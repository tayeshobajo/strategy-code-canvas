import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getProjectSpine } from "@/lib/engine.functions";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Clock,
  Circle,
  ChevronDown,
  ChevronUp,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/engine/projects/$projectId/plans")({
  component: PlansAndSpecs,
});

type PlanningDepth = "standard" | "deep" | "express";
type StageStatus = "complete" | "in_progress" | "missing" | "skipped";

type SpineMilestone = {
  id: string;
  name: string;
  phase: string | null;
  brief_md: string | null;
  sort_index: number | null;
};

type SpinePayload = {
  project: {
    frame?: string | null;
    name?: string | null;
    goal?: string | null;
  };
  milestones: SpineMilestone[];
};

type StageDefinition = {
  number: number;
  name: string;
  description: string;
};

type StageState = StageDefinition & {
  status: StageStatus;
  helper?: string | null;
};

type MilestonePlan = {
  milestone: SpineMilestone;
  stages: StageState[];
  completeCount: number;
};

const COLORS = {
  navy: "#0A0F1F",
  cream: "#FBF9F4",
  blue: "#3E68B2",
  stone: "#E8E1D6",
  muted: "#667085",
  green: "#1f6b3b",
} as const;

const STAGES: StageDefinition[] = [
  { number: 1, name: "Project Frame", description: "Clarify the operating frame and project context." },
  { number: 2, name: "User Flows", description: "Map the critical paths users move through." },
  {
    number: 3,
    name: "Page/Feature Structure",
    description: "Define the pages, surfaces, or feature modules that must exist.",
  },
  { number: 4, name: "Interaction Model", description: "Describe the behaviors, states, and transitions." },
  {
    number: 5,
    name: "Backend Architecture",
    description: "Capture the server-side services, jobs, and technical boundaries.",
  },
  { number: 6, name: "Data Model", description: "Identify the core entities and their relationships." },
  { number: 7, name: "Integrations", description: "List external systems, APIs, and dependencies." },
  { number: 8, name: "Permissions", description: "Define access levels, roles, and control boundaries." },
  {
    number: 9,
    name: "Acceptance Criteria",
    description: "State how the milestone will be judged complete and correct.",
  },
  { number: 10, name: "QA Plan", description: "Specify the test approach and evidence required." },
  {
    number: 11,
    name: "Implementation Sequence",
    description: "Order the work so dependencies are clear before build begins.",
  },
  { number: 12, name: "Rollback Plan", description: "Describe how changes can be backed out safely." },
];

const DEPTH_VISIBLE_STAGES: Record<PlanningDepth, number[]> = {
  express: [3, 9],
  standard: [1, 3, 9, 11],
  deep: STAGES.map((stage) => stage.number),
};

function PlansAndSpecs() {
  const { projectId } = Route.useParams();
  const [depth, setDepth] = useState<PlanningDepth>("standard");
  const [openMilestones, setOpenMilestones] = useState<Record<string, boolean>>({});
  const spineFn = useServerFn(getProjectSpine);
  const spineQ = useQuery({
    queryKey: ["engine", "spine", projectId],
    queryFn: () => spineFn({ data: { id: projectId } }),
    staleTime: 30_000,
  });

  const spine = spineQ.data as SpinePayload | undefined;
  const milestones = spine?.milestones ?? [];
  const milestonePlans = buildMilestonePlans(spine);
  const unplannedMilestones = milestonePlans.filter((plan) => plan.completeCount === 0);

  return (
    <div className="space-y-6" style={{ color: COLORS.navy }}>
      <header className="space-y-4">
        <Link
          to="/engine/projects/$projectId/overview"
          params={{ projectId }}
          className="inline-flex items-center gap-2 text-sm transition hover:opacity-80"
          style={{ color: COLORS.blue }}
        >
          <span aria-hidden>←</span>
          Back to Overview
        </Link>
        <div className="space-y-2">
          <h1 className="font-display text-3xl" style={{ color: COLORS.navy }}>
            Plans &amp; Specifications
          </h1>
          <p className="max-w-3xl text-sm leading-6" style={{ color: COLORS.muted }}>
            Planning happens before execution. Each milestone needs its planning stage complete before build can begin.
          </p>
        </div>
      </header>

      {unplannedMilestones.length > 0 ? (
        <div
          className="rounded-xl border p-5"
          style={{ backgroundColor: COLORS.cream, borderColor: COLORS.blue }}
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 text-sm font-medium" style={{ color: COLORS.navy }}>
                <Zap className="h-4 w-4" style={{ color: COLORS.blue }} />
                Captain Recommendation
              </div>
              <p className="text-sm" style={{ color: COLORS.muted }}>
                {unplannedMilestones.length} milestone{unplannedMilestones.length === 1 ? " hasn't" : "s haven't"} started planning.
              </p>
              <p className="text-sm" style={{ color: COLORS.navy }}>
                Begin with: <span className="font-medium">{unplannedMilestones[0]?.milestone.name}</span>
              </p>
            </div>
            <Link
              to="/engine/projects/$projectId/milestones/$milestoneId/brief"
              params={{ projectId, milestoneId: unplannedMilestones[0]!.milestone.id }}
              className="inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
              style={{ backgroundColor: COLORS.blue }}
            >
              Start planning →
            </Link>
          </div>
        </div>
      ) : null}

      <section
        className="rounded-2xl border p-4 md:p-5"
        style={{ backgroundColor: COLORS.cream, borderColor: COLORS.stone }}
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-medium" style={{ color: COLORS.navy }}>
              Planning depth
            </h2>
            <p className="text-xs" style={{ color: COLORS.muted }}>
              Choose how much pre-build planning detail to review right now.
            </p>
          </div>
          <div className="inline-flex rounded-full border p-1" style={{ borderColor: COLORS.stone }}>
            <DepthButton
              active={depth === "standard"}
              label="Standard"
              description="Page/feature structure + acceptance criteria"
              onClick={() => setDepth("standard")}
            />
            <DepthButton
              active={depth === "deep"}
              label="Deep"
              description="All 12 planning stages"
              onClick={() => setDepth("deep")}
            />
            <DepthButton
              active={depth === "express"}
              label="Express"
              description="Brief + acceptance criteria only"
              onClick={() => setDepth("express")}
            />
          </div>
        </div>
      </section>

      {spineQ.isPending ? (
        <div
          className="rounded-2xl border p-6 text-sm"
          style={{ backgroundColor: COLORS.cream, borderColor: COLORS.stone, color: COLORS.muted }}
        >
          Loading planning coverage…
        </div>
      ) : spineQ.isError ? (
        <div
          className="rounded-2xl border p-6 text-sm"
          style={{ backgroundColor: "#fff5f5", borderColor: "#fecaca", color: "#991b1b" }}
        >
          {(spineQ.error as Error | null)?.message ?? "The planning view could not be loaded."}
        </div>
      ) : milestones.length === 0 ? (
        <div
          className="rounded-2xl border p-8 text-center text-sm"
          style={{ backgroundColor: COLORS.cream, borderColor: COLORS.stone, color: COLORS.muted }}
        >
          No milestones found. Build the roadmap first, then return here to plan each milestone.
        </div>
      ) : (
        <div className="space-y-4">
          {milestonePlans.map((plan) => {
            const isOpen = openMilestones[plan.milestone.id] ?? true;
            const visibleStages = plan.stages.filter((stage) =>
              DEPTH_VISIBLE_STAGES[depth].includes(stage.number),
            );
            const anyInProgress = plan.stages.some((stage) => stage.status === "in_progress");
            const milestoneTone = plan.completeCount === STAGES.length
              ? COLORS.green
              : plan.completeCount > 0 || anyInProgress
                ? COLORS.blue
                : COLORS.stone;
            const progress = Math.round((plan.completeCount / STAGES.length) * 100);

            return (
              <section
                key={plan.milestone.id}
                className="rounded-2xl border bg-white shadow-sm"
                style={{ borderColor: COLORS.stone }}
              >
                <button
                  type="button"
                  onClick={() =>
                    setOpenMilestones((current) => ({
                      ...current,
                      [plan.milestone.id]: !(current[plan.milestone.id] ?? true),
                    }))
                  }
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className="inline-flex h-3 w-3 rounded-full"
                        style={{ backgroundColor: milestoneTone }}
                        aria-hidden
                      />
                      <span className="font-display text-xl" style={{ color: COLORS.navy }}>
                        {plan.milestone.name}
                      </span>
                      <span
                        className="rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em]"
                        style={{ borderColor: COLORS.stone, color: COLORS.muted, backgroundColor: COLORS.cream }}
                      >
                        {humanize(plan.milestone.phase) || "Unphased"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <p className="text-sm" style={{ color: COLORS.muted }}>
                        {plan.completeCount}/12 planning stages complete
                      </p>
                      <div className="w-full max-w-md">
                        <div
                          className="h-2 overflow-hidden rounded-full"
                          style={{ backgroundColor: COLORS.stone }}
                        >
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${progress}%`, backgroundColor: COLORS.blue }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  {isOpen ? (
                    <ChevronUp className="h-5 w-5 shrink-0" style={{ color: COLORS.muted }} />
                  ) : (
                    <ChevronDown className="h-5 w-5 shrink-0" style={{ color: COLORS.muted }} />
                  )}
                </button>

                {isOpen ? (
                  <div className="border-t px-5 py-4" style={{ borderColor: COLORS.stone }}>
                    <div className="space-y-3">
                      {visibleStages.map((stage) => (
                        <div
                          key={`${plan.milestone.id}-${stage.number}`}
                          className="rounded-xl border p-4"
                          style={{ borderColor: COLORS.stone, backgroundColor: COLORS.cream }}
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start gap-3">
                                <span
                                  className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold"
                                  style={{ borderColor: COLORS.stone, color: COLORS.navy, backgroundColor: "#fff" }}
                                >
                                  {stage.number}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-sm font-medium" style={{ color: COLORS.navy }}>
                                      {stage.name}
                                    </h3>
                                    <StageBadge status={stage.status} />
                                  </div>
                                  <p className="mt-1 text-sm" style={{ color: COLORS.muted }}>
                                    {stage.helper ?? stage.description}
                                  </p>
                                </div>
                              </div>
                            </div>
                            {stage.status === "missing" ? (
                              <Link
                                to="/engine/projects/$projectId/milestones/$milestoneId/brief"
                                params={{ projectId, milestoneId: plan.milestone.id }}
                                className="inline-flex shrink-0 items-center rounded-full border px-3 py-1.5 text-sm font-medium transition hover:bg-white"
                                style={{ borderColor: COLORS.blue, color: COLORS.blue }}
                              >
                                Prepare this
                              </Link>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DepthButton({
  active,
  label,
  description,
  onClick,
}: {
  active: boolean;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-2 text-left transition sm:px-4",
        active ? "shadow-sm" : "hover:bg-white/70",
      )}
      style={{
        backgroundColor: active ? COLORS.blue : "transparent",
        color: active ? "#fff" : COLORS.navy,
      }}
    >
      <div className="text-sm font-medium">{label}</div>
      <div className="text-[11px] leading-4" style={{ color: active ? "rgba(255,255,255,0.82)" : COLORS.muted }}>
        {description}
      </div>
    </button>
  );
}

function StageBadge({ status }: { status: StageStatus }) {
  const config = {
    complete: {
      icon: <CheckCircle2 className="h-4 w-4" style={{ color: COLORS.green }} />,
      label: "Complete",
      className: "",
      style: {
        color: COLORS.green,
        borderColor: "#c4e6d2",
        backgroundColor: "#e6f5ec",
        fontStyle: "normal",
      } as const,
    },
    in_progress: {
      icon: <Clock className="h-4 w-4" style={{ color: COLORS.blue }} />,
      label: "In Progress",
      className: "",
      style: {
        color: COLORS.blue,
        borderColor: "#cdd6f3",
        backgroundColor: "#e9eefb",
        fontStyle: "normal",
      } as const,
    },
    missing: {
      icon: <Circle className="h-4 w-4" style={{ color: COLORS.stone }} />,
      label: "Missing",
      className: "",
      style: {
        color: COLORS.muted,
        borderColor: COLORS.stone,
        backgroundColor: "#fff",
        fontStyle: "normal",
      } as const,
    },
    skipped: {
      icon: <span className="text-sm leading-none">-</span>,
      label: "Skipped",
      className: "italic",
      style: {
        color: COLORS.muted,
        borderColor: COLORS.stone,
        backgroundColor: COLORS.cream,
        fontStyle: "italic",
      } as const,
    },
  }[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em]",
        config.className,
      )}
      style={config.style}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

function buildMilestonePlans(spine: SpinePayload | undefined): MilestonePlan[] {
  const milestones = spine?.milestones ?? [];
  const allMilestonesHaveSequence = milestones.length > 1 && milestones.every((milestone) => milestone.sort_index != null);
  const anyMilestonesNeedSequence = milestones.length > 1 && milestones.some((milestone) => milestone.sort_index == null);
  const hasBackendMilestone = milestones.some((milestone) => {
    const haystack = `${milestone.name} ${milestone.brief_md ?? ""}`.toLowerCase();
    return ["backend", "database", "api", "server", "integration", "auth"].some((needle) =>
      haystack.includes(needle),
    );
  });

  return milestones.map((milestone) => {
    const brief = milestone.brief_md?.trim() ?? "";
    const hasLongBrief = brief.length > 200;
    const hasAnyBrief = brief.length > 0;
    const mentionsCriteria = /success|criteria/i.test(brief);
    const hasFrame = Boolean(spine?.project?.frame?.trim());
    const hasGoalWithoutFrame = !hasFrame && Boolean(spine?.project?.goal?.trim());

    const stages: StageState[] = STAGES.map((stage) => {
      switch (stage.number) {
        case 1:
          return {
            ...stage,
            status: hasFrame ? "complete" : hasGoalWithoutFrame ? "in_progress" : "missing",
            helper: hasFrame ? "Project frame is already defined in the spine." : hasGoalWithoutFrame ? "Goal exists, but the project frame still needs to be formalized." : stage.description,
          };
        case 2:
          return {
            ...stage,
            status: hasAnyBrief ? "missing" : "skipped",
            helper: hasAnyBrief ? stage.description : "N/A for this project type",
          };
        case 3:
          return {
            ...stage,
            status: hasLongBrief ? "complete" : hasAnyBrief ? "in_progress" : "missing",
            helper: hasLongBrief ? "Milestone brief is detailed enough to define the structure." : hasAnyBrief ? "Brief exists, but it needs more structure detail before build starts." : stage.description,
          };
        case 4:
          return { ...stage, status: "missing" };
        case 5:
          return {
            ...stage,
            status: hasBackendMilestone ? "complete" : "missing",
            helper: hasBackendMilestone ? "A backend-related milestone already exists in the approved spine." : stage.description,
          };
        case 6:
          return { ...stage, status: "missing" };
        case 7:
          return { ...stage, status: "missing" };
        case 8:
          return { ...stage, status: "missing" };
        case 9:
          return {
            ...stage,
            status: mentionsCriteria ? "complete" : hasAnyBrief ? "in_progress" : "missing",
            helper: mentionsCriteria ? "Acceptance criteria are already referenced in the milestone brief." : hasAnyBrief ? "The brief exists, but explicit success criteria still need to be written." : stage.description,
          };
        case 10:
          return { ...stage, status: "missing" };
        case 11:
          return {
            ...stage,
            status: allMilestonesHaveSequence ? "complete" : anyMilestonesNeedSequence ? "in_progress" : "missing",
            helper: allMilestonesHaveSequence ? "Milestones already have sequence order in the spine." : anyMilestonesNeedSequence ? "Some milestone ordering exists, but sequence still needs to be completed." : stage.description,
          };
        case 12:
          return { ...stage, status: "missing" };
        default:
          return { ...stage, status: "missing" };
      }
    });

    return {
      milestone,
      stages,
      completeCount: stages.filter((stage) => stage.status === "complete").length,
    };
  });
}

function humanize(value: string | null | undefined) {
  if (!value) return "";
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
