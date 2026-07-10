import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  ShieldCheck,
  ArrowUpCircle,
  CheckCircle2,
  Archive,
  AlertTriangle,
  Bot,
  Copy,
  Send,
  PlayCircle,
  Undo2,
  ClipboardCheck,
  XCircle,
  Package,
  PackageOpen,
  Layers,
  Paperclip,
} from "lucide-react";
import {
  getProjectBuildExecution,
  generateBuildPackets,
  markBuildPacketReady,
  handoffBuildPacket,
  markBuildPacketInProgress,
  markBuildPacketReturned,
  markBuildPacketQaRequired,
  acceptBuildPacket,
  rejectBuildPacket,
  archiveBuildPacket,
  addBuildEvidence,
  type BuildExecutionState,
  type BuildPacketRow,
  type BuildPacketStatus,
  type BuildPacketPriority,
  type BuildEvidenceType,
} from "@/lib/engine-build-execution.functions";
import { OpenClawPanel } from "@/components/engine/OpenClawPanel";
import { OpenClawQueuePanel } from "@/components/engine/OpenClawQueuePanel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/engine/projects/$projectId/build-execution",
)({
  component: BuildExecutionPage,
  errorComponent: ({ error }) => (
    <div
      role="alert"
      className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800"
    >
      Failed to load Build Execution: {(error as Error).message}
    </div>
  ),
  notFoundComponent: () => (
    <div className="rounded border border-border bg-card p-4 text-sm text-ink/70">
      Build Execution not available for this project.
    </div>
  ),
});

const stateQueryOptions = (
  projectId: string,
  fn: (input: { data: { projectId: string } }) => Promise<unknown>,
) =>
  queryOptions({
    queryKey: ["engine", "build-execution", projectId],
    queryFn: () => fn({ data: { projectId } }),
    staleTime: 10_000,
  });

function BuildExecutionPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const fn = useServerFn(getProjectBuildExecution);
  const genFn = useServerFn(generateBuildPackets);

  const { data, isPending, isError, error, refetch } = useQuery(
    stateQueryOptions(
      projectId,
      fn as unknown as (i: { data: { projectId: string } }) => Promise<unknown>,
    ),
  );

  const [busy, setBusy] = useState<null | "generate">(null);
  const [openPacketId, setOpenPacketId] = useState<string | null>(null);
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["engine", "build-execution", projectId] });
  const state = data as BuildExecutionState | undefined;

  const onGenerate = async () => {
    setBusy("generate");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = (await (genFn as any)({ data: { projectId } })) as {
        ok: boolean;
        message?: string;
        missing_inputs?: Array<{ label: string }>;
      };
      if (!res.ok) {
        toast.error(res.message ?? "Missing inputs", {
          description: res.missing_inputs?.map((m) => m.label).join(", "),
        });
      } else {
        toast.success("Build packets generated");
      }
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (isPending) {
    return (
      <div
        className="rounded-xl border border-border bg-card p-8 text-sm text-ink/60"
        data-qa-state="build-execution-loading"
      >
        <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading Build
        Execution…
      </div>
    );
  }
  if (isError || !state) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800"
      >
        Failed to load Build Execution:{" "}
        {(error as Error | null)?.message ?? "unknown error"}
        <button className="ml-3 underline" onClick={() => void refetch()}>
          retry
        </button>
      </div>
    );
  }

  const openPacket = openPacketId
    ? state.packets.find((p) => p.id === openPacketId) ?? null
    : null;

  return (
    <div
      className="grid grid-cols-1 xl:grid-cols-3 gap-5"
      data-qa-state="build-execution-loaded"
      data-project-id={projectId}
    >
      <div className="xl:col-span-2 space-y-5">
        <HeaderCard state={state} busy={busy} onGenerate={onGenerate} />
        <OverviewCard state={state} />
        <PacketBoard
          state={state}
          onOpen={(id) => setOpenPacketId(id)}
        />
      </div>
      <div className="xl:col-span-1 space-y-5">
        <AiPmPanel state={state} />
      </div>

      {openPacket ? (
        <PacketDrawer
          projectId={projectId}
          packet={openPacket}
          state={state}
          onClose={() => setOpenPacketId(null)}
          onChanged={() => {
            invalidate();
          }}
        />
      ) : null}
    </div>
  );
}

// -------------------- presentational --------------------

function StatusBadge({ status }: { status: BuildPacketStatus }) {
  const map: Record<BuildPacketStatus, string> = {
    draft: "bg-ink/10 text-ink",
    ready: "bg-sky-100 text-sky-900 border-sky-300",
    handed_off: "bg-indigo-100 text-indigo-900 border-indigo-300",
    in_progress: "bg-amber-100 text-amber-900 border-amber-300",
    returned: "bg-orange-100 text-orange-900 border-orange-300",
    qa_required: "bg-purple-100 text-purple-900 border-purple-300",
    accepted: "bg-emerald-100 text-emerald-900 border-emerald-300",
    rejected: "bg-red-100 text-red-900 border-red-300",
    archived: "bg-ink/5 text-ink/60",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest font-mono",
        map[status],
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function PriorityBadge({ p }: { p: BuildPacketPriority }) {
  const map: Record<BuildPacketPriority, string> = {
    p0: "bg-red-100 text-red-900 border-red-300",
    p1: "bg-amber-100 text-amber-900 border-amber-300",
    p2: "bg-ink/10 text-ink/70 border-border",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-widest font-mono",
        map[p],
      )}
    >
      {p}
    </span>
  );
}

function HeaderCard({
  state,
  busy,
  onGenerate,
}: {
  state: BuildExecutionState;
  busy: string | null;
  onGenerate: () => void;
}) {
  const impl = state.approved_implementation_plan;
  const nba = state.next_best_action;
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">
            Build Execution / OpenClaw Handoff
          </div>
          <h1 className="text-xl font-semibold mt-1">
            {impl?.title ?? "Approve an implementation plan to begin"}
          </h1>
          <div className="text-xs text-ink/60 mt-1">
            {state.project.client_company} · {state.project.current_step} ·{" "}
            {state.project.status}
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {impl ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 px-2 py-0.5 text-[10px] uppercase tracking-widest font-mono"
                data-qa="badge-approved-impl"
              >
                <ShieldCheck className="w-3 h-3" /> Impl plan approved
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 text-[10px] uppercase tracking-widest font-mono">
                <AlertTriangle className="w-3 h-3" /> Impl plan not approved
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full bg-ink/5 border border-border px-2 py-0.5 text-[10px] uppercase tracking-widest font-mono text-ink/70">
              <Package className="w-3 h-3" /> {state.packets.length} packet
              {state.packets.length === 1 ? "" : "s"}
            </span>
            {nba ? (
              <span className="text-[10px] uppercase tracking-widest text-ink/50">
                NBA: {nba.action}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onGenerate}
            disabled={!state.capabilities.canGenerate || busy === "generate"}
            className="inline-flex items-center gap-1.5 rounded-md bg-royal text-white text-xs px-3 py-1.5 hover:bg-royal/90 disabled:opacity-50"
            title={
              !state.capabilities.canGenerate
                ? "Approve an implementation plan before generating build packets."
                : ""
            }
            data-qa="btn-generate-build-packets"
          >
            {busy === "generate" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Generate Build Packets
          </button>
        </div>
      </div>
      {!state.readiness.ready ? (
        <div
          className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
          data-qa="build-missing-inputs"
        >
          <div className="font-semibold mb-1 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Missing inputs
          </div>
          <ul className="list-disc list-inside space-y-0.5">
            {state.readiness.missing.map((m) => (
              <li key={m.key}>
                <strong>{m.label}</strong> — {m.recommendation}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function MetricTile({
  label,
  value,
  tone = "info",
}: {
  label: string;
  value: number | string;
  tone?: "info" | "warn" | "ok" | "danger";
}) {
  const cls =
    tone === "warn"
      ? "bg-amber-50 border-amber-200 text-amber-900"
      : tone === "ok"
        ? "bg-emerald-50 border-emerald-200 text-emerald-900"
        : tone === "danger"
          ? "bg-red-50 border-red-200 text-red-900"
          : "border-border bg-white/50";
  return (
    <div className={cn("rounded border p-2", cls)}>
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-ink/50">
        {label}
      </div>
    </div>
  );
}

function OverviewCard({ state }: { state: BuildExecutionState }) {
  const c = state.packet_counts;
  const impl = state.approved_implementation_plan;
  const nextP = state.next_packet;
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">
        Execution Overview
      </div>
      {impl ? (
        <p className="text-xs text-ink/70 mt-2">
          <span className="font-semibold">Source:</span> {impl.title} ·{" "}
          {impl.build_step_count} steps · {impl.p0_count} P0 · {impl.high_risk_count}{" "}
          high risk
        </p>
      ) : (
        <p className="text-xs text-ink/60 mt-2">
          No approved implementation plan yet.
        </p>
      )}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3">
        <MetricTile label="Total" value={state.packets.length} />
        <MetricTile label="Draft" value={c.draft} />
        <MetricTile label="Ready" value={c.ready} tone="info" />
        <MetricTile label="Handed off" value={c.handed_off} />
        <MetricTile label="In progress" value={c.in_progress} tone="warn" />
        <MetricTile label="Returned" value={c.returned} tone="warn" />
        <MetricTile label="QA required" value={c.qa_required} tone="warn" />
        <MetricTile label="Accepted" value={c.accepted} tone="ok" />
        <MetricTile label="Rejected" value={c.rejected} tone="danger" />
        <MetricTile label="Archived" value={c.archived} />
      </div>
      {nextP ? (
        <div
          className="mt-4 rounded border border-royal/30 bg-royal/5 p-3 text-xs"
          data-qa="next-packet"
        >
          <div className="font-mono text-[10px] uppercase tracking-widest text-royal">
            Next packet
          </div>
          <div className="text-sm font-medium mt-1">
            #{nextP.sequence_number} · {nextP.title}
          </div>
          <div className="text-ink/60 mt-0.5">
            {nextP.packet_type} · {nextP.priority} ·{" "}
            {nextP.payload?.target_builder ?? "—"}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const STATUS_GROUPS: BuildPacketStatus[] = [
  "draft",
  "ready",
  "handed_off",
  "in_progress",
  "returned",
  "qa_required",
  "accepted",
  "rejected",
];

function PacketBoard({
  state,
  onOpen,
}: {
  state: BuildExecutionState;
  onOpen: (id: string) => void;
}) {
  const grouped = useMemo(() => {
    const m: Record<BuildPacketStatus, BuildPacketRow[]> = {
      draft: [],
      ready: [],
      handed_off: [],
      in_progress: [],
      returned: [],
      qa_required: [],
      accepted: [],
      rejected: [],
      archived: [],
    };
    for (const p of state.packets) m[p.status].push(p);
    return m;
  }, [state.packets]);

  if (state.packets.length === 0) {
    return (
      <div
        className="rounded-xl border border-dashed border-border bg-card p-8 text-center"
        data-qa="empty-packets"
      >
        <PackageOpen className="w-8 h-8 mx-auto text-ink/40" />
        <div className="mt-3 text-sm font-medium">No build packets yet</div>
        <div className="text-xs text-ink/60 mt-1 max-w-md mx-auto">
          Build Execution turns the <strong>approved implementation plan</strong>{" "}
          into ordered build packets — each with a handoff prompt, scope,
          do-not-touch list, acceptance criteria, QA requirements, evidence
          requirements, rollback notes, dependencies, and risks. Nothing here
          executes anything: prompts must be copied and run manually.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Layers className="w-4 h-4 text-royal" />
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">
          Build Packet Board
        </div>
      </div>
      <div className="mt-3 space-y-5">
        {STATUS_GROUPS.map((s) => {
          const rows = grouped[s];
          if (rows.length === 0) return null;
          return (
            <div key={s}>
              <div className="flex items-center gap-2 mb-2">
                <StatusBadge status={s} />
                <span className="text-[10px] uppercase tracking-widest text-ink/50">
                  {rows.length} packet{rows.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {rows.map((p) => (
                  <PacketCard
                    key={p.id}
                    packet={p}
                    evidenceCount={state.evidence_counts[p.id] ?? 0}
                    onOpen={() => onOpen(p.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PacketCard({
  packet,
  evidenceCount,
  onOpen,
}: {
  packet: BuildPacketRow;
  evidenceCount: number;
  onOpen: () => void;
}) {
  const p = packet.payload;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left rounded-lg border border-border bg-white/60 p-3 text-xs space-y-1 hover:border-royal/50 transition-colors"
      data-qa="packet-card"
      data-packet-id={packet.id}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-sm text-ink truncate">
            <span className="font-mono text-ink/50 mr-1">
              #{packet.sequence_number}
            </span>
            {packet.title}
          </div>
          <div className="text-ink/60 capitalize">
            {packet.packet_type} · {p?.target_builder ?? "—"}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <PriorityBadge p={packet.priority} />
        </div>
      </div>
      {p?.packet_goal ? (
        <div className="text-ink/70 line-clamp-2">{p.packet_goal}</div>
      ) : packet.summary ? (
        <div className="text-ink/70 line-clamp-2">{packet.summary}</div>
      ) : null}
      <div className="flex items-center gap-3 text-[10px] text-ink/60 pt-1">
        <span>{p?.dependencies?.length ?? 0} deps</span>
        <span>{p?.blocking_conditions?.length ?? 0} blockers</span>
        <span className="inline-flex items-center gap-0.5">
          <Paperclip className="w-3 h-3" /> {evidenceCount} evidence
        </span>
      </div>
    </button>
  );
}

// -------------------- Packet Drawer --------------------

function PacketDrawer({
  projectId,
  packet,
  state,
  onClose,
  onChanged,
}: {
  projectId: string;
  packet: BuildPacketRow;
  state: BuildExecutionState;
  onClose: () => void;
  onChanged: () => void;
}) {
  const readyFn = useServerFn(markBuildPacketReady);
  const handoffFn = useServerFn(handoffBuildPacket);
  const inProgFn = useServerFn(markBuildPacketInProgress);
  const returnedFn = useServerFn(markBuildPacketReturned);
  const qaFn = useServerFn(markBuildPacketQaRequired);
  const acceptFn = useServerFn(acceptBuildPacket);
  const rejectFn = useServerFn(rejectBuildPacket);
  const archiveFn = useServerFn(archiveBuildPacket);
  const evidenceFn = useServerFn(addBuildEvidence);

  const [busy, setBusy] = useState<string | null>(null);
  const [showEvidence, setShowEvidence] = useState(false);

  const run = async (label: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(label);
    try {
      await fn();
      toast.success(ok);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const p = packet.payload;
  const caps = state.capabilities;

  const copyPrompt = () => {
    void navigator.clipboard.writeText(p?.handoff_prompt ?? "");
    toast.success("Handoff prompt copied");
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 flex justify-end"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl h-full overflow-y-auto bg-card border-l border-border shadow-2xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">
              Build Packet · #{packet.sequence_number}
            </div>
            <h2 className="text-xl font-semibold mt-1">{packet.title}</h2>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <StatusBadge status={packet.status} />
              <PriorityBadge p={packet.priority} />
              <span className="text-[10px] uppercase tracking-widest text-ink/50">
                {packet.packet_type} · {p?.target_builder ?? "—"}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-ink/50 hover:text-ink text-sm"
            aria-label="Close"
          >
            Close
          </button>
        </div>

        {/* Lifecycle actions */}
        <div className="flex flex-wrap gap-2" data-qa="packet-lifecycle">
          {packet.status === "draft" && caps.canMarkReady ? (
            <ActionBtn
              icon={<ArrowUpCircle className="w-3.5 h-3.5" />}
              label="Mark ready"
              busy={busy === "ready"}
              onClick={() =>
                run(
                  "ready",
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  () => (readyFn as any)({ data: { projectId, packetId: packet.id } }),
                  "Packet ready",
                )
              }
            />
          ) : null}
          {packet.status === "ready" && caps.canHandoff ? (
            <ActionBtn
              icon={<Send className="w-3.5 h-3.5" />}
              label="Mark handed off"
              busy={busy === "handoff"}
              onClick={() =>
                run(
                  "handoff",
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  () => (handoffFn as any)({ data: { projectId, packetId: packet.id } }),
                  "Handed off",
                )
              }
            />
          ) : null}
          {["handed_off", "returned", "qa_required"].includes(packet.status) &&
          caps.canMarkInProgress ? (
            <ActionBtn
              icon={<PlayCircle className="w-3.5 h-3.5" />}
              label="In progress"
              busy={busy === "inprog"}
              onClick={() =>
                run(
                  "inprog",
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  () => (inProgFn as any)({ data: { projectId, packetId: packet.id } }),
                  "In progress",
                )
              }
            />
          ) : null}
          {["handed_off", "in_progress"].includes(packet.status) &&
          caps.canMarkReturned ? (
            <ActionBtn
              icon={<Undo2 className="w-3.5 h-3.5" />}
              label="Returned"
              busy={busy === "return"}
              onClick={() => {
                const note = prompt("Return note (optional):") || undefined;
                return run(
                  "return",
                  () =>
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (returnedFn as any)({
                      data: { projectId, packetId: packet.id, note },
                    }),
                  "Marked returned",
                );
              }}
            />
          ) : null}
          {["in_progress", "returned"].includes(packet.status) &&
          caps.canMarkQaRequired ? (
            <ActionBtn
              icon={<ClipboardCheck className="w-3.5 h-3.5" />}
              label="Needs QA"
              busy={busy === "qa"}
              onClick={() =>
                run(
                  "qa",
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  () => (qaFn as any)({ data: { projectId, packetId: packet.id } }),
                  "Marked QA required",
                )
              }
            />
          ) : null}
          {packet.status === "qa_required" && caps.canAccept ? (
            <ActionBtn
              icon={<CheckCircle2 className="w-3.5 h-3.5" />}
              label="Accept"
              tone="ok"
              busy={busy === "accept"}
              onClick={() => {
                const ack = prompt(
                  "Acceptance note (required if no evidence attached):",
                ) || undefined;
                return run(
                  "accept",
                  () =>
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (acceptFn as any)({
                      data: {
                        projectId,
                        packetId: packet.id,
                        evidenceAck: ack,
                      },
                    }),
                  "Packet accepted",
                );
              }}
            />
          ) : null}
          {packet.status === "qa_required" && caps.canReject ? (
            <ActionBtn
              icon={<XCircle className="w-3.5 h-3.5" />}
              label="Reject"
              tone="danger"
              busy={busy === "reject"}
              onClick={() => {
                const reason = prompt("Rejection reason (required):");
                if (!reason || reason.trim().length < 3) return;
                return run(
                  "reject",
                  () =>
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (rejectFn as any)({
                      data: { projectId, packetId: packet.id, reason },
                    }),
                  "Packet rejected",
                );
              }}
            />
          ) : null}
          {packet.status !== "archived" && caps.canArchive ? (
            <ActionBtn
              icon={<Archive className="w-3.5 h-3.5" />}
              label="Archive"
              tone="ghost"
              busy={busy === "archive"}
              onClick={() => {
                if (!confirm("Archive this packet?")) return;
                return run(
                  "archive",
                  () =>
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (archiveFn as any)({
                      data: { projectId, packetId: packet.id },
                    }),
                  "Packet archived",
                );
              }}
            />
          ) : null}
        </div>

        {/* Handoff prompt panel */}
        <div className="rounded-xl border border-royal/30 bg-royal/5 p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-royal" />
              <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-royal">
                Handoff Prompt · {p?.target_builder ?? "—"}
              </div>
            </div>
            <button
              onClick={copyPrompt}
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-mono rounded border border-royal/40 text-royal px-2 py-1 hover:bg-royal/10"
              data-qa="btn-copy-handoff-prompt"
            >
              <Copy className="w-3 h-3" /> Copy
            </button>
          </div>
          <pre className="whitespace-pre-wrap rounded bg-white/70 p-3 text-[11px] text-ink/90 font-mono max-h-96 overflow-y-auto">
            {p?.handoff_prompt || "—"}
          </pre>
          <p className="text-[10px] text-ink/60">
            Nothing here runs automatically. This prompt must be executed by
            the target builder outside this app. Do NOT deploy, mark QA
            passed, or mark delivered from this surface.
          </p>
        </div>

        {/* OpenClaw Direct Connection v2 */}
        <OpenClawPanel projectId={projectId} packet={packet} onChanged={onChanged} />




        {/* Scope */}
        <Section title="Execution scope">
          <LabeledList label="Included" items={p?.execution_scope?.included ?? []} />
          <LabeledList label="Excluded" items={p?.execution_scope?.excluded ?? []} />
          <LabeledList
            label="Expected files / surfaces"
            items={p?.execution_scope?.expected_files_or_surfaces ?? []}
          />
          <LabeledList
            label="Do NOT touch"
            items={p?.execution_scope?.do_not_touch ?? []}
            tone="warn"
          />
        </Section>

        <Section title="Implementation">
          <LabeledList
            label="Source implementation steps"
            items={p?.source_implementation_steps ?? []}
          />
          <LabeledList
            label="Implementation steps"
            items={p?.implementation_steps ?? []}
          />
          {p?.context_summary ? (
            <p className="text-xs text-ink/70 mt-1">{p.context_summary}</p>
          ) : null}
        </Section>

        <Section title="Acceptance & QA">
          <LabeledList
            label="Acceptance criteria"
            items={p?.acceptance_criteria ?? []}
          />
          <LabeledList label="QA requirements" items={p?.qa_requirements ?? []} />
          <LabeledList
            label="Evidence required"
            items={p?.evidence_required ?? []}
          />
          <LabeledList
            label="Post-execution checks"
            items={p?.post_execution_checks ?? []}
          />
        </Section>

        <Section title="Risk & rollback">
          <LabeledList label="Risk notes" items={p?.risk_notes ?? []} tone="warn" />
          <LabeledList label="Rollback notes" items={p?.rollback_notes ?? []} />
          <LabeledList label="Dependencies" items={p?.dependencies ?? []} />
          <LabeledList
            label="Blocking conditions"
            items={p?.blocking_conditions ?? []}
            tone="warn"
          />
          <LabeledList label="Open decisions" items={p?.open_decisions ?? []} />
        </Section>

        {/* Evidence */}
        <Section title={`Evidence (${state.evidence_counts[packet.id] ?? 0})`}>
          <button
            onClick={() => setShowEvidence((v) => !v)}
            className="text-[11px] underline text-royal"
          >
            {showEvidence ? "Hide add-evidence form" : "Add evidence"}
          </button>
          {showEvidence ? (
            <AddEvidenceForm
              projectId={projectId}
              packetId={packet.id}
              busy={busy === "evidence"}
              onSubmit={async (payload) => {
                await run(
                  "evidence",
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  () => (evidenceFn as any)({ data: payload }),
                  "Evidence added",
                );
                setShowEvidence(false);
              }}
            />
          ) : null}
        </Section>
      </div>
    </div>
  );
}

function ActionBtn({
  icon,
  label,
  busy,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  busy: boolean;
  tone?: "ok" | "danger" | "ghost";
  onClick: () => void;
}) {
  const cls =
    tone === "ok"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
      : tone === "danger"
        ? "border-red-300 bg-red-50 text-red-900 hover:bg-red-100"
        : tone === "ghost"
          ? "border-border text-ink/60 hover:border-red-300 hover:text-red-700"
          : "border-border hover:border-royal/50";
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border text-xs px-3 py-1.5 disabled:opacity-50",
        cls,
      )}
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-white/50 p-4 space-y-2">
      <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">
        {title}
      </div>
      <div className="text-xs space-y-2">{children}</div>
    </div>
  );
}

function LabeledList({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone?: "warn";
}) {
  return (
    <div>
      <div
        className={cn(
          "font-mono text-[9px] uppercase tracking-widest",
          tone === "warn" ? "text-amber-800" : "text-ink/50",
        )}
      >
        {label}
      </div>
      {items.length === 0 ? (
        <div className="text-ink/40 text-[11px]">—</div>
      ) : (
        <ul
          className={cn(
            "list-disc list-inside space-y-0.5",
            tone === "warn" ? "text-amber-900" : "text-ink/80",
          )}
        >
          {items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddEvidenceForm({
  projectId,
  packetId,
  busy,
  onSubmit,
}: {
  projectId: string;
  packetId: string;
  busy: boolean;
  onSubmit: (payload: {
    projectId: string;
    packetId: string;
    evidenceType: BuildEvidenceType;
    title: string;
    summary?: string;
    payload: Record<string, unknown>;
  }) => Promise<void>;
}) {
  const [type, setType] = useState<BuildEvidenceType>("note");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [url, setUrl] = useState("");

  return (
    <div className="mt-2 space-y-2" data-qa="add-evidence-form">
      <div className="flex gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as BuildEvidenceType)}
          className="rounded border border-border bg-white px-2 py-1 text-xs"
        >
          <option value="note">Note</option>
          <option value="screenshot">Screenshot</option>
          <option value="log">Log</option>
          <option value="diff_summary">Diff summary</option>
          <option value="qa_report">QA report</option>
          <option value="link">Link</option>
          <option value="artifact">Artifact</option>
        </select>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="rounded border border-border bg-white px-2 py-1 text-xs flex-1"
        />
      </div>
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="Summary / detail"
        className="w-full rounded border border-border bg-white px-2 py-1 text-xs"
        rows={3}
      />
      {(type === "link" || type === "screenshot" || type === "artifact") && (
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="URL"
          className="w-full rounded border border-border bg-white px-2 py-1 text-xs"
        />
      )}
      <button
        disabled={busy || !title.trim()}
        onClick={() =>
          void onSubmit({
            projectId,
            packetId,
            evidenceType: type,
            title: title.trim(),
            summary: summary.trim() || undefined,
            payload: url ? { url } : {},
          })
        }
        className="inline-flex items-center gap-1.5 rounded-md bg-royal text-white text-xs px-3 py-1.5 hover:bg-royal/90 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Paperclip className="w-3.5 h-3.5" />
        )}
        Add evidence
      </button>
    </div>
  );
}

// -------------------- AI PM Panel --------------------

function AiPmPanel({ state }: { state: BuildExecutionState }) {
  const c = state.packet_counts;
  const impl = state.approved_implementation_plan;
  const knows: string[] = [];
  const covers: string[] = [];
  const missing: string[] = state.readiness.missing.map((m) => m.label);
  const recommends: string[] = [];
  const needsReview: string[] = [];
  const readyStates: string[] = [];

  if (impl) {
    knows.push(
      `Implementation plan: ${impl.title} (${impl.build_step_count} steps, ${impl.p0_count} P0, ${impl.high_risk_count} high risk)`,
    );
  } else knows.push("No approved implementation plan.");

  if (state.packets.length > 0) {
    covers.push(
      `${state.packets.length} packet(s): ${c.ready} ready · ${c.handed_off} handed off · ${c.in_progress} in progress · ${c.qa_required} QA · ${c.accepted} accepted`,
    );
  }

  if (state.next_packet) {
    recommends.push(
      `Next: #${state.next_packet.sequence_number} · ${state.next_packet.title}`,
    );
  } else if (state.readiness.ready && state.packets.length === 0) {
    recommends.push("Click Generate Build Packets to create the handoff sequence.");
  }

  if (c.qa_required > 0)
    needsReview.push(`${c.qa_required} packet(s) awaiting QA acceptance.`);
  if (c.returned > 0)
    needsReview.push(`${c.returned} packet(s) returned — re-handoff or accept.`);
  if (c.accepted > 0 && c.accepted === state.packets.length - c.archived) {
    readyStates.push(
      "All non-archived packets accepted. Project is NOT auto-marked delivered — human still owns delivery.",
    );
  }

  return (
    <div
      className="rounded-xl border border-border bg-card p-5 shadow-sm sticky top-4 space-y-4"
      data-qa="ai-pm-panel"
    >
      <div className="flex items-center gap-2">
        <Bot className="w-4 h-4 text-royal" />
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">
          AI PM Panel
        </div>
      </div>
      <PanelList
        title="What the implementation plan requires"
        icon={<ShieldCheck className="w-3.5 h-3.5" />}
        items={knows}
        tone="info"
      />
      <PanelList
        title="Where build packets stand"
        icon={<Package className="w-3.5 h-3.5" />}
        items={covers}
        tone="info"
      />
      <PanelList
        title="What's missing"
        icon={<AlertTriangle className="w-3.5 h-3.5" />}
        items={missing}
        tone="warn"
      />
      <PanelList
        title="Needs review"
        icon={<ClipboardCheck className="w-3.5 h-3.5" />}
        items={needsReview}
        tone="warn"
      />
      <PanelList
        title="Next recommended action"
        icon={<Send className="w-3.5 h-3.5" />}
        items={recommends}
        tone="info"
      />
      <PanelList
        title="Delivery readiness"
        icon={<CheckCircle2 className="w-3.5 h-3.5" />}
        items={readyStates}
        tone="ok"
      />
    </div>
  );
}

function PanelList({
  title,
  icon,
  items,
  tone,
}: {
  title: string;
  icon: React.ReactNode;
  items: string[];
  tone: "info" | "warn" | "ok";
}) {
  const toneCls =
    tone === "warn"
      ? "text-amber-900"
      : tone === "ok"
        ? "text-emerald-800"
        : "text-ink/70";
  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest",
          toneCls,
        )}
      >
        {icon}
        {title}
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-ink/40 mt-1">—</div>
      ) : (
        <ul className="mt-1 text-xs text-ink/80 list-disc list-inside space-y-0.5">
          {items.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
