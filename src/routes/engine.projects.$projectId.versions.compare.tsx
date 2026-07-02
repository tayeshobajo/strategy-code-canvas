/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowRightLeft, ShieldCheck, Check, X, Edit3, CheckCircle2, AlertTriangle, FileText, Loader2 } from "lucide-react";
import { SectionCard, MetricCard, formatCents } from "@/components/engine/primitives";
import { getVersionCompareData } from "@/lib/engine-execution.functions";
import { approveVersion } from "@/lib/engine-intelligence.functions";

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

  const approveMut = useMutation({
    mutationFn: async () => {
      if (!draft?.id) throw new Error("No draft version to approve.");
      return approveFn({ data: { id: draft.id } });
    },
    onSuccess: async () => {
      setApproveError(null);
      setConfirmed(false);
      await qc.invalidateQueries({ queryKey: ["engine", "versions-compare", projectId] });
      await qc.invalidateQueries({ queryKey: ["engine"] });
    },
    onError: (e: Error) => setApproveError(e.message),
  });

  const activeMod = modules.find((m: any) => m.key === activeModule);

  const decide = (id: string, choice: "accept" | "reject" | "edit") =>
    setDecisions((prev) => ({ ...prev, [id]: choice }));

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
          <button
            onClick={() => approveMut.mutate()}
            disabled={!confirmed || approveMut.isPending || !draft?.id}
            className="text-xs bg-royal text-white rounded-md px-3 py-1.5 hover:bg-royal/90 disabled:opacity-60 inline-flex items-center gap-1.5"
          >
            {approveMut.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
            Approve as New Official Version
          </button>
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
                              onClick={() => decide(id, "accept")}
                              className={`text-[10px] rounded px-2 py-1 border ${decision === "accept" ? "bg-[#e6f5ec] border-[#c4e6d2] text-[#1f6b3b]" : "border-border text-ink/70 hover:border-royal/40"}`}
                            ><Check className="w-3 h-3 inline mr-1" />Accept</button>
                            <button
                              onClick={() => decide(id, "edit")}
                              className={`text-[10px] rounded px-2 py-1 border ${decision === "edit" ? "bg-[#fbf3e0] border-[#f1e3b9] text-[#8a6713]" : "border-border text-ink/70 hover:border-royal/40"}`}
                            ><Edit3 className="w-3 h-3 inline mr-1" />Edit</button>
                            <button
                              onClick={() => decide(id, "reject")}
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
                  if (_c.impact !== "high") next[`${m.key}-${i}`] = "accept";
                }));
                setDecisions((prev) => ({ ...prev, ...next }));
              }}
              className="mt-3 w-full text-xs border border-royal text-royal rounded-md py-2 hover:bg-royal/5"
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
        <button
          disabled={!confirmed}
          className="text-sm bg-royal text-white rounded-md px-4 py-2 hover:bg-royal/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >Approve as v{draft?.version ?? "next"} Official Version</button>
      </div>
    </div>
  );
}
