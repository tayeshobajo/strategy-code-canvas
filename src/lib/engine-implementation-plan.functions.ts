// Implementation Plan v1 — server functions.
//
// Staff-only (operator/admin). Mirrors QA Factory v1: all mutations flow
// through supabaseAdmin (RLS blocks direct writes). Every mutation writes
// an audit event + engine_activity row, verifies project scope, and refuses
// to silently overwrite an approved implementation plan (DB trigger also
// enforces this).
//
// Never writes to client_portal_*, roadmap_approvals, subscriptions,
// orders, engine tasks, or milestones. Never applies migrations. Never
// writes code. Never runs tests. Never marks any QA test as passed/failed.
// Never marks project delivered. Never deploys.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import { getProjectSpine, type ProjectSpinePayload } from "@/lib/engine.functions";
import type { BackendPlanRow } from "@/lib/engine-backend-builder.functions";
import type { MockupRow } from "@/lib/engine-mockup-builder.functions";
import type { FrameRow } from "@/lib/engine-frame-builder.functions";
import type { QaPlanRow } from "@/lib/engine-qa-factory.functions";
import {
  buildImplementationPrompt,
  assessImplementationReadiness,
  type ImplementationInputBundle,
  type MissingImplementationInput,
} from "@/lib/engine-implementation-plan-prompt.server";

const uuid = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "Invalid UUID",
  );

// --------------------- types ---------------------

export type ImplPlanStatus = "draft" | "in_review" | "approved" | "archived";
export type ImplGeneratedBy = "ai" | "human" | "hybrid";
export type ImplStepType =
  | "migration"
  | "server_function"
  | "ui_wiring"
  | "integration"
  | "permission"
  | "data_seed"
  | "qa"
  | "documentation"
  | "cleanup";
export type ImplPriority = "p0" | "p1" | "p2";
export type ImplRisk = "low" | "medium" | "high";
export type ImplPromptTarget = "Lovable" | "OpenClaw" | "developer" | "QA";

export type ImplPhase = {
  id: string;
  title: string;
  goal: string;
  sequence: number;
  depends_on: string[];
  deliverables: string[];
  acceptance_gates: string[];
  qa_gates: string[];
  rollback_notes: string[];
};

export type ImplBuildStep = {
  id: string;
  phase_id: string;
  title: string;
  type: ImplStepType;
  priority: ImplPriority;
  goal: string;
  inputs: string[];
  outputs: string[];
  files_or_surfaces: string[];
  dependencies: string[];
  implementation_notes: string[];
  qa_checks: string[];
  acceptance_criteria: string[];
  rollback_plan: string[];
  risk_level: ImplRisk;
  requires_human_review: boolean;
};

export type ImplMigrationItem = {
  id: string;
  title: string;
  sequence: number;
  table_changes: string[];
  rls_grants: string[];
  triggers: string[];
  seed_data: string[];
  rollback_notes: string[];
  safety_checks: string[];
};

export type ImplServerFnItem = {
  id: string;
  name: string;
  sequence: number;
  inputs: string[];
  outputs: string[];
  permissions: string[];
  audit_events: string[];
  failure_modes: string[];
  qa_tests: string[];
};

export type ImplUiWiringItem = {
  id: string;
  route: string;
  components: string[];
  data_dependencies: string[];
  action_handlers: string[];
  loading_state: string;
  empty_state: string;
  error_state: string;
  responsive_notes: string[];
};

export type ImplPermissionItem = {
  surface: string;
  roles: string[];
  access_rules: string[];
  server_function_gates: string[];
  direct_write_prevention: string;
  cross_project_isolation: string;
  portal_boundary: string;
};

export type ImplIntegrationItem = {
  system: string;
  purpose: string;
  secrets_required: string[];
  safety_notes: string[];
};

export type ImplQaExecutionItem = {
  after_step_id: string;
  run_tests: string[];
  evidence_required: string[];
  blocking: boolean;
  notes: string;
};

export type ImplDeveloperPrompt = {
  title: string;
  target: ImplPromptTarget;
  prompt: string;
  expected_output: string;
  acceptance_criteria: string[];
  safety_notes: string[];
};

export type ImplParallelization = {
  can_parallelize: string[];
  must_sequence: string[];
  blocked_until: string[];
};

export type ImplRollbackItem = {
  level: "phase" | "migration" | "feature";
  target: string;
  steps: string[];
};

export type ImplReleaseGate = {
  gate: string;
  criterion: string;
  no_go_conditions: string[];
};

export type ImplOpenDecision = {
  question: string;
  blocks: Array<"build" | "delivery" | "security">;
  recommended_owner: string;
  suggested_next_action: string;
};

export type ImplRiskItem = {
  name: string;
  severity: ImplRisk;
  mitigation: string;
};

export type ImplementationPayload = {
  implementation_goal: string;
  source_backend_summary: string;
  source_qa_summary: string;
  build_strategy: string;
  phases: ImplPhase[];
  build_steps: ImplBuildStep[];
  migration_plan: ImplMigrationItem[];
  server_function_plan: ImplServerFnItem[];
  ui_wiring_plan: ImplUiWiringItem[];
  permission_rls_plan: ImplPermissionItem[];
  integration_plan: ImplIntegrationItem[];
  qa_execution_order: ImplQaExecutionItem[];
  developer_prompts: ImplDeveloperPrompt[];
  parallelization: ImplParallelization;
  rollback_strategy: ImplRollbackItem[];
  release_gates: ImplReleaseGate[];
  open_decisions: ImplOpenDecision[];
  risks: ImplRiskItem[];
};

export type ImplPlanRow = {
  id: string;
  project_id: string;
  backend_plan_id: string;
  qa_plan_id: string;
  mockup_id: string | null;
  frame_id: string | null;
  title: string;
  summary: string | null;
  status: ImplPlanStatus;
  generated_by: ImplGeneratedBy;
  payload: ImplementationPayload;
  created_by_user_id: string | null;
  created_by_email: string | null;
  approved_by_user_id: string | null;
  approved_by_email: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

// --------------------- helpers ---------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

type StaffContext = {
  claims?: Record<string, unknown>;
  userId?: string;
  supabase: Sb;
};

async function assertStaff(context: StaffContext) {
  const email = ((context.claims?.email as string | undefined) ?? "").toLowerCase();
  const [isOperator, isAdmin] = await Promise.all([
    hasRoleForEmail(context.supabase, email, "operator"),
    hasRoleForEmail(context.supabase, email, "admin"),
  ]);
  if (!isOperator && !isAdmin) {
    throw new Error("Forbidden: operator or admin role required");
  }
  return { email, userId: context.userId ?? null, isAdmin, isOperator };
}

async function assertAdmin(context: StaffContext) {
  const staff = await assertStaff(context);
  if (!staff.isAdmin) throw new Error("Forbidden: admin role required");
  return staff;
}

async function insertActivity(
  sb: Sb,
  projectId: string,
  kind: string,
  title: string,
  body: string,
) {
  try {
    await sb
      .from("engine_activity")
      .insert({ project_id: projectId, kind, title, body, severity: "info" });
  } catch {
    /* best-effort */
  }
}

async function insertAuditEvent(
  sb: Sb,
  args: {
    projectId: string;
    userId: string | null;
    email: string;
    eventType: string;
    success?: boolean;
    errorCode?: string | null;
  },
) {
  try {
    await sb.from("engine_project_chat_events").insert({
      project_id: args.projectId,
      user_id: args.userId,
      user_email: args.email,
      thread_id: null,
      message_id: null,
      event_type: args.eventType,
      success: args.success ?? true,
      error_code: args.errorCode ?? null,
    });
  } catch {
    /* best-effort */
  }
}

async function loadProject(sb: Sb, projectId: string) {
  const { data, error } = await sb
    .from("engine_projects")
    .select(
      "id,name,status,current_step,current_step_num,point_b,roadmap,approved_version, engine_clients(company)",
    )
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load project");
  if (!data) throw new Error("Project not found");
  return data as {
    id: string;
    name: string | null;
    status: string;
    current_step: string;
    current_step_num: number;
    point_b: unknown;
    roadmap: unknown;
    approved_version: string | null;
    engine_clients: { company: string } | null;
  };
}

async function loadLatestApprovedBackendPlan(
  sb: Sb,
  projectId: string,
): Promise<BackendPlanRow | null> {
  const { data } = await sb
    .from("engine_project_backend_plans")
    .select("*")
    .eq("project_id", projectId)
    .eq("status", "approved")
    .order("approved_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as BackendPlanRow | null) ?? null;
}

async function loadLatestApprovedQaPlan(
  sb: Sb,
  projectId: string,
): Promise<QaPlanRow | null> {
  const { data } = await sb
    .from("engine_project_qa_plans")
    .select("*")
    .eq("project_id", projectId)
    .eq("status", "approved")
    .order("approved_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as QaPlanRow | null) ?? null;
}

async function loadLatestApprovedMockup(
  sb: Sb,
  projectId: string,
): Promise<MockupRow | null> {
  const { data } = await sb
    .from("engine_project_mockups")
    .select("*")
    .eq("project_id", projectId)
    .eq("status", "approved")
    .order("approved_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as MockupRow | null) ?? null;
}

async function loadLatestApprovedFrame(
  sb: Sb,
  projectId: string,
): Promise<FrameRow | null> {
  const { data } = await sb
    .from("engine_project_frames")
    .select("*")
    .eq("project_id", projectId)
    .eq("status", "approved")
    .order("approved_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as FrameRow | null) ?? null;
}

async function loadImplPlan(sb: Sb, planId: string): Promise<ImplPlanRow> {
  const { data, error } = await sb
    .from("engine_project_implementation_plans")
    .select("*")
    .eq("id", planId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load implementation plan");
  if (!data) throw new Error("Implementation plan not found");
  return data as ImplPlanRow;
}

// --------------------- getProjectImplementationPlan ---------------------

export type ImplementationPlanState = {
  project: {
    id: string;
    name: string;
    client_company: string;
    status: string;
    current_step: string;
  };
  approved_backend_plan: {
    id: string;
    title: string;
    approved_at: string | null;
    table_count: number;
    server_function_count: number;
    integration_count: number;
  } | null;
  approved_qa_plan: {
    id: string;
    title: string;
    approved_at: string | null;
    test_count: number;
    blocking_count: number;
    p0_count: number;
  } | null;
  approved_mockup: { id: string; title: string; approved_at: string | null } | null;
  approved_frame: { id: string; title: string; approved_at: string | null } | null;
  latest: ImplPlanRow | null;
  latest_approved: ImplPlanRow | null;
  history: Array<
    Pick<
      ImplPlanRow,
      | "id"
      | "title"
      | "status"
      | "generated_by"
      | "created_by_email"
      | "created_at"
      | "updated_at"
      | "approved_at"
    >
  >;
  readiness: { ready: boolean; missing: MissingImplementationInput[] };
  capabilities: {
    isStaff: boolean;
    isAdmin: boolean;
    canGenerate: boolean;
    canSaveDraft: boolean;
    canSubmitReview: boolean;
    canApprove: boolean;
    canArchive: boolean;
  };
};

export const getProjectImplementationPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<ImplementationPlanState> => {
    const staff = await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;

    const project = await loadProject(sb, data.projectId);
    const approvedBackend = await loadLatestApprovedBackendPlan(sb, data.projectId);
    const approvedQa = await loadLatestApprovedQaPlan(sb, data.projectId);
    const approvedMockup = await loadLatestApprovedMockup(sb, data.projectId);
    const approvedFrame = await loadLatestApprovedFrame(sb, data.projectId);

    const { data: rows, error } = await sb
      .from("engine_project_implementation_plans")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message ?? "Failed to load implementation plans");
    const plans = (rows ?? []) as ImplPlanRow[];
    const latest = plans[0] ?? null;
    const latest_approved = plans.find((p) => p.status === "approved") ?? null;

    const missing = assessImplementationReadiness({
      approved_backend_plan: approvedBackend,
      approved_qa_plan: approvedQa,
    });

    const qaTests = approvedQa?.payload.test_matrix ?? [];

    return {
      project: {
        id: project.id,
        name: project.name ?? "",
        client_company: project.engine_clients?.company ?? "—",
        status: project.status,
        current_step: project.current_step,
      },
      approved_backend_plan: approvedBackend
        ? {
            id: approvedBackend.id,
            title: approvedBackend.title,
            approved_at: approvedBackend.approved_at,
            table_count: approvedBackend.payload?.data_model?.tables?.length ?? 0,
            server_function_count: approvedBackend.payload?.server_functions?.length ?? 0,
            integration_count: approvedBackend.payload?.integrations?.length ?? 0,
          }
        : null,
      approved_qa_plan: approvedQa
        ? {
            id: approvedQa.id,
            title: approvedQa.title,
            approved_at: approvedQa.approved_at,
            test_count: qaTests.length,
            blocking_count: qaTests.filter((t) => t.blocking).length,
            p0_count: qaTests.filter((t) => t.priority === "p0").length,
          }
        : null,
      approved_mockup: approvedMockup
        ? {
            id: approvedMockup.id,
            title: approvedMockup.title,
            approved_at: approvedMockup.approved_at,
          }
        : null,
      approved_frame: approvedFrame
        ? {
            id: approvedFrame.id,
            title: approvedFrame.title,
            approved_at: approvedFrame.approved_at,
          }
        : null,
      latest,
      latest_approved,
      history: plans.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        generated_by: p.generated_by,
        created_by_email: p.created_by_email,
        created_at: p.created_at,
        updated_at: p.updated_at,
        approved_at: p.approved_at,
      })),
      readiness: { ready: missing.length === 0, missing },
      capabilities: {
        isStaff: true,
        isAdmin: staff.isAdmin,
        canGenerate: missing.length === 0,
        canSaveDraft: true,
        canSubmitReview: true,
        canApprove: staff.isAdmin,
        canArchive: staff.isAdmin,
      },
    };
  });

// --------------------- generateProjectImplementationPlan ---------------------

async function gatherImplBundle(
  sb: Sb,
  project: Awaited<ReturnType<typeof loadProject>>,
  approvedBackend: BackendPlanRow,
  approvedQa: QaPlanRow,
  approvedMockup: MockupRow | null,
  approvedFrame: FrameRow | null,
): Promise<ImplementationInputBundle> {
  const { data: artRows } = await sb
    .from("engine_project_artifacts")
    .select("artifact_type,title,summary")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: msRows } = await sb
    .from("engine_milestones")
    .select("id,name,phase")
    .eq("project_id", project.id)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .limit(30);

  const milestones: ImplementationInputBundle["milestones"] = [];
  for (const m of (msRows ?? []) as Array<{
    id: string;
    name: string;
    phase: string | null;
  }>) {
    const { count } = await sb
      .from("engine_tasks")
      .select("id", { count: "exact", head: true })
      .eq("milestone_id", m.id);
    milestones.push({ id: m.id, name: m.name, phase: m.phase, task_count: count ?? 0 });
  }

  const roadmap = (project.roadmap ?? {}) as Record<string, unknown>;
  const goal =
    (roadmap.goal as string | undefined) ??
    ((project.point_b as Record<string, unknown> | null)?.goal as string | undefined) ??
    null;

  return {
    project: {
      id: project.id,
      name: project.name ?? "",
      client_company: project.engine_clients?.company ?? "—",
      status: project.status,
      current_step: project.current_step,
      goal,
    },
    approved_backend_plan: approvedBackend,
    approved_qa_plan: approvedQa,
    approved_mockup: approvedMockup,
    approved_frame: approvedFrame,
    milestones,
    artifacts: (artRows ?? []) as ImplementationInputBundle["artifacts"],
  };
}

export const generateProjectImplementationPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid }).parse(raw))
  .handler(
    async ({
      context,
      data,
    }): Promise<{
      ok: boolean;
      plan?: ImplPlanRow;
      missing_inputs?: MissingImplementationInput[];
      message?: string;
    }> => {
      const staff = await assertStaff(context as unknown as StaffContext);
      const sb = (context as unknown as StaffContext).supabase;

      const project = await loadProject(sb, data.projectId);
      const approvedBackend = await loadLatestApprovedBackendPlan(sb, data.projectId);
      const approvedQa = await loadLatestApprovedQaPlan(sb, data.projectId);
      const missing = assessImplementationReadiness({
        approved_backend_plan: approvedBackend,
        approved_qa_plan: approvedQa,
      });
      if (missing.length || !approvedBackend || !approvedQa) {
        await insertAuditEvent(sb, {
          projectId: data.projectId,
          userId: staff.userId,
          email: staff.email,
          eventType: "implementation_plan_generation_refused",
          success: false,
          errorCode: "missing_inputs",
        });
        return {
          ok: false,
          missing_inputs: missing,
          message:
            "Approve a backend plan AND a QA plan before generating an implementation plan.",
        };
      }

      const approvedMockup = await loadLatestApprovedMockup(sb, data.projectId);
      const approvedFrame = await loadLatestApprovedFrame(sb, data.projectId);

      let spine: ProjectSpinePayload | null = null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        spine = (await (getProjectSpine as any)({
          data: { id: data.projectId },
        })) as ProjectSpinePayload;
      } catch {
        spine = null;
      }

      const bundle = await gatherImplBundle(
        sb,
        project,
        approvedBackend,
        approvedQa,
        approvedMockup,
        approvedFrame,
      );
      const { system, user } = buildImplementationPrompt(bundle, spine);

      const { callLovableAi, parseJsonOutput } = await import("@/lib/engine-ai.server");
      const ai = await callLovableAi(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        { json: true, temperature: 0.2 },
      );

      const parsed = parseJsonOutput<
        { title?: string; summary?: string } & ImplementationPayload
      >(ai.text);
      if (!parsed) {
        await insertAuditEvent(sb, {
          projectId: data.projectId,
          userId: staff.userId,
          email: staff.email,
          eventType: "implementation_plan_generation_failed",
          success: false,
          errorCode: "invalid_json",
        });
        throw new Error("AI returned invalid JSON for the implementation plan.");
      }

      const payload = normalizeImplPayload(parsed, approvedBackend, approvedQa);

      if (payload.build_steps.length === 0) {
        await insertAuditEvent(sb, {
          projectId: data.projectId,
          userId: staff.userId,
          email: staff.email,
          eventType: "implementation_plan_generation_failed",
          success: false,
          errorCode: "empty_build_steps",
        });
        throw new Error("Implementation plan output is missing build steps.");
      }

      const title = (
        parsed.title ?? `Implementation Plan · ${project.name ?? project.id}`
      ).slice(0, 200);
      const summary = (parsed.summary ?? "").slice(0, 2000);

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("engine_project_implementation_plans")
        .insert({
          project_id: data.projectId,
          backend_plan_id: approvedBackend.id,
          qa_plan_id: approvedQa.id,
          mockup_id: approvedMockup?.id ?? null,
          frame_id: approvedFrame?.id ?? null,
          title,
          summary,
          status: "draft",
          generated_by: "ai",
          payload,
          created_by_email: staff.email,
          created_by_user_id: staff.userId,
        })
        .select("*")
        .single();
      if (insErr)
        throw new Error(insErr.message ?? "Failed to save implementation plan draft");

      const p0 = payload.build_steps.filter((s) => s.priority === "p0").length;
      await insertAuditEvent(sb, {
        projectId: data.projectId,
        userId: staff.userId,
        email: staff.email,
        eventType: "implementation_plan_generated",
      });
      await insertActivity(
        sb,
        data.projectId,
        "implementation_plan_generated",
        `Implementation plan draft generated`,
        `${staff.email} generated an implementation plan draft (${payload.phases.length} phases, ${payload.build_steps.length} steps, ${p0} P0) from approved backend plan ${approvedBackend.id} and QA plan ${approvedQa.id}.`,
      );

      return { ok: true, plan: inserted as ImplPlanRow };
    },
  );

// --------------------- normalize ---------------------

const STEP_TYPES = new Set([
  "migration",
  "server_function",
  "ui_wiring",
  "integration",
  "permission",
  "data_seed",
  "qa",
  "documentation",
  "cleanup",
]);
const PRIORITIES = new Set(["p0", "p1", "p2"]);
const RISKS = new Set(["low", "medium", "high"]);
const PROMPT_TARGETS = new Set(["Lovable", "OpenClaw", "developer", "QA"]);

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x ?? "")).filter(Boolean) : [];
}

function normalizeImplPayload(
  raw: Partial<ImplementationPayload> & Record<string, unknown>,
  approvedBackend: BackendPlanRow,
  approvedQa: QaPlanRow,
): ImplementationPayload {
  const rawPhases = Array.isArray(raw.phases) ? raw.phases : [];
  const phases: ImplPhase[] = rawPhases.map((p, i) => {
    const pp = p as Partial<ImplPhase>;
    return {
      id: pp.id || `PH-${String(i + 1).padStart(2, "0")}`,
      title: pp.title ?? "",
      goal: pp.goal ?? "",
      sequence: typeof pp.sequence === "number" ? pp.sequence : i + 1,
      depends_on: strList(pp.depends_on),
      deliverables: strList(pp.deliverables),
      acceptance_gates: strList(pp.acceptance_gates),
      qa_gates: strList(pp.qa_gates),
      rollback_notes: strList(pp.rollback_notes),
    };
  });

  const rawSteps = Array.isArray(raw.build_steps) ? raw.build_steps : [];
  const build_steps: ImplBuildStep[] = rawSteps.map((s, i) => {
    const ss = s as Partial<ImplBuildStep>;
    return {
      id: ss.id || `S-${String(i + 1).padStart(3, "0")}`,
      phase_id: ss.phase_id ?? "",
      title: ss.title ?? "",
      type: (STEP_TYPES.has(ss.type as string) ? ss.type : "ui_wiring") as ImplStepType,
      priority: (PRIORITIES.has(ss.priority as string) ? ss.priority : "p2") as ImplPriority,
      goal: ss.goal ?? "",
      inputs: strList(ss.inputs),
      outputs: strList(ss.outputs),
      files_or_surfaces: strList(ss.files_or_surfaces),
      dependencies: strList(ss.dependencies),
      implementation_notes: strList(ss.implementation_notes),
      qa_checks: strList(ss.qa_checks),
      acceptance_criteria: strList(ss.acceptance_criteria),
      rollback_plan: strList(ss.rollback_plan),
      risk_level: (RISKS.has(ss.risk_level as string) ? ss.risk_level : "medium") as ImplRisk,
      requires_human_review: !!ss.requires_human_review,
    };
  });

  const migration_plan: ImplMigrationItem[] = (
    Array.isArray(raw.migration_plan) ? raw.migration_plan : []
  ).map((m, i) => {
    const mm = m as Partial<ImplMigrationItem>;
    return {
      id: mm.id || `M-${String(i + 1).padStart(2, "0")}`,
      title: mm.title ?? "",
      sequence: typeof mm.sequence === "number" ? mm.sequence : i + 1,
      table_changes: strList(mm.table_changes),
      rls_grants: strList(mm.rls_grants),
      triggers: strList(mm.triggers),
      seed_data: strList(mm.seed_data),
      rollback_notes: strList(mm.rollback_notes),
      safety_checks: strList(mm.safety_checks),
    };
  });

  const server_function_plan: ImplServerFnItem[] = (
    Array.isArray(raw.server_function_plan) ? raw.server_function_plan : []
  ).map((f, i) => {
    const ff = f as Partial<ImplServerFnItem>;
    return {
      id: ff.id || `F-${String(i + 1).padStart(2, "0")}`,
      name: ff.name ?? "",
      sequence: typeof ff.sequence === "number" ? ff.sequence : i + 1,
      inputs: strList(ff.inputs),
      outputs: strList(ff.outputs),
      permissions: strList(ff.permissions),
      audit_events: strList(ff.audit_events),
      failure_modes: strList(ff.failure_modes),
      qa_tests: strList(ff.qa_tests),
    };
  });

  const ui_wiring_plan: ImplUiWiringItem[] = (
    Array.isArray(raw.ui_wiring_plan) ? raw.ui_wiring_plan : []
  ).map((u, i) => {
    const uu = u as Partial<ImplUiWiringItem>;
    return {
      id: uu.id || `U-${String(i + 1).padStart(2, "0")}`,
      route: uu.route ?? "",
      components: strList(uu.components),
      data_dependencies: strList(uu.data_dependencies),
      action_handlers: strList(uu.action_handlers),
      loading_state: uu.loading_state ?? "",
      empty_state: uu.empty_state ?? "",
      error_state: uu.error_state ?? "",
      responsive_notes: strList(uu.responsive_notes),
    };
  });

  const permission_rls_plan: ImplPermissionItem[] = (
    Array.isArray(raw.permission_rls_plan) ? raw.permission_rls_plan : []
  ).map((p) => {
    const pp = p as Partial<ImplPermissionItem>;
    return {
      surface: pp.surface ?? "",
      roles: strList(pp.roles),
      access_rules: strList(pp.access_rules),
      server_function_gates: strList(pp.server_function_gates),
      direct_write_prevention: pp.direct_write_prevention ?? "",
      cross_project_isolation: pp.cross_project_isolation ?? "",
      portal_boundary: pp.portal_boundary ?? "",
    };
  });

  const integration_plan: ImplIntegrationItem[] = (
    Array.isArray(raw.integration_plan) ? raw.integration_plan : []
  ).map((i) => {
    const ii = i as Partial<ImplIntegrationItem>;
    return {
      system: ii.system ?? "",
      purpose: ii.purpose ?? "",
      secrets_required: strList(ii.secrets_required),
      safety_notes: strList(ii.safety_notes),
    };
  });

  const qa_execution_order: ImplQaExecutionItem[] = (
    Array.isArray(raw.qa_execution_order) ? raw.qa_execution_order : []
  ).map((q) => {
    const qq = q as Partial<ImplQaExecutionItem>;
    return {
      after_step_id: qq.after_step_id ?? "",
      run_tests: strList(qq.run_tests),
      evidence_required: strList(qq.evidence_required),
      blocking: !!qq.blocking,
      notes: qq.notes ?? "",
    };
  });

  const developer_prompts: ImplDeveloperPrompt[] = (
    Array.isArray(raw.developer_prompts) ? raw.developer_prompts : []
  ).map((d) => {
    const dd = d as Partial<ImplDeveloperPrompt>;
    return {
      title: dd.title ?? "",
      target: (PROMPT_TARGETS.has(dd.target as string)
        ? dd.target
        : "developer") as ImplPromptTarget,
      prompt: dd.prompt ?? "",
      expected_output: dd.expected_output ?? "",
      acceptance_criteria: strList(dd.acceptance_criteria),
      safety_notes: strList(dd.safety_notes),
    };
  });

  const parRaw = (raw.parallelization ?? {}) as Partial<ImplParallelization>;
  const parallelization: ImplParallelization = {
    can_parallelize: strList(parRaw.can_parallelize),
    must_sequence: strList(parRaw.must_sequence),
    blocked_until: strList(parRaw.blocked_until),
  };

  const rollback_strategy: ImplRollbackItem[] = (
    Array.isArray(raw.rollback_strategy) ? raw.rollback_strategy : []
  ).map((r) => {
    const rr = r as Partial<ImplRollbackItem>;
    return {
      level: (["phase", "migration", "feature"].includes(rr.level as string)
        ? rr.level
        : "feature") as ImplRollbackItem["level"],
      target: rr.target ?? "",
      steps: strList(rr.steps),
    };
  });

  const release_gates: ImplReleaseGate[] = (
    Array.isArray(raw.release_gates) ? raw.release_gates : []
  ).map((g) => {
    const gg = g as Partial<ImplReleaseGate>;
    return {
      gate: gg.gate ?? "",
      criterion: gg.criterion ?? "",
      no_go_conditions: strList(gg.no_go_conditions),
    };
  });

  const open_decisions: ImplOpenDecision[] = (
    Array.isArray(raw.open_decisions) ? raw.open_decisions : []
  ).map((d) => {
    const dd = d as Partial<ImplOpenDecision>;
    return {
      question: dd.question ?? "",
      blocks: (dd.blocks ?? []).filter((b) =>
        ["build", "delivery", "security"].includes(b as string),
      ) as ImplOpenDecision["blocks"],
      recommended_owner: dd.recommended_owner ?? "",
      suggested_next_action: dd.suggested_next_action ?? "",
    };
  });

  const risks: ImplRiskItem[] = (Array.isArray(raw.risks) ? raw.risks : []).map((r) => {
    const rr = r as Partial<ImplRiskItem>;
    return {
      name: rr.name ?? "",
      severity: (RISKS.has(rr.severity as string) ? rr.severity : "medium") as ImplRisk,
      mitigation: rr.mitigation ?? "",
    };
  });

  return {
    implementation_goal: (raw.implementation_goal as string) ?? "",
    source_backend_summary:
      (raw.source_backend_summary as string) ??
      approvedBackend.summary ??
      approvedBackend.payload?.backend_goal ??
      "",
    source_qa_summary:
      (raw.source_qa_summary as string) ??
      approvedQa.summary ??
      approvedQa.payload?.qa_goal ??
      "",
    build_strategy: (raw.build_strategy as string) ?? "",
    phases,
    build_steps,
    migration_plan,
    server_function_plan,
    ui_wiring_plan,
    permission_rls_plan,
    integration_plan,
    qa_execution_order,
    developer_prompts,
    parallelization,
    rollback_strategy,
    release_gates,
    open_decisions,
    risks,
  };
}

// --------------------- saveProjectImplementationPlanDraft ---------------------

const ImplPayloadSchema: z.ZodType<ImplementationPayload> = z
  .object({
    implementation_goal: z.string().default(""),
    source_backend_summary: z.string().default(""),
    source_qa_summary: z.string().default(""),
    build_strategy: z.string().default(""),
    phases: z.array(z.any()).default([]),
    build_steps: z.array(z.any()).default([]),
    migration_plan: z.array(z.any()).default([]),
    server_function_plan: z.array(z.any()).default([]),
    ui_wiring_plan: z.array(z.any()).default([]),
    permission_rls_plan: z.array(z.any()).default([]),
    integration_plan: z.array(z.any()).default([]),
    qa_execution_order: z.array(z.any()).default([]),
    developer_prompts: z.array(z.any()).default([]),
    parallelization: z.any().default({}),
    rollback_strategy: z.array(z.any()).default([]),
    release_gates: z.array(z.any()).default([]),
    open_decisions: z.array(z.any()).default([]),
    risks: z.array(z.any()).default([]),
  })
  .passthrough() as unknown as z.ZodType<ImplementationPayload>;

export const saveProjectImplementationPlanDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: uuid,
        planId: uuid,
        title: z.string().trim().min(1).max(200),
        summary: z.string().trim().max(2000).nullish(),
        payload: ImplPayloadSchema,
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ plan: ImplPlanRow }> => {
    const staff = await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    await loadProject(sb, data.projectId);
    const existing = await loadImplPlan(sb, data.planId);
    if (existing.project_id !== data.projectId)
      throw new Error("Project scope mismatch");
    if (existing.status !== "draft") {
      throw new Error(
        `Cannot edit implementation plan in status ${existing.status}; create a new draft`,
      );
    }

    // Re-normalize to strip any drift and re-lock schema.
    const sanitized = normalizeImplPayload(
      data.payload as unknown as Partial<ImplementationPayload> & Record<string, unknown>,
      { payload: {} } as unknown as BackendPlanRow,
      { payload: {} } as unknown as QaPlanRow,
    );

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: upd, error } = await supabaseAdmin
      .from("engine_project_implementation_plans")
      .update({
        title: data.title,
        summary: data.summary ?? null,
        payload: sanitized,
        generated_by: existing.generated_by === "ai" ? "hybrid" : existing.generated_by,
      })
      .eq("id", data.planId)
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "Failed to update draft");

    await insertAuditEvent(sb, {
      projectId: data.projectId,
      userId: staff.userId,
      email: staff.email,
      eventType: "implementation_plan_draft_updated",
    });
    await insertActivity(
      sb,
      data.projectId,
      "implementation_plan_draft_updated",
      `Implementation plan draft updated`,
      `${staff.email} updated implementation plan "${data.title.slice(0, 80)}".`,
    );
    return { plan: upd as ImplPlanRow };
  });

// --------------------- submitProjectImplementationPlanToReview ---------------------

export const submitProjectImplementationPlanToReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: uuid, planId: uuid }).parse(raw),
  )
  .handler(
    async ({
      context,
      data,
    }): Promise<{ plan: ImplPlanRow; reviewItemId: string }> => {
      const staff = await assertStaff(context as unknown as StaffContext);
      const sb = (context as unknown as StaffContext).supabase;
      const project = await loadProject(sb, data.projectId);
      const plan = await loadImplPlan(sb, data.planId);
      if (plan.project_id !== data.projectId)
        throw new Error("Project scope mismatch");
      if (plan.status !== "draft") {
        throw new Error(
          `Implementation plan is in status ${plan.status}; only drafts can be submitted to review`,
        );
      }

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: upd, error: updErr } = await supabaseAdmin
        .from("engine_project_implementation_plans")
        .update({ status: "in_review" })
        .eq("id", data.planId)
        .select("*")
        .single();
      if (updErr)
        throw new Error(updErr.message ?? "Failed to submit implementation plan to review");

      const { data: rev, error: revErr } = await supabaseAdmin
        .from("engine_review_items")
        .insert({
          project_id: data.projectId,
          project: project.name ?? project.id,
          item_type: "implementation_plan",
          title: `Review implementation plan: ${plan.title}`.slice(0, 240),
          impact: "high",
          source: "implementation_plan",
          requested_by: staff.email,
          status: "pending",
        })
        .select("id")
        .single();
      if (revErr) throw new Error(revErr.message ?? "Failed to create review item");

      await insertAuditEvent(sb, {
        projectId: data.projectId,
        userId: staff.userId,
        email: staff.email,
        eventType: "implementation_plan_submitted_for_review",
      });
      await insertActivity(
        sb,
        data.projectId,
        "implementation_plan_submitted_for_review",
        `Implementation plan submitted to review`,
        `${staff.email} submitted "${plan.title.slice(0, 80)}" to the review queue.`,
      );
      return { plan: upd as ImplPlanRow, reviewItemId: (rev as { id: string }).id };
    },
  );

// --------------------- approveProjectImplementationPlan ---------------------

export const approveProjectImplementationPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: uuid, planId: uuid }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ plan: ImplPlanRow }> => {
    const staff = await assertAdmin(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    await loadProject(sb, data.projectId);
    const plan = await loadImplPlan(sb, data.planId);
    if (plan.project_id !== data.projectId)
      throw new Error("Project scope mismatch");
    if (plan.status !== "in_review") {
      throw new Error(
        `Implementation plan must be in_review to approve; currently ${plan.status}`,
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();
    const { data: upd, error } = await supabaseAdmin
      .from("engine_project_implementation_plans")
      .update({
        status: "approved",
        approved_by_email: staff.email,
        approved_by_user_id: staff.userId,
        approved_at: nowIso,
      })
      .eq("id", data.planId)
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "Failed to approve implementation plan");

    await insertAuditEvent(sb, {
      projectId: data.projectId,
      userId: staff.userId,
      email: staff.email,
      eventType: "implementation_plan_approved",
    });
    await insertActivity(
      sb,
      data.projectId,
      "implementation_plan_approved",
      `Implementation plan approved`,
      `${staff.email} approved "${plan.title.slice(0, 80)}". Next best action: Build Execution / OpenClaw handoff / Implementation Queue.`,
    );
    return { plan: upd as ImplPlanRow };
  });

// --------------------- archiveProjectImplementationPlan ---------------------

export const archiveProjectImplementationPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: uuid, planId: uuid }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ plan: ImplPlanRow }> => {
    const staff = await assertAdmin(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    await loadProject(sb, data.projectId);
    const plan = await loadImplPlan(sb, data.planId);
    if (plan.project_id !== data.projectId)
      throw new Error("Project scope mismatch");
    if (plan.status === "archived") return { plan };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: upd, error } = await supabaseAdmin
      .from("engine_project_implementation_plans")
      .update({ status: "archived" })
      .eq("id", data.planId)
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "Failed to archive implementation plan");

    await insertAuditEvent(sb, {
      projectId: data.projectId,
      userId: staff.userId,
      email: staff.email,
      eventType: "implementation_plan_archived",
    });
    await insertActivity(
      sb,
      data.projectId,
      "implementation_plan_archived",
      `Implementation plan archived`,
      `${staff.email} archived "${plan.title.slice(0, 80)}".`,
    );
    return { plan: upd as ImplPlanRow };
  });
