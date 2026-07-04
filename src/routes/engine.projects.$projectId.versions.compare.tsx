/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { type ReactNode, useEffect, useState } from "react";
import { ArrowRightLeft, ShieldCheck, Check, X, Edit3, CheckCircle2, AlertTriangle, FileText, Loader2, Send } from "lucide-react";
import { SectionCard, MetricCard } from "@/components/engine/primitives";
import { OperatorLockNotice } from "@/components/engine/OperatorLockNotice";
import { useEngineRole } from "@/hooks/useEngineRole";
import {
  getVersionCompareData,
  listVersionChangeDecisions,
  recordVersionChangeDecision,
} from "@/lib/engine-execution.functions";
import { approveVersion } from "@/lib/engine-intelligence.functions";
import {
  submitPreviewForApproval,
  approvePreview,
  publishVersionToPortal,
} from "@/lib/engine-ops.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/engine/projects/$projectId/versions/compare")({
  component: VersionComparePage,
  errorComponent: ({ error }) => (
    <div className="text-red-700 text-sm">Failed: {(error as Error).message}</div>
  ),
});

function VersionComparePage() {
  const { projectId } = Route.useParams();
  const fn = useServerFn(getVersionCompareData);
  const approveFn = useServerFn(approveVersion);
  const listDecisionsFn = useServerFn(listVersionChangeDecisions);
  const recordDecisionFn = useServerFn(recordVersionChangeDecision);
  const { canPublish, adminOnlyReason } = useEngineRole();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["engine", "versions-compare", projectId],
    queryFn: () => fn({ data: { projectId } }),
  });
  const d = q.data as any;
  const modules = d?.modules ?? [];
  const summary = d?.summary ?? { totalChanges: 0, added: 0, modified: 0, removed: 0, conflicts: 0, modulesAffected: 0 };
  const approved = d?.approved;
  const draft = d?.draft;

  const [activeModule, setActiveModule] = useState<string>(modules.find((m: any) => m.changes.length > 0)?.key ?? modules[0]?.key ?? "point_a");
  const [decisions, setDecisions] = useState<Record<string, "accept" | "reject" | "edit" | undefined>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  // Load persisted per-change decisions for the current draft.
  const decisionsQuery = useQuery({
    queryKey: ["engine", "version-decisions", draft?.id],
    queryFn: () => listDecisionsFn({ data: { version_id: draft.id as string } }),
    enabled: Boolean(draft?.id),
  });

  useEffect(() => {
    if (!decisionsQuery.data) return;
    // Take latest decision per change_id (rows are ordered ascending).
    const map: Record<string, "accept" | "edit" | "reject"> = {};
    for (const r of decisionsQuery.data) map[r.change_id] = r.decision;
    setDecisions((prev) => ({ ...map, ...prev })); // in-flight optimistic wins
  }, [decisionsQuery.data]);

  const recordMut = useMutation({
    mutationFn: (args: { module_key: string; change_id: string; decision: "accept" | "edit" | "reject" }) =>
      recordDecisionFn({
        data: {
          version_id: draft.id,
          project_id: projectId,
          module_key: args.module_key,
          change_id: args.change_id,
          decision: args.decision,
        },
      }),
    onError: (e: Error) => toast.error(e.message ?? "Failed to save decision"),
  });

  const approveMut = useMutation({
    mutationFn: async () => {
      if (!draft?.id) throw new Error("No draft version to approve.");
      return approveFn({ data: { id: draft.id } });
    },
    onSuccess: async () => {
      setApproveError(null);
      setConfirmed(false);
      toast.success("Approved. This draft is now the official version.");
      await qc.invalidateQueries({ queryKey: ["engine", "versions-compare", projectId] });
      await qc.invalidateQueries({ queryKey: ["engine"] });
    },
    onError: (e: Error) => {
      setApproveError(e.message);
      toast.error(e.message);
    },
  });

  const activeMod = modules.find((m: any) => m.key === activeModule);

  const decide = (moduleKey: string, changeId: string, choice: "accept" | "reject" | "edit") => {
    setDecisions((prev) => ({ ...prev, [changeId]: choice }));
    if (draft?.id) recordMut.mutate({ module_key: moduleKey, change_id: changeId, decision: choice });
  };


  return (
    <div className="space-y-5 max-w-[1500px]">

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl text-ink flex items-center gap-2">
            Version Compare / Change Review <ShieldCheck className="w-5 h-5 text-royal" />
          </h1>
          <p className="text-sm text-ink/60 mt-1">Review changes between the approved roadmap and the new AI-generated draft.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="text-xs border border-border rounded-md px-3 py-1.5 hover:border-royal/50 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" /> View Full Versions
          </button>
          <button className="text-xs border border-border rounded-md px-3 py-1.5 hover:border-royal/50">Restore Version</button>
          {canPublish ? (
            <button
              onClick={() => approveMut.mutate()}
              disabled={!confirmed || approveMut.isPending || !draft?.id}
              className="text-xs bg-royal text-white rounded-md px-3 py-1.5 hover:bg-royal/90 disabled:opacity-60 inline-flex items-center gap-1.5"
            >
              {approveMut.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
              Approve as New Official Version
            </button>
          ) : (
            <OperatorLockNotice message={adminOnlyReason} />
          )}
        </div>
      </div>

      {/* From / To */}
      <div className="rounded-xl border border-border bg-card shadow-sm p-5">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-center">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wide text-ink/50">From (Approved)</div>
            <div className="font-display text-2xl text-ink mt-1">{approved?.version ?? "—"}</div>
            <div className="text-xs text-ink/60 mt-1">
              {approved?.approved_at ? `Approved on ${new Date(approved.approved_at).toLocaleDateString()}` : "No approved version"}
            </div>
          </div>
          <div className="flex justify-center">
            <div className="w-10 h-10 rounded-full border border-border flex items-center justify-center">
              <ArrowRightLeft className="w-4 h-4 text-ink/60" />
            </div>
          </div>
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wide text-ink/50">To (AI Draft)</div>
            <div className="font-display text-2xl text-ink mt-1">{draft?.version ?? "—"}</div>
            <div className="text-xs text-ink/60 mt-1">
              {draft?.created_at ? `Generated ${new Date(draft.created_at).toLocaleString()}` : "No draft"}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wide text-ink/50">Source Trigger</div>
            <div className="text-sm text-ink mt-1">{draft?.source ?? "Recent source updates"}</div>
          </div>
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wide text-ink/50">Status</div>
            <span className="inline-flex mt-1 items-center rounded-full border border-[#f1e3b9] bg-[#fbf3e0] text-[#8a6713] px-2.5 py-0.5 text-[11px] font-medium">
              Needs Review
            </span>
          </div>
        </div>
      </div>

      <PublishTimeline projectId={projectId} draft={draft} approved={approved} canPublish={canPublish} adminOnlyReason={adminOnlyReason} />

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard label="Total changes" value={summary.totalChanges.toString()} tone="blue" hint={`Across ${summary.modulesAffected} modules`} />
        <MetricCard label="Added" value={summary.added.toString()} tone="green" hint="New information" />

        <MetricCard label="Modified" value={summary.modified.toString()} tone="orange" hint="Changed" />
        <MetricCard label="Removed" value={summary.removed.toString()} tone="red" hint="No longer relevant" />
        <MetricCard label="Conflicts" value={summary.conflicts.toString()} tone="red" hint="Need resolution" />
        <MetricCard label="Modules affected" value={`${summary.modulesAffected} / 10`} tone="purple" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr_300px] gap-5">
        {/* Module list */}
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="px-4 py-3 border-b border-border font-display text-sm text-ink">Review by Module</div>
          <ul className="p-2 space-y-0.5">
            {modules.map((m: any) => {
              const count = m.changes.length;
              const active = activeModule === m.key;
              return (
                <li key={m.key}>
                  <button
                    onClick={() => setActiveModule(m.key)}
                    className={`w-full text-left rounded-md px-3 py-2 flex items-center justify-between text-sm ${
                      active ? "bg-royal/10 text-royal" : "text-ink/80 hover:bg-canvas/60"
                    }`}
                  >
                    <span>{m.label}</span>
                    <span className="text-[11px] text-ink/50">{count} {count === 1 ? "change" : "changes"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Change table */}
        <SectionCard title={activeMod?.label ?? "Module"} right={<span>{activeMod?.changes?.length ?? 0} changes</span>}>
          {(!activeMod || activeMod.changes.length === 0) ? (
            <div className="text-sm text-ink/50 text-center py-10">No changes in this module.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-ink/50 border-b border-border">
                    <th className="py-2 pr-2 w-32">Change</th>
                    <th className="py-2 pr-2">Current (Approved)</th>
                    <th className="py-2 pr-2">New Draft</th>
                    <th className="py-2 pr-2 w-24">Impact</th>
                    <th className="py-2 pr-2 w-40">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {activeMod.changes.map((c: any, i: number) => {
                    const id = `${activeMod.key}-${i}`;
                    const decision = decisions[id];
                    return (
                      <tr key={id} className="border-b border-border/60 align-top">
                        <td className="py-3 pr-2">
                          <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] capitalize ${
                            c.type === "added" ? "bg-[#e6f5ec] text-[#1f6b3b]"
                            : c.type === "removed" ? "bg-[#fbe9ec] text-[#a4283c]"
                            : "bg-[#fbf3e0] text-[#8a6713]"
                          }`}>{c.type}</span>
                          <div className="mt-2 text-ink/70 text-[11px]">{c.label}</div>
                        </td>
                        <td className="py-3 pr-2">
                          <pre className="whitespace-pre-wrap font-mono text-[10px] text-ink/70 bg-canvas/50 rounded p-2 max-h-32 overflow-auto">
                            {c.before ? JSON.stringify(c.before, null, 2).slice(0, 400) : "(none)"}
                          </pre>
                        </td>
                        <td className="py-3 pr-2">
                          <pre className="whitespace-pre-wrap font-mono text-[10px] text-ink bg-[#e6f5ec] rounded p-2 max-h-32 overflow-auto">
                            {c.after ? JSON.stringify(c.after, null, 2).slice(0, 400) : "(none)"}
                          </pre>
                        </td>
                        <td className="py-3 pr-2">
                          <span className={`inline-flex items-center gap-1 text-[11px] capitalize ${
                            c.impact === "high" ? "text-[#a4283c]" : c.impact === "medium" ? "text-[#8a6713]" : "text-[#1f6b3b]"
                          }`}>
                            <AlertTriangle className="w-3 h-3" /> {c.impact}
                          </span>
                        </td>
                        <td className="py-3 pr-2">
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => decide(activeMod.key, id, "accept")}
                              className={`text-[10px] rounded px-2 py-1 border ${decision === "accept" ? "bg-[#e6f5ec] border-[#c4e6d2] text-[#1f6b3b]" : "border-border text-ink/70 hover:border-royal/40"}`}
                            ><Check className="w-3 h-3 inline mr-1" />Accept</button>
                            <button
                              onClick={() => decide(activeMod.key, id, "edit")}
                              className={`text-[10px] rounded px-2 py-1 border ${decision === "edit" ? "bg-[#fbf3e0] border-[#f1e3b9] text-[#8a6713]" : "border-border text-ink/70 hover:border-royal/40"}`}
                            ><Edit3 className="w-3 h-3 inline mr-1" />Edit</button>
                            <button
                              onClick={() => decide(activeMod.key, id, "reject")}
                              className={`text-[10px] rounded px-2 py-1 border ${decision === "reject" ? "bg-[#fbe9ec] border-[#f3ced5] text-[#a4283c]" : "border-border text-ink/70 hover:border-royal/40"}`}
                            ><X className="w-3 h-3 inline mr-1" />Reject</button>

                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {/* Summary side */}
        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="font-display text-sm text-ink mb-2">Change Summary</div>
            <ul className="text-xs text-ink/80 space-y-1.5">
              <li className="flex justify-between"><span>Total Changes</span><span className="font-mono">{summary.totalChanges}</span></li>
              <li className="flex justify-between"><span>High Impact</span><span className="font-mono">{summary.removed}</span></li>
              <li className="flex justify-between"><span>Conflicts</span><span className="font-mono">{summary.conflicts}</span></li>
              <li className="flex justify-between"><span>Modules Affected</span><span className="font-mono">{summary.modulesAffected} / 10</span></li>
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="font-display text-sm text-ink mb-2">Next Best Action</div>
            <p className="text-xs text-ink/70">Review high-impact changes first. Accept safe changes, edit any wording that affects the client copy, and reject anything outside scope.</p>
            <button
              onClick={() => {
                const next: Record<string, "accept"> = {};
                modules.forEach((m: any) => m.changes.forEach((_c: any, i: number) => {
                  const id = `${m.key}-${i}`;
                  if (_c.impact !== "high" && decisions[id] !== "accept") {
                    next[id] = "accept";
                    if (draft?.id) recordMut.mutate({ module_key: m.key, change_id: id, decision: "accept" });
                  }
                }));
                setDecisions((prev) => ({ ...prev, ...next }));
              }}
              disabled={!draft?.id}
              className="mt-3 w-full text-xs border border-royal text-royal rounded-md py-2 hover:bg-royal/5 disabled:opacity-50"
            >Accept all safe changes</button>

          </div>
        </aside>
      </div>

      {/* Approval confirmation */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-[#1f6b3b] mt-0.5" />
          <div>
            <div className="font-display text-lg text-ink">Approval Confirmation</div>
            <div className="text-xs text-ink/60">Your approval will create a new official version and update all connected modules.</div>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink/80">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="accent-royal" />
          I confirm these changes have been reviewed
        </label>
        {canPublish ? (
          <button
            onClick={() => approveMut.mutate()}
            disabled={!confirmed || approveMut.isPending || !draft?.id}
            className="text-sm bg-royal text-white rounded-md px-4 py-2 hover:bg-royal/90 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {approveMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Approve as v{draft?.version ?? "next"} Official Version
          </button>
        ) : (
          <OperatorLockNotice message={adminOnlyReason} />
        )}
      </div>
      {approveError && (
        <div className="rounded-md border border-[#f3ced5] bg-[#fbe9ec] text-[#a4283c] text-sm px-4 py-2">
          {approveError}
        </div>
      )}
      {approveMut.isSuccess && (
        <div className="rounded-md border border-[#c4e6d2] bg-[#e6f5ec] text-[#1f6b3b] text-sm px-4 py-2">
          Approved. This draft is now the official version.
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PublishTimeline({ projectId, draft, approved, canPublish, adminOnlyReason }: { projectId: string; draft: any; approved: any; canPublish: boolean; adminOnlyReason: string | undefined }) {
  const qc = useQueryClient();
  const submitPreviewFn = useServerFn(submitPreviewForApproval);
  const approvePreviewFn = useServerFn(approvePreview);
  const publishFn = useServerFn(publishVersionToPortal);

  const target = draft?.status === "approved" ? draft : approved;
  const versionId = target?.id as string | undefined;
  const versionLabel = target?.version ?? "—";
  const status = (target?.status ?? "draft") as string;
  const previewStatus = (target?.client_preview_status ?? "none") as "none" | "draft" | "approved";
  const publishedAt = target?.published_to_portal_at as string | null | undefined;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["engine", "versions-compare", projectId] });
    qc.invalidateQueries({ queryKey: ["engine", "draft-versions"] });
    qc.invalidateQueries({ queryKey: ["engine", "reviews"] });
  };

  const submitPreview = useMutation({
    mutationFn: () => submitPreviewFn({ data: { versionId: versionId! } }),
    onSuccess: () => { toast.success("Client preview sent to Tai for approval."); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const approvePreviewMut = useMutation({
    mutationFn: () => approvePreviewFn({ data: { versionId: versionId! } }),
    onSuccess: () => { toast.success("Client preview approved. Ready to publish."); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const publishMut = useMutation({
    mutationFn: () => publishFn({ data: { versionId: versionId! } }),
    onSuccess: () => { toast.success("Published to client portal."); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const gate1Done = status === "approved";
  const gate2Done = previewStatus === "approved";
  const gate3Done = !!publishedAt;

  const Gate = ({ n, label, done, sub, action }: { n: number; label: string; done: boolean; sub?: string | null; action?: React.ReactNode }) => (
    <div className={`flex-1 rounded-lg border p-3 ${done ? "border-[#c4e6d2] bg-[#e6f5ec]" : "border-border bg-white"}`}>
      <div className="flex items-center gap-2">
        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${done ? "bg-[#1f6b3b] text-white" : "bg-paper-soft text-ink/60 border border-border"}`}>
          {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : n}
        </span>
        <div className="text-sm font-medium text-ink">{label}</div>
      </div>
      {sub ? <div className="text-xs text-ink/60 mt-1 ml-8">{sub}</div> : null}
      {action ? <div className="mt-2 ml-8">{action}</div> : null}
    </div>
  );

  if (!versionId) return null;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-display text-base text-ink">Publish pipeline · {versionLabel}</div>
        <div className="text-[10px] font-mono uppercase tracking-wider text-ink/50">Official → Preview → Portal</div>
      </div>
      <div className="flex flex-col md:flex-row gap-3">
        <Gate
          n={1}
          label="Official version approved"
          done={gate1Done}
          sub={gate1Done ? `Approved${target?.approved_at ? ` on ${new Date(target.approved_at).toLocaleDateString()}` : ""}.` : "Approve the draft as the official version to unlock the client preview gate."}
        />
        <Gate
          n={2}
          label="Client preview approved"
          done={gate2Done}
          sub={
            gate2Done
              ? "Preview signed off. Ready to publish."
              : previewStatus === "draft"
                ? "Preview submitted; waiting on Tai approval."
                : "Submit the client-safe preview to Tai for approval."
          }
          action={
            canPublish && gate1Done ? (
              previewStatus === "none" ? (
                <button onClick={() => submitPreview.mutate()} disabled={submitPreview.isPending} className="text-xs bg-ink text-white rounded px-2 py-1 hover:bg-ink/90 disabled:opacity-40 inline-flex items-center gap-1">
                  {submitPreview.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Submit preview to Tai
                </button>
              ) : previewStatus === "draft" ? (
                <button onClick={() => approvePreviewMut.mutate()} disabled={approvePreviewMut.isPending} className="text-xs bg-royal text-white rounded px-2 py-1 hover:bg-royal/90 disabled:opacity-40 inline-flex items-center gap-1">
                  {approvePreviewMut.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Approve preview
                </button>
              ) : null
            ) : !canPublish && gate1Done ? (
              <span className="text-[11px] text-ink/50" title={adminOnlyReason}>Admin only</span>
            ) : null
          }
        />
        <Gate
          n={3}
          label="Published to client portal"
          done={gate3Done}
          sub={
            gate3Done
              ? `Live in the client portal as of ${new Date(publishedAt!).toLocaleString()}.`
              : gate2Done
                ? "Ready to publish."
                : "Waiting on the preview gate."
          }
          action={
            canPublish && gate2Done && !gate3Done ? (
              <button onClick={() => publishMut.mutate()} disabled={publishMut.isPending} className="text-xs bg-[#1f6b3b] text-white rounded px-2 py-1 hover:bg-[#164d2b] disabled:opacity-40 inline-flex items-center gap-1">
                {publishMut.isPending && <Loader2 className="w-3 h-3 animate-spin" />} <Send className="w-3 h-3" /> Publish to portal
              </button>
            ) : null
          }
        />
      </div>
    </div>
  );
}
