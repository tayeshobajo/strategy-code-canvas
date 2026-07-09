// Backend Builder v1 — server functions.
//
// Staff-only (operator/admin). Mirrors Frame + Mockup Builder: all mutations
// flow through supabaseAdmin (RLS blocks direct writes). Every mutation
// writes an audit event (engine_project_chat_events) + engine_activity row,
// verifies project scope, and refuses to silently overwrite an approved
// backend plan (DB trigger also enforces this).
//
// Never writes to client_portal_*, roadmap_approvals, subscriptions, orders,
// engine tasks, or milestones. Never runs DDL. Never applies migrations.
// Never deploys code. Approval sets the row status only.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import { getProjectSpine, type ProjectSpinePayload } from "@/lib/engine.functions";
import type { MockupRow, MockupPayload } from "@/lib/engine-mockup-builder.functions";
import type { FrameRow } from "@/lib/engine-frame-builder.functions";
import {
  buildBackendPrompt,
  assessBackendReadiness,
  type BackendInputBundle,
  type MissingBackendInput,
} from "@/lib/engine-backend-builder-prompt.server";

const uuid = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "Invalid UUID",
  );

// --------------------- types ---------------------

export type BackendPlanStatus = "draft" | "in_review" | "approved" | "archived";
export type BackendGeneratedBy = "ai" | "human" | "hybrid";

export type BackendField = {
  name: string;
  type: string;
  required: boolean;
  notes: string;
};

export type BackendTable = {
  name: string;
  purpose: string;
  fields: BackendField[];
  relationships: string[];
  indexes: string[];
  rls_rules: string[];
  audit_requirements: string[];
};

export type BackendServerFunction = {
  name: string;
  purpose: string;
  inputs: string[];
  outputs: string[];
  permissions: string[];
  side_effects: string[];
  audit_events: string[];
  failure_modes: string[];
};

export type BackendPermission = {
  role: string;
  can_read: string[];
  can_create: string[];
  can_update: string[];
  can_delete: string[];
  notes: string;
};

export type BackendIntegration = {
  name: string;
  purpose: string;
  direction: "inbound" | "outbound" | "both";
  data_exchanged: string[];
  auth_required: string;
  failure_modes: string[];
};

export type BackendWorkflow = {
  name: string;
  trigger: string;
  steps: string[];
  success_condition: string;
  failure_modes: string[];
};

export type BackendOpenDecision = {
  question: string;
  blocks: Array<"implementation" | "security" | "delivery">;
  recommended_owner: string;
  suggested_next_action: string;
};

export type BackendRisk = {
  name: string;
  severity: "low" | "medium" | "high";
  mitigation: string;
};

export type BackendPayload = {
  backend_goal: string;
  source_mockup_summary: string;
  architecture_summary: string;
  data_model: {
    tables: BackendTable[];
    views: string[];
    enums: string[];
    storage_buckets: string[];
  };
  server_functions: BackendServerFunction[];
  permissions: BackendPermission[];
  integrations: BackendIntegration[];
  workflows: BackendWorkflow[];
  api_endpoints: string[];
  background_jobs: string[];
  notifications: string[];
  security_checks: string[];
  qa_plan: {
    role_tests: string[];
    data_tests: string[];
    rls_tests: string[];
    integration_tests: string[];
    edge_cases: string[];
    regression_tests: string[];
  };
  implementation_sequence: string[];
  open_decisions: BackendOpenDecision[];
  risks: BackendRisk[];
};

export type BackendPlanRow = {
  id: string;
  project_id: string;
  mockup_id: string;
  frame_id: string | null;
  title: string;
  summary: string | null;
  status: BackendPlanStatus;
  generated_by: BackendGeneratedBy;
  payload: BackendPayload;
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

async function loadBackendPlan(sb: Sb, planId: string): Promise<BackendPlanRow> {
  const { data, error } = await sb
    .from("engine_project_backend_plans")
    .select("*")
    .eq("id", planId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load backend plan");
  if (!data) throw new Error("Backend plan not found");
  return data as BackendPlanRow;
}

// --------------------- getProjectBackendBuilder ---------------------

export type BackendBuilderState = {
  project: {
    id: string;
    name: string;
    client_company: string;
    status: string;
    current_step: string;
  };
  approved_mockup: {
    id: string;
    title: string;
    approved_at: string | null;
    page_count: number;
    must_build_count: number;
    open_decisions_count: number;
  } | null;
  approved_frame: {
    id: string;
    title: string;
    approved_at: string | null;
  } | null;
  latest: BackendPlanRow | null;
  latest_approved: BackendPlanRow | null;
  history: Array<
    Pick<
      BackendPlanRow,
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
  readiness: { ready: boolean; missing: MissingBackendInput[] };
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

export const getProjectBackendBuilder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<BackendBuilderState> => {
    const staff = await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;

    const project = await loadProject(sb, data.projectId);
    const approvedMockup = await loadLatestApprovedMockup(sb, data.projectId);
    const approvedFrame = await loadLatestApprovedFrame(sb, data.projectId);

    const { data: rows, error } = await sb
      .from("engine_project_backend_plans")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message ?? "Failed to load backend plans");
    const plans = (rows ?? []) as BackendPlanRow[];
    const latest = plans[0] ?? null;
    const latest_approved = plans.find((p) => p.status === "approved") ?? null;

    const missing = assessBackendReadiness({ approved_mockup: approvedMockup });

    const mockupSummary = approvedMockup
      ? {
          id: approvedMockup.id,
          title: approvedMockup.title,
          approved_at: approvedMockup.approved_at,
          page_count: approvedMockup.payload?.pages?.length ?? 0,
          must_build_count: (approvedMockup.payload?.pages ?? []).filter(
            (p) => p.priority === "must",
          ).length,
          open_decisions_count: approvedMockup.payload?.open_decisions?.length ?? 0,
        }
      : null;

    const frameSummary = approvedFrame
      ? {
          id: approvedFrame.id,
          title: approvedFrame.title,
          approved_at: approvedFrame.approved_at,
        }
      : null;

    return {
      project: {
        id: project.id,
        name: project.name ?? "",
        client_company: project.engine_clients?.company ?? "—",
        status: project.status,
        current_step: project.current_step,
      },
      approved_mockup: mockupSummary,
      approved_frame: frameSummary,
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

// --------------------- generateProjectBackendPlan ---------------------

async function gatherBackendBundle(
  sb: Sb,
  project: Awaited<ReturnType<typeof loadProject>>,
  approvedMockup: MockupRow,
  approvedFrame: FrameRow | null,
): Promise<BackendInputBundle> {
  const { data: artRows } = await sb
    .from("engine_project_artifacts")
    .select("artifact_type,title,summary")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(20);

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
    approved_mockup: approvedMockup,
    approved_frame: approvedFrame,
    approved_roadmap: project.approved_version ? roadmap : null,
    artifacts: (artRows ?? []) as BackendInputBundle["artifacts"],
    open_mockup_decisions:
      (approvedMockup.payload?.open_decisions ?? []) as MockupPayload["open_decisions"],
  };
}

export const generateProjectBackendPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid }).parse(raw))
  .handler(
    async ({
      context,
      data,
    }): Promise<{
      ok: boolean;
      plan?: BackendPlanRow;
      missing_inputs?: MissingBackendInput[];
      message?: string;
    }> => {
      const staff = await assertStaff(context as unknown as StaffContext);
      const sb = (context as unknown as StaffContext).supabase;

      const project = await loadProject(sb, data.projectId);
      const approvedMockup = await loadLatestApprovedMockup(sb, data.projectId);
      const missing = assessBackendReadiness({ approved_mockup: approvedMockup });
      if (missing.length || !approvedMockup) {
        await insertAuditEvent(sb, {
          projectId: data.projectId,
          userId: staff.userId,
          email: staff.email,
          eventType: "backend_plan_generation_refused",
          success: false,
          errorCode: "no_approved_mockup",
        });
        return {
          ok: false,
          missing_inputs: missing,
          message:
            "Approve a mockup set in Mockup Builder before generating a backend plan.",
        };
      }

      const approvedFrame = await loadLatestApprovedFrame(sb, data.projectId);

      // Best-effort spine snapshot.
      let spine: ProjectSpinePayload | null = null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        spine = (await (getProjectSpine as any)({
          data: { id: data.projectId },
        })) as ProjectSpinePayload;
      } catch {
        spine = null;
      }

      const bundle = await gatherBackendBundle(sb, project, approvedMockup, approvedFrame);
      const { system, user } = buildBackendPrompt(bundle, spine);

      const { callLovableAi, parseJsonOutput } = await import("@/lib/engine-ai.server");
      const ai = await callLovableAi(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        { json: true, temperature: 0.2 },
      );

      const parsed = parseJsonOutput<
        { title?: string; summary?: string } & BackendPayload
      >(ai.text);
      if (!parsed) {
        await insertAuditEvent(sb, {
          projectId: data.projectId,
          userId: staff.userId,
          email: staff.email,
          eventType: "backend_plan_generation_failed",
          success: false,
          errorCode: "invalid_json",
        });
        throw new Error("AI returned invalid JSON for the backend plan.");
      }

      const payload = normalizeBackendPayload(parsed, approvedMockup);

      // At least one table and one server function are required.
      if (payload.data_model.tables.length === 0 || payload.server_functions.length === 0) {
        await insertAuditEvent(sb, {
          projectId: data.projectId,
          userId: staff.userId,
          email: staff.email,
          eventType: "backend_plan_generation_failed",
          success: false,
          errorCode: "empty_backbone",
        });
        throw new Error(
          "Backend plan output is missing required tables or server functions.",
        );
      }

      const title = (
        parsed.title ?? `Backend Plan · ${project.name ?? project.id}`
      ).slice(0, 200);
      const summary = (parsed.summary ?? "").slice(0, 2000);

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("engine_project_backend_plans")
        .insert({
          project_id: data.projectId,
          mockup_id: approvedMockup.id,
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
      if (insErr) throw new Error(insErr.message ?? "Failed to save backend plan draft");

      await insertAuditEvent(sb, {
        projectId: data.projectId,
        userId: staff.userId,
        email: staff.email,
        eventType: "backend_plan_generated",
      });
      await insertActivity(
        sb,
        data.projectId,
        "backend_plan_generated",
        `Backend plan draft generated`,
        `${staff.email} generated a Backend Builder draft (${payload.data_model.tables.length} tables, ${payload.server_functions.length} server functions) from approved mockup ${approvedMockup.id}.`,
      );

      return { ok: true, plan: inserted as BackendPlanRow };
    },
  );

function normalizeBackendPayload(
  raw: Partial<BackendPayload> & Record<string, unknown>,
  approvedMockup: MockupRow,
): BackendPayload {
  const dm = (raw.data_model ?? {}) as Partial<BackendPayload["data_model"]>;
  const qa = (raw.qa_plan ?? {}) as Partial<BackendPayload["qa_plan"]>;
  const tables: BackendTable[] = ((dm.tables as BackendTable[] | undefined) ?? []).map(
    (t) => ({
      name: t.name ?? "",
      purpose: t.purpose ?? "",
      fields: (t.fields ?? []).map((f) => ({
        name: f.name ?? "",
        type: f.type ?? "text",
        required: !!f.required,
        notes: f.notes ?? "",
      })),
      relationships: t.relationships ?? [],
      indexes: t.indexes ?? [],
      rls_rules: t.rls_rules ?? [],
      audit_requirements: t.audit_requirements ?? [],
    }),
  );
  return {
    backend_goal: (raw.backend_goal as string) ?? "",
    source_mockup_summary:
      (raw.source_mockup_summary as string) ??
      approvedMockup.summary ??
      approvedMockup.payload?.source_frame_summary ??
      "",
    architecture_summary: (raw.architecture_summary as string) ?? "",
    data_model: {
      tables,
      views: (dm.views as string[]) ?? [],
      enums: (dm.enums as string[]) ?? [],
      storage_buckets: (dm.storage_buckets as string[]) ?? [],
    },
    server_functions: ((raw.server_functions as BackendServerFunction[]) ?? []).map(
      (f) => ({
        name: f.name ?? "",
        purpose: f.purpose ?? "",
        inputs: f.inputs ?? [],
        outputs: f.outputs ?? [],
        permissions: f.permissions ?? [],
        side_effects: f.side_effects ?? [],
        audit_events: f.audit_events ?? [],
        failure_modes: f.failure_modes ?? [],
      }),
    ),
    permissions: ((raw.permissions as BackendPermission[]) ?? []).map((p) => ({
      role: p.role ?? "",
      can_read: p.can_read ?? [],
      can_create: p.can_create ?? [],
      can_update: p.can_update ?? [],
      can_delete: p.can_delete ?? [],
      notes: p.notes ?? "",
    })),
    integrations: ((raw.integrations as BackendIntegration[]) ?? []).map((i) => ({
      name: i.name ?? "",
      purpose: i.purpose ?? "",
      direction: (["inbound", "outbound", "both"].includes(i.direction as string)
        ? i.direction
        : "outbound") as BackendIntegration["direction"],
      data_exchanged: i.data_exchanged ?? [],
      auth_required: i.auth_required ?? "",
      failure_modes: i.failure_modes ?? [],
    })),
    workflows: ((raw.workflows as BackendWorkflow[]) ?? []).map((w) => ({
      name: w.name ?? "",
      trigger: w.trigger ?? "",
      steps: w.steps ?? [],
      success_condition: w.success_condition ?? "",
      failure_modes: w.failure_modes ?? [],
    })),
    api_endpoints: (raw.api_endpoints as string[]) ?? [],
    background_jobs: (raw.background_jobs as string[]) ?? [],
    notifications: (raw.notifications as string[]) ?? [],
    security_checks: (raw.security_checks as string[]) ?? [],
    qa_plan: {
      role_tests: qa.role_tests ?? [],
      data_tests: qa.data_tests ?? [],
      rls_tests: qa.rls_tests ?? [],
      integration_tests: qa.integration_tests ?? [],
      edge_cases: qa.edge_cases ?? [],
      regression_tests: qa.regression_tests ?? [],
    },
    implementation_sequence: (raw.implementation_sequence as string[]) ?? [],
    open_decisions: ((raw.open_decisions as BackendOpenDecision[]) ?? []).map((d) => ({
      question: d.question ?? "",
      blocks: (d.blocks ?? []).filter((b) =>
        ["implementation", "security", "delivery"].includes(b as string),
      ) as BackendOpenDecision["blocks"],
      recommended_owner: d.recommended_owner ?? "",
      suggested_next_action: d.suggested_next_action ?? "",
    })),
    risks: ((raw.risks as BackendRisk[]) ?? []).map((r) => ({
      name: r.name ?? "",
      severity: (["low", "medium", "high"].includes(r.severity as string)
        ? r.severity
        : "medium") as BackendRisk["severity"],
      mitigation: r.mitigation ?? "",
    })),
  };
}

// --------------------- saveProjectBackendPlanDraft ---------------------

const BackendPayloadSchema: z.ZodType<BackendPayload> = z
  .object({
    backend_goal: z.string().default(""),
    source_mockup_summary: z.string().default(""),
    architecture_summary: z.string().default(""),
    data_model: z
      .object({
        tables: z.array(z.any()).default([]),
        views: z.array(z.string()).default([]),
        enums: z.array(z.string()).default([]),
        storage_buckets: z.array(z.string()).default([]),
      })
      .default({ tables: [], views: [], enums: [], storage_buckets: [] }),
    server_functions: z.array(z.any()).default([]),
    permissions: z.array(z.any()).default([]),
    integrations: z.array(z.any()).default([]),
    workflows: z.array(z.any()).default([]),
    api_endpoints: z.array(z.string()).default([]),
    background_jobs: z.array(z.string()).default([]),
    notifications: z.array(z.string()).default([]),
    security_checks: z.array(z.string()).default([]),
    qa_plan: z
      .object({
        role_tests: z.array(z.string()).default([]),
        data_tests: z.array(z.string()).default([]),
        rls_tests: z.array(z.string()).default([]),
        integration_tests: z.array(z.string()).default([]),
        edge_cases: z.array(z.string()).default([]),
        regression_tests: z.array(z.string()).default([]),
      })
      .default({
        role_tests: [],
        data_tests: [],
        rls_tests: [],
        integration_tests: [],
        edge_cases: [],
        regression_tests: [],
      }),
    implementation_sequence: z.array(z.string()).default([]),
    open_decisions: z.array(z.any()).default([]),
    risks: z.array(z.any()).default([]),
  })
  .passthrough() as unknown as z.ZodType<BackendPayload>;

export const saveProjectBackendPlanDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: uuid,
        planId: uuid,
        title: z.string().trim().min(1).max(200),
        summary: z.string().trim().max(2000).nullish(),
        payload: BackendPayloadSchema,
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ plan: BackendPlanRow }> => {
    const staff = await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    await loadProject(sb, data.projectId);
    const existing = await loadBackendPlan(sb, data.planId);
    if (existing.project_id !== data.projectId) throw new Error("Project scope mismatch");
    if (existing.status !== "draft") {
      throw new Error(
        `Cannot edit backend plan in status ${existing.status}; create a new draft`,
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: upd, error } = await supabaseAdmin
      .from("engine_project_backend_plans")
      .update({
        title: data.title,
        summary: data.summary ?? null,
        payload: data.payload,
        generated_by: existing.generated_by === "ai" ? "hybrid" : existing.generated_by,
      })
      .eq("id", data.planId)
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "Failed to update backend plan draft");

    await insertAuditEvent(sb, {
      projectId: data.projectId,
      userId: staff.userId,
      email: staff.email,
      eventType: "backend_plan_draft_updated",
    });
    await insertActivity(
      sb,
      data.projectId,
      "backend_plan_draft_updated",
      `Backend plan draft updated`,
      `${staff.email} updated backend plan "${data.title.slice(0, 80)}".`,
    );
    return { plan: upd as BackendPlanRow };
  });

// --------------------- submitProjectBackendPlanToReview ---------------------

export const submitProjectBackendPlanToReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid, planId: uuid }).parse(raw))
  .handler(
    async ({
      context,
      data,
    }): Promise<{ plan: BackendPlanRow; reviewItemId: string }> => {
      const staff = await assertStaff(context as unknown as StaffContext);
      const sb = (context as unknown as StaffContext).supabase;
      const project = await loadProject(sb, data.projectId);
      const plan = await loadBackendPlan(sb, data.planId);
      if (plan.project_id !== data.projectId) throw new Error("Project scope mismatch");
      if (plan.status !== "draft") {
        throw new Error(
          `Backend plan is in status ${plan.status}; only drafts can be submitted to review`,
        );
      }

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: upd, error: updErr } = await supabaseAdmin
        .from("engine_project_backend_plans")
        .update({ status: "in_review" })
        .eq("id", data.planId)
        .select("*")
        .single();
      if (updErr)
        throw new Error(updErr.message ?? "Failed to submit backend plan to review");

      const { data: rev, error: revErr } = await supabaseAdmin
        .from("engine_review_items")
        .insert({
          project_id: data.projectId,
          project: project.name ?? project.id,
          item_type: "backend_plan",
          title: `Review backend plan: ${plan.title}`.slice(0, 240),
          impact: "high",
          source: "backend_builder",
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
        eventType: "backend_plan_submitted_for_review",
      });
      await insertActivity(
        sb,
        data.projectId,
        "backend_plan_submitted_for_review",
        `Backend plan submitted to review`,
        `${staff.email} submitted "${plan.title.slice(0, 80)}" to the review queue.`,
      );
      return { plan: upd as BackendPlanRow, reviewItemId: (rev as { id: string }).id };
    },
  );

// --------------------- approveProjectBackendPlan ---------------------

export const approveProjectBackendPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid, planId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<{ plan: BackendPlanRow }> => {
    const staff = await assertAdmin(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    await loadProject(sb, data.projectId);
    const plan = await loadBackendPlan(sb, data.planId);
    if (plan.project_id !== data.projectId) throw new Error("Project scope mismatch");
    if (plan.status !== "in_review") {
      throw new Error(
        `Backend plan must be in_review to approve; currently ${plan.status}`,
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();
    const { data: upd, error } = await supabaseAdmin
      .from("engine_project_backend_plans")
      .update({
        status: "approved",
        approved_by_email: staff.email,
        approved_by_user_id: staff.userId,
        approved_at: nowIso,
      })
      .eq("id", data.planId)
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "Failed to approve backend plan");

    await insertAuditEvent(sb, {
      projectId: data.projectId,
      userId: staff.userId,
      email: staff.email,
      eventType: "backend_plan_approved",
    });
    await insertActivity(
      sb,
      data.projectId,
      "backend_plan_approved",
      `Backend plan approved`,
      `${staff.email} approved "${plan.title.slice(0, 80)}". Next best action: QA Factory / Implementation Plan.`,
    );
    return { plan: upd as BackendPlanRow };
  });

// --------------------- archiveProjectBackendPlan ---------------------

export const archiveProjectBackendPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid, planId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<{ plan: BackendPlanRow }> => {
    const staff = await assertAdmin(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    await loadProject(sb, data.projectId);
    const plan = await loadBackendPlan(sb, data.planId);
    if (plan.project_id !== data.projectId) throw new Error("Project scope mismatch");
    if (plan.status === "archived") return { plan };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: upd, error } = await supabaseAdmin
      .from("engine_project_backend_plans")
      .update({ status: "archived" })
      .eq("id", data.planId)
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "Failed to archive backend plan");

    await insertAuditEvent(sb, {
      projectId: data.projectId,
      userId: staff.userId,
      email: staff.email,
      eventType: "backend_plan_archived",
    });
    await insertActivity(
      sb,
      data.projectId,
      "backend_plan_archived",
      `Backend plan archived`,
      `${staff.email} archived "${plan.title.slice(0, 80)}".`,
    );
    return { plan: upd as BackendPlanRow };
  });
