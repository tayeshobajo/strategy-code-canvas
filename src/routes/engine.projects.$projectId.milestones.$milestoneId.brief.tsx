/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2, Circle, Copy, RotateCcw, Send, Save, Sparkles, ShieldCheck,
  AlertTriangle, GitBranch, ChevronRight, FileText, Plus, Trash2, PencilLine, X,
  History as HistoryIcon, ListChecks, Link2,
} from "lucide-react";
import { SectionCard, MetricCard, formatCents } from "@/components/engine/primitives";
import { AIDraftBadge } from "@/components/engine/AIDraftBadge";
import {
  getMilestoneBrief, updateMilestone, approveMilestone, sendMilestoneToTasks,
  regenerateMilestoneSection,
} from "@/lib/engine-execution.functions";
import { recordIntelligenceDecision } from "@/lib/engine-intelligence.functions";
import { useEngineRole } from "@/hooks/useEngineRole";
import { MilestoneTabs } from "@/components/engine/MilestoneTabs";

export const Route = createFileRoute("/engine/projects/$projectId/milestones/$milestoneId/brief")({
  component: MilestoneBriefPage,
  errorComponent: ({ error }) => (
    <div className="text-red-700 text-sm">Failed: {(error as Error).message}</div>
  ),
});

const TABS = ["Overview", "Brief", "Acceptance Criteria", "Developer Prompt", "QA Checklist", "Dependencies", "Risks & Decisions", "History"] as const;
type Tab = (typeof TABS)[number];

function MilestoneBriefPage() {
  const { projectId, milestoneId } = Route.useParams();
  const qc = useQueryClient();
  const getFn = useServerFn(getMilestoneBrief);
  const updateFn = useServerFn(updateMilestone);
  const approveFn = useServerFn(approveMilestone);
  const sendFn = useServerFn(sendMilestoneToTasks);
  const regenFn = useServerFn(regenerateMilestoneSection);
  const recordDecisionFn = useServerFn(recordIntelligenceDecision);
  const role = useEngineRole();
  const [tab, setTab] = useState<Tab>("Overview");
  const [regenerating, setRegenerating] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["engine", "milestone", milestoneId, projectId],
    queryFn: () => getFn({ data: { projectId, milestoneId } }),
  });
  const m = (q.data as any)?.milestone;

  const refresh = () => qc.invalidateQueries({ queryKey: ["engine", "milestone", milestoneId, projectId] });

  const patch = useMutation({
    mutationFn: (p: Record<string, unknown>) => updateFn({ data: { id: m.id, patch: p } }),
    onSuccess: () => { refresh(); },
    onError: (e: any) => toast.error(e.message),
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

  const regenerate = async (section: string) => {
    if (!m) return;
    if (!role.canRegenerate) { toast.error(role.editDeniedReason); return; }
    if (m.approval_status === "approved") { toast.error("Reset approval before regenerating"); return; }
    setRegenerating(section);
    try {
      await regenFn({ data: { id: m.id, section: section as any } });
      toast.success(`Regenerated ${section.replace(/_/g, " ")}`);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Regenerate failed");
    } finally {
      setRegenerating(null);
    }
  };

  const recordItemDecision = async (
    action: "accept" | "reject",
    field: "dependencies" | "risks" | "history",
    item: unknown,
    index: number,
  ) => {
    try {
      await recordDecisionFn({
        data: {
          memory_id: null,
          project_id: projectId,
          action,
          before_state: { field, index, item, milestone_id: milestoneId },
          after_state: { decided: action },
          notes: `milestone:${milestoneId} · ${field}[${index}] · ${action}`,
        },
      });
      toast.success(`Recorded ${action}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to record decision");
    }
  };

  if (q.isLoading) return <div className="text-sm text-ink/60">Loading milestone…</div>;
  if (!m) return (
    <div className="text-sm text-ink/70 p-6 rounded-lg border border-ink/10 bg-white/50">
      Milestone not found in this project. It may have been deleted or the URL is stale.
    </div>
  );


  const criteria: any[] = Array.isArray(m.acceptance_criteria) ? m.acceptance_criteria : [];
  const done = criteria.filter((c) => c.done).length;
  const isAI = (m.created_by_kind ?? "ai") === "ai";
  const approved = m.approval_status === "approved";
  const showTab = (t: Tab) => tab === "Overview" || tab === t;
  const regenDisabled = approved || !role.canRegenerate;
  const regenDisabledReason = !role.canRegenerate
    ? role.editDeniedReason
    : approved ? "Milestone is Approved — reset approval to regenerate." : undefined;
  const editDisabled = approved || !role.canEdit;
  const editDisabledReason = !role.canEdit
    ? role.editDeniedReason
    : approved ? "Milestone is Approved — reset approval to edit." : undefined;

  return (
    <div className="space-y-5 max-w-[1500px]">
      <MilestoneTabs projectId={projectId} milestoneId={milestoneId} milestoneName={m?.name ?? null} />
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
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-display text-3xl text-ink">{m.name}</h1>
            <span className="inline-flex items-center rounded-full border border-[#cdd6f3] bg-[#e9eefb] text-[#2842a4] px-2.5 py-0.5 text-[11px] font-medium capitalize">
              {m.approval_status ?? m.status}
            </span>
            <AIDraftBadge kind={m.created_by_kind ?? (isAI ? "ai" : "human")} />
            {approved && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-[#a7d3b7] bg-[#e6f4ec] text-[#1f6b3b] px-2 py-0.5 text-[11px] font-medium"
                title="This milestone is Approved. All key fields are locked. Reset approval to edit."
              >
                <ShieldCheck className="w-3 h-3" /> Protected
              </span>
            )}
          </div>
          <div className="text-sm text-ink/60 mt-1">{m.phase}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => sendTasks.mutate()}
            disabled={sendTasks.isPending || !approved || !role.canSendTasks}
            title={
              !role.canSendTasks ? role.approvalDeniedReason :
              !approved ? "Approve the brief before sending to agent" :
              "Send acceptance criteria to the agent as tasks"
            }
            className="text-xs border border-border rounded-md px-3 py-1.5 flex items-center gap-1.5 hover:border-royal/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-3.5 h-3.5" /> Send to Agent
          </button>
          <button
            onClick={() => regenerate("brief_md")}
            disabled={regenDisabled || !!regenerating}
            title={regenDisabledReason ?? "Ask AI to redraft the brief"}
            className="text-xs border border-border rounded-md px-3 py-1.5 flex items-center gap-1.5 hover:border-royal/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${regenerating === "brief_md" ? "animate-spin" : ""}`} />
            {regenerating === "brief_md" ? "Regenerating…" : "Regenerate Brief"}
          </button>
          <button
            onClick={() => approve.mutate()}
            disabled={approve.isPending || approved || !role.canApprove}
            title={!role.canApprove ? role.approvalDeniedReason : (approved ? "Already approved" : "Approve this brief")}
            className="text-xs bg-ink text-white rounded-md px-3 py-1.5 flex items-center gap-1.5 hover:bg-ink/90 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> {approved ? "Approved" : "Approve Brief"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border flex items-center gap-4 sm:gap-6 text-sm scroll-strip pb-0.5">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`snap-start pb-2.5 -mb-px border-b-2 whitespace-nowrap ${
              tab === t ? "border-royal text-ink font-medium" : "border-transparent text-ink/60 hover:text-ink"
            }`}
          >{t}</button>
        ))}
      </div>


      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
        <div className="space-y-5 min-w-0">
          {tab === "Overview" && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <MetricCard label="Priority" value={m.priority ?? "—"} tone="red" hint={m.deadline_relevance ?? ""} />
              <MetricCard label="Target date" value={m.due_date ?? "—"} tone="orange" hint="Needed before deadline" />
              <MetricCard label="Effort" value={m.estimated_effort ?? "—"} tone="blue" hint="Medium complexity" />
              <MetricCard label="Agent cost" value={formatCents(m.estimated_cost_cents ?? 0)} tone="purple" hint="For this milestone" />
              <MetricCard label="Owner" value={m.owner_email ? m.owner_email.split("@")[0] : "Unassigned"} hint="Assign owner" />
              <MetricCard label="Status" value={m.status} tone="green" hint="Needs approval" />
            </div>
          )}

          {showTab("Brief") && (
            <SectionCard
              title={<span className="flex items-center gap-2"><FileText className="w-4 h-4" />Generated Brief</span>}
              right={<AIDraftBadge kind={m.created_by_kind ?? "ai"} size="xs" onRegenerate={() => regenerate("brief_md")} regenerating={regenerating === "brief_md"} disabled={regenDisabled} disabledReason={regenDisabledReason} />}
            >
              <EditableMarkdown
                value={m.brief_md ?? ""}
                approved={editDisabled}
                approvedReason={editDisabledReason}
                onSave={(v) => patch.mutateAsync({ brief_md: v }).then(() => toast.success("Brief saved"))}
              />
            </SectionCard>
          )}

          {showTab("Acceptance Criteria") && (
            <SectionCard
              title={<span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />Acceptance Criteria</span>}
              right={<span className="flex items-center gap-2 text-xs text-ink/60">{done}/{criteria.length} <AIDraftBadge kind={m.created_by_kind ?? "ai"} size="xs" onRegenerate={() => regenerate("acceptance_criteria")} regenerating={regenerating === "acceptance_criteria"} disabled={regenDisabled} disabledReason={regenDisabledReason} /></span>}
            >
              <CriteriaEditor
                criteria={criteria}
                approved={editDisabled}
                onSave={(next) => patch.mutateAsync({ acceptance_criteria: next })}
              />
            </SectionCard>
          )}

          {showTab("Developer Prompt") && (
            <SectionCard
              title={<span className="flex items-center gap-2"><Sparkles className="w-4 h-4" />Developer / Lovable Prompt</span>}
              right={
                <div className="flex items-center gap-2">
                  <AIDraftBadge kind={m.created_by_kind ?? "ai"} size="xs" onRegenerate={() => regenerate("developer_prompt")} regenerating={regenerating === "developer_prompt"} disabled={regenDisabled} disabledReason={regenDisabledReason} />
                  <button
                    onClick={() => { navigator.clipboard.writeText(m.developer_prompt ?? ""); toast.success("Copied"); }}
                    className="inline-flex items-center gap-1.5 text-xs text-royal hover:underline"
                  ><Copy className="w-3 h-3" /> Copy</button>
                </div>
              }
            >
              <EditablePrompt
                value={m.developer_prompt ?? ""}
                approved={editDisabled}
                approvedReason={editDisabledReason}
                onSave={(v) => patch.mutateAsync({ developer_prompt: v }).then(() => toast.success("Prompt saved"))}
              />
            </SectionCard>
          )}

          {tab === "Overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <SectionCard title={<span className="flex items-center gap-2"><ListChecks className="w-4 h-4" />QA Checklist</span>} right={<AIDraftBadge kind={m.created_by_kind ?? "ai"} size="xs" onRegenerate={() => regenerate("qa_checklist")} regenerating={regenerating === "qa_checklist"} disabled={regenDisabled} disabledReason={regenDisabledReason} />}>
                <QAList items={m.qa_checklist ?? []} />
              </SectionCard>
              <SectionCard title="Client-Safe Explanation" right={<AIDraftBadge kind={m.created_by_kind ?? "ai"} size="xs" onRegenerate={() => regenerate("client_safe_md")} regenerating={regenerating === "client_safe_md"} disabled={regenDisabled} disabledReason={regenDisabledReason} />}>
                <EditableMarkdown
                  value={m.client_safe_md ?? ""}
                  approved={editDisabled}
                  approvedReason={editDisabledReason}
                  onSave={(v) => patch.mutateAsync({ client_safe_md: v }).then(() => toast.success("Client copy saved"))}
                  compact
                />
              </SectionCard>
            </div>
          )}

          {tab === "QA Checklist" && (
            <SectionCard title="QA Checklist" right={<AIDraftBadge kind={m.created_by_kind ?? "ai"} size="xs" />}>
              <QAList items={m.qa_checklist ?? []} />
            </SectionCard>
          )}

          {tab === "Dependencies" && (
            <SectionCard
              title={<span className="flex items-center gap-2"><Link2 className="w-4 h-4" />Dependencies</span>}
              right={<AIDraftBadge kind={m.created_by_kind ?? "ai"} size="xs" />}
            >
              <StructuredListEditor
                fieldLabel="Dependency"
                fields={[
                  { key: "name", label: "Name", type: "text", placeholder: "e.g. Auth service" },
                  { key: "status", label: "Status", type: "select", options: ["pending", "in_progress", "blocked", "ready", "done"] },
                  { key: "owner", label: "Owner", type: "text", placeholder: "email or team" },
                  { key: "notes", label: "Notes", type: "textarea" },
                ]}
                items={Array.isArray(m.dependencies) ? m.dependencies : []}
                disabled={editDisabled}
                disabledReason={editDisabledReason}
                onSave={(next) => patch.mutateAsync({ dependencies: next })}
                onAccept={(item, i) => recordItemDecision("accept", "dependencies", item, i)}
                onReject={(item, i) => recordItemDecision("reject", "dependencies", item, i)}
                canDecide={role.canApprove}
                decideDeniedReason={role.approvalDeniedReason}
              />
            </SectionCard>
          )}

          {tab === "Risks & Decisions" && (
            <SectionCard
              title={<span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-[#c99a20]" />Risks</span>}
              right={<AIDraftBadge kind={m.created_by_kind ?? "ai"} size="xs" onRegenerate={() => regenerate("risks")} regenerating={regenerating === "risks"} disabled={regenDisabled} disabledReason={regenDisabledReason} />}
            >
              <StructuredListEditor
                fieldLabel="Risk"
                fields={[
                  { key: "text", label: "Risk", type: "textarea", placeholder: "Describe the risk" },
                  { key: "severity", label: "Severity", type: "select", options: ["low", "medium", "high", "critical"] },
                  { key: "likelihood", label: "Likelihood", type: "select", options: ["low", "medium", "high"] },
                  { key: "mitigation", label: "Mitigation", type: "textarea" },
                ]}
                items={Array.isArray(m.risks) ? m.risks : []}
                disabled={editDisabled}
                disabledReason={editDisabledReason}
                onSave={(next) => patch.mutateAsync({ risks: next })}
                onAccept={(item, i) => recordItemDecision("accept", "risks", item, i)}
                onReject={(item, i) => recordItemDecision("reject", "risks", item, i)}
                canDecide={role.canApprove}
                decideDeniedReason={role.approvalDeniedReason}
              />
            </SectionCard>
          )}

          {tab === "History" && (
            <SectionCard
              title={<span className="flex items-center gap-2"><HistoryIcon className="w-4 h-4" />History & Decisions</span>}
              right={<AIDraftBadge kind={m.created_by_kind ?? "ai"} size="xs" />}
            >
              <div className="space-y-4">
                <ul className="space-y-2 text-sm text-ink/80">
                  <li className="flex items-center justify-between border-b border-border/60 pb-2">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs text-ink/50">current</span>
                      Milestone last updated
                    </span>
                    <span className="text-xs text-ink/50">{m.updated_at ? new Date(m.updated_at).toLocaleString() : "—"}</span>
                  </li>
                  <li className="flex items-center justify-between border-b border-border/60 pb-2">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs text-ink/50">created</span>
                      Milestone drafted
                    </span>
                    <span className="text-xs text-ink/50">{m.created_at ? new Date(m.created_at).toLocaleString() : "—"}</span>
                  </li>
                  {m.approval_status === "approved" && (
                    <li className="flex items-center justify-between text-[#1f6b3b]">
                      <span className="flex items-center gap-2"><ShieldCheck className="w-3.5 h-3.5" />Approved</span>
                      <span className="text-xs">{m.approved_at ? new Date(m.approved_at).toLocaleString() : "—"}</span>
                    </li>
                  )}
                </ul>
                <div className="pt-3 border-t border-border">
                  <div className="text-xs font-mono uppercase tracking-[0.2em] text-ink/50 mb-2">Decisions Log</div>
                  <StructuredListEditor
                    fieldLabel="Decision"
                    fields={[
                      { key: "title", label: "Decision", type: "text", placeholder: "e.g. Use Postgres FTS over Algolia" },
                      { key: "rationale", label: "Rationale", type: "textarea" },
                      { key: "status", label: "Status", type: "select", options: ["proposed", "accepted", "rejected", "superseded"] },
                      { key: "decided_at", label: "Decided at", type: "text", placeholder: "YYYY-MM-DD" },
                    ]}
                    items={Array.isArray(m.decisions) ? m.decisions : []}
                    disabled={editDisabled}
                    disabledReason={editDisabledReason}
                    onSave={(next) => patch.mutateAsync({ decisions: next })}
                    onAccept={(item, i) => recordItemDecision("accept", "history", item, i)}
                    onReject={(item, i) => recordItemDecision("reject", "history", item, i)}
                    canDecide={role.canApprove}
                    decideDeniedReason={role.approvalDeniedReason}
                    readOnlyIfNoField
                  />
                </div>
              </div>
            </SectionCard>
          )}

          {/* Approval gate — always visible */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="font-display text-lg text-ink flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" /> Approval Gate
                </div>
                <p className="text-xs text-ink/60 mt-1">
                  Review the brief, acceptance criteria, and outputs before approving.
                </p>
                {!role.canApprove && (
                  <p className="text-[11px] text-[#a4283c] mt-1">{role.approvalDeniedReason}</p>
                )}
              </div>
              <div className="text-xs text-ink/60">Approval status: <span className="font-medium text-ink capitalize">{m.approval_status}</span></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => approve.mutate()}
                disabled={approve.isPending || approved || !role.canApprove}
                title={!role.canApprove ? role.approvalDeniedReason : (approved ? "Already approved" : "")}
                className="text-sm bg-royal text-white rounded-md px-4 py-2 flex items-center gap-1.5 hover:bg-royal/90 disabled:opacity-60 disabled:cursor-not-allowed"
              ><CheckCircle2 className="w-4 h-4" /> Approve Brief</button>
              <button
                onClick={() => patch.mutate({ approval_status: "revision_requested" })}
                disabled={!role.canApprove}
                title={!role.canApprove ? role.approvalDeniedReason : ""}
                className="text-sm border border-border rounded-md px-4 py-2 hover:border-royal/50 disabled:opacity-60 disabled:cursor-not-allowed"
              >Request Revision</button>
              <button
                onClick={() => patch.mutate({ approval_status: "draft" })}
                disabled={!role.canApprove}
                title={!role.canApprove ? role.approvalDeniedReason : ""}
                className="text-sm border border-border rounded-md px-4 py-2 hover:border-royal/50 flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Save className="w-3.5 h-3.5" /> Save as Draft
              </button>
              <button
                onClick={() => sendTasks.mutate()}
                disabled={sendTasks.isPending || !approved || !role.canSendTasks}
                title={
                  !role.canSendTasks ? role.approvalDeniedReason :
                  !approved ? "Approve the brief before sending tasks" :
                  "Send acceptance criteria as tasks"
                }
                className="text-sm border border-border rounded-md px-4 py-2 hover:border-royal/50 disabled:opacity-60 disabled:cursor-not-allowed"
              >Send to Tasks</button>
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
            <div className="text-xs text-ink/60">{(m.confidence ?? 0) >= 70 ? "High confidence — strong source alignment" : "Needs more sources"}</div>
            <ul className="mt-3 space-y-1 text-xs text-ink/70">
              <li>· {criteria.length} criteria drafted</li>
              <li>· {(m.dependencies ?? []).length} dependencies</li>
              <li>· {(m.risks ?? []).length} risks tracked</li>
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
            <div className="font-display text-sm text-ink mb-2 flex items-center gap-2">
              <Link2 className="w-4 h-4" /> Dependencies
            </div>
            <ul className="space-y-1.5 text-xs">
              {(m.dependencies ?? []).map((d: any, i: number) => (
                <li key={i} className="flex items-center justify-between">
                  <span className="text-ink/80">{d.name}</span>
                  <span className="text-ink/60">{d.status}</span>
                </li>
              ))}
              {(m.dependencies ?? []).length === 0 && <li className="text-ink/50">None</li>}
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
              {(m.risks ?? []).length === 0 && <li className="text-ink/50">None</li>}
            </ul>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="font-display text-sm text-ink mb-2 flex items-center gap-2">
              <GitBranch className="w-4 h-4" /> Recent Changes
            </div>
            <ul className="space-y-2 text-xs text-ink/70">
              <li>Last updated {m.updated_at ? new Date(m.updated_at).toLocaleDateString() : "—"}</li>
              <li>Created {m.created_at ? new Date(m.created_at).toLocaleDateString() : "—"}</li>
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

// -- Inline editors --------------------------------------------------------

function EditableMarkdown({
  value, onSave, approved, compact = false, approvedReason,
}: {
  value: string;
  onSave: (v: string) => Promise<unknown>;
  approved: boolean;
  compact?: boolean;
  approvedReason?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [lastSaved, setLastSaved] = useState(value);
  const [saving, setSaving] = useState(false);
  const [autoStatus, setAutoStatus] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  useEffect(() => { setDraft(value); setLastSaved(value); }, [value]);

  // Debounced autosave — 1.2s after last keystroke while editing
  useEffect(() => {
    if (!editing || approved) return;
    if (draft === lastSaved) { setAutoStatus("idle"); return; }
    setAutoStatus("dirty");
    const t = setTimeout(async () => {
      try {
        setAutoStatus("saving");
        await onSave(draft);
        setLastSaved(draft);
        setAutoStatus("saved");
      } catch {
        setAutoStatus("error");
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [draft, editing, approved, lastSaved, onSave]);

  if (!editing) {
    return (
      <div className="space-y-3">
        <div className={`prose prose-sm max-w-none text-ink/85 whitespace-pre-wrap ${compact ? "text-sm" : ""}`}>{value || "—"}</div>
        <button
          onClick={() => setEditing(true)}
          disabled={approved}
          title={approved ? (approvedReason ?? "This milestone is Approved — reset approval before editing.") : "Edit"}
          className="inline-flex items-center gap-1 text-xs text-royal hover:underline disabled:opacity-40 disabled:no-underline"
        >
          <PencilLine className="w-3 h-3" /> Edit
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={compact ? 6 : 12}
        className="w-full text-sm border border-border rounded p-3 bg-white"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try { await onSave(draft); setLastSaved(draft); setAutoStatus("saved"); setEditing(false); }
            finally { setSaving(false); }
          }}
          className="text-xs bg-royal text-white rounded-md px-3 py-1.5 hover:bg-royal/90 disabled:opacity-60 inline-flex items-center gap-1"
        >
          <Save className="w-3 h-3" /> Save & Close
        </button>
        <button
          onClick={async () => {
            setDraft(lastSaved);
            if (lastSaved !== value) { try { await onSave(lastSaved); } catch { /* noop */ } }
            setAutoStatus("idle");
          }}
          title="Discard changes made since the last successful autosave"
          className="text-xs text-ink/70 hover:text-ink inline-flex items-center gap-1 border border-border rounded-md px-2 py-1.5"
        >
          <RotateCcw className="w-3 h-3" /> Rollback to last saved
        </button>
        <button onClick={() => { setDraft(value); setEditing(false); }} className="text-xs text-ink/60 hover:text-ink inline-flex items-center gap-1">
          <X className="w-3 h-3" /> Close
        </button>
        <span className="ml-auto text-[11px] text-ink/50">
          {autoStatus === "saving" && "Autosaving…"}
          {autoStatus === "saved" && "Autosaved ✓"}
          {autoStatus === "dirty" && "Unsaved changes…"}
          {autoStatus === "error" && <span className="text-[#a4283c]">Autosave failed — use Save</span>}
        </span>
      </div>
    </div>
  );
}

function EditablePrompt({
  value, onSave, approved, approvedReason,
}: {
  value: string;
  onSave: (v: string) => Promise<unknown>;
  approved: boolean;
  approvedReason?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [lastSaved, setLastSaved] = useState(value);
  const [saving, setSaving] = useState(false);
  const [autoStatus, setAutoStatus] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  useEffect(() => { setDraft(value); setLastSaved(value); }, [value]);

  useEffect(() => {
    if (!editing || approved) return;
    if (draft === lastSaved) { setAutoStatus("idle"); return; }
    setAutoStatus("dirty");
    const t = setTimeout(async () => {
      try {
        setAutoStatus("saving");
        await onSave(draft);
        setLastSaved(draft);
        setAutoStatus("saved");
      } catch { setAutoStatus("error"); }
    }, 1200);
    return () => clearTimeout(t);
  }, [draft, editing, approved, lastSaved, onSave]);

  if (!editing) {
    return (
      <div className="space-y-3">
        <pre className="bg-[#0f172a] text-slate-100 rounded-md p-4 text-xs whitespace-pre-wrap font-mono max-h-96 overflow-auto">
          {value || "—"}
        </pre>
        <button
          onClick={() => setEditing(true)}
          disabled={approved}
          title={approved ? (approvedReason ?? "This milestone is Approved — reset approval before editing.") : "Edit prompt"}
          className="inline-flex items-center gap-1 text-xs text-royal hover:underline disabled:opacity-40 disabled:no-underline"
        >
          <PencilLine className="w-3 h-3" /> Edit prompt
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={14}
        className="w-full text-xs font-mono bg-[#0f172a] text-slate-100 border border-slate-700 rounded p-3"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          disabled={saving}
          onClick={async () => { setSaving(true); try { await onSave(draft); setLastSaved(draft); setAutoStatus("saved"); setEditing(false); } finally { setSaving(false); } }}
          className="text-xs bg-royal text-white rounded-md px-3 py-1.5 hover:bg-royal/90 disabled:opacity-60"
        ><Save className="w-3 h-3 inline mr-1" /> Save & Close</button>
        <button
          onClick={async () => {
            setDraft(lastSaved);
            if (lastSaved !== value) { try { await onSave(lastSaved); } catch { /* noop */ } }
            setAutoStatus("idle");
          }}
          title="Discard changes made since the last successful autosave"
          className="text-xs text-ink/70 hover:text-ink inline-flex items-center gap-1 border border-border rounded-md px-2 py-1.5"
        ><RotateCcw className="w-3 h-3" /> Rollback</button>
        <button onClick={() => { setDraft(value); setEditing(false); }} className="text-xs text-ink/60 hover:text-ink">Close</button>
        <span className="ml-auto text-[11px] text-ink/50">
          {autoStatus === "saving" && "Autosaving…"}
          {autoStatus === "saved" && "Autosaved ✓"}
          {autoStatus === "dirty" && "Unsaved…"}
          {autoStatus === "error" && <span className="text-[#a4283c]">Autosave failed — use Save</span>}
        </span>
      </div>
    </div>
  );
}

function CriteriaEditor({
  criteria, onSave, approved,
}: {
  criteria: any[];
  onSave: (next: any[]) => Promise<unknown>;
  approved: boolean;
}) {
  const normalized = useMemo(
    () => criteria.map((c) => (typeof c === "string" ? { text: c, done: false } : { text: c?.text ?? "", done: !!c?.done })),
    [criteria],
  );
  const [items, setItems] = useState(normalized);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setItems(normalized); setDirty(false); }, [normalized]);

  const update = (next: typeof items) => { setItems(next); setDirty(true); };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(items);
      toast.success("Criteria saved");
      setDirty(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {items.map((c, i) => (
          <li key={i} className="flex items-start gap-3 group">
            <button
              onClick={() => update(items.map((it, j) => j === i ? { ...it, done: !it.done } : it))}
              className="mt-1 shrink-0"
              aria-label={c.done ? "Mark undone" : "Mark done"}
            >
              {c.done ? <CheckCircle2 className="w-4 h-4 text-[#1f6b3b]" /> : <Circle className="w-4 h-4 text-ink/40" />}
            </button>
            <span className="font-mono text-[10px] text-ink/40 mt-1.5">{String(i + 1).padStart(2, "0")}</span>
            <input
              type="text"
              value={c.text}
              disabled={approved}
              onChange={(e) => update(items.map((it, j) => j === i ? { ...it, text: e.target.value } : it))}
              className="flex-1 text-sm bg-transparent border-b border-transparent focus:border-border outline-none py-1 text-ink disabled:text-ink/60"
              placeholder="Acceptance criterion"
            />
            <button
              onClick={() => update(items.filter((_, j) => j !== i))}
              disabled={approved}
              className="text-ink/40 hover:text-[#a4283c] mt-1 disabled:opacity-30"
              aria-label="Remove"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="text-sm text-ink/50">No criteria yet.</li>}
      </ul>
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <button
          onClick={() => update([...items, { text: "", done: false }])}
          disabled={approved}
          className="inline-flex items-center gap-1 text-xs text-royal hover:underline disabled:opacity-40"
        >
          <Plus className="w-3 h-3" /> Add criterion
        </button>
        {dirty && (
          <>
            <button
              onClick={save}
              disabled={saving}
              className="text-xs bg-royal text-white rounded-md px-3 py-1.5 hover:bg-royal/90 disabled:opacity-60 inline-flex items-center gap-1"
            >
              <Save className="w-3 h-3" /> {saving ? "Saving…" : "Save changes"}
            </button>
            <button onClick={() => { setItems(normalized); setDirty(false); }} className="text-xs text-ink/60 hover:text-ink">Discard</button>
          </>
        )}
      </div>
    </div>
  );
}

function QAList({ items }: { items: any[] }) {
  if (items.length === 0) return <div className="text-sm text-ink/50">No QA items yet.</div>;
  return (
    <ul className="space-y-2 text-sm">
      {items.map((q, i) => (
        <li key={i} className="flex items-center justify-between border-b border-border/50 pb-2 last:border-0">
          <div>
            <div className="text-ink">{q.section}</div>
            <div className="text-xs text-ink/50">{q.note}</div>
          </div>
          <span className="text-xs text-ink/60">{q.items} items</span>
        </li>
      ))}
    </ul>
  );
}

function DependencyList({ items }: { items: any[] }) {
  if (items.length === 0) return <div className="text-sm text-ink/50">No dependencies.</div>;
  return (
    <ul className="space-y-2 text-sm">
      {items.map((d, i) => (
        <li key={i} className="flex items-center justify-between border-b border-border/50 pb-2 last:border-0">
          <span className="text-ink">{d.name}</span>
          <span className="text-xs text-ink/60">{d.status}</span>
        </li>
      ))}
    </ul>
  );
}

function RiskList({ items }: { items: any[] }) {
  if (items.length === 0) return <div className="text-sm text-ink/50">No risks tracked.</div>;
  return (
    <ul className="space-y-2 text-sm">
      {items.map((r, i) => (
        <li key={i} className="flex items-start justify-between gap-3 border-b border-border/50 pb-2 last:border-0">
          <span className="text-ink">{r.text}</span>
          <span className="text-xs text-ink/60 shrink-0 uppercase tracking-wide">{r.severity}</span>
        </li>
      ))}
    </ul>
  );
}

// -- Structured list editor (Dependencies / Risks / Decisions) -----------
type StructuredFieldDef = {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "number";
  options?: string[];
  placeholder?: string;
};

function StructuredListEditor({
  fieldLabel,
  fields,
  items,
  disabled,
  disabledReason,
  onSave,
  onAccept,
  onReject,
  canDecide,
  decideDeniedReason,
  readOnlyIfNoField = false,
}: {
  fieldLabel: string;
  fields: StructuredFieldDef[];
  items: any[];
  disabled: boolean;
  disabledReason?: string;
  onSave: (next: any[]) => Promise<unknown>;
  onAccept: (item: any, index: number) => void | Promise<void>;
  onReject: (item: any, index: number) => void | Promise<void>;
  canDecide: boolean;
  decideDeniedReason: string;
  readOnlyIfNoField?: boolean;
}) {
  const normalized = useMemo<any[]>(
    () => items.map((it) => (it && typeof it === "object" ? { ...it } : { value: String(it ?? "") })),
    [items],
  );
  const [rows, setRows] = useState<any[]>(normalized);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [decidedIdx, setDecidedIdx] = useState<Record<number, "accept" | "reject">>({});
  useEffect(() => { setRows(normalized); setDirty(false); setDecidedIdx({}); }, [normalized]);

  const update = (i: number, key: string, v: unknown) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: v } : r)));
    setDirty(true);
  };
  const addRow = () => {
    const blank: any = {};
    for (const f of fields) blank[f.key] = f.type === "number" ? 0 : "";
    setRows((prev) => [...prev, blank]);
    setDirty(true);
  };
  const removeRow = (i: number) => {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(rows);
      toast.success(`${fieldLabel}s saved`);
      setDirty(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally { setSaving(false); }
  };

  const decide = async (i: number, kind: "accept" | "reject") => {
    if (!canDecide) { toast.error(decideDeniedReason); return; }
    const it = rows[i];
    try {
      if (kind === "accept") await onAccept(it, i); else await onReject(it, i);
      setDecidedIdx((prev) => ({ ...prev, [i]: kind }));
    } catch { /* toasts handled upstream */ }
  };

  if (readOnlyIfNoField && rows.length === 0 && disabled) {
    return <div className="text-sm text-ink/50">No {fieldLabel.toLowerCase()}s recorded.</div>;
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {rows.map((row, i) => {
          const decided = decidedIdx[i];
          return (
            <li key={i} className={`rounded-md border ${decided === "accept" ? "border-[#a7d3b7] bg-[#f4faf6]" : decided === "reject" ? "border-[#f3ced5] bg-[#fdf5f7]" : "border-border bg-white"} p-3`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-ink/50">{fieldLabel} #{i + 1}{decided ? ` · ${decided}ed` : ""}</div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => decide(i, "accept")}
                    disabled={!canDecide}
                    title={!canDecide ? decideDeniedReason : "Record accept in audit ledger"}
                    className="text-[11px] border border-[#a7d3b7] text-[#1f6b3b] rounded px-2 py-0.5 hover:bg-[#e6f4ec] disabled:opacity-40 disabled:cursor-not-allowed"
                  >Accept</button>
                  <button
                    onClick={() => decide(i, "reject")}
                    disabled={!canDecide}
                    title={!canDecide ? decideDeniedReason : "Record reject in audit ledger"}
                    className="text-[11px] border border-[#f3ced5] text-[#a4283c] rounded px-2 py-0.5 hover:bg-[#fbe9ec] disabled:opacity-40 disabled:cursor-not-allowed"
                  >Reject</button>
                  <button
                    onClick={() => removeRow(i)}
                    disabled={disabled}
                    title={disabled ? disabledReason : "Remove item"}
                    className="text-ink/40 hover:text-[#a4283c] p-1 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Remove"
                  ><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {fields.map((f) => {
                  const val = row[f.key] ?? "";
                  const common = "w-full text-sm border border-border rounded px-2 py-1.5 bg-white disabled:bg-paper-soft disabled:text-ink/60";
                  return (
                    <label key={f.key} className={f.type === "textarea" ? "sm:col-span-2 flex flex-col gap-1" : "flex flex-col gap-1"}>
                      <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-ink/50">{f.label}</span>
                      {f.type === "textarea" ? (
                        <textarea value={val} rows={2} disabled={disabled} onChange={(e) => update(i, f.key, e.target.value)} placeholder={f.placeholder} className={common} />
                      ) : f.type === "select" ? (
                        <select value={val} disabled={disabled} onChange={(e) => update(i, f.key, e.target.value)} className={common}>
                          <option value="">—</option>
                          {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : f.type === "number" ? (
                        <input type="number" value={val} disabled={disabled} onChange={(e) => update(i, f.key, Number(e.target.value))} className={common} />
                      ) : (
                        <input type="text" value={val} disabled={disabled} onChange={(e) => update(i, f.key, e.target.value)} placeholder={f.placeholder} className={common} />
                      )}
                    </label>
                  );
                })}
              </div>
            </li>
          );
        })}
        {rows.length === 0 && <li className="text-sm text-ink/50">No {fieldLabel.toLowerCase()}s yet.</li>}
      </ul>
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <button
          onClick={addRow}
          disabled={disabled}
          title={disabled ? disabledReason : `Add a ${fieldLabel.toLowerCase()}`}
          className="inline-flex items-center gap-1 text-xs text-royal hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
        ><Plus className="w-3 h-3" /> Add {fieldLabel.toLowerCase()}</button>
        {dirty && (
          <>
            <button
              onClick={save}
              disabled={saving || disabled}
              title={disabled ? disabledReason : ""}
              className="text-xs bg-royal text-white rounded-md px-3 py-1.5 hover:bg-royal/90 disabled:opacity-60 inline-flex items-center gap-1 disabled:cursor-not-allowed"
            ><Save className="w-3 h-3" /> {saving ? "Saving…" : "Save changes"}</button>
            <button onClick={() => { setRows(normalized); setDirty(false); }} className="text-xs text-ink/60 hover:text-ink">Discard</button>
          </>
        )}
        {!canDecide && (
          <span className="ml-auto text-[11px] text-ink/50" title={decideDeniedReason}>Accept/Reject disabled</span>
        )}
      </div>
    </div>
  );
}
