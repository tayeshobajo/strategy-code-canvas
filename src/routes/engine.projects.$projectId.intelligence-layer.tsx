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
  Archive,
  GitCompare,
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
  listChangeEvents,
  resolveChangeEvent,
  runIntelligencePipeline,
  createSourceUploadUrl,
  type EngineSource,
  type EngineRoadmapVersion,
  type EngineChangeEvent,
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

  const sourcesQ = useQuery({
    queryKey: ["engine", "sources", projectId],
    queryFn: () => listSourcesFn({ data: { projectId } }),
  });
  const versionsQ = useQuery({
    queryKey: ["engine", "versions", projectId],
    queryFn: () => listVersionsFn({ data: { projectId } }),
  });
  const changesQ = useQuery({
    queryKey: ["engine", "changes", projectId],
    queryFn: () => listChangesFn({ data: { projectId } }),
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

        <InputHub projectId={projectId} sources={sources} onChange={() => sourcesQ.refetch()} />
        <ProcessingTimeline running={runMut.isPending} />
        <ChangeDetection changes={changes} onResolve={() => changesQ.refetch()} />
        <VersionsTable
          versions={versions}
          onRefresh={() => versionsQ.refetch()}
        />
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
  return (
    <tr className="border-b border-border/60">
      <td className="py-2.5">
        <div className="font-medium text-ink text-sm">{row.name}</div>
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
            title="Reprocess"
            onClick={async () => {
              setBusy(true);
              await reprocessFn({ data: { id: row.id } });
              setBusy(false);
              onChange();
            }}
            disabled={busy}
            className="p-1 hover:bg-ink/5 rounded"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} />
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
  );
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

function ProcessingTimeline({ running }: { running: boolean }) {
  return (
    <SectionCard
      title={<span className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-ink/60" />AI Processing Timeline</span>}
      right={running ? <span className="text-royal">Running…</span> : <span>Idle</span>}
    >
      <ol className="space-y-2.5">
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
  onRefresh,
}: {
  versions: EngineRoadmapVersion[];
  onRefresh: () => void;
}) {
  const approveFn = useServerFn(approveVersion);
  const archiveFn = useServerFn(archiveVersion);
  return (
    <SectionCard
      title={<span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-ink/60" />Roadmap Versions</span>}
      right={<span>{versions.length} total</span>}
    >
      {versions.length === 0 ? (
        <EmptyState title="No versions yet" hint="Run the intelligence update to draft v0.1." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.18em] text-ink/50 border-b border-border">
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
                            const r = (await approveFn({ data: { id: v.id } })) as any;
                            toast.success(`Version ${r.version} approved`);
                            onRefresh();
                          }}
                          className="text-xs bg-ink text-white rounded px-2 py-1 hover:bg-ink/90"
                        >
                          Approve
                        </button>
                      ) : null}
                      {v.status !== "archived" ? (
                        <button
                          title="Archive"
                          onClick={async () => {
                            await archiveFn({ data: { id: v.id } });
                            onRefresh();
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
    </SectionCard>
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
