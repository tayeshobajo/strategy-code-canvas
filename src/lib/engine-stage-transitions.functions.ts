import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";

export type StageStatus = "complete" | "in_progress" | "not_started" | "blocked";

export type StageTransitionInfo = {
  stageName: string;
  stageLabel: string;
  stageNum: number;
  status: StageStatus;
  isCurrentStage: boolean;
  isNextStage: boolean;
  readyToAdvance: boolean;
  blockers: string[];
  nextActor: string | null;
  actionRequired: string | null;
};

export type ProjectStageTransitionReport = {
  projectId: string;
  projectName: string;
  currentStage: string;
  currentStageNum: number;
  nextStage: string | null;
  readyToAdvance: boolean;
  blockers: string[];
  nextActor: string | null;
  actionRequired: string | null;
  allStages: StageTransitionInfo[];
  completedStageCount: number;
  totalStageCount: number;
  percentComplete: number;
};

export type WorkspaceStageTransitionReport = {
  projects: ProjectStageTransitionReport[];
  totalProjects: number;
  readyToAdvanceCount: number;
  blockedCount: number;
  completedCount: number;
  generatedAt: string;
};

type StageName =
  | "intake"
  | "understanding"
  | "spine"
  | "blueprint"
  | "roadmap"
  | "sequencing"
  | "investment"
  | "delivery";

type EngineProjectRow = {
  id: string;
  name: string;
  status: string;
  current_step: string | null;
  current_step_num: number | null;
  step_states: unknown;
  signal_room: unknown;
  extraction: unknown;
  point_a: unknown;
  point_b: unknown;
  blueprint: unknown;
  roadmap: unknown;
  sequencing: unknown;
  delivery: unknown;
  approved_at: string | null;
  approved_by_email: string | null;
  investment_confirmed_at: string | null;
  completed_at: string | null;
};

const PROJECT_SELECT = [
  "id",
  "name",
  "status",
  "current_step",
  "current_step_num",
  "step_states",
  "signal_room",
  "extraction",
  "point_a",
  "point_b",
  "blueprint",
  "roadmap",
  "sequencing",
  "delivery",
  "approved_at",
  "approved_by_email",
  "investment_confirmed_at",
  "completed_at",
].join(",");

const STAGES: Array<{
  name: StageName;
  label: string;
  actor: string | null;
  getBlockers: (project: EngineProjectRow) => string[];
  hasStarted: (project: EngineProjectRow) => boolean;
}> = [
  {
    name: "intake",
    label: "Signal Intake",
    actor: "operator",
    getBlockers: (project) => (hasKeys(project.signal_room) ? [] : ["signal_room missing"]),
    hasStarted: (project) => hasKeys(project.signal_room),
  },
  {
    name: "understanding",
    label: "Understanding",
    actor: "operator",
    getBlockers: (project) => (hasKeys(project.extraction) ? [] : ["extraction missing"]),
    hasStarted: (project) => hasKeys(project.extraction),
  },
  {
    name: "spine",
    label: "Project Spine",
    actor: "operator",
    getBlockers: (project) => {
      const blockers: string[] = [];
      if (!hasKeys(project.point_a)) blockers.push("point_a missing");
      if (!hasKeys(project.point_b)) blockers.push("point_b missing");
      if (!project.approved_at) blockers.push("approved_at not set");
      return blockers;
    },
    hasStarted: (project) =>
      hasKeys(project.point_a) || hasKeys(project.point_b) || Boolean(project.approved_at),
  },
  {
    name: "blueprint",
    label: "Blueprint",
    actor: "operator",
    getBlockers: (project) => (hasKeys(project.blueprint) ? [] : ["blueprint missing"]),
    hasStarted: (project) => hasKeys(project.blueprint),
  },
  {
    name: "roadmap",
    label: "Roadmap",
    actor: "operator",
    getBlockers: (project) => (hasKeys(project.roadmap) ? [] : ["roadmap missing"]),
    hasStarted: (project) => hasKeys(project.roadmap),
  },
  {
    name: "sequencing",
    label: "Sequencing",
    actor: "operator",
    getBlockers: (project) => (hasKeys(project.sequencing) ? [] : ["sequencing missing"]),
    hasStarted: (project) => hasKeys(project.sequencing),
  },
  {
    name: "investment",
    label: "Investment Sign-Off",
    actor: "client",
    getBlockers: (project) =>
      project.investment_confirmed_at ? [] : ["investment_confirmed_at not set"],
    hasStarted: (project) => Boolean(project.investment_confirmed_at),
  },
  {
    name: "delivery",
    label: "Delivery",
    actor: "operator",
    getBlockers: (project) => (hasKeys(project.delivery) ? [] : ["delivery missing"]),
    hasStarted: (project) => hasKeys(project.delivery),
  },
];

async function assertOperatorOrAdmin(context: {
  claims?: Record<string, unknown>;
  supabase: Parameters<typeof hasRoleForEmail>[0];
}) {
  const email = (context.claims?.email as string | undefined) ?? undefined;
  const ok =
    (await hasRoleForEmail(context.supabase, email, "admin")) ||
    (await hasRoleForEmail(context.supabase, email, "operator"));
  if (!ok) throw new Error("Forbidden: operator role required");
}

function hasKeys(value: unknown) {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).length > 0
  );
}

function normalizeStageName(value: string | null | undefined): StageName | null {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  switch (normalized) {
    case "intake":
    case "signal-room":
    case "signal":
      return "intake";
    case "understanding":
    case "extraction":
      return "understanding";
    case "spine":
    case "point-a":
    case "point-b":
      return "spine";
    case "blueprint":
      return "blueprint";
    case "roadmap":
    case "builder":
      return "roadmap";
    case "sequencing":
      return "sequencing";
    case "investment":
      return "investment";
    case "delivery":
      return "delivery";
    default:
      return null;
  }
}

function resolveCurrentStage(project: EngineProjectRow) {
  const byNum =
    typeof project.current_step_num === "number" &&
    Number.isFinite(project.current_step_num) &&
    project.current_step_num >= 1 &&
    project.current_step_num <= STAGES.length
      ? STAGES[project.current_step_num - 1]
      : null;

  if (byNum) return byNum;

  const byName = normalizeStageName(project.current_step);
  if (byName) return STAGES.find((stage) => stage.name === byName) ?? STAGES[0];

  const firstIncomplete = STAGES.find((stage) => stage.getBlockers(project).length > 0);
  return firstIncomplete ?? STAGES[STAGES.length - 1];
}

function getStageNum(stageName: StageName) {
  return STAGES.findIndex((stage) => stage.name === stageName) + 1;
}

function sentenceForStage(stage: StageTransitionInfo) {
  if (stage.blockers.length === 0) return null;
  const missing = stage.blockers.join(", ");
  switch (stage.stageName) {
    case "intake":
      return `Populate the signal room so intake is complete (${missing}).`;
    case "understanding":
      return `Complete extraction so the understanding stage is ready (${missing}).`;
    case "spine":
      return `Finish Point A, Point B, and approval to complete the spine (${missing}).`;
    case "blueprint":
      return `Populate the blueprint artifacts before this stage can finish (${missing}).`;
    case "roadmap":
      return `Populate the roadmap before the project can move forward (${missing}).`;
    case "sequencing":
      return `Populate sequencing so implementation order is explicit (${missing}).`;
    case "investment":
      return `Capture the client investment confirmation before delivery prep continues (${missing}).`;
    case "delivery":
      return `Populate delivery artifacts to finish the project (${missing}).`;
    default:
      return `Resolve the remaining blockers (${missing}).`;
  }
}

function buildProjectReport(project: EngineProjectRow): ProjectStageTransitionReport {
  const currentStage = resolveCurrentStage(project);
  const currentStageNum = getStageNum(currentStage.name);
  const allStagesBase = STAGES.map((stage, index) => {
    const blockers = stage.getBlockers(project);
    const complete = blockers.length === 0;
    const status: StageStatus = complete
      ? "complete"
      : stage.hasStarted(project)
        ? "in_progress"
        : index + 1 <= currentStageNum
          ? "blocked"
          : "not_started";

    const info: StageTransitionInfo = {
      stageName: stage.name,
      stageLabel: stage.label,
      stageNum: index + 1,
      status,
      isCurrentStage: stage.name === currentStage.name,
      isNextStage: false,
      readyToAdvance: false,
      blockers,
      nextActor: complete ? null : stage.actor,
      actionRequired: complete
        ? null
        : sentenceForStage({
            stageName: stage.name,
            stageLabel: stage.label,
            stageNum: index + 1,
            status,
            isCurrentStage: false,
            isNextStage: false,
            readyToAdvance: false,
            blockers,
            nextActor: stage.actor,
            actionRequired: null,
          }),
    };

    return info;
  });

  const nextStageInfo = currentStageNum < STAGES.length ? allStagesBase[currentStageNum] : null;
  const currentStageInfo = allStagesBase[currentStageNum - 1];
  const readyToAdvance =
    currentStageInfo.status === "complete" && nextStageInfo?.status === "not_started";
  const completedStageCount = allStagesBase.filter((stage) => stage.status === "complete").length;
  const percentComplete = Math.round((completedStageCount / STAGES.length) * 100);
  const allStages = allStagesBase.map((stage) => ({
    ...stage,
    isNextStage: nextStageInfo?.stageName === stage.stageName,
    readyToAdvance: readyToAdvance && stage.stageName === currentStageInfo.stageName,
  }));

  let blockers: string[] = [];
  let nextActor: string | null = null;
  let actionRequired: string | null = null;

  if (completedStageCount === STAGES.length || project.completed_at) {
    actionRequired = null;
  } else if (readyToAdvance && nextStageInfo) {
    nextActor = nextStageInfo.nextActor;
    actionRequired = `Advance the project from ${currentStageInfo.stageLabel} to ${nextStageInfo.stageLabel}.`;
  } else if (currentStageInfo.status === "complete" && nextStageInfo?.status === "in_progress") {
    nextActor = nextStageInfo.nextActor;
    actionRequired = `Advance current_step to ${nextStageInfo.stageLabel}; work for that stage has already started.`;
  } else {
    blockers = currentStageInfo.blockers;
    nextActor = currentStageInfo.nextActor;
    actionRequired =
      currentStageInfo.actionRequired ??
      `Complete ${currentStageInfo.stageLabel.toLowerCase()} before moving forward.`;
  }

  return {
    projectId: project.id,
    projectName: project.name,
    currentStage: currentStage.name,
    currentStageNum,
    nextStage: nextStageInfo?.stageName ?? null,
    readyToAdvance,
    blockers,
    nextActor,
    actionRequired,
    allStages,
    completedStageCount,
    totalStageCount: STAGES.length,
    percentComplete,
  };
}

export const getProjectStageTransitions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }): Promise<ProjectStageTransitionReport> => {
    await assertOperatorOrAdmin(context as unknown as Parameters<typeof assertOperatorOrAdmin>[0]);
    const sb = context.supabase as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (
            column: string,
            value: string,
          ) => {
            maybeSingle: () => Promise<{
              data: EngineProjectRow | null;
              error: { message?: string } | null;
            }>;
          };
        };
      };
    };

    const { data: project, error } = await sb
      .from("engine_projects")
      .select(PROJECT_SELECT)
      .eq("id", data.projectId)
      .maybeSingle();

    if (error) throw new Error(error.message ?? "Failed to load project.");
    if (!project) throw new Error("Project not found.");

    return buildProjectReport(project);
  });

export const getWorkspaceStageTransitions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WorkspaceStageTransitionReport> => {
    await assertOperatorOrAdmin(context as unknown as Parameters<typeof assertOperatorOrAdmin>[0]);
    const sb = context.supabase as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          order: (
            column: string,
            options: { ascending: boolean },
          ) => Promise<{ data: EngineProjectRow[] | null; error: { message?: string } | null }>;
        };
      };
    };

    const { data: rows, error } = await sb
      .from("engine_projects")
      .select(PROJECT_SELECT)
      .order("updated_at", { ascending: false });

    if (error) throw new Error(error.message ?? "Failed to load workspace transitions.");

    const projects = (rows ?? []).map(buildProjectReport);
    const readyToAdvanceCount = projects.filter((project) => project.readyToAdvance).length;
    const blockedCount = projects.filter(
      (project) =>
        !project.readyToAdvance &&
        project.completedStageCount < project.totalStageCount &&
        project.blockers.length > 0,
    ).length;
    const completedCount = projects.filter(
      (project) => project.completedStageCount === project.totalStageCount,
    ).length;

    return {
      projects,
      totalProjects: projects.length,
      readyToAdvanceCount,
      blockedCount,
      completedCount,
      generatedAt: new Date().toISOString(),
    };
  });