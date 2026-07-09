// QA Factory v1 — server functions.
//
// Staff-only (operator/admin). Mirrors Backend Builder v1: all mutations
// flow through supabaseAdmin (RLS blocks direct writes). Every mutation
// writes an audit event + engine_activity row, verifies project scope, and
// refuses to silently overwrite an approved QA plan (DB trigger also
// enforces this).
//
// Never writes to client_portal_*, roadmap_approvals, subscriptions,
// orders, engine tasks, or milestones. Never runs tests. Never marks any
// test status as passed/failed automatically. Never marks project delivered.
// Never deploys.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import { getProjectSpine, type ProjectSpinePayload } from "@/lib/engine.functions";
import type { BackendPlanRow } from "@/lib/engine-backend-builder.functions";
import type { MockupRow } from "@/lib/engine-mockup-builder.functions";
import type { FrameRow } from "@/lib/engine-frame-builder.functions";
import {
  buildQaPrompt,
  assessQaReadiness,
  type QaInputBundle,
  type MissingQaInput,
} from "@/lib/engine-qa-factory-prompt.server";

const uuid = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "Invalid UUID",
  );

// --------------------- types ---------------------

export type QaPlanStatus = "draft" | "in_review" | "approved" | "archived";
export type QaGeneratedBy = "ai" | "human" | "hybrid";

export type QaTestCategory =
  | "route"
  | "role"
  | "data"
  | "rls"
  | "workflow"
  | "ui_state"
  | "responsive"
  | "integration"
  | "audit"
  | "regression"
  | "edge_case";
export type QaPriority = "p0" | "p1" | "p2";
export type QaTestStatus = "not_run" | "passed" | "failed" | "blocked" | "skipped";
export type QaTestSource =
  | "frame"
  | "mockup"
  | "backend_plan"
  | "spine"
  | "task"
  | "milestone";

export type QaTest = {
  id: string;
  title: string;
  category: QaTestCategory;
  priority: QaPriority;
  source: QaTestSource;
  surface: string;
  scenario: string;
  steps: string[];
  expected_result: string;
  evidence_required: string[];
  status: QaTestStatus;
  owner: string;
  blocking: boolean;
};

export type QaEvidenceItem = {
  name: string;
  captures: string[];
  notes: string;
};

export type QaGoNoGoGate =
  | "before_build"
  | "before_delivery"
  | "blocks_launch"
  | "can_be_deferred";

export type QaGoNoGoCriterion = {
  gate: QaGoNoGoGate;
  criterion: string;
  detail: string;
};

export type QaOpenDecision = {
  question: string;
  blocks: Array<"build" | "delivery" | "security">;
  recommended_owner: string;
  suggested_next_action: string;
};

export type QaRisk = {
  name: string;
  severity: "low" | "medium" | "high";
  mitigation: string;
};

export type QaPayload = {
  qa_goal: string;
  source_backend_summary: string;
  overall_readiness:
    | "not_ready"
    | "needs_review"
    | "ready_for_build"
    | "ready_for_delivery";
  test_matrix: QaTest[];
  role_tests: string[];
  route_tests: string[];
  data_tests: string[];
  rls_tests: string[];
  workflow_tests: string[];
  ui_state_tests: string[];
  responsive_tests: string[];
  integration_tests: string[];
  audit_tests: string[];
  regression_tests: string[];
  edge_cases: string[];
  blocked_items: string[];
  evidence_plan: QaEvidenceItem[];
  go_no_go_criteria: QaGoNoGoCriterion[];
  open_decisions: QaOpenDecision[];
  risks: QaRisk[];
};

export type QaPlanRow = {
  id: string;
  project_id: string;
  backend_plan_id: string;
  mockup_id: string | null;
  frame_id: string | null;
  title: string;
  summary: string | null;
  status: QaPlanStatus;
  generated_by: QaGeneratedBy;
  payload: QaPayload;
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

async function loadQaPlan(sb: Sb, planId: string): Promise<QaPlanRow> {
  const { data, error } = await sb
    .from("engine_project_qa_plans")
    .select("*")
    .eq("id", planId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load QA plan");
  if (!data) throw new Error("QA plan not found");
  return data as QaPlanRow;
}

// --------------------- getProjectQaFactory ---------------------

export type QaFactoryState = {
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
    open_decisions_count: number;
  } | null;
  approved_mockup: {
    id: string;
    title: string;
    approved_at: string | null;
  } | null;
  approved_frame: {
    id: string;
    title: string;
    approved_at: string | null;
  } | null;
  latest: QaPlanRow | null;
  latest_approved: QaPlanRow | null;
  history: Array<
    Pick<
      QaPlanRow,
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
  readiness: { ready: boolean; missing: MissingQaInput[] };
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

export const getProjectQaFactory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<QaFactoryState> => {
    const staff = await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;

    const project = await loadProject(sb, data.projectId);
    const approvedBackend = await loadLatestApprovedBackendPlan(sb, data.projectId);
    const approvedMockup = await loadLatestApprovedMockup(sb, data.projectId);
    const approvedFrame = await loadLatestApprovedFrame(sb, data.projectId);

    const { data: rows, error } = await sb
      .from("engine_project_qa_plans")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message ?? "Failed to load QA plans");
    const plans = (rows ?? []) as QaPlanRow[];
    const latest = plans[0] ?? null;
    const latest_approved = plans.find((p) => p.status === "approved") ?? null;

    const missing = assessQaReadiness({ approved_backend_plan: approvedBackend });

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
            server_function_count:
              approvedBackend.payload?.server_functions?.length ?? 0,
            integration_count: approvedBackend.payload?.integrations?.length ?? 0,
            open_decisions_count:
              approvedBackend.payload?.open_decisions?.length ?? 0,
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

// --------------------- generateProjectQaPlan ---------------------

async function gatherQaBundle(
  sb: Sb,
  project: Awaited<ReturnType<typeof loadProject>>,
  approvedBackend: BackendPlanRow,
  approvedMockup: MockupRow | null,
  approvedFrame: FrameRow | null,
): Promise<QaInputBundle> {
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

  const milestones: QaInputBundle["milestones"] = [];
  for (const m of (msRows ?? []) as Array<{ id: string; name: string; phase: string | null }>) {
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
    approved_mockup: approvedMockup,
    approved_frame: approvedFrame,
    milestones,
    artifacts: (artRows ?? []) as QaInputBundle["artifacts"],
  };
}

export const generateProjectQaPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid }).parse(raw))
  .handler(
    async ({
      context,
      data,
    }): Promise<{
      ok: boolean;
      plan?: QaPlanRow;
      missing_inputs?: MissingQaInput[];
      message?: string;
    }> => {
      const staff = await assertStaff(context as unknown as StaffContext);
      const sb = (context as unknown as StaffContext).supabase;

      const project = await loadProject(sb, data.projectId);
      const approvedBackend = await loadLatestApprovedBackendPlan(sb, data.projectId);
      const missing = assessQaReadiness({ approved_backend_plan: approvedBackend });
      if (missing.length || !approvedBackend) {
        await insertAuditEvent(sb, {
          projectId: data.projectId,
          userId: staff.userId,
          email: staff.email,
          eventType: "qa_plan_generation_refused",
          success: false,
          errorCode: "no_approved_backend_plan",
        });
        return {
          ok: false,
          missing_inputs: missing,
          message:
            "Approve a backend plan in Backend Builder before generating a QA plan.",
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

      const bundle = await gatherQaBundle(
        sb,
        project,
        approvedBackend,
        approvedMockup,
        approvedFrame,
      );
      const { system, user } = buildQaPrompt(bundle, spine);

      const { callLovableAi, parseJsonOutput } = await import("@/lib/engine-ai.server");
      const ai = await callLovableAi(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        { json: true, temperature: 0.2 },
      );

      const parsed = parseJsonOutput<
        { title?: string; summary?: string } & QaPayload
      >(ai.text);
      if (!parsed) {
        await insertAuditEvent(sb, {
          projectId: data.projectId,
          userId: staff.userId,
          email: staff.email,
          eventType: "qa_plan_generation_failed",
          success: false,
          errorCode: "invalid_json",
        });
        throw new Error("AI returned invalid JSON for the QA plan.");
      }

      const payload = normalizeQaPayload(parsed, approvedBackend);

      if (payload.test_matrix.length === 0) {
        await insertAuditEvent(sb, {
          projectId: data.projectId,
          userId: staff.userId,
          email: staff.email,
          eventType: "qa_plan_generation_failed",
          success: false,
          errorCode: "empty_matrix",
        });
        throw new Error("QA plan output is missing a test matrix.");
      }

      const title = (
        parsed.title ?? `QA Plan · ${project.name ?? project.id}`
      ).slice(0, 200);
      const summary = (parsed.summary ?? "").slice(0, 2000);

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("engine_project_qa_plans")
        .insert({
          project_id: data.projectId,
          backend_plan_id: approvedBackend.id,
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
      if (insErr) throw new Error(insErr.message ?? "Failed to save QA plan draft");

      const blocking = payload.test_matrix.filter((t) => t.blocking).length;
      await insertAuditEvent(sb, {
        projectId: data.projectId,
        userId: staff.userId,
        email: staff.email,
        eventType: "qa_plan_generated",
      });
      await insertActivity(
        sb,
        data.projectId,
        "qa_plan_generated",
        `QA plan draft generated`,
        `${staff.email} generated a QA Factory draft (${payload.test_matrix.length} tests, ${blocking} blocking) from approved backend plan ${approvedBackend.id}.`,
      );

      return { ok: true, plan: inserted as QaPlanRow };
    },
  );

const READINESS = new Set([
  "not_ready",
  "needs_review",
  "ready_for_build",
  "ready_for_delivery",
]);
const CATEGORIES = new Set([
  "route",
  "role",
  "data",
  "rls",
  "workflow",
  "ui_state",
  "responsive",
  "integration",
  "audit",
  "regression",
  "edge_case",
]);
const PRIORITIES = new Set(["p0", "p1", "p2"]);
const STATUSES = new Set(["not_run", "passed", "failed", "blocked", "skipped"]);
const SOURCES = new Set(["frame", "mockup", "backend_plan", "spine", "task", "milestone"]);
const GATES = new Set([
  "before_build",
  "before_delivery",
  "blocks_launch",
  "can_be_deferred",
]);

function normalizeQaPayload(
  raw: Partial<QaPayload> & Record<string, unknown>,
  approvedBackend: BackendPlanRow,
): QaPayload {
  const strList = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x ?? "")).filter(Boolean) : [];
  const rawMatrix = Array.isArray(raw.test_matrix) ? raw.test_matrix : [];
  const test_matrix: QaTest[] = rawMatrix.map((t, i) => {
    const tt = t as Partial<QaTest> & Record<string, unknown>;
    return {
      id: (tt.id as string) || `T-${String(i + 1).padStart(3, "0")}`,
      title: (tt.title as string) ?? "",
      category: (CATEGORIES.has(tt.category as string)
        ? tt.category
        : "workflow") as QaTestCategory,
      priority: (PRIORITIES.has(tt.priority as string)
        ? tt.priority
        : "p2") as QaPriority,
      source: (SOURCES.has(tt.source as string)
        ? tt.source
        : "backend_plan") as QaTestSource,
      surface: (tt.surface as string) ?? "",
      scenario: (tt.scenario as string) ?? "",
      steps: strList(tt.steps),
      expected_result: (tt.expected_result as string) ?? "",
      evidence_required: strList(tt.evidence_required),
      // v1 hard-lock: never trust model-provided status
      status: "not_run",
      owner: (tt.owner as string) ?? "",
      blocking: !!tt.blocking,
    };
  });
  return {
    qa_goal: (raw.qa_goal as string) ?? "",
    source_backend_summary:
      (raw.source_backend_summary as string) ??
      approvedBackend.summary ??
      approvedBackend.payload?.backend_goal ??
      "",
    overall_readiness: (READINESS.has(raw.overall_readiness as string)
      ? raw.overall_readiness
      : "needs_review") as QaPayload["overall_readiness"],
    test_matrix,
    role_tests: strList(raw.role_tests),
    route_tests: strList(raw.route_tests),
    data_tests: strList(raw.data_tests),
    rls_tests: strList(raw.rls_tests),
    workflow_tests: strList(raw.workflow_tests),
    ui_state_tests: strList(raw.ui_state_tests),
    responsive_tests: strList(raw.responsive_tests),
    integration_tests: strList(raw.integration_tests),
    audit_tests: strList(raw.audit_tests),
    regression_tests: strList(raw.regression_tests),
    edge_cases: strList(raw.edge_cases),
    blocked_items: strList(raw.blocked_items),
    evidence_plan: (Array.isArray(raw.evidence_plan) ? raw.evidence_plan : []).map(
      (e) => {
        const ee = e as Partial<QaEvidenceItem>;
        return {
          name: ee.name ?? "",
          captures: strList(ee.captures),
          notes: ee.notes ?? "",
        };
      },
    ),
    go_no_go_criteria: (Array.isArray(raw.go_no_go_criteria) ? raw.go_no_go_criteria : []).map(
      (g) => {
        const gg = g as Partial<QaGoNoGoCriterion>;
        return {
          gate: (GATES.has(gg.gate as string) ? gg.gate : "before_build") as QaGoNoGoGate,
          criterion: gg.criterion ?? "",
          detail: gg.detail ?? "",
        };
      },
    ),
    open_decisions: (Array.isArray(raw.open_decisions) ? raw.open_decisions : []).map(
      (d) => {
        const dd = d as Partial<QaOpenDecision>;
        return {
          question: dd.question ?? "",
          blocks: (dd.blocks ?? []).filter((b) =>
            ["build", "delivery", "security"].includes(b as string),
          ) as QaOpenDecision["blocks"],
          recommended_owner: dd.recommended_owner ?? "",
          suggested_next_action: dd.suggested_next_action ?? "",
        };
      },
    ),
    risks: (Array.isArray(raw.risks) ? raw.risks : []).map((r) => {
      const rr = r as Partial<QaRisk>;
      return {
        name: rr.name ?? "",
        severity: (["low", "medium", "high"].includes(rr.severity as string)
          ? rr.severity
          : "medium") as QaRisk["severity"],
        mitigation: rr.mitigation ?? "",
      };
    }),
  };
}

// --------------------- saveProjectQaPlanDraft ---------------------

const QaPayloadSchema: z.ZodType<QaPayload> = z
  .object({
    qa_goal: z.string().default(""),
    source_backend_summary: z.string().default(""),
    overall_readiness: z
      .enum(["not_ready", "needs_review", "ready_for_build", "ready_for_delivery"])
      .default("needs_review"),
    test_matrix: z.array(z.any()).default([]),
    role_tests: z.array(z.string()).default([]),
    route_tests: z.array(z.string()).default([]),
    data_tests: z.array(z.string()).default([]),
    rls_tests: z.array(z.string()).default([]),
    workflow_tests: z.array(z.string()).default([]),
    ui_state_tests: z.array(z.string()).default([]),
    responsive_tests: z.array(z.string()).default([]),
    integration_tests: z.array(z.string()).default([]),
    audit_tests: z.array(z.string()).default([]),
    regression_tests: z.array(z.string()).default([]),
    edge_cases: z.array(z.string()).default([]),
    blocked_items: z.array(z.string()).default([]),
    evidence_plan: z.array(z.any()).default([]),
    go_no_go_criteria: z.array(z.any()).default([]),
    open_decisions: z.array(z.any()).default([]),
    risks: z.array(z.any()).default([]),
  })
  .passthrough() as unknown as z.ZodType<QaPayload>;

export const saveProjectQaPlanDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: uuid,
        planId: uuid,
        title: z.string().trim().min(1).max(200),
        summary: z.string().trim().max(2000).nullish(),
        payload: QaPayloadSchema,
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ plan: QaPlanRow }> => {
    const staff = await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    await loadProject(sb, data.projectId);
    const existing = await loadQaPlan(sb, data.planId);
    if (existing.project_id !== data.projectId) throw new Error("Project scope mismatch");
    if (existing.status !== "draft") {
      throw new Error(
        `Cannot edit QA plan in status ${existing.status}; create a new draft`,
      );
    }

    // Never let a draft save mark tests as anything but not_run in v1.
    const sanitized: QaPayload = {
      ...(data.payload as QaPayload),
      test_matrix: (data.payload.test_matrix ?? []).map((t) => ({
        ...(t as QaTest),
        status: "not_run" as QaTestStatus,
      })),
    };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: upd, error } = await supabaseAdmin
      .from("engine_project_qa_plans")
      .update({
        title: data.title,
        summary: data.summary ?? null,
        payload: sanitized,
        generated_by: existing.generated_by === "ai" ? "hybrid" : existing.generated_by,
      })
      .eq("id", data.planId)
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "Failed to update QA plan draft");

    await insertAuditEvent(sb, {
      projectId: data.projectId,
      userId: staff.userId,
      email: staff.email,
      eventType: "qa_plan_draft_updated",
    });
    await insertActivity(
      sb,
      data.projectId,
      "qa_plan_draft_updated",
      `QA plan draft updated`,
      `${staff.email} updated QA plan "${data.title.slice(0, 80)}".`,
    );
    return { plan: upd as QaPlanRow };
  });

// --------------------- submitProjectQaPlanToReview ---------------------

export const submitProjectQaPlanToReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid, planId: uuid }).parse(raw))
  .handler(
    async ({
      context,
      data,
    }): Promise<{ plan: QaPlanRow; reviewItemId: string }> => {
      const staff = await assertStaff(context as unknown as StaffContext);
      const sb = (context as unknown as StaffContext).supabase;
      const project = await loadProject(sb, data.projectId);
      const plan = await loadQaPlan(sb, data.planId);
      if (plan.project_id !== data.projectId) throw new Error("Project scope mismatch");
      if (plan.status !== "draft") {
        throw new Error(
          `QA plan is in status ${plan.status}; only drafts can be submitted to review`,
        );
      }

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: upd, error: updErr } = await supabaseAdmin
        .from("engine_project_qa_plans")
        .update({ status: "in_review" })
        .eq("id", data.planId)
        .select("*")
        .single();
      if (updErr)
        throw new Error(updErr.message ?? "Failed to submit QA plan to review");

      const { data: rev, error: revErr } = await supabaseAdmin
        .from("engine_review_items")
        .insert({
          project_id: data.projectId,
          project: project.name ?? project.id,
          item_type: "qa_plan",
          title: `Review QA plan: ${plan.title}`.slice(0, 240),
          impact: "high",
          source: "qa_factory",
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
        eventType: "qa_plan_submitted_for_review",
      });
      await insertActivity(
        sb,
        data.projectId,
        "qa_plan_submitted_for_review",
        `QA plan submitted to review`,
        `${staff.email} submitted "${plan.title.slice(0, 80)}" to the review queue.`,
      );
      return { plan: upd as QaPlanRow, reviewItemId: (rev as { id: string }).id };
    },
  );

// --------------------- approveProjectQaPlan ---------------------

export const approveProjectQaPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid, planId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<{ plan: QaPlanRow }> => {
    const staff = await assertAdmin(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    await loadProject(sb, data.projectId);
    const plan = await loadQaPlan(sb, data.planId);
    if (plan.project_id !== data.projectId) throw new Error("Project scope mismatch");
    if (plan.status !== "in_review") {
      throw new Error(
        `QA plan must be in_review to approve; currently ${plan.status}`,
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();
    const { data: upd, error } = await supabaseAdmin
      .from("engine_project_qa_plans")
      .update({
        status: "approved",
        approved_by_email: staff.email,
        approved_by_user_id: staff.userId,
        approved_at: nowIso,
      })
      .eq("id", data.planId)
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "Failed to approve QA plan");

    await insertAuditEvent(sb, {
      projectId: data.projectId,
      userId: staff.userId,
      email: staff.email,
      eventType: "qa_plan_approved",
    });
    await insertActivity(
      sb,
      data.projectId,
      "qa_plan_approved",
      `QA plan approved`,
      `${staff.email} approved "${plan.title.slice(0, 80)}". Next best action: Implementation Plan / Build Execution.`,
    );
    return { plan: upd as QaPlanRow };
  });

// --------------------- archiveProjectQaPlan ---------------------

export const archiveProjectQaPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid, planId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<{ plan: QaPlanRow }> => {
    const staff = await assertAdmin(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    await loadProject(sb, data.projectId);
    const plan = await loadQaPlan(sb, data.planId);
    if (plan.project_id !== data.projectId) throw new Error("Project scope mismatch");
    if (plan.status === "archived") return { plan };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: upd, error } = await supabaseAdmin
      .from("engine_project_qa_plans")
      .update({ status: "archived" })
      .eq("id", data.planId)
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "Failed to archive QA plan");

    await insertAuditEvent(sb, {
      projectId: data.projectId,
      userId: staff.userId,
      email: staff.email,
      eventType: "qa_plan_archived",
    });
    await insertActivity(
      sb,
      data.projectId,
      "qa_plan_archived",
      `QA plan archived`,
      `${staff.email} archived "${plan.title.slice(0, 80)}".`,
    );
    return { plan: upd as QaPlanRow };
  });
