import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useWorkspace } from "@/hooks/use-workspace";
import { SectionCard, EmptyState, formatDate } from "@/components/engine/primitives";
import { AuditTrailCard } from "@/components/engine/AuditTrail";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  BrainCircuit,
  Layers,
  Eye,
  PackageCheck,
  Info,
  Sparkles,
  Check,
  Map,
  ClipboardList,
  FlaskConical,
  Lightbulb,
  GitBranch,
  MessageSquare,
} from "lucide-react";
import { getVersionCompareData } from "@/lib/engine-execution.functions";
import { getNextBestAction } from "@/lib/engine.functions";
import { listReviewQueue, type ReviewItem } from "@/lib/engine-ops.functions";
import type { StepState } from "@/lib/engine-workspace";

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

type StageState = "done" | "current" | "pending";
type Stage = { key: string; label: string; state: StageState };

function computeStages(p: {
  status: string;
  signal_count: number;
  roadmap_version: string | null;
  approved_version: string | null;
  step_states: Record<string, StepState>;
}): Stage[] {
  const isApproved = (k: string) => p.step_states[k]?.state === "approved";
  const understanding = p.signal_count > 0;
  const roadmap = !!p.roadmap_version || isApproved("builder");
  const planning = !!p.approved_version || isApproved("sequencing") || isApproved("deadlines");
  const design = isApproved("blueprint") || isApproved("preview");
  const build = ["in_execution", "delivered"].includes(p.status) || isApproved("delivery");
  const qa = p.status === "delivered";
  const delivery = p.status === "delivered";

  const flags = [understanding, roadmap, planning, design, build, qa, delivery];
  const currentIdx = flags.findIndex((f) => !f);
  const labels = ["Understanding", "Roadmap", "Planning", "Design", "Build", "QA", "Delivery"];

  return labels.map((label, i) => {
    let state: StageState = "pending";
    if (flags[i]) state = "done";
    else if (i === currentIdx) state = "current";
    return { key: label.toLowerCase(), label, state };
  });
}

function ProgressStepper({ stages }: { stages: Stage[] }) {
  return (
    <div className="w-full overflow-x-auto">
      <ol className="flex items-start min-w-max gap-0">
        {stages.map((s, i) => {
          const isLast = i === stages.length - 1;
          const dotClasses =
            s.state === "done"
              ? "bg-emerald-500 border-emerald-500 text-white"
              : s.state === "current"
              ? "bg-white border-royal text-royal ring-4 ring-royal/10"
              : "bg-white border-border text-ink/40";
          const connectorClass =
            stages[i + 1]?.state === "done" || s.state === "done"
              ? "bg-emerald-500"
              : "bg-border";
          return (
            <li key={s.key} className="flex items-start">
              <div className="flex flex-col items-center w-20 sm:w-24">
                <div
                  className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-semibold ${dotClasses}`}
                >
                  {s.state === "done" ? <Check className="w-4 h-4" /> : i + 1}
                </div>
                <div
                  className={`mt-2 text-[11px] text-center font-medium ${
                    s.state === "pending" ? "text-ink/40" : "text-ink"
                  }`}
                >
                  {s.label}
                </div>
              </div>
              {!isLast && <div className={`h-0.5 w-8 sm:w-12 mt-4 ${connectorClass}`} />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ProjectSummary({
  p,
  activity,
  pendingCount,
}: {
  p: ReturnType<typeof useWorkspace>["project"];
  activity: ReturnType<typeof useWorkspace>["activity"];
  pendingCount: number;
}) {
  const approvedSteps = Object.entries(p.step_states)
    .filter(([, v]) => v?.state === "approved")
    .sort(
      (a, b) => new Date(b[1].updated_at).getTime() - new Date(a[1].updated_at).getTime(),
    )
    .slice(0, 3)
    .map(([k]) => k.replace(/-/g, " "));

  const recentActivity = activity.slice(0, 3);
  const hasAnything =
    approvedSteps.length > 0 || recentActivity.length > 0 || p.signal_count > 0;

  if (!hasAnything) {
    return (
      <div className="text-sm text-ink/50 italic">
        Summary will generate once the project has activity.
      </div>
    );
  }

  const objective = p.next_action ?? `Progress ${p.name} to the next milestone.`;
  const stageLabel = `Step ${p.current_step_num} of 14 · ${p.status.replace(/_/g, " ")}`;
  const accomplishments =
    approvedSteps.length > 0
      ? approvedSteps.map((s) => `Approved ${s}`)
      : recentActivity.map((a) => a.title);

  return (
    <div className="space-y-4 text-sm">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">
          Objective
        </div>
        <div className="text-ink mt-1">{objective}</div>
      </div>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">
          Stage
        </div>
        <div className="text-ink mt-1 capitalize">{stageLabel}</div>
      </div>
      {accomplishments.length > 0 && (
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">
            Recent accomplishments
          </div>
          <ul className="mt-1 space-y-1 list-disc list-inside text-ink/80 capitalize">
            {accomplishments.map((a, i) => (
              <li key={i} className="truncate">
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}
      {pendingCount > 0 && (
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">
            Decisions pending
          </div>
          <div className="text-ink mt-1">
            {pendingCount} item{pendingCount === 1 ? "" : "s"} awaiting review
          </div>
        </div>
      )}
    </div>
  );
}

function NeedsAttentionCard({ items }: { items: ReviewItem[] }) {
  if (items.length === 0) {
    return <EmptyState title="Nothing pending" hint="All caught up." />;
  }
  return (
    <ul className="space-y-3">
      {items.slice(0, 6).map((it) => (
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
  );
}

function HealthBreakdown({
  p,
  pendingCount,
  activity,
}: {
  p: ReturnType<typeof useWorkspace>["project"];
  pendingCount: number;
  activity: ReturnType<typeof useWorkspace>["activity"];
}) {
  const risk: StageState =
    p.status === "blocked" ? "pending" : pendingCount > 2 ? "current" : "done";
  const engagement: StageState = activity.length > 0 ? "done" : "current";
  const timeline: StageState = p.status === "blocked" ? "pending" : "done";

  const rows: Array<{ label: string; text: string; tone: "green" | "amber" | "red" }> = [
    { label: "Scope Alignment", text: "On Track", tone: "green" },
    {
      label: "Timeline",
      text: timeline === "done" ? "On Track" : "At Risk",
      tone: timeline === "done" ? "green" : "red",
    },
    { label: "Budget", text: "On Track", tone: "green" },
    {
      label: "Risk Level",
      text: risk === "done" ? "Low" : risk === "current" ? "Elevated" : "High",
      tone: risk === "done" ? "green" : risk === "current" ? "amber" : "red",
    },
    {
      label: "Client Engagement",
      text: engagement === "done" ? "Active" : "Quiet",
      tone: engagement === "done" ? "green" : "amber",
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
          <div className="font-display text-3xl text-ink leading-none">{p.health_score}</div>
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

// ─────────── main component ─────────────────────────────────────
function ProjectOverview() {
  const { projectId } = Route.useParams();
  const { project: p, dates, activity } = useWorkspace(projectId);

  const compareFn = useServerFn(getVersionCompareData);
  const compareQ = useQuery({
    queryKey: ["engine", "versions-compare", projectId],
    queryFn: () => compareFn({ data: { projectId } }),
    staleTime: 30_000,
  });
  void compareQ;

  const nbaFn = useServerFn(getNextBestAction);
  const nbaQ = useQuery({
    queryKey: ["engine", "next-best-action", projectId],
    queryFn: () => nbaFn({ data: { projectId } }),
    refetchInterval: 30_000,
    staleTime: 15_000,
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
      // ReviewItem.project may hold either project name or id; match on name for now.
      (i.project === p.name || i.project === p.id),
  );
  const pendingCount = pendingItems.length;

  const stages = computeStages(p);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6 min-w-0">
          {/* Progress stepper */}
          <SectionCard title="Project Progress">
            <ProgressStepper stages={stages} />
          </SectionCard>

          {/* Next Best Action */}
          <SectionCard
            title={
              <span className="inline-flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-royal" />
                Next best action
              </span>
            }
            className="border-l-4 border-royal"
          >
            {nbaQ.isLoading ? (
              <div className="text-sm text-ink/50">Computing…</div>
            ) : nbaQ.data ? (
              <div>
                <div className="flex items-start gap-2">
                  <span
                    className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${
                      nbaQ.data.severity === "critical"
                        ? "bg-red-500"
                        : nbaQ.data.severity === "warning"
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                    }`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    {nbaQ.data.href ? (
                      <a href={nbaQ.data.href} className="text-ink text-lg hover:underline">
                        {nbaQ.data.action}
                      </a>
                    ) : (
                      <div className="text-ink text-lg">{nbaQ.data.action}</div>
                    )}
                    {nbaQ.data.reason ? (
                      <div className="text-sm text-ink/70 mt-1">{nbaQ.data.reason}</div>
                    ) : null}
                  </div>
                </div>
                <div className="text-xs text-ink/60 mt-2">
                  {pendingCount} pending{" "}
                  {pendingCount === 1 ? "review item" : "review items"} · Step{" "}
                  {p.current_step_num} of 14 · Live
                </div>
              </div>
            ) : (
              <div className="text-ink text-lg">
                {p.next_action ?? "Nothing waiting — advance to the next step when ready."}
              </div>
            )}
          </SectionCard>

          {/* Project Summary */}
          <SectionCard title="Project Summary">
            <ProjectSummary p={p} activity={activity} pendingCount={pendingCount} />
          </SectionCard>

          {/* Recent Activity */}
          <SectionCard title="Recent Activity">
            {activity.length === 0 ? (
              <EmptyState title="No activity yet" />
            ) : (
              <ul className="space-y-3">
                {activity.map((a) => (
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

        <div className="space-y-6 min-w-0">
          <SectionCard
            title="Needs Your Attention"
            right={
              pendingCount > 0 ? (
                <span className="text-[11px] text-ink/60">{pendingCount} pending</span>
              ) : null
            }
          >
            {reviewQ.isLoading ? (
              <div className="text-sm text-ink/50">Loading…</div>
            ) : (
              <NeedsAttentionCard items={pendingItems} />
            )}
          </SectionCard>

          <SectionCard title="Critical Dates">
            {dates.length === 0 ? (
              <EmptyState title="No dates set" />
            ) : (
              <ul className="space-y-3 text-sm">
                {dates.map((d) => (
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
                Project Health
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="What project health means"
                        className="ml-1 inline-flex"
                      >
                        <Info className="h-3.5 w-3.5 text-ink/40 transition hover:text-ink/60" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        Reflects signal coverage, scope, timeline, risk, and client engagement.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </span>
            }
          >
            <HealthBreakdown p={p} pendingCount={pendingCount} activity={activity} />
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
