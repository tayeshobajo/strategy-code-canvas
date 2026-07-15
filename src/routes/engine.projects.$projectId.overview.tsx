import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useWorkspace } from "@/hooks/use-workspace";
import { SectionCard, EmptyState, formatDate } from "@/components/engine/primitives";
import { AuditTrailCard } from "@/components/engine/AuditTrail";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  BrainCircuit,
  Eye,
  Info,
  Sparkles,
  Map,
  ClipboardList,
  FlaskConical,
  Lightbulb,
  GitBranch,
  MessageSquare,
  ArrowRight,
  AlertTriangle,
  Activity,
  Calendar,
  ShieldCheck,
} from "lucide-react";
import { getIntelligentNextAction, type NextBestAction } from "@/lib/engine-nba.functions";
import { listReviewQueue, type ReviewItem } from "@/lib/engine-ops.functions";

export const Route = createFileRoute("/engine/projects/$projectId/overview")({
  component: ProjectOverview,
});

// ─────────── helpers ────────────────────────────────────────────
function formatDateShort(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const IMPACT_STYLES: Record<ReviewItem["impact"], string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-orange-100 text-orange-700 border-orange-200",
  low: "bg-yellow-100 text-yellow-700 border-yellow-200",
};

const IMPACT_LABEL: Record<ReviewItem["impact"], string> = {
  high: "High Impact",
  medium: "Medium",
  low: "Low",
};

// ─────────── stage derivation ────────────────────────────────────
type Owner = "Internal team" | "Client" | "AI Captain" | "System";
type StageStatus = "needs_review" | "in_progress" | "waiting" | "blocked" | "done";

type CurrentStage = {
  name: string;
  context: string;
  nextAction: string;
  owner: Owner;
  status: StageStatus;
  ctaHref: string | null;
  ctaLabel: string;
  showDelivery: boolean;
  deliveryPct: number;
  deliveryNote: string;
  workflowStepNum: number;
  workflowTotal: number;
};

function deriveStage(
  p: ReturnType<typeof useWorkspace>["project"],
  nba: NextBestAction | undefined,
  pendingItems: ReviewItem[],
): CurrentStage {
  const isApproved = (k: string) => p.step_states[k]?.state === "approved";
  const hasRoadmapDraft = !!p.roadmap_version || isApproved("builder");
  const roadmapApproved = !!p.approved_version || isApproved("sequencing");
  const inBuild = ["in_execution", "delivered"].includes(p.status);
  const delivered = p.status === "delivered";
  const blocked = p.status === "blocked";
  const highBlocker = pendingItems.find((i) => i.impact === "high");

  // Delivery %: only meaningful after roadmap approval
  const buildSteps = ["blueprint", "preview", "delivery"];
  const buildApproved = buildSteps.filter(isApproved).length;
  const deliveryPct = delivered
    ? 100
    : inBuild
      ? Math.round((buildApproved / buildSteps.length) * 100)
      : 0;

  let name = "Understanding";
  let context = "Collecting business signals before drafting the roadmap.";
  let nextAction = p.next_action ?? "Continue gathering signals.";
  let owner: Owner = "Internal team";
  let status: StageStatus = "in_progress";
  let ctaHref: string | null = `/engine/projects/${p.id}/understanding-room`;
  let ctaLabel = "Open Understanding Room";

  if (delivered) {
    name = "Delivered";
    context = "Project has shipped. Post-delivery review and handoff.";
    nextAction = "Review delivery artifacts and evidence.";
    owner = "Internal team";
    status = "done";
    ctaHref = `/engine/projects/${p.id}/delivery`;
    ctaLabel = "Open Delivery";
  } else if (blocked) {
    name = "Blocked";
    context = highBlocker
      ? `Blocked on: ${highBlocker.title}`
      : "Project is currently blocked. Resolve the blocker to proceed.";
    nextAction = p.next_action ?? "Unblock this project.";
    owner = "Internal team";
    status = "blocked";
    ctaHref = `/engine/projects/${p.id}/chat`;
    ctaLabel = "Open Captain Chat";
  } else if (inBuild) {
    name = "In Build";
    context = "Roadmap approved. Delivery in progress against milestones.";
    nextAction = p.next_action ?? "Advance the next milestone.";
    owner = "Internal team";
    status = "in_progress";
    ctaHref = `/engine/projects/${p.id}/delivery`;
    ctaLabel = "Open Delivery";
  } else if (roadmapApproved) {
    name = "Kickoff";
    context = "Roadmap approved by the client. Build begins after kickoff.";
    nextAction = p.next_action ?? "Schedule kickoff and begin build.";
    owner = "Internal team";
    status = "waiting";
    ctaHref = `/engine/projects/${p.id}/delivery`;
    ctaLabel = "Prepare Kickoff";
  } else if (hasRoadmapDraft) {
    name = "Roadmap Review";
    context = "AI-drafted roadmap is ready for human review.";
    nextAction = "Review AI-drafted roadmap";
    owner = "Internal team";
    status = "needs_review";
    ctaHref = `/engine/projects/${p.id}/builder`;
    ctaLabel = "Review Roadmap";
  } else if (p.signal_count > 0) {
    name = "Roadmap Drafting";
    context = "Signals captured. Captain is drafting the roadmap.";
    nextAction = p.next_action ?? "Continue drafting the roadmap.";
    owner = "AI Captain";
    status = "in_progress";
    ctaHref = `/engine/projects/${p.id}/builder`;
    ctaLabel = "Open Roadmap Builder";
  }

  // NBA overrides CTA when available and non-blocked
  if (nba && !blocked) {
    nextAction = nba.action;
    if (nba.href) ctaHref = nba.href;
  }

  return {
    name,
    context,
    nextAction,
    owner,
    status,
    ctaHref,
    ctaLabel,
    showDelivery: roadmapApproved || inBuild || delivered,
    deliveryPct,
    deliveryNote: delivered
      ? "Delivered."
      : inBuild
        ? "Milestones in progress."
        : roadmapApproved
          ? "Begins after kickoff."
          : "Begins after roadmap approval.",
    workflowStepNum: p.current_step_num,
    workflowTotal: 14,
  };
}

const STATUS_BADGE: Record<StageStatus, string> = {
  needs_review: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  in_progress: "bg-royal/10 text-royal border-royal/30",
  waiting: "bg-slate-500/10 text-slate-600 border-slate-500/30",
  blocked: "bg-red-500/10 text-red-600 border-red-500/30",
  done: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
};

const STATUS_LABEL: Record<StageStatus, string> = {
  needs_review: "Needs Review",
  in_progress: "In Progress",
  waiting: "Waiting",
  blocked: "Blocked",
  done: "Done",
};

// ─────────── main component ─────────────────────────────────────
function ProjectOverview() {
  const { projectId } = Route.useParams();
  const { project: p, dates, activity } = useWorkspace(projectId);

  const nbaFn = useServerFn(getIntelligentNextAction);
  const nbaQ = useQuery({
    queryKey: ["engine", "intelligent-nba", projectId],
    queryFn: () => nbaFn({ data: { projectId } }),
    refetchInterval: 120_000,
    staleTime: 90_000,
  });

  const reviewFn = useServerFn(listReviewQueue);
  const reviewQ = useQuery({
    queryKey: ["engine", "review-queue"],
    queryFn: () => reviewFn(),
    staleTime: 30_000,
  });

  const pendingItems: ReviewItem[] = (reviewQ.data?.items ?? []).filter(
    (i) =>
      i.status === "pending" &&
      (i.project === p.name || i.project === p.id),
  );
  const pendingCount = pendingItems.length;
  const nba = nbaQ.data as NextBestAction | undefined;
  const stage = deriveStage(p, nba, pendingItems);

  const criticalDates = dates.slice(0, 3);
  const recentActivity = activity.slice(0, 5);

  const openDecisions = p.open_decisions ?? 0;
  const blockerCount = pendingItems.filter((i) => i.impact === "high").length;

  return (
    <div className="space-y-6">
      <div
        role="status"
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        data-qa-role="overview-moved-banner"
      >
        <span>
          Overview has moved. The Project Spine is now the primary view for this project.
        </span>
        <Link
          to="/engine/projects/$projectId/spine"
          params={{ projectId: p.id }}
          className="inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-xs text-white hover:bg-ink/90"
        >
          Go to Spine
        </Link>
      </div>
      {/* Header */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">
            Project Command Center
          </div>
          <h1 className="mt-1 truncate text-xl sm:text-2xl font-semibold text-ink">
            {p.name}
          </h1>
          <div className="mt-1 text-xs text-ink/60 truncate">
            {p.client_company || "—"}
            {p.client_owner_email ? ` · ${p.client_owner_email}` : ""}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize ${STATUS_BADGE[stage.status]}`}
          >
            {stage.name}
          </span>
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${STATUS_BADGE[stage.status]}`}
          >
            {STATUS_LABEL[stage.status]}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6 min-w-0">
          {/* CURRENT STAGE HERO */}
          <CurrentStageHero stage={stage} />
          {nbaQ.isError ? (
            <div
              role="status"
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
            >
              Next-best action is temporarily unavailable — showing the last
              known project state.{" "}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-amber-950"
                onClick={() => nbaQ.refetch()}
              >
                Retry
              </button>
            </div>
          ) : null}


          {/* SECONDARY METRICS ROW */}
          <SecondaryMetrics
            healthScore={p.health_score}
            openDecisions={openDecisions + pendingCount}
            criticalDatesCount={dates.length}
            blockerCount={blockerCount}
          />

          {/* Recent Activity */}
          <SectionCard title="Recent Activity">
            {recentActivity.length === 0 ? (
              <EmptyState title="No activity yet" />
            ) : (
              <ul className="space-y-3">
                {recentActivity.map((a) => (
                  <li key={a.id} className="min-w-0">
                    <div
                      className="text-sm font-medium text-ink truncate"
                      title={a.title}
                    >
                      {a.title}
                    </div>
                    {a.body ? (
                      <div className="text-xs text-ink/60 mt-0.5 line-clamp-2">{a.body}</div>
                    ) : null}
                    <div className="text-[11px] text-ink/40 mt-1 font-mono uppercase tracking-wider">
                      {a.kind} ·{" "}
                      <span className="sm:hidden">{formatDateShort(a.created_at)}</span>
                      <span className="hidden sm:inline">{formatDate(a.created_at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title="Audit Trail"
            right={<span className="text-[11px] text-ink/40">Formal audit events only</span>}
          >
            <AuditTrailCard projectId={projectId} limit={50} compact />
          </SectionCard>
        </div>

        {/* RIGHT RAIL */}
        <div className="space-y-6 min-w-0">
          <SectionCard
            title="Pending Actions"
            right={
              pendingCount > 0 ? (
                <span className="text-[11px] text-ink/60">{pendingCount} pending</span>
              ) : null
            }
          >
            {reviewQ.isLoading ? (
              <div className="text-sm text-ink/50">Loading…</div>
            ) : pendingItems.length === 0 ? (
              <EmptyState title="Nothing pending" hint="System is waiting for the next signal." />
            ) : (
              <ul className="space-y-3">
                {pendingItems.slice(0, 6).map((it) => (
                  <li key={it.id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink truncate" title={it.title}>
                        {it.title}
                      </div>
                      <div className="text-[11px] text-ink/50 mt-0.5">
                        {formatDateShort(it.created_at)} · {it.item_type}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${IMPACT_STYLES[it.impact]}`}
                    >
                      {IMPACT_LABEL[it.impact]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Upcoming Dates">
            {criticalDates.length === 0 ? (
              <EmptyState title="No dates set" />
            ) : (
              <ul className="space-y-3 text-sm">
                {criticalDates.map((d) => (
                  <li key={d.id} className="flex items-baseline justify-between gap-3">
                    <span className="text-ink truncate">{d.label}</span>
                    <span className="text-ink/60 text-xs whitespace-nowrap">
                      {formatDateShort(d.due_on)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title={
              <span className="inline-flex items-center">
                Health Drivers
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="What health drivers mean"
                        className="ml-1 inline-flex"
                      >
                        <Info className="h-3.5 w-3.5 text-ink/40 transition hover:text-ink/60" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        Signal coverage, scope, timeline, risk, and client engagement.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </span>
            }
          >
            <HealthDrivers
              healthScore={p.health_score}
              blocked={p.status === "blocked"}
              pendingCount={pendingCount}
              activityCount={activity.length}
            />
          </SectionCard>

          <SectionCard title="Shortcuts">
            <div className="grid grid-cols-2 gap-2">
              <Shortcut
                projectId={projectId}
                to="/engine/projects/$projectId/spine"
                icon={<GitBranch className="w-4 h-4" />}
                label="Project Spine"
              />
              <Shortcut
                projectId={projectId}
                to="/engine/projects/$projectId/builder"
                icon={<Map className="w-4 h-4" />}
                label="Roadmap"
              />
              <Shortcut
                projectId={projectId}
                to="/engine/projects/$projectId/plans"
                icon={<ClipboardList className="w-4 h-4" />}
                label="Plans & Specs"
              />
              <Shortcut
                projectId={projectId}
                to="/engine/projects/$projectId/evidence"
                icon={<FlaskConical className="w-4 h-4" />}
                label="Evidence & QA"
              />
              <Shortcut
                projectId={projectId}
                to="/engine/projects/$projectId/understanding-room"
                icon={<Lightbulb className="w-4 h-4" />}
                label="Understanding"
              />
              <Shortcut
                projectId={projectId}
                to="/engine/projects/$projectId/intelligence"
                icon={<BrainCircuit className="w-4 h-4" />}
                label="Intelligence"
              />
              <Shortcut
                projectId={projectId}
                to="/engine/projects/$projectId/chat"
                icon={<MessageSquare className="w-4 h-4" />}
                label="Captain Chat"
              />
              <Shortcut
                projectId={projectId}
                to="/engine/projects/$projectId/preview"
                icon={<Eye className="w-4 h-4" />}
                label="Client Preview"
              />
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

// ─────────── Current Stage hero ─────────────────────────────────
function CurrentStageHero({ stage }: { stage: CurrentStage }) {
  const workflowPct = Math.round((stage.workflowStepNum / stage.workflowTotal) * 100);
  return (
    <section className="rounded-xl border border-royal/20 bg-gradient-to-br from-royal/5 via-transparent to-transparent p-5 sm:p-6 shadow-sm">
      <div className="flex items-start gap-2">
        <Sparkles className="w-4 h-4 text-royal mt-1 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">
            Current Stage
          </div>
          <h2 className="mt-1 text-2xl sm:text-3xl font-semibold text-ink leading-tight">
            {stage.name}
          </h2>
          <p className="mt-2 text-sm text-ink/70">{stage.context}</p>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-border bg-card p-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">
          Next required action
        </div>
        <div className="mt-1 text-lg font-medium text-ink">{stage.nextAction}</div>
        <div className="mt-1 text-xs text-ink/60">
          Owner: {stage.owner} · Status: {STATUS_LABEL[stage.status]}
        </div>
        {stage.ctaHref ? (
          <a
            href={stage.ctaHref}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-royal px-3 py-1.5 text-sm font-medium text-white hover:bg-royal/90 transition"
          >
            {stage.ctaLabel}
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ProgressBar
          label="Workflow progress"
          hint={`Step ${stage.workflowStepNum} of ${stage.workflowTotal}`}
          pct={workflowPct}
          tone="royal"
        />
        {stage.showDelivery ? (
          <ProgressBar
            label="Delivery progress"
            hint={stage.deliveryNote}
            pct={stage.deliveryPct}
            tone="emerald"
          />
        ) : (
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">
              Delivery progress
            </div>
            <div className="mt-1 text-sm text-ink/60 italic">
              {stage.deliveryNote}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function ProgressBar({
  label,
  hint,
  pct,
  tone,
}: {
  label: string;
  hint: string;
  pct: number;
  tone: "royal" | "emerald";
}) {
  const bar = tone === "royal" ? "bg-royal" : "bg-emerald-500";
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">
          {label}
        </div>
        <div className="text-xs text-ink/70 tabular-nums">{pct}%</div>
      </div>
      <div className="mt-1.5 h-1.5 w-full rounded-full bg-border overflow-hidden">
        <div
          className={`h-full ${bar} transition-all`}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
      <div className="mt-1 text-[11px] text-ink/50">{hint}</div>
    </div>
  );
}

// ─────────── Secondary metrics ─────────────────────────────────
function SecondaryMetrics({
  healthScore,
  openDecisions,
  criticalDatesCount,
  blockerCount,
}: {
  healthScore: number;
  openDecisions: number;
  criticalDatesCount: number;
  blockerCount: number;
}) {
  const items = [
    {
      label: "Health",
      value: `${healthScore}`,
      hint: healthScore >= 80 ? "Strong" : healthScore >= 60 ? "Watch" : "At risk",
      icon: <ShieldCheck className="w-3.5 h-3.5" />,
      tone: healthScore >= 80 ? "text-emerald-600" : healthScore >= 60 ? "text-amber-600" : "text-red-600",
    },
    {
      label: "Open decisions",
      value: `${openDecisions}`,
      hint: openDecisions === 0 ? "None" : "Awaiting review",
      icon: <Activity className="w-3.5 h-3.5" />,
      tone: openDecisions === 0 ? "text-ink/70" : "text-amber-600",
    },
    {
      label: "Critical dates",
      value: `${criticalDatesCount}`,
      hint: criticalDatesCount === 0 ? "None set" : "Tracked",
      icon: <Calendar className="w-3.5 h-3.5" />,
      tone: "text-ink/70",
    },
    {
      label: "Blockers",
      value: `${blockerCount}`,
      hint: blockerCount === 0 ? "None" : "Needs attention",
      icon: <AlertTriangle className="w-3.5 h-3.5" />,
      tone: blockerCount === 0 ? "text-ink/70" : "text-red-600",
    },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-lg border border-border bg-card px-3 py-3 min-w-0"
        >
          <div className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-mono ${it.tone}`}>
            {it.icon}
            {it.label}
          </div>
          <div className="mt-1 text-2xl font-semibold text-ink tabular-nums">{it.value}</div>
          <div className="text-[11px] text-ink/50 mt-0.5 truncate">{it.hint}</div>
        </div>
      ))}
    </div>
  );
}

// ─────────── Health drivers ────────────────────────────────────
function HealthDrivers({
  healthScore,
  blocked,
  pendingCount,
  activityCount,
}: {
  healthScore: number;
  blocked: boolean;
  pendingCount: number;
  activityCount: number;
}) {
  const rows: Array<{ label: string; text: string; tone: "green" | "amber" | "red" }> = [
    { label: "Scope Alignment", text: "On Track", tone: "green" },
    {
      label: "Timeline",
      text: blocked ? "At Risk" : "On Track",
      tone: blocked ? "red" : "green",
    },
    { label: "Budget", text: "On Track", tone: "green" },
    {
      label: "Risk Level",
      text: blocked ? "High" : pendingCount > 2 ? "Elevated" : "Low",
      tone: blocked ? "red" : pendingCount > 2 ? "amber" : "green",
    },
    {
      label: "Client Engagement",
      text: activityCount > 0 ? "Active" : "Quiet",
      tone: activityCount > 0 ? "green" : "amber",
    },
  ];
  const dot: Record<"green" | "amber" | "red", string> = {
    green: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
  };
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="font-display text-3xl text-ink leading-none tabular-nums">
            {healthScore}
          </div>
          <div className="text-[11px] text-ink/50 mt-1">Health score / 100</div>
        </div>
      </div>
      <ul className="space-y-2 pt-2 border-t border-border">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between text-sm">
            <span className="text-ink/70">{r.label}</span>
            <span className="inline-flex items-center gap-2 text-ink">
              {r.text}
              <span className={`inline-block w-2 h-2 rounded-full ${dot[r.tone]}`} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Shortcut({
  projectId,
  to,
  icon,
  label,
}: {
  projectId: string;
  to:
    | "/engine/projects/$projectId/intelligence"
    | "/engine/projects/$projectId/builder"
    | "/engine/projects/$projectId/preview"
    | "/engine/projects/$projectId/delivery"
    | "/engine/projects/$projectId/spine"
    | "/engine/projects/$projectId/plans"
    | "/engine/projects/$projectId/evidence"
    | "/engine/projects/$projectId/understanding-room"
    | "/engine/projects/$projectId/chat";
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      params={{ projectId }}
      className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-ink hover:border-royal/50 hover:bg-paper-soft transition"
    >
      {icon}
      {label}
    </Link>
  );
}
