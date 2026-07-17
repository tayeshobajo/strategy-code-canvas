/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Upload,
  Link2,
  FileText,
  StickyNote,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  ExternalLink,
  Loader2,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Archive,
  GitCompare,
  RotateCcw,
  X,
  ChevronDown,
  ChevronRight,
  History,
  AlertTriangle,
  MinusCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard, EmptyState } from "@/components/engine/primitives";
import {
  listSources,
  createSource,
  removeSource,
  reprocessSource,
  listVersions,
  approveVersion,
  archiveVersion,
  compareVersions,
  restoreVersion,
  restoreVersionSection,
  listChangeEvents,
  resolveChangeEvent,
  runIntelligencePipeline,
  createSourceUploadUrl,
  listAuditLog,
  type EngineSource,
  type EngineSourceStage,
  type EngineRoadmapVersion,
  type EngineChangeEvent,
  type EngineAuditLog,
} from "@/lib/engine-intelligence.functions";
import { PIPELINE_STAGES } from "@/lib/engine-agent-prompts";

export const Route = createFileRoute("/engine/projects/$projectId/intelligence-layer")({
  component: IntelligenceLayerPage,
  errorComponent: ({ error }) => (
    <div className="text-red-700 text-sm">Failed: {(error as Error).message}</div>
  ),
  notFoundComponent: () => <div>Project not found.</div>,
});

function IntelligenceLayerPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const listSourcesFn = useServerFn(listSources);
  const listVersionsFn = useServerFn(listVersions);
  const listChangesFn = useServerFn(listChangeEvents);
  const listAuditFn = useServerFn(listAuditLog);

  const sourcesQ = useQuery({
    queryKey: ["engine", "sources", projectId],
    queryFn: () => listSourcesFn({ data: { projectId } }),
    // Live-poll while any source is processing.
    refetchInterval: (q) => {
      const rows = ((q.state.data as any)?.rows ?? []) as EngineSource[];
      return rows.some((r) => r.status === "processing") ? 1500 : false;
    },
  });
  const versionsQ = useQuery({
    queryKey: ["engine", "versions", projectId],
    queryFn: () => listVersionsFn({ data: { projectId } }),
  });
  const changesQ = useQuery({
    queryKey: ["engine", "changes", projectId],
    queryFn: () => listChangesFn({ data: { projectId } }),
  });
  const auditQ = useQuery({
    queryKey: ["engine", "audit", projectId],
    queryFn: () => listAuditFn({ data: { projectId, limit: 100 } }),
  });

  const runPipeline = useServerFn(runIntelligencePipeline);
  const runMut = useMutation({
    mutationFn: () => runPipeline({ data: { projectId } }),
    onSuccess: (r: any) => {
      toast.success(`Draft ${r.version} generated`);
      qc.invalidateQueries({ queryKey: ["engine"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Pipeline failed"),
  });

  const sources = (sourcesQ.data as any)?.rows ?? [];
  const versions = (versionsQ.data as any)?.rows ?? [];
  const changes = (changesQ.data as any)?.rows ?? [];
  const auditRows = (auditQ.data as any)?.rows ?? [];

  const latestDraft = versions.find((v: EngineRoadmapVersion) => v.status !== "approved" && v.status !== "archived");
  const latestApproved = versions.find((v: EngineRoadmapVersion) => v.status === "approved");
  const processedCount = sources.filter((s: EngineSource) => s.status === "processed").length;
  const conflicts = changes.filter((c: EngineChangeEvent) => c.kind === "conflict" && !c.resolved_at).length;
  const overallConfidence = sources.length
    ? Math.round(sources.reduce((s: number, r: EngineSource) => s + r.confidence, 0) / sources.length)
    : 0;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
      <div className="space-y-5 min-w-0">
        {/* Header */}
        <div className="rounded-xl bg-card border border-border p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-display text-2xl text-ink">Intelligence Layer</h2>
              <p className="text-sm text-ink/60 mt-1">
                Upload the truth. Let the engine draft. Review before anything becomes official.
              </p>
            </div>
            <button
              onClick={() => runMut.mutate()}
              disabled={runMut.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-royal text-white text-sm px-4 py-2 hover:bg-royal/90 disabled:opacity-60"
            >
              {runMut.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Run Intelligence Update
            </button>
          </div>
        </div>

        {/* Deep-link anchors for TruthCard "Open intelligence room" links.
            Kept in sync with src/lib/intelligence-room-links.ts. */}
        <section id="point-a" aria-label="Point A intelligence" className="scroll-mt-20" />
        <section id="point-b" aria-label="Point B intelligence" className="scroll-mt-20" />

        <InputHub
          projectId={projectId}
          sources={sources}
          onChange={() => sourcesQ.refetch()}
        />
        <ProcessingTimeline running={runMut.isPending} sources={sources} />
        <ChangeDetection changes={changes} onResolve={() => changesQ.refetch()} />
        <VersionsTable
          versions={versions}
          projectId={projectId}
          onRefresh={() => {
            versionsQ.refetch();
            auditQ.refetch();
          }}
        />
        <AuditLogSection rows={auditRows} loading={auditQ.isLoading} onRefresh={() => auditQ.refetch()} />
      </div>

      {/* Right rail */}
      <aside className="space-y-4">
        <div className="rounded-xl bg-card border border-border p-4 shadow-sm">
          <div className="font-display text-lg text-ink">Intelligence Control</div>
          <div className="mt-4 space-y-3 text-sm">
            <RailRow
              label="Current approved"
              value={latestApproved?.version ?? "None"}
              tone={latestApproved ? "green" : "muted"}
            />
            <RailRow
              label="Latest draft"
              value={latestDraft?.version ?? "None"}
              tone={latestDraft ? "blue" : "muted"}
            />
            <RailRow label="Sources processed" value={`${processedCount} / ${sources.length}`} />
            <RailRow label="AI confidence" value={`${overallConfidence}%`} tone="blue" />
            <RailRow label="Conflicts detected" value={conflicts.toString()} tone={conflicts ? "red" : "muted"} />
          </div>
        </div>

        <div className="rounded-xl bg-royal/5 border border-royal/20 p-4">
          <div className="font-display text-sm text-ink">Next best action</div>
          <p className="text-xs text-ink/70 mt-1.5">
            {latestDraft
              ? `Review draft ${latestDraft.version} before approving.`
              : "Add sources and run the intelligence update."}
          </p>
          <Link
            to="/engine/projects/$projectId/agent"
            params={{ projectId }}
            className="mt-3 inline-flex items-center gap-1.5 text-xs bg-ink text-white rounded-md px-3 py-1.5 hover:bg-ink/90"
          >
            Ask the agent
          </Link>
        </div>

        <div className="rounded-xl bg-card border border-border p-4 shadow-sm">
          <div className="font-display text-sm text-ink">Safety</div>
          <ul className="mt-2 space-y-1.5 text-xs text-ink/70">
            <li className="flex gap-2"><ShieldCheck className="w-3.5 h-3.5 text-[#1f6b3b] shrink-0 mt-0.5" /> AI drafts, you approve.</li>
            <li className="flex gap-2"><ShieldCheck className="w-3.5 h-3.5 text-[#1f6b3b] shrink-0 mt-0.5" /> Approved versions are protected.</li>
            <li className="flex gap-2"><ShieldCheck className="w-3.5 h-3.5 text-[#1f6b3b] shrink-0 mt-0.5" /> Client copy needs final review.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

function RailRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "blue" | "red" | "muted";
}) {
  const color =
    tone === "green" ? "text-[#1f6b3b]" : tone === "blue" ? "text-royal" : tone === "red" ? "text-[#a4283c]" : "text-ink/60";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink/60">{label}</span>
      <span className={`font-medium ${color}`}>{value}</span>
    </div>
  );
}

/* ============================================================
 * Input Hub
 * ============================================================ */

function InputHub({
  projectId,
  sources,
  onChange,
}: {
  projectId: string;
  sources: EngineSource[];
  onChange: () => void;
}) {
  const [mode, setMode] = useState<null | "upload" | "url" | "transcript" | "brief" | "more">(null);

  return (
    <SectionCard
      title={<span className="flex items-center gap-2"><FileText className="w-4 h-4 text-ink/60" />Input Hub</span>}
      right={<span>{sources.length} sources</span>}
    >
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <QuickAdd icon={<Upload className="w-4 h-4" />} label="Upload source" hint="Files, docs" onClick={() => setMode("upload")} active={mode === "upload"} />
        <QuickAdd icon={<Link2 className="w-4 h-4" />} label="Add URL" hint="Website, competitor" onClick={() => setMode("url")} active={mode === "url"} />
        <QuickAdd icon={<FileText className="w-4 h-4" />} label="Paste transcript" hint="Call, meeting" onClick={() => setMode("transcript")} active={mode === "transcript"} />
        <QuickAdd icon={<StickyNote className="w-4 h-4" />} label="Brief or notes" hint="Research, email" onClick={() => setMode("brief")} active={mode === "brief"} />
        <QuickAdd icon={<MoreHorizontal className="w-4 h-4" />} label="Screenshots" hint="Prior roadmap" onClick={() => setMode("more")} active={mode === "more"} />
      </div>

      {mode ? (
        <div className="mt-4">
          <AddSourceForm projectId={projectId} mode={mode} onClose={() => setMode(null)} onDone={onChange} />
        </div>
      ) : null}

      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.18em] text-ink/50 border-b border-border">
              <th className="text-left py-2">Source</th>
              <th className="text-left">Type</th>
              <th className="text-left">Date</th>
              <th className="text-left">Status</th>
              <th className="text-right">Signals</th>
              <th className="text-right">Confidence</th>
              <th className="text-left pl-4">Used in</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sources.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <EmptyState title="No sources yet" hint="Add a transcript, brief, or URL to start." />
                </td>
              </tr>
            ) : (
              sources.map((s) => <SourceRow key={s.id} row={s} onChange={onChange} />)
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function QuickAdd({
  icon,
  label,
  hint,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-lg border p-3 transition ${
        active ? "border-royal bg-royal/5" : "border-border hover:border-royal/40"
      }`}
    >
      <div className="flex items-center gap-2 text-ink font-medium text-sm">
        {icon} {label}
      </div>
      <div className="text-xs text-ink/60 mt-1">{hint}</div>
    </button>
  );
}

function AddSourceForm({
  projectId,
  mode,
  onClose,
  onDone,
}: {
  projectId: string;
  mode: "upload" | "url" | "transcript" | "brief" | "more";
  onClose: () => void;
  onDone: () => void;
}) {
  const createFn = useServerFn(createSource);
  const uploadUrlFn = useServerFn(createSourceUploadUrl);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const label = {
    upload: "Upload a file",
    url: "Add a URL",
    transcript: "Paste transcript",
    brief: "Paste brief or notes",
    more: "Attach screenshot",
  }[mode];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "upload" || mode === "more") {
        const file = fileRef.current?.files?.[0];
        if (!file) throw new Error("Choose a file first.");
        const signed = (await uploadUrlFn({ data: { projectId, filename: file.name } })) as any;
        const { error } = await supabase.storage
          .from("engine-signals")
          .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
        if (error) throw new Error(error.message);
        await createFn({
          data: {
            projectId,
            name: name || file.name,
            type: mode === "more" ? "screenshot" : "document",
            storage_path: signed.path,
          },
        });
      } else if (mode === "url") {
        await createFn({
          data: {
            projectId,
            name: name || url,
            type: "website_url",
            url,
          },
        });
      } else {
        await createFn({
          data: {
            projectId,
            name: name || `${mode} · ${new Date().toLocaleDateString()}`,
            type: mode === "transcript" ? "transcript" : "brief",
            raw_text: text,
          },
        });
      }
      toast.success("Source added");
      onDone();
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-border p-4 bg-canvas/50 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-medium text-sm text-ink">{label}</div>
        <button type="button" onClick={onClose} className="text-xs text-ink/60 hover:text-ink">
          Cancel
        </button>
      </div>
      <input
        placeholder="Label (optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full text-sm border border-border rounded-md px-3 py-2 bg-card"
      />
      {mode === "upload" || mode === "more" ? (
        <input ref={fileRef} type="file" className="text-sm" />
      ) : mode === "url" ? (
        <input
          type="url"
          required
          placeholder="https://..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full text-sm border border-border rounded-md px-3 py-2 bg-card"
        />
      ) : (
        <textarea
          required
          rows={6}
          placeholder="Paste content..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full text-sm border border-border rounded-md px-3 py-2 bg-card font-mono"
        />
      )}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 text-sm bg-ink text-white rounded-md px-3 py-1.5 hover:bg-ink/90 disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Add source
        </button>
      </div>
    </form>
  );
}

function SourceRow({ row, onChange }: { row: EngineSource; onChange: () => void }) {
  const removeFn = useServerFn(removeSource);
  const reprocessFn = useServerFn(reprocessSource);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const isProcessing = row.status === "processing";
  const isFailed = row.status === "failed";
  const stages = (row.processing_stages ?? []) as EngineSourceStage[];

  const reprocess = async () => {
    setBusy(true);
    setOpen(true);
    try {
      await reprocessFn({ data: { id: row.id } });
      toast.success(`Reprocessed "${row.name}"`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      onChange();
    }
  };

  return (
    <>
      <tr className="border-b border-border/60">
        <td className="py-2.5">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setOpen((v) => !v)}
              className="p-0.5 hover:bg-ink/5 rounded"
              aria-label={open ? "Collapse stages" : "Expand stages"}
            >
              {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            <div className="min-w-0">
              <div className="font-medium text-ink text-sm truncate">{row.name}</div>
              {row.url ? (
                <a
                  href={row.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-royal hover:underline inline-flex items-center gap-1"
                >
                  {row.url.slice(0, 48)} <ExternalLink className="w-3 h-3" />
                </a>
              ) : null}
              {isFailed && row.error ? (
                <div className="text-[11px] text-[#a4283c] mt-0.5 truncate max-w-[320px]">{row.error}</div>
              ) : null}
            </div>
          </div>
        </td>
        <td className="text-ink/70 capitalize">{row.type.replace(/_/g, " ")}</td>
        <td className="text-ink/60 text-xs">{new Date(row.created_at).toLocaleDateString()}</td>
        <td>
          <StatusPill status={row.status} />
        </td>
        <td className="text-right text-ink/80">{row.signals_count}</td>
        <td className="text-right">
          <ConfidenceDial value={row.confidence} />
        </td>
        <td className="pl-4 text-ink/70 text-xs">{row.used_in_version ?? "—"}</td>
        <td className="text-right">
          <div className="inline-flex items-center gap-1">
            <button
              title="Reprocess this source"
              onClick={reprocess}
              disabled={busy || isProcessing}
              className="p-1 hover:bg-ink/5 rounded disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busy || isProcessing ? "animate-spin" : ""}`} />
            </button>
            <button
              title="Remove"
              onClick={async () => {
                if (!confirm(`Remove "${row.name}"?`)) return;
                await removeFn({ data: { id: row.id } });
                onChange();
              }}
              className="p-1 hover:bg-ink/5 rounded"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
      {open ? (
        <tr className="bg-canvas/60 border-b border-border/60">
          <td colSpan={8} className="px-3 py-3">
            <StagePanel stages={stages} isProcessing={isProcessing} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function StagePanel({
  stages,
  isProcessing,
}: {
  stages: EngineSourceStage[];
  isProcessing: boolean;
}) {
  if (!stages.length) {
    return (
      <div className="text-xs text-ink/60">
        {isProcessing
          ? "Starting…"
          : "Not yet processed. Click the refresh icon to run the pipeline for this source."}
      </div>
    );
  }
  return (
    <ol className="grid grid-cols-1 md:grid-cols-5 gap-2">
      {stages.map((s) => (
        <li
          key={s.key}
          className="rounded-md border border-border bg-white px-3 py-2 flex items-start gap-2"
        >
          <StageIcon status={s.status} />
          <div className="min-w-0 flex-1">
            <div className="text-xs text-ink font-medium">{s.label}</div>
            <div className="text-[10px] uppercase tracking-wide text-ink/50">{s.status}</div>
            {s.note ? <div className="text-[11px] text-ink/70 mt-0.5 truncate">{s.note}</div> : null}
            {s.error ? <div className="text-[11px] text-[#a4283c] mt-0.5 truncate">{s.error}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function StageIcon({ status }: { status: EngineSourceStage["status"] }) {
  if (status === "running") return <Loader2 className="w-3.5 h-3.5 mt-0.5 text-royal animate-spin" />;
  if (status === "completed") return <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-[#1f6b3b]" />;
  if (status === "failed") return <XCircle className="w-3.5 h-3.5 mt-0.5 text-[#a4283c]" />;
  if (status === "skipped") return <MinusCircle className="w-3.5 h-3.5 mt-0.5 text-ink/40" />;
  return <span className="w-3.5 h-3.5 mt-0.5 rounded-full border border-ink/30 block" />;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    queued: "bg-[#ecedf0] text-ink/70 border-[#d6d8df]",
    processing: "bg-[#e9eefb] text-royal border-[#cdd6f3]",
    processed: "bg-[#e6f5ec] text-[#1f6b3b] border-[#c4e6d2]",
    failed: "bg-[#fbe9ec] text-[#a4283c] border-[#f3ced5]",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${map[status] ?? map.queued}`}
    >
      {status}
    </span>
  );
}

function ConfidenceDial({ value }: { value: number }) {
  const color = value >= 80 ? "text-[#1f6b3b]" : value >= 50 ? "text-[#8a6713]" : "text-ink/50";
  return <span className={`text-xs font-mono ${color}`}>{value}%</span>;
}

/* ============================================================
 * Processing Timeline
 * ============================================================ */

function ProcessingTimeline({
  running,
  sources,
}: {
  running: boolean;
  sources: EngineSource[];
}) {
  // Aggregate per-stage status across all sources so Tai sees at a glance
  // where the pipeline is spending time.
  type Agg = { total: number; running: number; completed: number; failed: number; skipped: number };
  const agg = new Map<string, Agg>();
  for (const s of sources) {
    for (const st of s.processing_stages ?? []) {
      const cur = agg.get(st.key) ?? { total: 0, running: 0, completed: 0, failed: 0, skipped: 0 };
      cur.total += 1;
      if (st.status === "running") cur.running += 1;
      else if (st.status === "completed") cur.completed += 1;
      else if (st.status === "failed") cur.failed += 1;
      else if (st.status === "skipped") cur.skipped += 1;
      agg.set(st.key, cur);
    }
  }
  const anyProcessing = sources.some((s) => s.status === "processing");
  return (
    <SectionCard
      title={<span className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-ink/60" />AI Processing Timeline</span>}
      right={
        running || anyProcessing ? (
          <span className="text-royal inline-flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Running
          </span>
        ) : (
          <span>Idle</span>
        )
      }
    >
      <div className="text-[11px] uppercase tracking-wider text-ink/50 mb-2">Pipeline stages</div>
      <ol className="space-y-2 mb-4">
        {PIPELINE_STAGES.map((s, i) => (
          <li key={s.key} className="flex items-center gap-3 text-sm">
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                running ? "bg-royal/10 text-royal" : "bg-ink/5 text-ink/50"
              }`}
            >
              {running ? <Loader2 className="w-3 h-3 animate-spin" /> : i + 1}
            </span>
            <span className="text-ink">{s.label}</span>
          </li>
        ))}
      </ol>
      {sources.length ? (
        <>
          <div className="text-[11px] uppercase tracking-wider text-ink/50 mb-2">
            Per-source jobs
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {["queued", "fetch", "extract", "persist", "complete"].map((k) => {
              const a = agg.get(k) ?? { total: 0, running: 0, completed: 0, failed: 0, skipped: 0 };
              return (
                <div key={k} className="rounded-md border border-border bg-white px-3 py-2">
                  <div className="text-[11px] text-ink/60 capitalize">{k}</div>
                  <div className="mt-1 flex items-center gap-2 flex-wrap text-[11px]">
                    {a.running ? <span className="text-royal">{a.running} running</span> : null}
                    {a.completed ? (
                      <span className="text-[#1f6b3b]">{a.completed} done</span>
                    ) : null}
                    {a.failed ? <span className="text-[#a4283c]">{a.failed} failed</span> : null}
                    {a.skipped ? <span className="text-ink/40">{a.skipped} skipped</span> : null}
                    {!a.total ? <span className="text-ink/40">—</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </SectionCard>
  );
}

/* ============================================================
 * Change Detection
 * ============================================================ */

function ChangeDetection({
  changes,
  onResolve,
}: {
  changes: EngineChangeEvent[];
  onResolve: () => void;
}) {
  const resolveFn = useServerFn(resolveChangeEvent);
  const active = useMemo(() => changes.filter((c) => !c.resolved_at), [changes]);
  return (
    <SectionCard
      title={<span className="flex items-center gap-2"><GitCompare className="w-4 h-4 text-ink/60" />Change Detection</span>}
      right={<span>{active.length} open</span>}
    >
      {active.length === 0 ? (
        <EmptyState title="No pending changes" hint="Run the pipeline to detect new information." />
      ) : (
        <ul className="space-y-2">
          {active.map((c) => (
            <li key={c.id} className="flex items-start gap-3 border border-border rounded-md px-3 py-2.5">
              <SeverityDot severity={c.severity} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-ink">{c.title}</span>
                  <span className="text-[10px] uppercase tracking-wide text-ink/50">
                    {c.kind.replace(/_/g, " ")}
                  </span>
                  {c.affected_module ? (
                    <span className="text-[10px] text-royal">→ {c.affected_module}</span>
                  ) : null}
                </div>
                {c.body ? <p className="text-xs text-ink/70 mt-1">{c.body}</p> : null}
              </div>
              <button
                onClick={async () => {
                  await resolveFn({ data: { id: c.id } });
                  onResolve();
                }}
                className="text-xs text-ink/60 hover:text-ink"
              >
                Resolve
              </button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function SeverityDot({ severity }: { severity: string }) {
  const color =
    severity === "critical" ? "bg-[#a4283c]" : severity === "warn" ? "bg-[#c99a20]" : "bg-royal";
  return <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${color}`} />;
}

/* ============================================================
 * Versions Table
 * ============================================================ */

function VersionsTable({
  versions,
  projectId,
  onRefresh,
}: {
  versions: EngineRoadmapVersion[];
  projectId: string;
  onRefresh: () => void;
}) {
  const approveFn = useServerFn(approveVersion);
  const archiveFn = useServerFn(archiveVersion);
  const restoreFn = useServerFn(restoreVersion);
  const compareFn = useServerFn(compareVersions);
  const [selected, setSelected] = useState<string[]>([]);
  const [diff, setDiff] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) => {
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : s.length >= 2 ? [s[1], id] : [...s, id],
    );
  };
  const runCompare = async () => {
    if (selected.length !== 2) {
      toast.error("Pick two versions to compare.");
      return;
    }
    setBusy(true);
    try {
      const res = await compareFn({ data: { aId: selected[0], bId: selected[1] } });
      setDiff(res);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      title={<span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-ink/60" />Roadmap Versions</span>}
      right={
        <div className="flex items-center gap-2">
          <span>{versions.length} total</span>
          <button
            disabled={selected.length !== 2 || busy}
            onClick={runCompare}
            className="text-xs inline-flex items-center gap-1 border border-border rounded px-2 py-1 disabled:opacity-40 hover:bg-ink/5"
          >
            <GitCompare className="w-3.5 h-3.5" />
            Compare ({selected.length}/2)
          </button>
        </div>
      }
    >
      {versions.length === 0 ? (
        <EmptyState title="No versions yet" hint="Run the intelligence update to draft v0.1." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.18em] text-ink/50 border-b border-border">
                <th className="w-6"></th>
                <th className="text-left py-2">Version</th>
                <th className="text-left">Status</th>
                <th className="text-left">Created by</th>
                <th className="text-left">Sources</th>
                <th className="text-left">Summary</th>
                <th className="text-left">Date</th>
                <th className="text-left">Approved by</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id} className="border-b border-border/60">
                  <td className="py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.includes(v.id)}
                      onChange={() => toggle(v.id)}
                    />
                  </td>
                  <td className="py-2.5 font-mono text-ink">{v.version}</td>
                  <td>
                    <VersionStatus status={v.status} />
                  </td>
                  <td className="text-ink/70 capitalize">{v.created_by}</td>
                  <td className="text-ink/70 text-xs">{v.source_ids.length}</td>
                  <td className="text-ink/70 text-xs max-w-[280px] truncate">{v.summary ?? "—"}</td>
                  <td className="text-ink/60 text-xs">{new Date(v.created_at).toLocaleDateString()}</td>
                  <td className="text-ink/70 text-xs">{v.approved_by ?? "—"}</td>
                  <td className="text-right">
                    <div className="inline-flex items-center gap-1">
                      {v.status !== "approved" && v.status !== "archived" ? (
                        <button
                          onClick={async () => {
                            if (!confirm(`Approve version ${v.version}? This locks the roadmap.`)) return;
                            try {
                              const r = (await approveFn({ data: { id: v.id } })) as any;
                              toast.success(`Version ${r.version} approved`);
                              onRefresh();
                            } catch (e) {
                              toast.error((e as Error).message);
                            }
                          }}
                          className="text-xs bg-ink text-white rounded px-2 py-1 hover:bg-ink/90"
                        >
                          Approve
                        </button>
                      ) : null}
                      <button
                        title="Restore as new draft"
                        onClick={async () => {
                          if (!confirm(`Restore ${v.version} as a new draft?`)) return;
                          try {
                            const r = (await restoreFn({ data: { id: v.id } })) as any;
                            toast.success(`Restored as ${r.version}`);
                            onRefresh();
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        }}
                        className="p-1 hover:bg-ink/5 rounded"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      {v.status !== "archived" && v.status !== "approved" ? (
                        <button
                          title="Archive"
                          onClick={async () => {
                            try {
                              await archiveFn({ data: { id: v.id } });
                              onRefresh();
                            } catch (e) {
                              toast.error((e as Error).message);
                            }
                          }}
                          className="p-1 hover:bg-ink/5 rounded"
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {diff ? (
        <VersionDiffModal
          diff={diff}
          projectId={projectId}
          onClose={() => setDiff(null)}
          onRestored={onRefresh}
        />
      ) : null}
    </SectionCard>
  );
}

/* Simple LCS-based line diff. Small enough to inline; used only in the modal. */
type DiffLine = { type: "eq" | "add" | "del"; text: string };
function lineDiff(a: string, b: string): DiffLine[] {
  const A = a.split("\n");
  const B = b.split("\n");
  const m = A.length;
  const n = B.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (A[i] === B[j]) {
      out.push({ type: "eq", text: A[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "del", text: A[i] });
      i++;
    } else {
      out.push({ type: "add", text: B[j] });
      j++;
    }
  }
  while (i < m) out.push({ type: "del", text: A[i++] });
  while (j < n) out.push({ type: "add", text: B[j++] });
  return out;
}

function VersionDiffModal({
  diff,
  projectId: _projectId,
  onClose,
  onRestored,
}: {
  diff: any;
  projectId: string;
  onClose: () => void;
  onRestored: () => void;
}) {
  const restoreSectionFn = useServerFn(restoreVersionSection);
  const changed = diff.diffs.filter((d: any) => d.changed);
  const [restoring, setRestoring] = useState<string | null>(null);

  const restoreFrom = async (module: string, source: "a" | "b") => {
    const src = source === "a" ? diff.a : diff.b;
    if (!confirm(`Restore "${module}" from ${src.version} into the current draft?`)) return;
    setRestoring(module + source);
    try {
      await restoreSectionFn({ data: { sourceVersionId: src.id, module } });
      toast.success(`${module} restored from ${src.version}`);
      onRestored();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-lg border border-border shadow-xl w-full max-w-6xl max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="text-sm">
            <span className="font-mono text-ink">{diff.a.version}</span>
            <span className="text-ink/40 mx-2">→</span>
            <span className="font-mono text-ink">{diff.b.version}</span>
            <span className="text-ink/50 ml-3 text-xs">
              {changed.length} of {diff.diffs.length} modules differ
            </span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-ink/5 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-auto p-4 space-y-4">
          {changed.length === 0 ? (
            <div className="text-sm text-ink/60">
              These versions are identical across tracked modules.
            </div>
          ) : (
            changed.map((d: any) => {
              const lines = lineDiff(d.a || "", d.b || "");
              return (
                <div key={d.module} className="border border-border rounded overflow-hidden">
                  <div className="flex items-center justify-between bg-ink/5 px-3 py-1.5">
                    <div className="text-[11px] uppercase tracking-wider text-ink/70">
                      {d.module.replace(/_/g, " ")}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        disabled={restoring === d.module + "a"}
                        onClick={() => restoreFrom(d.module, "a")}
                        className="text-[11px] inline-flex items-center gap-1 border border-border rounded px-2 py-0.5 bg-white hover:bg-ink/5 disabled:opacity-40"
                      >
                        <RotateCcw className="w-3 h-3" /> Restore from {diff.a.version}
                      </button>
                      <button
                        disabled={restoring === d.module + "b"}
                        onClick={() => restoreFrom(d.module, "b")}
                        className="text-[11px] inline-flex items-center gap-1 border border-border rounded px-2 py-0.5 bg-white hover:bg-ink/5 disabled:opacity-40"
                      >
                        <RotateCcw className="w-3 h-3" /> Restore from {diff.b.version}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 text-[11px] font-mono max-h-72">
                    <div className="border-r border-border overflow-auto">
                      {lines.map((l, i) =>
                        l.type === "add" ? null : (
                          <div
                            key={`a-${i}`}
                            className={
                              l.type === "del"
                                ? "bg-red-100/60 text-red-900 px-2 whitespace-pre-wrap break-words"
                                : "text-ink/80 px-2 whitespace-pre-wrap break-words"
                            }
                          >
                            <span className="opacity-40 select-none mr-2">
                              {l.type === "del" ? "-" : " "}
                            </span>
                            {l.text || " "}
                          </div>
                        ),
                      )}
                    </div>
                    <div className="overflow-auto">
                      {lines.map((l, i) =>
                        l.type === "del" ? null : (
                          <div
                            key={`b-${i}`}
                            className={
                              l.type === "add"
                                ? "bg-green-100/60 text-green-900 px-2 whitespace-pre-wrap break-words"
                                : "text-ink/80 px-2 whitespace-pre-wrap break-words"
                            }
                          >
                            <span className="opacity-40 select-none mr-2">
                              {l.type === "add" ? "+" : " "}
                            </span>
                            {l.text || " "}
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}


function VersionStatus({ status }: { status: string }) {
  const map: Record<string, string> = {
    ai_generated: "bg-[#efe9fb] text-[#5435a4] border-[#dccdf3]",
    draft: "bg-[#e9eefb] text-royal border-[#cdd6f3]",
    needs_review: "bg-[#fbf3e0] text-[#8a6713] border-[#f1e3b9]",
    tai_edited: "bg-[#e9eefb] text-royal border-[#cdd6f3]",
    approved: "bg-[#e6f5ec] text-[#1f6b3b] border-[#c4e6d2]",
    client_facing: "bg-[#e6f5ec] text-[#1f6b3b] border-[#c4e6d2]",
    delivered: "bg-[#efe9fb] text-[#5435a4] border-[#dccdf3]",
    archived: "bg-[#ecedf0] text-ink/50 border-[#d6d8df]",
  };
  const label = status.replace(/_/g, " ");
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${map[status] ?? map.draft}`}>
      {label}
    </span>
  );
}

/* ============================================================
 * Audit Log
 * ============================================================ */

const AUDIT_ACTION_LABEL: Record<string, { label: string; tone: string; icon: React.ReactNode }> = {
  version_approved: { label: "Version approved", tone: "text-[#1f6b3b]", icon: <ShieldCheck className="w-3.5 h-3.5" /> },
  version_archived: { label: "Version archived", tone: "text-ink/60", icon: <Archive className="w-3.5 h-3.5" /> },
  version_restored: { label: "Version restored", tone: "text-royal", icon: <RotateCcw className="w-3.5 h-3.5" /> },
  version_compared: { label: "Versions compared", tone: "text-ink/70", icon: <GitCompare className="w-3.5 h-3.5" /> },
  section_restored: { label: "Section restored", tone: "text-royal", icon: <RotateCcw className="w-3.5 h-3.5" /> },
  agent_applied: { label: "Agent applied", tone: "text-[#5435a4]", icon: <Sparkles className="w-3.5 h-3.5" /> },
  agent_pending_approval: { label: "Agent proposal queued", tone: "text-[#8a6713]", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
};

function AuditLogSection({
  rows,
  loading,
  onRefresh,
}: {
  rows: EngineAuditLog[];
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <SectionCard
      title={<span className="flex items-center gap-2"><History className="w-4 h-4 text-ink/60" />Audit Log</span>}
      right={
        <button onClick={onRefresh} className="text-xs text-ink/60 hover:text-ink inline-flex items-center gap-1">
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      }
    >
      {rows.length === 0 ? (
        <EmptyState title="No audit events yet" hint="Approvals, restores, compares, and agent applies land here." />
      ) : (
        <ul className="divide-y divide-border/70">
          {rows.map((r) => {
            const meta = AUDIT_ACTION_LABEL[r.action] ?? {
              label: r.action.replace(/_/g, " "),
              tone: "text-ink/70",
              icon: <History className="w-3.5 h-3.5" />,
            };
            return (
              <li key={r.id} className="py-2.5 flex items-start gap-3">
                <span className={`${meta.tone} mt-0.5`}>{meta.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-medium ${meta.tone}`}>{meta.label}</span>
                    <span className="text-[11px] text-ink/50">{new Date(r.created_at).toLocaleString()}</span>
                    {r.actor_email ? (
                      <span className="text-[11px] text-ink/70">· {r.actor_email}</span>
                    ) : null}
                  </div>
                  {r.summary ? <div className="text-xs text-ink/70 mt-0.5">{r.summary}</div> : null}
                  {r.affected_modules?.length ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.affected_modules.map((m) => (
                        <span
                          key={m}
                          className="text-[10px] uppercase tracking-wide bg-ink/5 text-ink/70 rounded px-1.5 py-0.5"
                        >
                          {m.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
