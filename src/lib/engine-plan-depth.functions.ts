/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 7B — Plan Depth and Completeness
//
// Surfaces whether each active project has sufficient planning depth
// before execution begins. The engine cannot build well from a shallow
// plan. This module enforces the principle that user journeys, sitemaps,
// data models, acceptance criteria, and QA plans must exist before a
// project moves into active development.
//
// Depth dimensions assessed:
//   USER_JOURNEY   — at least one mockup or frame with a user-flow payload
//   SITEMAP        — blueprint contains a node structure (system architecture)
//   DATA_MODEL     — backend plan exists with schema/model payload
//   SPEC_DEPTH     — implementation plans have acceptance criteria filled
//   QA_PLAN        — at least one QA plan linked to the project
//   MOCKUP_COVERAGE — ratio of milestones with an associated mockup
//   BACKEND_PLAN   — at least one backend plan linked to the project
//
// Scoring:
//   Each dimension contributes to a 0-100 plan depth score.
//   < 40 = shallow (execution should not begin)
//   40-69 = partial (proceed with caution)
//   >= 70 = sufficient
//
// Product law:
//   A project with a shallow plan will generate a shallow product.
//   Depth signals are surfaced as blockers on the exception board.
//   This module is READ-ONLY. It never modifies project state.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail, isOperatorEmail, isAdminEmail } from "@/lib/ops/access";

type Sb = any;
type StaffCtx = { claims?: Record<string, unknown>; userId?: string; supabase: Sb };

async function assertStaff(ctx: StaffCtx) {
  const email = ((ctx.claims?.email as string | undefined) ?? "").toLowerCase();
  if (isOperatorEmail(email) || isAdminEmail(email)) return;
  const ok = await hasRoleForEmail(ctx.supabase, email, "admin");
  if (!ok) throw new Error("Forbidden: operator or admin role required");
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlanDepthLevel = "sufficient" | "partial" | "shallow";

export type PlanDimensionStatus = "present" | "missing" | "partial";

export type PlanDimension = {
  id: string;
  label: string;
  description: string;
  status: PlanDimensionStatus;
  score: number; // 0-100 contribution to total
  weight: number; // relative weight
  detail: string | null;
  actionPath: string | null;
  actionLabel: string | null;
};

export type ProjectPlanDepth = {
  projectId: string;
  projectName: string;
  projectStatus: string | null;
  currentStep: string | null;
  // Composite depth score 0-100
  depthScore: number;
  depthLevel: PlanDepthLevel;
  // Dimension breakdown
  dimensions: PlanDimension[];
  // Counts
  presentCount: number;
  missingCount: number;
  partialCount: number;
  totalDimensions: number;
  // Artifacts
  mockupCount: number;
  backendPlanCount: number;
  qaPlanCount: number;
  implPlanCount: number;
  implPlansWithCriteria: number;
  // Derived flags
  readyForExecution: boolean;
  blockedReason: string | null;
  generatedAt: string;
};

export type WorkspacePlanDepthReport = {
  projects: ProjectPlanDepth[];
  totalProjects: number;
  sufficientCount: number;
  partialCount: number;
  shallowCount: number;
  avgDepthScore: number;
  notReadyForExecution: number;
  generatedAt: string;
};

// ---------------------------------------------------------------------------
// Dimension weights (must sum to 100)
// ---------------------------------------------------------------------------

const WEIGHTS = {
  user_journey: 20,      // mockups/frames with user flow
  sitemap: 15,           // blueprint node structure
  data_model: 20,        // backend plan with schema payload
  spec_depth: 20,        // impl plans with acceptance criteria
  qa_plan: 10,           // QA plan attached
  mockup_coverage: 10,   // milestones:mockups ratio
  backend_plan: 5,       // backend plan present at all
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function depthLevel(score: number): PlanDepthLevel {
  if (score >= 70) return "sufficient";
  if (score >= 40) return "partial";
  return "shallow";
}

function hasNestedKeys(obj: any, keys: string[]): boolean {
  if (!obj || typeof obj !== "object") return false;
  return keys.some((k) => k in obj && obj[k] !== null && obj[k] !== undefined && obj[k] !== "");
}

function blueprintHasNodes(blueprint: any): boolean {
  if (!blueprint) return false;
  if (typeof blueprint !== "object") return false;
  // Look for common node keys in various blueprint formats
  const nodeKeys = ["nodes", "components", "screens", "pages", "entities", "services", "modules", "architecture"];
  return nodeKeys.some((k) => {
    const val = blueprint[k];
    return Array.isArray(val) ? val.length > 0 : !!val;
  });
}

function mockupHasUserFlow(payload: any): boolean {
  if (!payload) return false;
  if (typeof payload !== "object") return false;
  const flowKeys = ["user_journey", "user_flow", "flow", "journey", "user_stories", "flows"];
  return flowKeys.some((k) => {
    const val = payload[k];
    if (!val) return false;
    if (typeof val === "string") return val.trim().length > 20;
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === "object") return Object.keys(val).length > 0;
    return false;
  });
}

function backendPlanHasDataModel(payload: any): boolean {
  if (!payload) return false;
  const modelKeys = ["schema", "data_model", "models", "entities", "tables", "database", "db_schema"];
  return hasNestedKeys(payload, modelKeys);
}

function implPlanHasCriteria(plan: { acceptance_criteria: any }): boolean {
  const ac = plan.acceptance_criteria;
  if (!ac) return false;
  if (Array.isArray(ac)) return ac.length > 0;
  if (typeof ac === "object") return Object.keys(ac).length > 0;
  if (typeof ac === "string") return ac.trim().length > 10;
  return false;
}

// ---------------------------------------------------------------------------
// buildProjectDepth — compute dimensions for one project
// ---------------------------------------------------------------------------

type ProjRow = {
  id: string;
  name: string | null;
  status: string | null;
  current_step: string | null;
  blueprint: any;
};

type MockupRow = { id: string; payload: any };
type BackendPlanRow = { id: string; payload: any; summary: string | null };
type QaPlanRow = { id: string };
type ImplPlanRow = { id: string; acceptance_criteria: any };
type MilestoneRow = { id: string };

function buildProjectDepth(
  proj: ProjRow,
  mockups: MockupRow[],
  backendPlans: BackendPlanRow[],
  qaPlans: QaPlanRow[],
  implPlans: ImplPlanRow[],
  milestones: MilestoneRow[],
  now: Date,
): ProjectPlanDepth {
  const dimensions: PlanDimension[] = [];

  // ── 1. USER JOURNEY ─────────────────────────────────────────────────────
  const mockupsWithFlow = mockups.filter((m) => mockupHasUserFlow(m.payload));
  const hasUserJourney = mockupsWithFlow.length > 0;
  dimensions.push({
    id: "user_journey",
    label: "User journeys",
    description: "At least one mockup or frame documents a user journey or user flow.",
    status: hasUserJourney ? "present" : mockups.length > 0 ? "partial" : "missing",
    score: hasUserJourney ? WEIGHTS.user_journey : mockups.length > 0 ? Math.round(WEIGHTS.user_journey * 0.4) : 0,
    weight: WEIGHTS.user_journey,
    detail: hasUserJourney
      ? `${mockupsWithFlow.length} mockup${mockupsWithFlow.length !== 1 ? "s" : ""} with user flow defined.`
      : mockups.length > 0
      ? `${mockups.length} mockup${mockups.length !== 1 ? "s" : ""} exist but none contain a user journey payload.`
      : "No mockups found. User journeys are required before execution begins.",
    actionPath: proj.id ? `/engine/projects/${proj.id}` : null,
    actionLabel: "Add mockups",
  });

  // ── 2. SITEMAP / ARCHITECTURE ────────────────────────────────────────────
  const hasSitemap = blueprintHasNodes(proj.blueprint);
  dimensions.push({
    id: "sitemap",
    label: "Sitemap / architecture",
    description: "Blueprint contains a node structure (screens, components, services).",
    status: hasSitemap ? "present" : "missing",
    score: hasSitemap ? WEIGHTS.sitemap : 0,
    weight: WEIGHTS.sitemap,
    detail: hasSitemap
      ? "Blueprint contains architecture nodes."
      : "Blueprint is empty or missing structure. Define the sitemap / system architecture before building.",
    actionPath: proj.id ? `/engine/projects/${proj.id}/blueprint` : null,
    actionLabel: "Open blueprint",
  });

  // ── 3. DATA MODEL ────────────────────────────────────────────────────────
  const backendWithModel = backendPlans.filter((b) => backendPlanHasDataModel(b.payload));
  const hasDataModel = backendWithModel.length > 0;
  dimensions.push({
    id: "data_model",
    label: "Data model",
    description: "Backend plan contains a schema, data model, or entity definitions.",
    status: hasDataModel ? "present" : backendPlans.length > 0 ? "partial" : "missing",
    score: hasDataModel
      ? WEIGHTS.data_model
      : backendPlans.length > 0
      ? Math.round(WEIGHTS.data_model * 0.3)
      : 0,
    weight: WEIGHTS.data_model,
    detail: hasDataModel
      ? `${backendWithModel.length} backend plan${backendWithModel.length !== 1 ? "s" : ""} with data model defined.`
      : backendPlans.length > 0
      ? `${backendPlans.length} backend plan${backendPlans.length !== 1 ? "s" : ""} found but no data model payload. Add schema definitions.`
      : "No backend plans found. Data model is required before any database work begins.",
    actionPath: proj.id ? `/engine/projects/${proj.id}` : null,
    actionLabel: "Add backend plan",
  });

  // ── 4. SPEC DEPTH — acceptance criteria ────────────────────────────────
  const implWithCriteria = implPlans.filter(implPlanHasCriteria);
  const implCoverageRatio = implPlans.length > 0 ? implWithCriteria.length / implPlans.length : 0;
  const specScore = implPlans.length === 0 ? 0
    : implCoverageRatio >= 0.8 ? WEIGHTS.spec_depth
    : implCoverageRatio >= 0.4 ? Math.round(WEIGHTS.spec_depth * 0.5)
    : Math.round(WEIGHTS.spec_depth * 0.2);
  dimensions.push({
    id: "spec_depth",
    label: "Spec depth (acceptance criteria)",
    description: "Implementation plans have acceptance criteria that define done.",
    status: implPlans.length === 0
      ? "missing"
      : implCoverageRatio >= 0.8
      ? "present"
      : "partial",
    score: specScore,
    weight: WEIGHTS.spec_depth,
    detail: implPlans.length === 0
      ? "No implementation plans found. Create specs with acceptance criteria for each milestone."
      : `${implWithCriteria.length} of ${implPlans.length} implementation plan${implPlans.length !== 1 ? "s" : ""} have acceptance criteria (${Math.round(implCoverageRatio * 100)}% coverage).`,
    actionPath: proj.id ? `/engine/projects/${proj.id}` : null,
    actionLabel: "Review specs",
  });

  // ── 5. QA PLAN ───────────────────────────────────────────────────────────
  const hasQaPlan = qaPlans.length > 0;
  dimensions.push({
    id: "qa_plan",
    label: "QA plan",
    description: "At least one QA plan is attached to the project.",
    status: hasQaPlan ? "present" : "missing",
    score: hasQaPlan ? WEIGHTS.qa_plan : 0,
    weight: WEIGHTS.qa_plan,
    detail: hasQaPlan
      ? `${qaPlans.length} QA plan${qaPlans.length !== 1 ? "s" : ""} attached.`
      : "No QA plan found. QA plan is required before milestones can be marked complete.",
    actionPath: proj.id ? `/engine/projects/${proj.id}` : null,
    actionLabel: "Add QA plan",
  });

  // ── 6. MOCKUP COVERAGE ───────────────────────────────────────────────────
  const milestoneCount = milestones.length;
  const mockupCount = mockups.length;
  const coverageRatio = milestoneCount > 0 ? Math.min(mockupCount / milestoneCount, 1) : 0;
  const mockupCoverageScore = milestoneCount === 0
    ? Math.round(WEIGHTS.mockup_coverage * 0.5) // no milestones yet — neutral
    : Math.round(WEIGHTS.mockup_coverage * coverageRatio);
  dimensions.push({
    id: "mockup_coverage",
    label: "Mockup coverage",
    description: "Ratio of milestones that have an associated mockup or visual spec.",
    status: milestoneCount === 0
      ? "partial"
      : coverageRatio >= 0.7
      ? "present"
      : coverageRatio > 0
      ? "partial"
      : "missing",
    score: mockupCoverageScore,
    weight: WEIGHTS.mockup_coverage,
    detail: milestoneCount === 0
      ? "No milestones defined yet — coverage will be measured once milestones are added."
      : `${mockupCount} mockup${mockupCount !== 1 ? "s" : ""} for ${milestoneCount} milestone${milestoneCount !== 1 ? "s" : ""} (${Math.round(coverageRatio * 100)}% coverage).`,
    actionPath: proj.id ? `/engine/projects/${proj.id}` : null,
    actionLabel: "Add mockups",
  });

  // ── 7. BACKEND PLAN ──────────────────────────────────────────────────────
  const hasBackendPlan = backendPlans.length > 0;
  dimensions.push({
    id: "backend_plan",
    label: "Backend plan",
    description: "At least one backend plan is attached to the project.",
    status: hasBackendPlan ? "present" : "missing",
    score: hasBackendPlan ? WEIGHTS.backend_plan : 0,
    weight: WEIGHTS.backend_plan,
    detail: hasBackendPlan
      ? `${backendPlans.length} backend plan${backendPlans.length !== 1 ? "s" : ""} attached.`
      : "No backend plan found.",
    actionPath: proj.id ? `/engine/projects/${proj.id}` : null,
    actionLabel: "Add backend plan",
  });

  // ── Compute totals ───────────────────────────────────────────────────────
  const depthScore = dimensions.reduce((sum, d) => sum + d.score, 0);
  const level = depthLevel(depthScore);

  const presentCount = dimensions.filter((d) => d.status === "present").length;
  const missingCount = dimensions.filter((d) => d.status === "missing").length;
  const partialCount = dimensions.filter((d) => d.status === "partial").length;

  const readyForExecution = level !== "shallow";
  const missingDims = dimensions.filter((d) => d.status === "missing").map((d) => d.label);
  const blockedReason = missingDims.length > 0
    ? `Missing required planning artifacts: ${missingDims.join(", ")}.`
    : null;

  return {
    projectId: proj.id,
    projectName: proj.name ?? "Untitled project",
    projectStatus: proj.status,
    currentStep: proj.current_step,
    depthScore: Math.min(100, depthScore),
    depthLevel: level,
    dimensions,
    presentCount,
    missingCount,
    partialCount,
    totalDimensions: dimensions.length,
    mockupCount,
    backendPlanCount: backendPlans.length,
    qaPlanCount: qaPlans.length,
    implPlanCount: implPlans.length,
    implPlansWithCriteria: implWithCriteria.length,
    readyForExecution,
    blockedReason,
    generatedAt: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// getWorkspacePlanDepthReport — cross-project depth audit
// ---------------------------------------------------------------------------

export const getWorkspacePlanDepthReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WorkspacePlanDepthReport> => {
    await assertStaff(context as unknown as StaffCtx);
    const sb = (context as unknown as StaffCtx).supabase;
    const now = new Date();

    // ── 1. Active projects ─────────────────────────────────────────────────
    const { data: projects, error: pErr } = await sb
      .from("engine_projects")
      .select("id,name,status,current_step,blueprint")
      .not("status", "in", "(\"completed\",\"archived\")")
      .order("last_activity_at", { ascending: false })
      .limit(50);
    if (pErr) throw new Error(pErr.message ?? "Failed to load projects");
    const projectRows = (projects ?? []) as ProjRow[];

    if (projectRows.length === 0) {
      return {
        projects: [], totalProjects: 0, sufficientCount: 0,
        partialCount: 0, shallowCount: 0, avgDepthScore: 0,
        notReadyForExecution: 0, generatedAt: now.toISOString(),
      };
    }

    const projectIds = projectRows.map((p) => p.id);

    // ── 2. Batch queries ───────────────────────────────────────────────────
    const [mRes, bRes, qRes, iRes, msRes] = await Promise.all([
      sb.from("engine_project_mockups").select("id,project_id,payload").in("project_id", projectIds),
      sb.from("engine_project_backend_plans").select("id,project_id,payload,summary").in("project_id", projectIds),
      sb.from("engine_project_qa_plans").select("id,project_id").in("project_id", projectIds),
      sb.from("engine_project_implementation_plans").select("id,project_id,acceptance_criteria").in("project_id", projectIds),
      sb.from("engine_milestones").select("id,project_id").in("project_id", projectIds),
    ]);

    const mockupRows = ((mRes.data ?? []) as Array<MockupRow & { project_id: string }>);
    const backendRows = ((bRes.data ?? []) as Array<BackendPlanRow & { project_id: string }>);
    const qaRows = ((qRes.data ?? []) as Array<{ id: string; project_id: string }>);
    const implRows = ((iRes.data ?? []) as Array<ImplPlanRow & { project_id: string }>);
    const milestoneRows = ((msRes.data ?? []) as Array<{ id: string; project_id: string }>);

    // ── 3. Group by project ────────────────────────────────────────────────
    function byProject<T extends { project_id: string }>(rows: T[]): Map<string, T[]> {
      const m = new Map<string, T[]>();
      for (const r of rows) {
        if (!m.has(r.project_id)) m.set(r.project_id, []);
        m.get(r.project_id)!.push(r);
      }
      return m;
    }

    const mockupsByProject = byProject(mockupRows);
    const backendByProject = byProject(backendRows);
    const qaByProject = byProject(qaRows);
    const implByProject = byProject(implRows);
    const mssByProject = byProject(milestoneRows);

    // ── 4. Build per-project depth reports ────────────────────────────────
    const projectReports = projectRows.map((proj) =>
      buildProjectDepth(
        proj,
        mockupsByProject.get(proj.id) ?? [],
        backendByProject.get(proj.id) ?? [],
        qaByProject.get(proj.id) ?? [],
        implByProject.get(proj.id) ?? [],
        mssByProject.get(proj.id) ?? [],
        now,
      ),
    );

    // Sort: shallow first, then partial, then sufficient
    const DEPTH_RANK: Record<PlanDepthLevel, number> = { shallow: 0, partial: 1, sufficient: 2 };
    projectReports.sort((a, b) => DEPTH_RANK[a.depthLevel] - DEPTH_RANK[b.depthLevel]);

    // ── 5. Workspace aggregates ────────────────────────────────────────────
    const sufficientCount = projectReports.filter((p) => p.depthLevel === "sufficient").length;
    const partialCount = projectReports.filter((p) => p.depthLevel === "partial").length;
    const shallowCount = projectReports.filter((p) => p.depthLevel === "shallow").length;
    const avgDepthScore = projectReports.length > 0
      ? Math.round(projectReports.reduce((s, p) => s + p.depthScore, 0) / projectReports.length)
      : 0;
    const notReadyForExecution = projectReports.filter((p) => !p.readyForExecution).length;

    return {
      projects: projectReports,
      totalProjects: projectReports.length,
      sufficientCount,
      partialCount,
      shallowCount,
      avgDepthScore,
      notReadyForExecution,
      generatedAt: now.toISOString(),
    };
  });

// ---------------------------------------------------------------------------
// getProjectPlanDepth — single-project depth audit
// ---------------------------------------------------------------------------

export const getProjectPlanDepth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }): Promise<ProjectPlanDepth> => {
    await assertStaff(context as unknown as StaffCtx);
    const sb = (context as unknown as StaffCtx).supabase;
    const now = new Date();

    const [pRes, mRes, bRes, qRes, iRes, msRes] = await Promise.all([
      sb.from("engine_projects").select("id,name,status,current_step,blueprint").eq("id", data.projectId).single(),
      sb.from("engine_project_mockups").select("id,payload").eq("project_id", data.projectId),
      sb.from("engine_project_backend_plans").select("id,payload,summary").eq("project_id", data.projectId),
      sb.from("engine_project_qa_plans").select("id").eq("project_id", data.projectId),
      sb.from("engine_project_implementation_plans").select("id,acceptance_criteria").eq("project_id", data.projectId),
      sb.from("engine_milestones").select("id").eq("project_id", data.projectId),
    ]);

    if (!pRes.data) throw new Error("Project not found");

    return buildProjectDepth(
      pRes.data as ProjRow,
      (mRes.data ?? []) as MockupRow[],
      (bRes.data ?? []) as BackendPlanRow[],
      (qRes.data ?? []) as QaPlanRow[],
      (iRes.data ?? []) as ImplPlanRow[],
      (msRes.data ?? []) as MilestoneRow[],
      now,
    );
  });
