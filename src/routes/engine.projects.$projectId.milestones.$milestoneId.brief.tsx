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
} from "@/lib/engine-execution.functions";

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
  const [tab, setTab] = useState<Tab>("Overview");

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

  if (q.isLoading || !m) return <div className="text-sm text-ink/60">Loading milestone…</div>;

  const criteria: any[] = Array.isArray(m.acceptance_criteria) ? m.acceptance_criteria : [];
  const done = criteria.filter((c) => c.done).length;
  const isAI = (m.created_by_kind ?? "ai") === "ai";
  const approved = m.approval_status === "approved";
  const showTab = (t: Tab) => tab === "Overview" || tab === t;

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
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-display text-3xl text-ink">{m.name}</h1>
            <span className="inline-flex items-center rounded-full border border-[#cdd6f3] bg-[#e9eefb] text-[#2842a4] px-2.5 py-0.5 text-[11px] font-medium capitalize">
              {m.approval_status ?? m.status}
            </span>
            <AIDraftBadge kind={m.created_by_kind ?? (isAI ? "ai" : "human")} />
            {approved && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#a7d3b7] bg-[#e6f4ec] text-[#1f6b3b] px-2 py-0.5 text-[11px] font-medium">
                <ShieldCheck className="w-3 h-3" /> Protected
              </span>
            )}
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
            disabled={approve.isPending || approved}
            className="text-xs bg-ink text-white rounded-md px-3 py-1.5 flex items-center gap-1.5 hover:bg-ink/90 disabled:opacity-60"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> {approved ? "Approved" : "Approve Brief"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border flex items-center gap-6 text-sm overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-2.5 -mb-px border-b-2 whitespace-nowrap ${
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
              right={<AIDraftBadge kind={m.created_by_kind ?? "ai"} size="xs" />}
            >
              <EditableMarkdown
                value={m.brief_md ?? ""}
                approved={approved}
                onSave={(v) => patch.mutateAsync({ brief_md: v }).then(() => toast.success("Brief saved"))}
              />
            </SectionCard>
          )}

          {showTab("Acceptance Criteria") && (
            <SectionCard
              title={<span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />Acceptance Criteria</span>}
              right={<span className="flex items-center gap-2 text-xs text-ink/60">{done}/{criteria.length} <AIDraftBadge kind={m.created_by_kind ?? "ai"} size="xs" /></span>}
            >
              <CriteriaEditor
                criteria={criteria}
                approved={approved}
                onSave={(next) => patch.mutateAsync({ acceptance_criteria: next })}
              />
            </SectionCard>
          )}

          {showTab("Developer Prompt") && (
            <SectionCard
              title={<span className="flex items-center gap-2"><Sparkles className="w-4 h-4" />Developer / Lovable Prompt</span>}
              right={
                <button
                  onClick={() => { navigator.clipboard.writeText(m.developer_prompt ?? ""); toast.success("Copied"); }}
                  className="inline-flex items-center gap-1.5 text-xs text-royal hover:underline"
                ><Copy className="w-3 h-3" /> Copy</button>
              }
            >
              <EditablePrompt
                value={m.developer_prompt ?? ""}
                approved={approved}
                onSave={(v) => patch.mutateAsync({ developer_prompt: v }).then(() => toast.success("Prompt saved"))}
              />
            </SectionCard>
          )}

          {tab === "Overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <SectionCard title={<span className="flex items-center gap-2"><ListChecks className="w-4 h-4" />QA Checklist</span>} right={<AIDraftBadge kind={m.created_by_kind ?? "ai"} size="xs" />}>
                <QAList items={m.qa_checklist ?? []} />
              </SectionCard>
              <SectionCard title="Client-Safe Explanation" right={<AIDraftBadge kind={m.created_by_kind ?? "ai"} size="xs" />}>
                <EditableMarkdown
                  value={m.client_safe_md ?? ""}
                  approved={approved}
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
            <SectionCard title={<span className="flex items-center gap-2"><Link2 className="w-4 h-4" />Dependencies</span>}>
              <DependencyList items={m.dependencies ?? []} />
            </SectionCard>
          )}

          {tab === "Risks & Decisions" && (
            <SectionCard title={<span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-[#c99a20]" />Risks</span>}>
              <RiskList items={m.risks ?? []} />
            </SectionCard>
          )}

          {tab === "History" && (
            <SectionCard title={<span className="flex items-center gap-2"><HistoryIcon className="w-4 h-4" />Version History</span>}>
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
              </div>
              <div className="text-xs text-ink/60">Approval status: <span className="font-medium text-ink capitalize">{m.approval_status}</span></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => approve.mutate()}
                disabled={approve.isPending || approved}
                className="text-sm bg-royal text-white rounded-md px-4 py-2 flex items-center gap-1.5 hover:bg-royal/90 disabled:opacity-60"
              ><CheckCircle2 className="w-4 h-4" /> Approve Brief</button>
              <button
                onClick={() => patch.mutate({ approval_status: "revision_requested" })}
                className="text-sm border border-border rounded-md px-4 py-2 hover:border-royal/50"
              >Request Revision</button>
              <button
                onClick={() => patch.mutate({ approval_status: "draft" })}
                className="text-sm border border-border rounded-md px-4 py-2 hover:border-royal/50 flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" /> Save as Draft
              </button>
              <button
                onClick={() => sendTasks.mutate()}
                disabled={sendTasks.isPending || !approved}
                title={!approved ? "Approve the brief before sending tasks" : "Send acceptance criteria as tasks"}
                className="text-sm border border-border rounded-md px-4 py-2 hover:border-royal/50 disabled:opacity-60"
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
  value, onSave, approved, compact = false,
}: {
  value: string;
  onSave: (v: string) => Promise<unknown>;
  approved: boolean;
  compact?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(value); }, [value]);

  if (!editing) {
    return (
      <div className="space-y-3">
        <div className={`prose prose-sm max-w-none text-ink/85 whitespace-pre-wrap ${compact ? "text-sm" : ""}`}>{value || "—"}</div>
        <button
          onClick={() => setEditing(true)}
          disabled={approved}
          title={approved ? "Reset approval before editing" : "Edit"}
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
      <div className="flex items-center gap-2">
        <button
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try { await onSave(draft); setEditing(false); }
            finally { setSaving(false); }
          }}
          className="text-xs bg-royal text-white rounded-md px-3 py-1.5 hover:bg-royal/90 disabled:opacity-60 inline-flex items-center gap-1"
        >
          <Save className="w-3 h-3" /> Save
        </button>
        <button onClick={() => { setDraft(value); setEditing(false); }} className="text-xs text-ink/60 hover:text-ink inline-flex items-center gap-1">
          <X className="w-3 h-3" /> Cancel
        </button>
      </div>
    </div>
  );
}

function EditablePrompt({
  value, onSave, approved,
}: {
  value: string;
  onSave: (v: string) => Promise<unknown>;
  approved: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(value); }, [value]);

  if (!editing) {
    return (
      <div className="space-y-3">
        <pre className="bg-[#0f172a] text-slate-100 rounded-md p-4 text-xs whitespace-pre-wrap font-mono max-h-96 overflow-auto">
          {value || "—"}
        </pre>
        <button
          onClick={() => setEditing(true)}
          disabled={approved}
          title={approved ? "Reset approval before editing" : "Edit prompt"}
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
      <div className="flex items-center gap-2">
        <button
          disabled={saving}
          onClick={async () => { setSaving(true); try { await onSave(draft); setEditing(false); } finally { setSaving(false); } }}
          className="text-xs bg-royal text-white rounded-md px-3 py-1.5 hover:bg-royal/90 disabled:opacity-60"
        ><Save className="w-3 h-3 inline mr-1" /> Save</button>
        <button onClick={() => { setDraft(value); setEditing(false); }} className="text-xs text-ink/60 hover:text-ink">Cancel</button>
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
