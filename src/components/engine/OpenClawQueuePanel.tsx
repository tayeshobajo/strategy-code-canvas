import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2, ListOrdered, Play, Pause, XCircle, PlayCircle,
  RefreshCw, Archive, SkipForward, ShieldAlert, Zap, CheckCircle2,
} from "lucide-react";
import {
  listOpenClawQueues,
  getOpenClawQueue,
  createOpenClawQueue,
  startOpenClawQueue,
  pauseOpenClawQueue,
  resumeOpenClawQueue,
  cancelOpenClawQueue,
  archiveOpenClawQueue,
  runNextQueueItem,
  retryQueueItem,
  skipQueueItem,
  markQueueItemReviewed,
  listEligibleOpenClawPackets,
  type OpenClawQueueRow,
  type OpenClawQueueItemRow,
  type OpenClawQueueItemStatus,
  type OpenClawQueueStatus,
  type EligibleQueuePacket,
} from "@/lib/engine-openclaw-queue.functions";
import { getOpenClawConnectionStatus } from "@/lib/engine-openclaw.functions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = (fn: unknown, data: unknown) => (fn as any)({ data });

type QueueSummary = OpenClawQueueRow & {
  item_counts: Record<OpenClawQueueItemStatus, number>;
  total_items: number;
  running_item: OpenClawQueueItemRow | null;
  next_item: OpenClawQueueItemRow | null;
};

function statusTone(s: OpenClawQueueStatus | OpenClawQueueItemStatus): string {
  switch (s) {
    case "completed":
      return "bg-emerald-100 text-emerald-800 border-emerald-300";
    case "failed":
    case "cancelled":
      return "bg-red-100 text-red-800 border-red-300";
    case "paused":
    case "blocked":
      return "bg-amber-100 text-amber-800 border-amber-300";
    case "running":
      return "bg-royal/10 text-royal border-royal/40";
    case "ready":
    case "queued":
      return "bg-blue-100 text-blue-800 border-blue-300";
    case "skipped":
    case "archived":
      return "bg-neutral-100 text-neutral-600 border-neutral-300";
    default:
      return "bg-neutral-100 text-neutral-700 border-neutral-300";
  }
}

export function OpenClawQueuePanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();

  const connQ = useQuery({
    queryKey: ["openclaw-status", projectId],
    queryFn: () => call(getOpenClawConnectionStatus, { projectId }),
  });
  const queuesQ = useQuery({
    queryKey: ["openclaw-queues", projectId],
    queryFn: () => call(listOpenClawQueues, { projectId }),
  });

  const conn = connQ.data as
    | { configured: boolean; mode: "http" | "manual_tracking"; message: string }
    | undefined;
  const queues = (queuesQ.data as { queues: QueueSummary[] } | undefined)?.queues ?? [];
  const active = queues.find((q) => ["ready", "running", "paused"].includes(q.status)) ?? null;

  const [busy, setBusy] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showQueueId, setShowQueueId] = useState<string | null>(null);

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["openclaw-queues", projectId] }),
      qc.invalidateQueries({ queryKey: ["openclaw-queue", projectId] }),
      qc.invalidateQueries({ queryKey: ["engine", "build-execution", projectId] }),
      qc.invalidateQueries({ queryKey: ["openclaw-runs", projectId] }),
    ]);
  };

  const startFn = useServerFn(startOpenClawQueue);
  const pauseFn = useServerFn(pauseOpenClawQueue);
  const resumeFn = useServerFn(resumeOpenClawQueue);
  const cancelFn = useServerFn(cancelOpenClawQueue);
  const archiveFn = useServerFn(archiveOpenClawQueue);
  const runNextFn = useServerFn(runNextQueueItem);

  const runIt = async (label: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(label);
    try {
      await fn();
      toast.success(ok);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="rounded-xl border border-amber-300/60 bg-amber-50/40 p-4 space-y-3"
      data-qa="openclaw-queue-panel"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <ListOrdered className="w-4 h-4 text-amber-700" />
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-amber-800">
            OpenClaw Supervised Queue · v3
          </div>
        </div>
        <div className="flex items-center gap-2">
          {conn ? (
            <span className="text-[10px] font-mono uppercase tracking-widest text-amber-800/80">
              {conn.mode === "http" ? "HTTP mode" : "Manual tracking"}
            </span>
          ) : null}
          <button
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-400 bg-white text-amber-900 text-xs px-3 py-1.5 hover:bg-amber-100 disabled:opacity-50"
            onClick={() => setShowCreate(true)}
            disabled={active !== null}
            title={active ? "Finish or cancel the active queue first" : "Create a new OpenClaw queue"}
            data-qa="btn-openclaw-queue-create"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Create OpenClaw Queue
          </button>
        </div>
      </div>

      {active ? (
        <ActiveQueueCard
          queue={active}
          busy={busy}
          onStart={() => runIt("start", () => call(startFn, { projectId, queueId: active.id }), "Queue started")}
          onPause={() => runIt("pause", () => call(pauseFn, { projectId, queueId: active.id }), "Queue paused")}
          onResume={() => runIt("resume", () => call(resumeFn, { projectId, queueId: active.id }), "Queue resumed")}
          onCancel={() => {
            const reason = window.prompt("Cancel reason (optional)") ?? undefined;
            void runIt("cancel", () => call(cancelFn, { projectId, queueId: active.id, reason }), "Queue cancelled");
          }}
          onRunNext={() => runIt(
            "run-next",
            () => call(runNextFn, { projectId, queueId: active.id, confirm: true }),
            "Item started",
          )}
          onOpen={() => setShowQueueId(active.id)}
        />
      ) : (
        <p className="text-[11px] text-ink/60 italic">
          No active queue. Create one to run selected OpenClaw packets one at a time.
        </p>
      )}

      {/* Recent/other queues */}
      {queues.length > 0 ? (
        <details className="mt-2">
          <summary className="text-[11px] font-mono uppercase tracking-widest text-ink/60 cursor-pointer">
            All queues ({queues.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {queues.map((q) => (
              <li key={q.id} className="flex items-center justify-between rounded border border-border bg-white/70 px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border ${statusTone(q.status)}`}>
                    {q.status}
                  </span>
                  <span className="text-xs">{q.name}</span>
                  <span className="text-[10px] font-mono text-ink/50">{q.total_items} items</span>
                </div>
                <div className="flex items-center gap-2">
                  <button className="text-[11px] text-royal underline" onClick={() => setShowQueueId(q.id)}>
                    Open
                  </button>
                  {["draft", "completed", "failed", "cancelled"].includes(q.status) ? (
                    <button
                      className="text-[11px] text-ink/60 hover:text-red-700"
                      onClick={() =>
                        runIt(`archive-${q.id}`, () => call(archiveFn, { projectId, queueId: q.id }), "Queue archived")
                      }
                    >
                      Archive
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <p className="text-[10px] text-ink/50">
        Supervised only: nothing is auto-accepted, delivered, published, deployed, or QA-passed.
        Every queue is started and stepped through manually.
      </p>

      {showCreate ? (
        <CreateQueueModal
          projectId={projectId}
          simulatedDefault={conn?.mode === "manual_tracking"}
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            await refresh();
          }}
        />
      ) : null}

      {showQueueId ? (
        <QueueDetailModal
          projectId={projectId}
          queueId={showQueueId}
          onClose={() => setShowQueueId(null)}
          onChanged={refresh}
        />
      ) : null}
    </div>
  );
}

function ActiveQueueCard({
  queue, busy, onStart, onPause, onResume, onCancel, onRunNext, onOpen,
}: {
  queue: QueueSummary;
  busy: string | null;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRunNext: () => void;
  onOpen: () => void;
}) {
  const c = queue.item_counts;
  return (
    <div className="rounded-lg border border-border bg-white/70 p-3 space-y-2" data-qa="openclaw-queue-active">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded border ${statusTone(queue.status)}`}>
            {queue.status}
          </span>
          <span className="text-sm font-medium">{queue.name}</span>
          {queue.simulated ? (
            <span className="text-[10px] font-mono uppercase tracking-widest text-amber-800/80">simulated</span>
          ) : null}
          <span className="text-[10px] font-mono text-ink/50">
            policy: {queue.failure_policy === "stop_queue" ? "stop on failure" : "continue after review"}
          </span>
        </div>
        <button className="text-[11px] text-royal underline" onClick={onOpen}>
          Open queue
        </button>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-7 gap-2 text-[11px]">
        <Stat label="Total" value={queue.total_items} />
        <Stat label="Queued" value={c.queued} />
        <Stat label="Running" value={c.running} tone={c.running > 0 ? "royal" : undefined} />
        <Stat label="Completed" value={c.completed} tone={c.completed > 0 ? "green" : undefined} />
        <Stat label="Failed" value={c.failed} tone={c.failed > 0 ? "red" : undefined} />
        <Stat label="Blocked" value={c.blocked} tone={c.blocked > 0 ? "amber" : undefined} />
        <Stat label="Skipped" value={c.skipped} />
      </div>

      <div className="flex flex-wrap gap-2">
        {queue.status === "ready" ? (
          <ActionBtn icon={<Play className="w-3.5 h-3.5" />} label="Start queue" onClick={onStart} busy={busy === "start"} primary />
        ) : null}
        {queue.status === "running" ? (
          <>
            <ActionBtn
              icon={<PlayCircle className="w-3.5 h-3.5" />}
              label="Run next item"
              onClick={onRunNext}
              busy={busy === "run-next"}
              primary
              disabled={!queue.next_item || (queue.running_item !== null)}
            />
            <ActionBtn icon={<Pause className="w-3.5 h-3.5" />} label="Pause" onClick={onPause} busy={busy === "pause"} />
          </>
        ) : null}
        {queue.status === "paused" ? (
          <ActionBtn icon={<Play className="w-3.5 h-3.5" />} label="Resume" onClick={onResume} busy={busy === "resume"} primary />
        ) : null}
        {["ready", "running", "paused"].includes(queue.status) ? (
          <ActionBtn icon={<XCircle className="w-3.5 h-3.5" />} label="Cancel queue" onClick={onCancel} busy={busy === "cancel"} tone="danger" />
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "royal" | "green" | "red" | "amber" }) {
  const toneCls =
    tone === "royal" ? "text-royal"
    : tone === "green" ? "text-emerald-700"
    : tone === "red" ? "text-red-700"
    : tone === "amber" ? "text-amber-700"
    : "text-ink/80";
  return (
    <div className="rounded border border-border bg-neutral-50 px-2 py-1">
      <div className={`font-mono text-sm ${toneCls}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-widest text-ink/50">{label}</div>
    </div>
  );
}

function ActionBtn({
  icon, label, onClick, busy, disabled, primary, tone,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  busy: boolean;
  disabled?: boolean;
  primary?: boolean;
  tone?: "danger";
}) {
  const cls = primary
    ? "bg-amber-700 text-white border-amber-800 hover:bg-amber-800"
    : tone === "danger"
      ? "bg-white border-red-300 text-red-800 hover:bg-red-50"
      : "bg-white border-border text-ink/80 hover:border-royal/50";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className={`inline-flex items-center gap-1.5 rounded border text-[11px] px-2.5 py-1.5 disabled:opacity-50 ${cls}`}
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}

// ---------------- Create queue modal ----------------

function CreateQueueModal({
  projectId, simulatedDefault, onClose, onCreated,
}: {
  projectId: string;
  simulatedDefault: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const eligibleQ = useQuery({
    queryKey: ["openclaw-eligible", projectId],
    queryFn: () => call(listEligibleOpenClawPackets, { projectId }),
  });
  const packets = (eligibleQ.data as { packets: EligibleQueuePacket[] } | undefined)?.packets ?? [];
  const [name, setName] = useState<string>(`Queue ${new Date().toISOString().slice(0, 16).replace("T", " ")}`);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [failurePolicy, setFailurePolicy] = useState<"stop_queue" | "continue_after_review">("stop_queue");
  const [simulated, setSimulated] = useState<boolean>(simulatedDefault);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);

  const createFn = useServerFn(createOpenClawQueue);

  const ordered = useMemo(() => {
    return packets
      .filter((p) => selected[p.id] !== undefined && !p.in_active_queue)
      .sort((a, b) => (selected[a.id] ?? 0) - (selected[b.id] ?? 0));
  }, [packets, selected]);

  const nextSeq = () => Object.values(selected).reduce((max, n) => Math.max(max, n), 0) + 1;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const copy = { ...prev };
      if (copy[id] !== undefined) delete copy[id];
      else copy[id] = nextSeq();
      return copy;
    });
  };

  const submit = async () => {
    if (!ack) return toast.error("Please confirm the acknowledgment checkbox.");
    if (ordered.length === 0) return toast.error("Select at least one eligible packet.");
    setBusy(true);
    try {
      await call(createFn, {
        projectId,
        name: name.trim() || "OpenClaw queue",
        packetIds: ordered.map((p) => p.id),
        failurePolicy,
        simulated,
        confirm: true,
      });
      toast.success("Queue created");
      onCreated();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-card rounded-xl border border-border shadow-2xl p-5 space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Create OpenClaw supervised queue</h3>
          <p className="text-xs text-ink/70 mt-1">
            Pick eligible packets in the order you want them run. Every packet still requires human QA and acceptance after the run.
          </p>
        </div>

        <label className="block text-xs">
          <span className="text-ink/70">Queue name</span>
          <input
            className="mt-1 w-full rounded border border-border bg-white px-2 py-1.5 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
          />
        </label>

        <div>
          <div className="text-xs font-mono uppercase tracking-widest text-ink/60 mb-1">
            Eligible packets ({packets.length})
          </div>
          {eligibleQ.isPending ? (
            <div className="text-xs text-ink/60"><Loader2 className="w-3 h-3 animate-spin inline mr-1" />Loading eligible packets…</div>
          ) : packets.length === 0 ? (
            <div className="text-xs text-ink/60 italic">No eligible packets. Packets must be OpenClaw/mixed and in status ready or handed_off.</div>
          ) : (
            <ul className="space-y-1 max-h-72 overflow-y-auto">
              {packets.map((p) => {
                const seq = selected[p.id];
                const disabled = p.in_active_queue;
                return (
                  <li key={p.id} className={`flex items-center gap-2 rounded border px-2 py-1.5 ${disabled ? "border-neutral-200 bg-neutral-50" : "border-border bg-white"}`}>
                    <input
                      type="checkbox"
                      checked={seq !== undefined}
                      disabled={disabled}
                      onChange={() => toggle(p.id)}
                      aria-label={`Select ${p.title}`}
                    />
                    <span className="text-[10px] font-mono text-ink/50 w-6 text-right">{seq ?? ""}</span>
                    <span className={`text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border ${statusTone(p.status as OpenClawQueueItemStatus)}`}>
                      {p.status}
                    </span>
                    <span className="text-xs flex-1 truncate">{p.title}</span>
                    <span className="text-[10px] font-mono text-ink/50">{p.target_builder}</span>
                    {p.priority ? <span className="text-[10px] font-mono text-ink/50">P:{p.priority}</span> : null}
                    {disabled ? <span className="text-[10px] text-amber-700">in another queue</span> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <fieldset className="rounded border border-border p-2">
            <legend className="text-[10px] font-mono uppercase tracking-widest text-ink/60 px-1">Failure policy</legend>
            <label className="flex items-start gap-2 text-xs">
              <input type="radio" name="fp" checked={failurePolicy === "stop_queue"} onChange={() => setFailurePolicy("stop_queue")} className="mt-0.5" />
              <span><strong>Stop queue</strong> on failure — pauses so you can decide.</span>
            </label>
            <label className="flex items-start gap-2 text-xs mt-1">
              <input type="radio" name="fp" checked={failurePolicy === "continue_after_review"} onChange={() => setFailurePolicy("continue_after_review")} className="mt-0.5" />
              <span><strong>Continue after review</strong> — failed item is blocked until you mark it reviewed.</span>
            </label>
          </fieldset>
          <fieldset className="rounded border border-border p-2">
            <legend className="text-[10px] font-mono uppercase tracking-widest text-ink/60 px-1">Mode</legend>
            <label className="flex items-start gap-2 text-xs">
              <input type="checkbox" checked={simulated} onChange={(e) => setSimulated(e.target.checked)} className="mt-0.5" />
              <span>Manual-tracking / simulated mode. No live HTTP call to OpenClaw; you update run status yourself.</span>
            </label>
          </fieldset>
        </div>

        <div className="rounded border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900 space-y-1">
          <div className="font-mono uppercase tracking-widest text-[10px]">What will NOT happen</div>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>Packets will NOT be accepted automatically.</li>
            <li>QA tests will NOT be marked passed.</li>
            <li>The project will NOT be marked delivered.</li>
            <li>Nothing will be published to the client portal.</li>
            <li>No migrations or deploys will run automatically.</li>
            <li>Approved upstream payloads will NOT be mutated.</li>
          </ul>
        </div>

        <label className="flex items-start gap-2 text-xs text-ink/80">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
          I understand this will create a supervised OpenClaw queue and I remain responsible for every advance and acceptance.
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button className="px-3 py-1.5 rounded border border-border text-xs hover:bg-neutral-50" onClick={onClose}>
            Cancel
          </button>
          <button
            className="px-3 py-1.5 rounded bg-amber-700 text-white text-xs hover:bg-amber-800 disabled:opacity-50 inline-flex items-center gap-1.5"
            onClick={submit}
            disabled={busy || !ack || ordered.length === 0}
            data-qa="btn-openclaw-queue-confirm"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            Create queue ({ordered.length})
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Queue detail modal (board + item controls) ----------------

function QueueDetailModal({
  projectId, queueId, onClose, onChanged,
}: {
  projectId: string;
  queueId: string;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const qc = useQueryClient();
  const detailQ = useQuery({
    queryKey: ["openclaw-queue", projectId, queueId],
    queryFn: () => call(getOpenClawQueue, { projectId, queueId }),
  });
  const detail = detailQ.data as
    | { queue: OpenClawQueueRow; items: OpenClawQueueItemRow[]; packets: Record<string, { id: string; title: string; status: string; target_builder: string }> }
    | undefined;

  const [busy, setBusy] = useState<string | null>(null);
  const retryFn = useServerFn(retryQueueItem);
  const skipFn = useServerFn(skipQueueItem);
  const reviewedFn = useServerFn(markQueueItemReviewed);

  const doAction = async (label: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(label);
    try {
      await fn();
      toast.success(ok);
      await qc.invalidateQueries({ queryKey: ["openclaw-queue", projectId, queueId] });
      await onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const grouped: Record<OpenClawQueueItemStatus, OpenClawQueueItemRow[]> = {
    queued: [], running: [], completed: [], failed: [], skipped: [], cancelled: [], blocked: [],
  };
  for (const it of detail?.items ?? []) grouped[it.status].push(it);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-card rounded-xl border border-border shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold">{detail?.queue.name ?? "Queue"}</h3>
            {detail ? (
              <p className="text-xs text-ink/70 mt-1">
                <span className={`text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border ${statusTone(detail.queue.status)}`}>
                  {detail.queue.status}
                </span>{" "}
                · policy: {detail.queue.failure_policy} · {detail.items.length} items
              </p>
            ) : null}
          </div>
          <button className="text-xs underline text-ink/60" onClick={onClose}>Close</button>
        </div>

        {detailQ.isPending ? (
          <div className="text-xs text-ink/60"><Loader2 className="w-3 h-3 animate-spin inline mr-1" />Loading…</div>
        ) : !detail ? (
          <div className="text-xs text-red-700">Failed to load queue.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(["queued", "running", "blocked", "failed", "completed", "skipped", "cancelled"] as OpenClawQueueItemStatus[]).map((status) => {
              const items = grouped[status];
              if (items.length === 0) return null;
              return (
                <div key={status} className="rounded-lg border border-border bg-white/70 p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border ${statusTone(status)}`}>
                      {status}
                    </span>
                    <span className="text-[10px] font-mono text-ink/50">{items.length}</span>
                  </div>
                  <ul className="space-y-1">
                    {items.map((it) => {
                      const pkt = detail.packets[it.build_packet_id];
                      return (
                        <li key={it.id} className="rounded border border-border bg-white p-2 text-xs space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] text-ink/50">#{it.sequence_number}</span>
                            <span className="flex-1 truncate">{pkt?.title ?? it.build_packet_id.slice(0, 8)}</span>
                            {pkt ? <span className="text-[10px] text-ink/50">{pkt.status}</span> : null}
                          </div>
                          {it.error_message ? (
                            <div className="text-[11px] text-red-700">{it.error_message}</div>
                          ) : null}
                          <div className="flex flex-wrap gap-1 pt-1">
                            {it.status === "failed" ? (
                              <button
                                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 border border-border rounded hover:bg-neutral-50 disabled:opacity-50"
                                disabled={busy === `retry-${it.id}`}
                                onClick={() =>
                                  doAction(`retry-${it.id}`, () => call(retryFn, { projectId, queueItemId: it.id }), "Item retried")
                                }
                              >
                                {busy === `retry-${it.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                Retry
                              </button>
                            ) : null}
                            {it.status === "blocked" ? (
                              <button
                                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 border border-border rounded hover:bg-neutral-50 disabled:opacity-50"
                                disabled={busy === `review-${it.id}`}
                                onClick={() =>
                                  doAction(`review-${it.id}`, () => call(reviewedFn, { projectId, queueItemId: it.id }), "Marked reviewed")
                                }
                              >
                                {busy === `review-${it.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                Mark reviewed
                              </button>
                            ) : null}
                            {["queued", "blocked", "failed"].includes(it.status) ? (
                              <button
                                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 border border-border rounded text-ink/60 hover:text-red-700 disabled:opacity-50"
                                disabled={busy === `skip-${it.id}`}
                                onClick={() => {
                                  const reason = window.prompt("Skip reason (min 3 chars)");
                                  if (!reason || reason.trim().length < 3) return;
                                  void doAction(`skip-${it.id}`, () => call(skipFn, { projectId, queueItemId: it.id, reason }), "Item skipped");
                                }}
                              >
                                {busy === `skip-${it.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <SkipForward className="w-3 h-3" />}
                                Skip
                              </button>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
