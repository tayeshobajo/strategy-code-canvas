/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2, Circle, Copy, RotateCcw, Send, Save, Sparkles, ShieldCheck,
  AlertTriangle, GitBranch, ChevronRight, FileText,
} from "lucide-react";
import { SectionCard, MetricCard, formatCents } from "@/components/engine/primitives";
import {
  getMilestoneBrief, updateMilestone, approveMilestone, sendMilestoneToTasks,
} from "@/lib/engine-execution.functions";

export const Route = createFileRoute("/engine/projects/$projectId/milestones/$milestoneId/brief")({
  component: MilestoneBriefPage,
  errorComponent: ({ error }) => (
    <div className="text-red-700 text-sm">Failed: {(error as Error).message}</div>
  ),
});

const TABS = ["Overview", "Brief", "Acceptance Criteria", "Developer Prompt", "QA Checklist", "Dependencies", "Risks & Decisions", "History"];

function MilestoneBriefPage() {
  const { projectId, milestoneId } = Route.useParams();
  const qc = useQueryClient();
  const getFn = useServerFn(getMilestoneBrief);
  const updateFn = useServerFn(updateMilestone);
  const approveFn = useServerFn(approveMilestone);
  const sendFn = useServerFn(sendMilestoneToTasks);
  const [tab, setTab] = useState("Overview");

  const q = useQuery({
    queryKey: ["engine", "milestone", milestoneId, projectId],
    queryFn: () => getFn({ data: { projectId, milestoneId } }),
  });
  const m = (q.data as any)?.milestone;

  const refresh = () => qc.invalidateQueries({ queryKey: ["engine", "milestone", milestoneId, projectId] });

  const toggleCriterion = useMutation({
    mutationFn: async (idx: number) => {
      const next = [...(m?.acceptance_criteria ?? [])];
      next[idx] = { ...next[idx], done: !next[idx].done };
      return updateFn({ data: { id: m.id, patch: { acceptance_criteria: next } } });
    },
    onSuccess: refresh,
  });

  const approve = useMutation({
    mutationFn: () => approveFn({ data: { id: m.id } }),
    onSuccess: () => { toast.success("Brief approved"); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const sendTasks = useMutation({
    mutationFn: () => sendFn({ data: { id: m.id } }),
    onSuccess: (r: any) => { toast.success(`Sent ${r.count ?? 0} tasks`); },
    onError: (e: any) => toast.error(e.message),
  });

  if (q.isLoading || !m) return <div className="text-sm text-ink/60">Loading milestone…</div>;

  const criteria: any[] = Array.isArray(m.acceptance_criteria) ? m.acceptance_criteria : [];
  const done = criteria.filter((c) => c.done).length;

  return (
    <div className="space-y-5 max-w-[1500px]">
      {/* Breadcrumb */}
      <nav className="text-xs text-ink/60 flex items-center gap-1.5">
        <Link to="/engine/projects" className="hover:text-ink">Projects</Link>
        <ChevronRight className="w-3 h-3" />
        <Link to="/engine/projects/$projectId/overview" params={{ projectId }} className="hover:text-ink">Project</Link>
        <ChevronRight className="w-3 h-3" />
        <Link to="/engine/projects/$projectId/builder" params={{ projectId }} className="hover:text-ink">Roadmap Workspace</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-ink font-medium">Milestone Brief Workspace</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl text-ink">{m.name}</h1>
            <span className="inline-flex items-center rounded-full border border-[#cdd6f3] bg-[#e9eefb] text-[#2842a4] px-2.5 py-0.5 text-[11px] font-medium capitalize">
              {m.approval_status ?? m.status}
            </span>
          </div>
          <div className="text-sm text-ink/60 mt-1">{m.phase}</div>
        </div>
        <div className="flex items-center gap-2">
          <button className="text-xs border border-border rounded-md px-3 py-1.5 flex items-center gap-1.5 hover:border-royal/50">
            <Send className="w-3.5 h-3.5" /> Send to Agent
          </button>
          <button className="text-xs border border-border rounded-md px-3 py-1.5 flex items-center gap-1.5 hover:border-royal/50">
            <RotateCcw className="w-3.5 h-3.5" /> Regenerate Brief
          </button>
          <button
            onClick={() => approve.mutate()}
            disabled={approve.isPending}
            className="text-xs bg-ink text-white rounded-md px-3 py-1.5 flex items-center gap-1.5 hover:bg-ink/90 disabled:opacity-60"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Approve Brief
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border flex items-center gap-6 text-sm">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-2.5 -mb-px border-b-2 ${
              tab === t ? "border-royal text-ink font-medium" : "border-transparent text-ink/60 hover:text-ink"
            }`}
          >{t}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
        <div className="space-y-5 min-w-0">
          {/* Overview strip */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard label="Priority" value={m.priority ?? "—"} tone="red" hint={m.deadline_relevance ?? ""} />
            <MetricCard label="Target date" value={m.due_date ?? "—"} tone="orange" hint="Needed before deadline" />
            <MetricCard label="Effort" value={m.estimated_effort ?? "—"} tone="blue" hint="Medium complexity" />
            <MetricCard label="Agent cost" value={formatCents(m.estimated_cost_cents ?? 0)} tone="purple" hint="For this milestone" />
            <MetricCard label="Owner" value={m.owner_email ? m.owner_email.split("@")[0] : "Unassigned"} hint="Assign owner" />
            <MetricCard label="Status" value={m.status} tone="green" hint="Needs approval" />
          </div>

          {/* Generated brief */}
          <SectionCard
            title={<span className="flex items-center gap-2"><FileText className="w-4 h-4" />Generated Brief</span>}
            right={<span className="text-royal">AI Generated</span>}
          >
            <div className="prose prose-sm max-w-none text-ink/85 whitespace-pre-wrap">{m.brief_md ?? "—"}</div>
          </SectionCard>

          {/* Acceptance criteria */}
          <SectionCard
            title={<span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />Acceptance Criteria</span>}
            right={<span>{done}/{criteria.length} · AI Generated</span>}
          >
            <ul className="space-y-2">
              {criteria.map((c: any, i: number) => (
                <li key={i} className="flex items-start gap-3 group">
                  <button onClick={() => toggleCriterion.mutate(i)} className="mt-0.5 shrink-0">
                    {c.done ? (
                      <CheckCircle2 className="w-4 h-4 text-[#1f6b3b]" />
                    ) : (
                      <Circle className="w-4 h-4 text-ink/40" />
                    )}
                  </button>
                  <div className="text-sm text-ink flex-1">
                    <span className="font-mono text-[10px] text-ink/40 mr-2">{String(i + 1).padStart(2, "0")}</span>
                    {typeof c === "string" ? c : c.text}
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>

          {/* Developer prompt */}
          <SectionCard
            title={<span className="flex items-center gap-2"><Sparkles className="w-4 h-4" />Developer / Lovable Prompt</span>}
            right={
              <button
                onClick={() => { navigator.clipboard.writeText(m.developer_prompt ?? ""); toast.success("Copied"); }}
                className="inline-flex items-center gap-1.5 text-xs text-royal hover:underline"
              ><Copy className="w-3 h-3" /> Copy</button>
            }
          >
            <pre className="bg-[#0f172a] text-slate-100 rounded-md p-4 text-xs whitespace-pre-wrap font-mono max-h-96 overflow-auto">
              {m.developer_prompt ?? "—"}
            </pre>
          </SectionCard>

          {/* QA + client-safe side-by-side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <SectionCard title="QA Checklist" right={<span className="text-royal">AI Generated</span>}>
              <ul className="space-y-2 text-sm">
                {(m.qa_checklist ?? []).map((q: any, i: number) => (
                  <li key={i} className="flex items-center justify-between border-b border-border/50 pb-2 last:border-0">
                    <div>
                      <div className="text-ink">{q.section}</div>
                      <div className="text-xs text-ink/50">{q.note}</div>
                    </div>
                    <span className="text-xs text-ink/60">{q.items} items</span>
                  </li>
                ))}
              </ul>
            </SectionCard>
            <SectionCard title="Client-Safe Explanation" right={<span className="text-royal">AI Generated</span>}>
              <p className="text-sm text-ink/85 whitespace-pre-wrap">{m.client_safe_md ?? "—"}</p>
            </SectionCard>
          </div>

          {/* Approval gate */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="font-display text-lg text-ink flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" /> Approval Gate
                </div>
                <p className="text-xs text-ink/60 mt-1">
                  Review the brief, acceptance criteria, and outputs before approving.
                </p>
              </div>
              <div className="text-xs text-ink/60">Approval status: <span className="font-medium text-ink capitalize">{m.approval_status}</span></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => approve.mutate()}
                disabled={approve.isPending}
                className="text-sm bg-royal text-white rounded-md px-4 py-2 flex items-center gap-1.5 hover:bg-royal/90 disabled:opacity-60"
              ><CheckCircle2 className="w-4 h-4" /> Approve Brief</button>
              <button
                onClick={() => updateFn({ data: { id: m.id, patch: { approval_status: "revision_requested" } } }).then(refresh)}
                className="text-sm border border-border rounded-md px-4 py-2 hover:border-royal/50"
              >Request Revision</button>
              <button className="text-sm border border-border rounded-md px-4 py-2 hover:border-royal/50 flex items-center gap-1.5">
                <Save className="w-3.5 h-3.5" /> Save as Draft
              </button>
              <button
                onClick={() => sendTasks.mutate()}
                disabled={sendTasks.isPending}
                className="text-sm border border-border rounded-md px-4 py-2 hover:border-royal/50 disabled:opacity-60"
              >Send to Tasks</button>
              <button className="text-sm border border-border rounded-md px-4 py-2 hover:border-royal/50">Generate Updated Prompt</button>
            </div>
          </div>
        </div>

        {/* Right rail */}
        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="font-display text-sm text-ink flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-royal" /> Milestone Intelligence
            </div>
            <div className="text-4xl font-display text-[#1f6b3b]">{m.confidence ?? 0}%</div>
            <div className="text-xs text-ink/60">High Confidence — strong source alignment</div>
            <ul className="mt-3 space-y-1 text-xs text-ink/70">
              <li>· 3 sources analyzed</li>
              <li>· {criteria.length} criteria generated</li>
              <li>· Aligned with roadmap</li>
            </ul>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="font-display text-sm text-ink mb-2">Related To</div>
            <div className="space-y-2 text-xs">
              <RelKV label="Gap" value={m.related_gap} />
              <RelKV label="Hidden Asset" value={m.related_hidden_asset} />
              <RelKV label="System Node" value={m.related_system_node} />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="font-display text-sm text-ink mb-2">Dependencies</div>
            <ul className="space-y-1.5 text-xs">
              {(m.dependencies ?? []).map((d: any, i: number) => (
                <li key={i} className="flex items-center justify-between">
                  <span className="text-ink/80">{d.name}</span>
                  <span className="text-ink/60">{d.status}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="font-display text-sm text-ink mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#c99a20]" /> Risks
            </div>
            <ul className="space-y-1.5 text-xs">
              {(m.risks ?? []).map((r: any, i: number) => (
                <li key={i} className="flex items-start justify-between gap-2">
                  <span className="text-ink/80">{r.text}</span>
                  <span className="text-ink/60 shrink-0">{r.severity}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="font-display text-sm text-ink mb-2 flex items-center gap-2">
              <GitBranch className="w-4 h-4" /> Version History
            </div>
            <ul className="space-y-2 text-xs text-ink/70">
              <li><span className="font-mono">v1.2</span> Updated draft</li>
              <li><span className="font-mono">v1.1</span> AI regenerated</li>
              <li><span className="font-mono">v1.0</span> Initial draft</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function RelKV({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-ink/50">{label}</span>
      <span className="text-ink/85 text-right">{value ?? "—"}</span>
    </div>
  );
}
