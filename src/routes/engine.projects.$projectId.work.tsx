import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  isEnrichmentRunning,
  runEnrichmentInBackground,
  subscribeEnrichment,
} from "@/lib/engine-milestone-enrichment-status";

import { z } from "zod";
import {
  Wrench,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock,
  ListChecks,
  Users,
  Bot,
  Flame,
  ShieldCheck,
  DollarSign,
  Zap,
  Plus,
  GitCompare,
  UserCog,
  FileCheck2,
} from "lucide-react";
import { getProjectWork, type ProjectWorkPayload } from "@/lib/engine-work.functions";
import { draftMilestoneAcceptanceCriteria, enrichMilestoneAcceptanceCriteria } from "@/lib/engine-milestone-ai-draft.functions";
import { Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  MilestoneExecutionSummary,
  WorkItem,
  WorkHealth,
  AgentAssignment,
  WorkBlocker,
  MilestoneGateProgression,
  GateState,
} from "@/lib/work-view";
import { Button } from "@/components/ui/button";
import { useEngineRole } from "@/hooks/useEngineRole";
import {
  AddWorkItemModal,
  ReassignWorkItemModal,
  ResolveBlockerModal,
  ComparePacketsModal,
  WorkEvidenceModal,
} from "@/components/engine/work/WorkActionModals";
import {
  PausedWorkBanner,
  BulkReassignModal,
  BulkResolveBlockersModal,
  WorkAuditTrailModal,
} from "@/components/engine/work/WorkBulkModals";
import { Checkbox } from "@/components/ui/checkbox";
import { History } from "lucide-react";

const searchSchema = z.object({
  view: z.enum(["milestones", "queue", "agents", "blockers"]).default("milestones"),
  milestoneId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/engine/projects/$projectId/work")({
  validateSearch: (raw) => searchSchema.parse(raw ?? {}),
  component: WorkTab,
});

const workQueryOptions = (
  projectId: string,
  fn: (input: { data: { id: string } }) => Promise<ProjectWorkPayload>,
) =>
  queryOptions({
    queryKey: ["engine", "work", projectId],
    queryFn: () => fn({ data: { id: projectId } }),
    staleTime: 15_000,
  });

type ModalState =
  | { kind: "none" }
  | { kind: "add"; milestoneId?: string | null }
  | { kind: "reassign"; taskId: string; taskName: string; currentOwner: string | null }
  | { kind: "resolve"; reviewItemId: string; title: string }
  | { kind: "compare"; milestoneId: string; milestoneName: string }
  | { kind: "evidence"; taskId: string; taskName: string }
  | { kind: "audit"; taskId: string; taskName: string }
  | { kind: "bulk-reassign"; taskIds: string[] }
  | { kind: "bulk-resolve"; reviewItemIds: string[] };

function WorkTab() {
  const { projectId } = Route.useParams();
  const search = useSearch({ from: "/engine/projects/$projectId/work" });
  const fn = useServerFn(getProjectWork);
  const role = useEngineRole();
  const [modal, setModal] = useState<ModalState>({ kind: "none" });
  const { data, isPending, isError, error } = useQuery(
    workQueryOptions(
      projectId,
      fn as unknown as (i: { data: { id: string } }) => Promise<ProjectWorkPayload>,
    ),
  );

  if (isPending) return <WorkSkeleton />;
  if (isError || !data) {
    return (
      <div
        className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-900"
        role="alert"
        data-qa-state="work-error"
      >
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-red-700/70">
          Work failed
        </div>
        <div className="mt-1">
          {(error as Error | null)?.message ?? "Work data did not load."}
        </div>
      </div>
    );
  }

  const view = data.view;

  if (view.mode === "no_roadmap") {
    return (
      <EmptyState
        title="Approve the roadmap to open Work"
        body="Work opens after Point A, Point B, and the milestone baseline are approved on the Roadmap tab."
        cta={{ label: "Open Roadmap", to: "/engine/projects/$projectId/roadmap", projectId }}
      />
    );
  }
  if (view.mode === "roadmap_no_ready_milestone") {
    return (
      <NoReadyMilestoneEmpty projectId={projectId} canAct={role.canEdit} />
    );
  }

  const canAct = role.canEdit;

  return (
    <div className="space-y-5" data-qa-tab-view="work">
      <PausedWorkBanner projectId={projectId} isAdmin={role.isAdmin} />
      <SummaryStrip
        view={view}
        onAddWork={canAct ? () => setModal({ kind: "add" }) : undefined}
      />
      <NextBestActionCard view={view} projectId={projectId} />
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-5">
        <div className="space-y-5 min-w-0">
          <ViewTabs projectId={projectId} current={search.view} />
          {search.view === "milestones" && (
            <MilestoneExecutionGrid
              milestones={view.milestones}
              projectId={projectId}
              activeId={search.milestoneId ?? null}
              canAct={canAct}
              onAddWork={(mid) => setModal({ kind: "add", milestoneId: mid })}
              onCompare={(mid, name) =>
                setModal({ kind: "compare", milestoneId: mid, milestoneName: name })
              }
            />
          )}
          {search.view === "queue" && (
            <WorkQueue
              queue={view.queue}
              offRoadmap={view.off_roadmap}
              canAct={canAct}
              onReassign={(w) =>
                setModal({
                  kind: "reassign",
                  taskId: w.id,
                  taskName: w.name,
                  currentOwner: w.owner_id ?? null,
                })
              }
              onEvidence={(w) =>
                setModal({ kind: "evidence", taskId: w.id, taskName: w.name })
              }
              onHistory={(w) =>
                setModal({ kind: "audit", taskId: w.id, taskName: w.name })
              }
              onBulkReassign={(ids) =>
                setModal({ kind: "bulk-reassign", taskIds: ids })
              }
            />
          )}
          {search.view === "agents" && <AgentGrid agents={view.agents} />}
          {search.view === "blockers" && (
            <BlockerList
              blockers={view.blockers}
              canAct={canAct}
              onResolve={(b) =>
                setModal({ kind: "resolve", reviewItemId: b.id, title: b.title })
              }
              onBulkResolve={(ids) =>
                setModal({ kind: "bulk-resolve", reviewItemIds: ids })
              }
            />
          )}
        </div>
        <aside className="space-y-4">
          <CaptainBriefCard view={view} />
          <QaHandoffCard view={view} projectId={projectId} />
          <CostCapacityCard view={view} />
          <RecentChangesCard view={view} />
        </aside>
      </div>

      {modal.kind === "add" ? (
        <AddWorkItemModal
          open
          onOpenChange={(o) => !o && setModal({ kind: "none" })}
          projectId={projectId}
          defaultMilestoneId={modal.milestoneId ?? null}
        />
      ) : null}
      {modal.kind === "reassign" ? (
        <ReassignWorkItemModal
          open
          onOpenChange={(o) => !o && setModal({ kind: "none" })}
          projectId={projectId}
          taskId={modal.taskId}
          taskName={modal.taskName}
          currentOwner={modal.currentOwner}
        />
      ) : null}
      {modal.kind === "resolve" ? (
        <ResolveBlockerModal
          open
          onOpenChange={(o) => !o && setModal({ kind: "none" })}
          projectId={projectId}
          reviewItemId={modal.reviewItemId}
          title={modal.title}
        />
      ) : null}
      {modal.kind === "compare" ? (
        <ComparePacketsModal
          open
          onOpenChange={(o) => !o && setModal({ kind: "none" })}
          projectId={projectId}
          milestoneId={modal.milestoneId}
          milestoneName={modal.milestoneName}
          isAdmin={role.isAdmin}
        />
      ) : null}
      {modal.kind === "evidence" ? (
        <WorkEvidenceModal
          open
          onOpenChange={(o) => !o && setModal({ kind: "none" })}
          projectId={projectId}
          taskId={modal.taskId}
          taskName={modal.taskName}
          isAdmin={role.isAdmin}
          currentUserEmail={role.email}
        />
      ) : null}
      {modal.kind === "audit" ? (
        <WorkAuditTrailModal
          open
          onOpenChange={(o) => !o && setModal({ kind: "none" })}
          projectId={projectId}
          taskId={modal.taskId}
          taskName={modal.taskName}
        />
      ) : null}
      {modal.kind === "bulk-reassign" ? (
        <BulkReassignModal
          open
          onOpenChange={(o) => !o && setModal({ kind: "none" })}
          projectId={projectId}
          taskIds={modal.taskIds}
        />
      ) : null}
      {modal.kind === "bulk-resolve" ? (
        <BulkResolveBlockersModal
          open
          onOpenChange={(o) => !o && setModal({ kind: "none" })}
          projectId={projectId}
          reviewItemIds={modal.reviewItemIds}
        />
      ) : null}
    </div>
  );
}


// ---------- summary strip ----------

function SummaryStrip({ view, onAddWork }: { view: ProjectWorkPayload["view"]; onAddWork?: () => void }) {
  const healthMeta = healthChip(view.work_health);
  return (
    <section
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
      data-qa-view-mode={view.mode}
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Wrench className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-ink/50">
              Work
            </div>
            <div className="text-sm font-medium text-ink truncate">
              {view.execution_phase ?? "Execution"}
              {view.current_version_label ? (
                <span className="text-ink/50"> · Roadmap {view.current_version_label}</span>
              ) : null}
            </div>
          </div>
        </div>
        <div
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${healthMeta.className}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          {healthMeta.label}
        </div>
        <StatPill icon={<Zap className="w-3.5 h-3.5" />} label="Ready" value={view.summary.ready_to_start} />
        <StatPill icon={<Clock className="w-3.5 h-3.5" />} label="In progress" value={view.summary.in_progress} />
        <StatPill
          icon={<AlertTriangle className="w-3.5 h-3.5" />}
          label="Blocked"
          value={view.summary.blocked}
          tone={view.summary.blocked > 0 ? "warn" : "muted"}
        />
        <StatPill
          icon={<ListChecks className="w-3.5 h-3.5" />}
          label="Awaiting approval"
          value={view.summary.awaiting_approval}
        />
        <StatPill
          icon={<Users className="w-3.5 h-3.5" />}
          label="Awaiting client"
          value={view.summary.awaiting_client}
        />
        <StatPill
          icon={<ShieldCheck className="w-3.5 h-3.5" />}
          label="Ready for QA"
          value={view.summary.ready_for_qa}
          tone={view.summary.ready_for_qa > 0 ? "good" : "muted"}
        />
        <StatPill icon={<Bot className="w-3.5 h-3.5" />} label="Active agents" value={view.summary.active_agents} />
        {view.summary.value_blocked_cents > 0 ? (
          <StatPill
            icon={<DollarSign className="w-3.5 h-3.5" />}
            label="Value blocked"
            value={formatCurrency(view.summary.value_blocked_cents)}
            tone="warn"
          />
        ) : null}
        {onAddWork ? (
          <Button size="sm" className="ml-auto" onClick={onAddWork}>
            <Plus className="w-3 h-3 mr-1" /> Add work
          </Button>
        ) : null}
      </div>
      {view.last_material_change ? (
        <div className="mt-3 text-xs text-ink/60 border-t border-border pt-3">
          Last change: <span className="text-ink">{view.last_material_change.title}</span>
          <span className="text-ink/40"> · {timeAgo(view.last_material_change.created_at)}</span>
        </div>
      ) : null}
    </section>
  );
}

function StatPill({
  icon,
  label,
  value,
  tone = "muted",
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone?: "muted" | "good" | "warn";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-700 bg-emerald-50 border-emerald-100"
      : tone === "warn"
        ? "text-amber-800 bg-amber-50 border-amber-100"
        : "text-ink/70 bg-white border-border";
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ${toneClass}`}>
      <span className="opacity-70">{icon}</span>
      <span className="font-medium text-ink">{value}</span>
      <span className="text-ink/50">{label}</span>
    </div>
  );
}

// ---------- next best action ----------

function NextBestActionCard({
  view,
  projectId,
}: {
  view: ProjectWorkPayload["view"];
  projectId: string;
}) {
  const nba = view.next_best_action;
  if (!nba) {
    return (
      <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-700" />
        <div className="text-sm text-emerald-900">
          Work is flowing. No blocker, approval, or QA handoff is waiting.
        </div>
      </section>
    );
  }
  const impactTone =
    nba.impact === "critical"
      ? "border-red-200 bg-red-50/70"
      : nba.impact === "high"
        ? "border-amber-200 bg-amber-50/70"
        : "border-primary/20 bg-primary/5";
  return (
    <section className={`rounded-xl border p-4 ${impactTone}`} data-qa-nba={nba.cta_kind}>
      <div className="flex items-start gap-3">
        <Flame className="w-5 h-5 text-primary mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-ink/50">
            Highest-leverage action
          </div>
          <div className="text-base font-medium text-ink mt-1">{nba.action}</div>
          <div className="text-sm text-ink/70 mt-1">{nba.why_it_matters}</div>
          <div className="text-xs text-ink/50 mt-2">
            Unlocks: <span className="text-ink/70">{nba.what_it_unlocks}</span>
            {nba.owner ? <span> · Owner: {nba.owner}</span> : null}
            {nba.due_date ? <span> · Due {formatDate(nba.due_date)}</span> : null}
          </div>
        </div>
        {nba.milestone_id ? (
          <Link
            to="/engine/projects/$projectId/work"
            params={{ projectId }}
            search={{ view: "milestones", milestoneId: nba.milestone_id }}
            className="inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-2 text-sm text-white hover:bg-ink/90 shrink-0"
          >
            {nba.cta_label} <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        ) : null}
      </div>
    </section>
  );
}

// ---------- view tabs ----------

function ViewTabs({
  projectId,
  current,
}: {
  projectId: string;
  current: "milestones" | "queue" | "agents" | "blockers";
}) {
  const tabs: Array<{ k: typeof current; label: string }> = [
    { k: "milestones", label: "Milestone execution" },
    { k: "queue", label: "Work queue" },
    { k: "agents", label: "Agents" },
    { k: "blockers", label: "Blockers" },
  ];
  return (
    <div className="inline-flex rounded-md border border-border bg-white p-0.5 text-sm">
      {tabs.map((t) => (
        <Link
          key={t.k}
          to="/engine/projects/$projectId/work"
          params={{ projectId }}
          search={{ view: t.k }}
          className={`px-3 py-1.5 rounded ${
            current === t.k ? "bg-ink text-white" : "text-ink/70 hover:text-ink"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

// ---------- milestone execution grid ----------

function MilestoneExecutionGrid({
  milestones,
  projectId,
  activeId,
  canAct,
  onAddWork,
  onCompare,
}: {
  milestones: MilestoneExecutionSummary[];
  projectId: string;
  activeId: string | null;
  canAct: boolean;
  onAddWork: (milestoneId: string) => void;
  onCompare: (milestoneId: string, milestoneName: string) => void;
}) {
  if (milestones.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-white p-6 text-sm text-ink/60">
        No milestones on the approved roadmap yet.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {milestones.map((m) => (
        <MilestoneExecutionCard
          key={m.id}
          m={m}
          projectId={projectId}
          highlighted={activeId === m.id}
          canAct={canAct}
          onAddWork={() => onAddWork(m.id)}
          onCompare={() => onCompare(m.id, m.name)}
        />
      ))}
    </div>
  );
}

function MilestoneExecutionCard({
  m,
  projectId,
  highlighted,
  canAct,
  onAddWork,
  onCompare,
}: {
  m: MilestoneExecutionSummary;
  projectId: string;
  highlighted: boolean;
  canAct: boolean;
  onAddWork: () => void;
  onCompare: () => void;
}) {
  const health = healthChip(m.health);
  return (
    <article
      className={`rounded-xl border bg-card p-4 shadow-sm flex flex-col gap-3 ${
        highlighted ? "border-primary ring-2 ring-primary/20" : "border-border"
      }`}
      data-qa-milestone-card={m.id}
      data-qa-work-state={m.work_state}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-ink/50">
            {m.phase ?? "Milestone"}
          </div>
          <h3 className="font-medium text-ink text-base truncate">{m.name}</h3>
          <p className="text-xs text-ink/60 mt-1 line-clamp-2">{m.outcome}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0 ${health.className}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          {health.label}
        </span>
      </header>

      <GateStrip gates={m.gates} current={m.current_gate} />

      <div className="grid grid-cols-2 gap-2 text-xs text-ink/70">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-ink/50">Work state</div>
          <div className="text-ink">{humanizeWorkState(m.work_state)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-ink/50">Owner</div>
          <div className="text-ink">{m.owner ?? "Unassigned"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-ink/50">Due</div>
          <div className="text-ink">{m.due_date ? formatDate(m.due_date) : "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-ink/50">Evidence</div>
          <div className="text-ink">
            {m.evidence_attached}/{m.evidence_required}
          </div>
        </div>
      </div>

      <div className="text-xs text-ink/60 border-t border-border pt-2">
        <span className="text-ink/50">Expected artifact: </span>
        <span className="text-ink/80">{m.expected_artifact}</span>
      </div>

      {m.readiness_missing.length > 0 ? (
        <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5">
          Missing: {m.readiness_missing.join(" · ")}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="text-xs text-ink/60">
          {m.active_tasks} active · {m.blocked_tasks} blocked
        </div>
        <div className="flex items-center gap-1.5">
          {canAct ? (
            <>
              <Button size="sm" variant="outline" onClick={onAddWork} title="Add work item">
                <Plus className="w-3 h-3 mr-1" /> Work
              </Button>
              <Button size="sm" variant="outline" onClick={onCompare} title="Compare build packets">
                <GitCompare className="w-3 h-3 mr-1" /> Compare
              </Button>
            </>
          ) : null}
          <Link
            to="/engine/projects/$projectId/milestones/$milestoneId"
            params={{ projectId, milestoneId: m.id }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-2.5 py-1.5 text-xs text-ink hover:border-ink/40"
          >
            {m.next_action} <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </article>
  );
}

function GateStrip({
  gates,
  current,
}: {
  gates: MilestoneGateProgression;
  current: keyof MilestoneGateProgression;
}) {
  const order: Array<keyof MilestoneGateProgression> = [
    "brief",
    "criteria",
    "mockups",
    "build",
    "qa",
    "delivery",
  ];
  return (
    <div className="flex items-center gap-1" role="list" aria-label="Milestone gates">
      {order.map((k, i) => {
        const state = gates[k];
        const isCurrent = k === current;
        return (
          <div key={k} className="flex items-center gap-1 min-w-0" role="listitem">
            <div
              className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${gateClass(
                state,
                isCurrent,
              )}`}
              title={`${gateLabel(k)}: ${state}`}
            >
              <GateDot state={state} />
              <span className="capitalize">{gateLabel(k)}</span>
            </div>
            {i < order.length - 1 ? <span className="text-ink/20 text-xs">→</span> : null}
          </div>
        );
      })}
    </div>
  );
}

function GateDot({ state }: { state: GateState }) {
  if (state === "done") return <CheckCircle2 className="w-3 h-3 text-emerald-600" />;
  if (state === "in_progress") return <Clock className="w-3 h-3 text-primary" />;
  if (state === "current") return <CircleDashed className="w-3 h-3 text-primary" />;
  if (state === "n_a") return <span className="w-2 h-2 rounded-full bg-ink/20" />;
  return <span className="w-2 h-2 rounded-full bg-ink/20" />;
}

function gateClass(state: GateState, current: boolean): string {
  if (state === "done") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (state === "in_progress" || state === "current")
    return `border-primary/30 bg-primary/10 text-primary ${current ? "ring-1 ring-primary/40" : ""}`;
  if (state === "n_a") return "border-border bg-white text-ink/40";
  return "border-border bg-white text-ink/50";
}

function gateLabel(k: keyof MilestoneGateProgression): string {
  if (k === "qa") return "QA";
  return k;
}

// ---------- work queue ----------

function WorkQueue({
  queue,
  offRoadmap,
  canAct,
  onReassign,
  onEvidence,
  onHistory,
  onBulkReassign,
}: {
  queue: WorkItem[];
  offRoadmap: WorkItem[];
  canAct: boolean;
  onReassign: (w: WorkItem) => void;
  onEvidence: (w: WorkItem) => void;
  onHistory: (w: WorkItem) => void;
  onBulkReassign: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectedIds = [...selected].filter(
    (id) => queue.some((w) => w.id === id) || offRoadmap.some((w) => w.id === id),
  );
  return (
    <div className="space-y-4">
      {canAct && selectedIds.length > 0 ? (
        <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span>{selectedIds.length} selected</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <Button size="sm" onClick={() => onBulkReassign(selectedIds)}>
              Bulk reassign
            </Button>
          </div>
        </div>
      ) : null}
      <div className="rounded-xl border border-border bg-white overflow-hidden">
        <header className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <div className="text-sm font-medium text-ink">Roadmap-linked work</div>
          <div className="text-xs text-ink/60">{queue.length} items</div>
        </header>
        {queue.length === 0 ? (
          <div className="p-4 text-sm text-ink/60">No active work items.</div>
        ) : (
          <ul className="divide-y divide-border">
            {queue.map((w) => (
              <WorkRow
                key={w.id}
                w={w}
                canAct={canAct}
                selected={selected.has(w.id)}
                onToggle={() => toggle(w.id)}
                onReassign={() => onReassign(w)}
                onEvidence={() => onEvidence(w)}
                onHistory={() => onHistory(w)}
              />
            ))}
          </ul>
        )}
      </div>

      {offRoadmap.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 overflow-hidden">
          <header className="flex items-center justify-between px-4 py-2.5 border-b border-amber-200">
            <div className="text-sm font-medium text-amber-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Off-roadmap tasks
            </div>
            <div className="text-xs text-amber-800/80">{offRoadmap.length} items</div>
          </header>
          <div className="px-4 py-2 text-xs text-amber-900/80">
            These tasks do not trace to an approved milestone. Attach them to a milestone or
            close them out.
          </div>
          <ul className="divide-y divide-amber-200">
            {offRoadmap.map((w) => (
              <WorkRow
                key={w.id}
                w={w}
                canAct={canAct}
                selected={selected.has(w.id)}
                onToggle={() => toggle(w.id)}
                onReassign={() => onReassign(w)}
                onEvidence={() => onEvidence(w)}
                onHistory={() => onHistory(w)}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function WorkRow({
  w,
  canAct,
  selected,
  onToggle,
  onReassign,
  onEvidence,
  onHistory,
}: {
  w: WorkItem;
  canAct: boolean;
  selected: boolean;
  onToggle: () => void;
  onReassign: () => void;
  onEvidence: () => void;
  onHistory: () => void;
}) {
  return (
    <li className="px-4 py-3 flex items-start gap-3 hover:bg-ink/[0.02]">
      {canAct ? (
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          className="mt-1.5"
          aria-label={`Select ${w.name}`}
        />
      ) : null}
      <StatusDot status={w.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-ink font-medium truncate">{w.name}</span>
          <span className="text-[11px] text-ink/50">· {w.milestone_name}</span>
          {w.owner_type === "agent" ? (
            <span className="inline-flex items-center gap-1 rounded bg-primary/10 text-primary text-[10px] px-1.5 py-0.5">
              <Bot className="w-2.5 h-2.5" /> agent
            </span>
          ) : null}
          <PriorityChip p={w.priority} />
        </div>
        <div className="text-xs text-ink/60 mt-0.5 line-clamp-1">{w.purpose}</div>
        <div className="text-[11px] text-ink/50 mt-1 flex gap-3 flex-wrap">
          <span>Status: {w.status.replace(/_/g, " ")}</span>
          {w.owner_id ? <span>Owner: {w.owner_id}</span> : null}
          {w.due_date ? <span>Due {formatDate(w.due_date)}</span> : null}
          {w.evidence_required > 0 ? (
            <span>
              Evidence {w.evidence_attached}/{w.evidence_required}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {canAct ? (
          <>
            <Button size="sm" variant="ghost" onClick={onReassign} title="Reassign">
              <UserCog className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={onEvidence} title="Evidence">
              <FileCheck2 className="w-3.5 h-3.5" />
            </Button>
          </>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onHistory} title="Audit trail">
          <History className="w-3.5 h-3.5" />
        </Button>
        <div className="text-xs text-ink/70">{w.next_action}</div>
      </div>
    </li>
  );
}

function StatusDot({ status }: { status: WorkItem["status"] }) {
  const cls =
    status === "blocked"
      ? "bg-red-500"
      : status === "in_progress"
        ? "bg-primary"
        : status === "ready"
          ? "bg-amber-500"
          : status === "submitted" || status === "evidence_review"
            ? "bg-purple-500"
            : status === "accepted" || status === "complete"
              ? "bg-emerald-500"
              : "bg-ink/30";
  return <span className={`w-2 h-2 rounded-full mt-2 shrink-0 ${cls}`} aria-hidden />;
}

function PriorityChip({ p }: { p: WorkItem["priority"] }) {
  const cls =
    p === "critical"
      ? "bg-red-100 text-red-800"
      : p === "high"
        ? "bg-amber-100 text-amber-900"
        : p === "low"
          ? "bg-ink/5 text-ink/60"
          : "bg-primary/10 text-primary";
  return <span className={`text-[10px] rounded px-1.5 py-0.5 ${cls}`}>{p}</span>;
}

// ---------- agents ----------

function AgentGrid({ agents }: { agents: AgentAssignment[] }) {
  if (agents.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-white p-6 text-sm text-ink/60">
        No agents are working on this project right now.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {agents.map((a) => (
        <div key={a.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm text-ink font-medium">{a.role}</div>
                <div className="text-xs text-ink/60">{a.current_work}</div>
              </div>
            </div>
            <AgentStateBadge state={a.state} />
          </div>
          {a.waiting_reason ? (
            <div className="mt-2 text-xs text-amber-800 bg-amber-50 rounded px-2 py-1">
              {a.waiting_reason}
            </div>
          ) : null}
          <div className="mt-2 text-[11px] text-ink/50 flex gap-3">
            <span>Cost {formatCurrency(a.cost_cents)}</span>
            <span>Updated {timeAgo(a.last_activity_at)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function AgentStateBadge({ state }: { state: AgentAssignment["state"] }) {
  const map: Record<AgentAssignment["state"], { label: string; cls: string }> = {
    working: { label: "Working", cls: "bg-primary/10 text-primary" },
    monitoring: { label: "Monitoring", cls: "bg-ink/5 text-ink/70" },
    waiting: { label: "Waiting", cls: "bg-amber-100 text-amber-900" },
    needs_clarification: { label: "Needs input", cls: "bg-amber-100 text-amber-900" },
    blocked: { label: "Blocked", cls: "bg-red-100 text-red-800" },
    failed: { label: "Failed", cls: "bg-red-100 text-red-800" },
    complete: { label: "Complete", cls: "bg-emerald-100 text-emerald-800" },
    idle: { label: "Idle", cls: "bg-ink/5 text-ink/60" },
  };
  const m = map[state];
  return <span className={`text-[11px] rounded px-2 py-0.5 ${m.cls}`}>{m.label}</span>;
}

// ---------- blockers ----------

function BlockerList({
  blockers,
  canAct,
  onResolve,
  onBulkResolve,
}: {
  blockers: WorkBlocker[];
  canAct: boolean;
  onResolve: (b: WorkBlocker) => void;
  onBulkResolve: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectedIds = [...selected].filter((id) => blockers.some((b) => b.id === id));

  if (blockers.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-6 text-sm text-emerald-900">
        No open blockers. Execution is clear.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {canAct && selectedIds.length > 0 ? (
        <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span>{selectedIds.length} selected</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <Button size="sm" onClick={() => onBulkResolve(selectedIds)}>
              Bulk resolve
            </Button>
          </div>
        </div>
      ) : null}
      <ul className="space-y-2">
        {blockers.map((b) => (
          <li key={b.id} className="rounded-xl border border-border bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              {canAct ? (
                <Checkbox
                  checked={selected.has(b.id)}
                  onCheckedChange={() => toggle(b.id)}
                  className="mt-1"
                  aria-label={`Select ${b.title}`}
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span className="text-sm text-ink font-medium">{b.title}</span>
                  <span className="text-[10px] rounded bg-ink/5 text-ink/60 px-1.5 py-0.5">
                    {b.blocker_type.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="text-xs text-ink/60 mt-1">Blocks: {b.what_it_blocks}</div>
                <div className="text-[11px] text-ink/50 mt-1 flex gap-3 flex-wrap">
                  <span>Age {b.age_days}d</span>
                  {b.owner ? <span>Owner: {b.owner}</span> : null}
                  {b.due_date ? <span>Due {formatDate(b.due_date)}</span> : null}
                  <span>Impact: {b.impact}</span>
                </div>
                <div className="text-xs text-ink/70 mt-2">{b.recommended_resolution}</div>
              </div>
              {canAct ? (
                <Button size="sm" variant="outline" onClick={() => onResolve(b)}>
                  Resolve
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}


// ---------- right rail cards ----------

function CaptainBriefCard({ view }: { view: ProjectWorkPayload["view"] }) {
  const b = view.captain_brief;
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-ink/50">
        Captain Brief
      </div>
      <dl className="mt-2 space-y-2 text-xs text-ink/80">
        <div>
          <dt className="text-ink/50">What changed</dt>
          <dd className="text-ink mt-0.5">{b.what_changed}</dd>
        </div>
        <div>
          <dt className="text-ink/50">What matters now</dt>
          <dd className="text-ink mt-0.5">{b.what_matters_now}</dd>
        </div>
        <div>
          <dt className="text-ink/50">Recommendation</dt>
          <dd className="text-ink mt-0.5">{b.recommendation}</dd>
        </div>
        <div>
          <dt className="text-ink/50">Watch for</dt>
          <dd className="text-ink mt-0.5">{b.watch_for}</dd>
        </div>
      </dl>
    </section>
  );
}

function QaHandoffCard({
  view,
  projectId,
}: {
  view: ProjectWorkPayload["view"];
  projectId: string;
}) {
  if (view.qa_handoffs.length === 0) return null;
  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
      <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-emerald-800/80">
        Ready for QA
      </div>
      <ul className="mt-2 space-y-2">
        {view.qa_handoffs.map((q) => (
          <li key={q.milestone_id}>
            <Link
              to="/engine/projects/$projectId/milestones/$milestoneId"
              params={{ projectId, milestoneId: q.milestone_id }}
              className="text-sm text-ink hover:underline"
            >
              {q.milestone_name}
            </Link>
            <div className="text-[11px] text-ink/60">{q.reasons_ready.join(" · ")}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CostCapacityCard({ view }: { view: ProjectWorkPayload["view"] }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-ink/50">
        Cost & capacity
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <MiniStat label="MTD spend" value={formatCurrency(view.cost.mtd_spend_cents)} />
        <MiniStat label="Burn/day" value={formatCurrency(view.cost.burn_per_day_cents)} />
        <MiniStat
          label="Value blocked"
          value={formatCurrency(view.cost.value_blocked_cents)}
          tone={view.cost.value_blocked_cents > 0 ? "warn" : "muted"}
        />
        <MiniStat label="Allocated" value={formatCurrency(view.cost.allocated_cents)} />
        <MiniStat label="Active agents" value={String(view.capacity.active_agents)} />
        <MiniStat label="Waiting" value={String(view.capacity.waiting_count)} />
      </dl>
    </section>
  );
}

function MiniStat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "muted" | "warn";
}) {
  return (
    <div className={tone === "warn" ? "text-amber-800" : "text-ink"}>
      <div className="text-[10px] uppercase tracking-wider text-ink/50">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function RecentChangesCard({ view }: { view: ProjectWorkPayload["view"] }) {
  if (view.changes.length === 0) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-ink/50">
        Recent changes
      </div>
      <ul className="mt-2 space-y-2">
        {view.changes.slice(0, 6).map((c) => (
          <li key={c.id} className="text-xs">
            <div className="text-ink truncate">{c.title}</div>
            <div className="text-[10px] text-ink/50">
              {c.actor ?? "system"} · {timeAgo(c.created_at)}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- misc ----------

function NoReadyMilestoneEmpty({ projectId, canAct }: { projectId: string; canAct: boolean }) {
  const qc = useQueryClient();
  const draft = useServerFn(draftMilestoneAcceptanceCriteria);
  const enrich = useServerFn(enrichMilestoneAcceptanceCriteria);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDraft() {
    setPending(true);
    setError(null);
    try {
      const res = (await (draft as unknown as (i: { data: { projectId: string } }) => Promise<{
        drafted: number;
        approved: number;
        needs_enrichment: boolean;
      }>)({ data: { projectId } }));
      // Defaults are persisted — reveal Work immediately.
      await qc.invalidateQueries({ queryKey: ["engine", "work", projectId] });
      if (res.drafted === 0) {
        setError("No milestones needed drafting. Try Refresh Project Intelligence on the Roadmap tab.");
      } else if (res.needs_enrichment) {
        // Fire AI polish in the background; refresh the Work view when it lands.
        runEnrichmentInBackground(
          projectId,
          enrich as unknown as (i: { data: { projectId: string } }) => Promise<unknown>,
          () => {
            void qc.invalidateQueries({ queryKey: ["engine", "work", projectId] });
          },
        );
      }
    } catch (e) {
      setError((e as Error)?.message ?? "AI draft failed.");
    } finally {
      setPending(false);
    }
  }


  return (
    <section className="rounded-xl border border-border bg-card p-8 text-center max-w-2xl mx-auto">
      <div className="mx-auto w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
        <Wrench className="w-5 h-5" />
      </div>
      <h2 className="mt-3 font-display text-lg text-ink">Roadmap approved. No milestone is ready yet.</h2>
      <p className="mt-1 text-sm text-ink/60">
        The AI Product Manager can draft acceptance criteria on every milestone so execution can open.
      </p>
      <div className="mt-4 flex items-center justify-center gap-2">
        {canAct && (
          <button
            type="button"
            onClick={onDraft}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md bg-royal px-3 py-2 text-sm font-medium text-white hover:bg-royal/90 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {pending ? "Drafting acceptance criteria…" : "AI: Draft acceptance criteria"}
          </button>
        )}
        <Link
          to="/engine/projects/$projectId/roadmap"
          params={{ projectId }}
          search={{ view: "journey" }}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-2 text-sm text-ink hover:bg-ink/5"
        >
          Open Roadmap <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      {error && <p className="mt-3 text-xs text-red-700">{error}</p>}
    </section>
  );
}

function EmptyState({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta: { label: string; to: "/engine/projects/$projectId/roadmap"; projectId: string };
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-8 text-center max-w-2xl mx-auto">
      <div className="mx-auto w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
        <Wrench className="w-5 h-5" />
      </div>
      <h2 className="mt-3 font-display text-lg text-ink">{title}</h2>
      <p className="mt-1 text-sm text-ink/60">{body}</p>
      <Link
        to={cta.to}
        params={{ projectId: cta.projectId }}
        search={{ view: "journey" }}
        className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-2 text-sm text-white hover:bg-ink/90"
      >
        {cta.label} <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </section>
  );
}

function WorkSkeleton() {
  return (
    <div className="space-y-4" data-qa-state="work-loading">
      <div className="h-20 rounded-xl border border-border bg-white animate-pulse" />
      <div className="h-16 rounded-xl border border-border bg-white animate-pulse" />
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-56 rounded-xl border border-border bg-white animate-pulse" />
          ))}
        </div>
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 rounded-xl border border-border bg-white animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}

function healthChip(h: WorkHealth): { label: string; className: string } {
  if (h === "blocked")
    return { label: "Blocked", className: "bg-red-100 text-red-800" };
  if (h === "at_risk")
    return { label: "At risk", className: "bg-amber-100 text-amber-900" };
  if (h === "needs_attention")
    return { label: "Needs attention", className: "bg-amber-50 text-amber-800" };
  return { label: "On track", className: "bg-emerald-100 text-emerald-800" };
}

function humanizeWorkState(s: MilestoneExecutionSummary["work_state"]): string {
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatCurrency(cents: number): string {
  const d = cents / 100;
  if (d === 0) return "$0";
  if (d >= 1000) return `$${Math.round(d / 100) / 10}k`;
  return `$${d.toFixed(0)}`;
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diff = Date.now() - then;
  const m = Math.round(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
