// Mockup Builder v1 — server functions.
//
// Staff-only (operator/admin). Mirrors Frame Builder: all mutations flow
// through supabaseAdmin (RLS blocks direct writes for authenticated/anon).
// Every mutation writes an audit event (engine_project_chat_events) +
// engine_activity row, verifies project scope, and refuses to silently
// overwrite an approved mockup (DB trigger also enforces this).
//
// Never writes to client_portal_*, roadmap_approvals, engine tasks, or
// milestones. Approval sets the mockup row status only — no automatic
// backend generation, no portal publish.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import { getProjectSpine, type ProjectSpinePayload } from "@/lib/engine.functions";
import type { FrameRow, FramePayload } from "@/lib/engine-frame-builder.functions";
import {
  buildMockupPrompt,
  assessMockupReadiness,
  type MockupInputBundle,
  type MissingMockupInput,
} from "@/lib/engine-mockup-builder-prompt.server";

const uuid = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "Invalid UUID",
  );

// --------------------- types ---------------------

export type MockupStatus = "draft" | "in_review" | "approved" | "archived";
export type MockupGeneratedBy = "ai" | "human" | "hybrid";
export type MockupPriority = "must" | "should" | "later";

export type MockupLayoutSection = {
  name: string;
  purpose: string;
  components: string[];
  content_notes: string[];
  interaction_notes: string[];
};

export type MockupState = {
  name: string;
  trigger: string;
  ui_expectation: string;
  empty_state: string;
  error_state: string;
  loading_state: string;
};

export type MockupPage = {
  frame_page_id: string;
  title: string;
  priority: MockupPriority;
  page_goal: string;
  primary_user: string;
  layout_sections: MockupLayoutSection[];
  key_actions: string[];
  states: MockupState[];
  responsive_notes: { desktop: string; tablet: string; mobile: string };
  data_dependencies: string[];
  backend_dependencies: string[];
  qa_checks: string[];
  open_questions: string[];
};

export type MockupOpenDecision = {
  question: string;
  blocks: Array<"mockups" | "backend" | "delivery">;
  recommended_owner: string;
  suggested_next_action: string;
};

export type MockupPayload = {
  mockup_goal: string;
  source_frame_summary: string;
  design_system_notes: {
    brand_direction: string;
    tone: string;
    layout_principles: string[];
    component_principles: string[];
    responsive_principles: string[];
  };
  pages: MockupPage[];
  global_components: string[];
  navigation_model: string[];
  interaction_model: string[];
  responsive_strategy: string[];
  qa_expectations: string[];
  open_decisions: MockupOpenDecision[];
};

export type MockupRow = {
  id: string;
  project_id: string;
  frame_id: string | null;
  title: string;
  summary: string | null;
  status: MockupStatus;
  generated_by: MockupGeneratedBy;
  payload: MockupPayload;
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
      "id,name,status,current_step,current_step_num,point_b,roadmap,approved_version,action_mode_enabled, engine_clients(company)",
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
    action_mode_enabled: boolean;
    engine_clients: { company: string } | null;
  };
}

async function loadLatestApprovedFrame(sb: Sb, projectId: string): Promise<FrameRow | null> {
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

async function loadMockup(sb: Sb, mockupId: string): Promise<MockupRow> {
  const { data, error } = await sb
    .from("engine_project_mockups")
    .select("*")
    .eq("id", mockupId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load mockup");
  if (!data) throw new Error("Mockup not found");
  return data as MockupRow;
}

// --------------------- getProjectMockupBuilder ---------------------

export type MockupBuilderState = {
  project: {
    id: string;
    name: string;
    client_company: string;
    status: string;
    current_step: string;
    action_mode_enabled: boolean;
  };
  approved_frame: {
    id: string;
    title: string;
    approved_at: string | null;
    page_count: number;
    must_build_count: number;
    open_decisions_count: number;
  } | null;
  latest: MockupRow | null;
  latest_approved: MockupRow | null;
  history: Array<Pick<
    MockupRow,
    "id" | "title" | "status" | "generated_by" | "created_by_email" | "created_at" | "updated_at" | "approved_at"
  >>;
  readiness: { ready: boolean; missing: MissingMockupInput[] };
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

export const getProjectMockupBuilder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<MockupBuilderState> => {
    const staff = await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;

    const project = await loadProject(sb, data.projectId);
    const approvedFrame = await loadLatestApprovedFrame(sb, data.projectId);

    const { data: rows, error } = await sb
      .from("engine_project_mockups")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message ?? "Failed to load mockups");
    const mockups = (rows ?? []) as MockupRow[];
    const latest = mockups[0] ?? null;
    const latest_approved = mockups.find((m) => m.status === "approved") ?? null;

    const missing = assessMockupReadiness({ approved_frame: approvedFrame });

    const frameSummary = approvedFrame
      ? {
          id: approvedFrame.id,
          title: approvedFrame.title,
          approved_at: approvedFrame.approved_at,
          page_count: approvedFrame.payload?.pages?.length ?? 0,
          must_build_count: (approvedFrame.payload?.pages ?? []).filter(
            (p) => p.priority === "must",
          ).length,
          open_decisions_count: approvedFrame.payload?.open_decisions?.length ?? 0,
        }
      : null;

    return {
      project: {
        id: project.id,
        name: project.name ?? "",
        client_company: project.engine_clients?.company ?? "—",
        status: project.status,
        current_step: project.current_step,
        action_mode_enabled: !!project.action_mode_enabled,
      },
      approved_frame: frameSummary,
      latest,
      latest_approved,
      history: mockups.map((m) => ({
        id: m.id,
        title: m.title,
        status: m.status,
        generated_by: m.generated_by,
        created_by_email: m.created_by_email,
        created_at: m.created_at,
        updated_at: m.updated_at,
        approved_at: m.approved_at,
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

// --------------------- generateProjectMockups ---------------------

async function gatherMockupBundle(
  sb: Sb,
  project: Awaited<ReturnType<typeof loadProject>>,
  approvedFrame: FrameRow,
): Promise<MockupInputBundle> {
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
    approved_frame: approvedFrame,
    approved_roadmap: project.approved_version ? roadmap : null,
    artifacts: (artRows ?? []) as MockupInputBundle["artifacts"],
    open_frame_decisions: (approvedFrame.payload?.open_decisions ?? []) as FramePayload["open_decisions"],
  };
}

export const generateProjectMockups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid }).parse(raw))
  .handler(
    async ({
      context,
      data,
    }): Promise<{
      ok: boolean;
      mockup?: MockupRow;
      missing_inputs?: MissingMockupInput[];
      message?: string;
    }> => {
      const staff = await assertStaff(context as unknown as StaffContext);
      const sb = (context as unknown as StaffContext).supabase;

      const project = await loadProject(sb, data.projectId);
      const approvedFrame = await loadLatestApprovedFrame(sb, data.projectId);
      const missing = assessMockupReadiness({ approved_frame: approvedFrame });
      if (missing.length || !approvedFrame) {
        await insertAuditEvent(sb, {
          projectId: data.projectId,
          userId: staff.userId,
          email: staff.email,
          eventType: "mockup_generation_refused",
          success: false,
          errorCode: "no_approved_frame",
        });
        return {
          ok: false,
          missing_inputs: missing,
          message: "Approve a frame in Frame Builder before generating mockups.",
        };
      }

      // Best-effort spine snapshot.
      let spine: ProjectSpinePayload | null = null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        spine = (await (getProjectSpine as any)({ data: { id: data.projectId } })) as ProjectSpinePayload;
      } catch {
        spine = null;
      }

      const bundle = await gatherMockupBundle(sb, project, approvedFrame);
      const { system, user } = buildMockupPrompt(bundle, spine);

      const { callLovableAi, parseJsonOutput } = await import("@/lib/engine-ai.server");
      const ai = await callLovableAi(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        { json: true, temperature: 0.2 },
      );

      const parsed = parseJsonOutput<
        { title?: string; summary?: string } & MockupPayload
      >(ai.text);
      if (!parsed) {
        await insertAuditEvent(sb, {
          projectId: data.projectId,
          userId: staff.userId,
          email: staff.email,
          eventType: "mockup_generation_failed",
          success: false,
          errorCode: "invalid_json",
        });
        throw new Error("AI returned invalid JSON for the mockup set.");
      }

      const payload = normalizeMockupPayload(parsed, approvedFrame);

      // Assert that every must-build page from the approved frame is covered.
      const mustFrameIds = new Set(
        (approvedFrame.payload?.pages ?? [])
          .filter((p) => p.priority === "must")
          .map((p) => p.id),
      );
      const coveredFrameIds = new Set(payload.pages.map((p) => p.frame_page_id));
      const uncovered = [...mustFrameIds].filter((id) => !coveredFrameIds.has(id));
      if (mustFrameIds.size > 0 && uncovered.length === mustFrameIds.size) {
        await insertAuditEvent(sb, {
          projectId: data.projectId,
          userId: staff.userId,
          email: staff.email,
          eventType: "mockup_generation_failed",
          success: false,
          errorCode: "missing_must_pages",
        });
        throw new Error(
          "Mockup output does not cover any must-build pages from the approved frame.",
        );
      }

      const title = (parsed.title ?? `Mockup Set · ${project.name ?? project.id}`).slice(0, 200);
      const summary = (parsed.summary ?? "").slice(0, 2000);

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("engine_project_mockups")
        .insert({
          project_id: data.projectId,
          frame_id: approvedFrame.id,
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
      if (insErr) throw new Error(insErr.message ?? "Failed to save mockup draft");

      await insertAuditEvent(sb, {
        projectId: data.projectId,
        userId: staff.userId,
        email: staff.email,
        eventType: "mockup_generated",
      });
      await insertActivity(
        sb,
        data.projectId,
        "mockup_generated",
        `Mockup draft generated`,
        `${staff.email} generated a Mockup Builder draft (${payload.pages.length} pages, ${payload.pages.reduce(
          (n, p) => n + p.states.length,
          0,
        )} states) from approved frame ${approvedFrame.id}.`,
      );

      return { ok: true, mockup: inserted as MockupRow };
    },
  );

function normalizeMockupPayload(
  raw: Partial<MockupPayload> & Record<string, unknown>,
  approvedFrame: FrameRow,
): MockupPayload {
  const dsn = (raw.design_system_notes ?? {}) as Partial<
    MockupPayload["design_system_notes"]
  >;
  const pages: MockupPage[] = ((raw.pages as MockupPage[] | undefined) ?? []).map((p) => ({
    frame_page_id: p.frame_page_id ?? "",
    title: p.title ?? "",
    priority: (["must", "should", "later"].includes(p.priority as string)
      ? p.priority
      : "should") as MockupPriority,
    page_goal: p.page_goal ?? "",
    primary_user: p.primary_user ?? "",
    layout_sections: (p.layout_sections ?? []).map((s) => ({
      name: s.name ?? "",
      purpose: s.purpose ?? "",
      components: s.components ?? [],
      content_notes: s.content_notes ?? [],
      interaction_notes: s.interaction_notes ?? [],
    })),
    key_actions: p.key_actions ?? [],
    states: (p.states ?? []).map((st) => ({
      name: st.name ?? "",
      trigger: st.trigger ?? "",
      ui_expectation: st.ui_expectation ?? "",
      empty_state: st.empty_state ?? "",
      error_state: st.error_state ?? "",
      loading_state: st.loading_state ?? "",
    })),
    responsive_notes: {
      desktop: p.responsive_notes?.desktop ?? "",
      tablet: p.responsive_notes?.tablet ?? "",
      mobile: p.responsive_notes?.mobile ?? "",
    },
    data_dependencies: p.data_dependencies ?? [],
    backend_dependencies: p.backend_dependencies ?? [],
    qa_checks: p.qa_checks ?? [],
    open_questions: p.open_questions ?? [],
  }));
  return {
    mockup_goal: (raw.mockup_goal as string) ?? "",
    source_frame_summary:
      (raw.source_frame_summary as string) ??
      approvedFrame.summary ??
      approvedFrame.payload?.project_summary ??
      "",
    design_system_notes: {
      brand_direction: dsn.brand_direction ?? "",
      tone: dsn.tone ?? "",
      layout_principles: dsn.layout_principles ?? [],
      component_principles: dsn.component_principles ?? [],
      responsive_principles: dsn.responsive_principles ?? [],
    },
    pages,
    global_components: (raw.global_components as string[]) ?? [],
    navigation_model: (raw.navigation_model as string[]) ?? [],
    interaction_model: (raw.interaction_model as string[]) ?? [],
    responsive_strategy: (raw.responsive_strategy as string[]) ?? [],
    qa_expectations: (raw.qa_expectations as string[]) ?? [],
    open_decisions: (raw.open_decisions as MockupOpenDecision[]) ?? [],
  };
}

// --------------------- saveProjectMockupDraft ---------------------

const MockupPayloadSchema: z.ZodType<MockupPayload> = z
  .object({
    mockup_goal: z.string().default(""),
    source_frame_summary: z.string().default(""),
    design_system_notes: z
      .object({
        brand_direction: z.string().default(""),
        tone: z.string().default(""),
        layout_principles: z.array(z.string()).default([]),
        component_principles: z.array(z.string()).default([]),
        responsive_principles: z.array(z.string()).default([]),
      })
      .default({
        brand_direction: "",
        tone: "",
        layout_principles: [],
        component_principles: [],
        responsive_principles: [],
      }),
    pages: z.array(z.any()).default([]),
    global_components: z.array(z.string()).default([]),
    navigation_model: z.array(z.string()).default([]),
    interaction_model: z.array(z.string()).default([]),
    responsive_strategy: z.array(z.string()).default([]),
    qa_expectations: z.array(z.string()).default([]),
    open_decisions: z.array(z.any()).default([]),
  })
  .passthrough() as unknown as z.ZodType<MockupPayload>;

export const saveProjectMockupDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: uuid,
        mockupId: uuid.nullish(),
        title: z.string().trim().min(1).max(200),
        summary: z.string().trim().max(2000).nullish(),
        payload: MockupPayloadSchema,
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ mockup: MockupRow }> => {
    const staff = await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    await loadProject(sb, data.projectId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let row: MockupRow;
    if (data.mockupId) {
      const existing = await loadMockup(sb, data.mockupId);
      if (existing.project_id !== data.projectId) throw new Error("Project scope mismatch");
      if (existing.status !== "draft") {
        throw new Error(`Cannot edit mockup in status ${existing.status}; create a new draft`);
      }
      const { data: upd, error } = await supabaseAdmin
        .from("engine_project_mockups")
        .update({
          title: data.title,
          summary: data.summary ?? null,
          payload: data.payload,
          generated_by: existing.generated_by === "ai" ? "hybrid" : existing.generated_by,
        })
        .eq("id", data.mockupId)
        .select("*")
        .single();
      if (error) throw new Error(error.message ?? "Failed to update mockup draft");
      row = upd as MockupRow;
    } else {
      const approvedFrame = await loadLatestApprovedFrame(sb, data.projectId);
      const { data: ins, error } = await supabaseAdmin
        .from("engine_project_mockups")
        .insert({
          project_id: data.projectId,
          frame_id: approvedFrame?.id ?? null,
          title: data.title,
          summary: data.summary ?? null,
          payload: data.payload,
          status: "draft",
          generated_by: "human",
          created_by_email: staff.email,
          created_by_user_id: staff.userId,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message ?? "Failed to create mockup draft");
      row = ins as MockupRow;
    }

    await insertAuditEvent(sb, {
      projectId: data.projectId,
      userId: staff.userId,
      email: staff.email,
      eventType: data.mockupId ? "mockup_draft_updated" : "mockup_draft_created",
    });
    await insertActivity(
      sb,
      data.projectId,
      data.mockupId ? "mockup_draft_updated" : "mockup_draft_created",
      `Mockup draft ${data.mockupId ? "updated" : "created"}: ${row.title.slice(0, 80)}`,
      `${staff.email} ${data.mockupId ? "updated" : "created"} a Mockup Builder draft.`,
    );
    return { mockup: row };
  });

// --------------------- submitProjectMockupToReview ---------------------

export const submitProjectMockupToReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid, mockupId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<{ mockup: MockupRow; reviewItemId: string }> => {
    const staff = await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    const project = await loadProject(sb, data.projectId);
    const mockup = await loadMockup(sb, data.mockupId);
    if (mockup.project_id !== data.projectId) throw new Error("Project scope mismatch");
    if (mockup.status !== "draft") {
      throw new Error(
        `Mockup is in status ${mockup.status}; only drafts can be submitted to review`,
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: upd, error: updErr } = await supabaseAdmin
      .from("engine_project_mockups")
      .update({ status: "in_review" })
      .eq("id", data.mockupId)
      .select("*")
      .single();
    if (updErr) throw new Error(updErr.message ?? "Failed to submit mockup to review");

    const { data: rev, error: revErr } = await supabaseAdmin
      .from("engine_review_items")
      .insert({
        project_id: data.projectId,
        project: project.name ?? project.id,
        item_type: "mockup_set",
        title: `Review mockup set: ${mockup.title}`.slice(0, 240),
        impact: "high",
        source: "mockup_builder",
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
      eventType: "mockup_submitted_for_review",
    });
    await insertActivity(
      sb,
      data.projectId,
      "mockup_submitted_for_review",
      `Mockup submitted to review`,
      `${staff.email} submitted "${mockup.title.slice(0, 80)}" to the review queue.`,
    );
    return { mockup: upd as MockupRow, reviewItemId: (rev as { id: string }).id };
  });

// --------------------- approveProjectMockup ---------------------

export const approveProjectMockup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid, mockupId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<{ mockup: MockupRow }> => {
    const staff = await assertAdmin(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    await loadProject(sb, data.projectId);
    const mockup = await loadMockup(sb, data.mockupId);
    if (mockup.project_id !== data.projectId) throw new Error("Project scope mismatch");
    if (mockup.status !== "in_review") {
      throw new Error(`Mockup must be in_review to approve; currently ${mockup.status}`);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();
    const { data: upd, error } = await supabaseAdmin
      .from("engine_project_mockups")
      .update({
        status: "approved",
        approved_by_email: staff.email,
        approved_by_user_id: staff.userId,
        approved_at: nowIso,
      })
      .eq("id", data.mockupId)
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "Failed to approve mockup");

    await insertAuditEvent(sb, {
      projectId: data.projectId,
      userId: staff.userId,
      email: staff.email,
      eventType: "mockup_approved",
    });
    await insertActivity(
      sb,
      data.projectId,
      "mockup_approved",
      `Mockup approved`,
      `${staff.email} approved "${mockup.title.slice(0, 80)}". Next best action: move to Backend Builder.`,
    );
    return { mockup: upd as MockupRow };
  });

// --------------------- archiveProjectMockup ---------------------

export const archiveProjectMockup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid, mockupId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<{ mockup: MockupRow }> => {
    const staff = await assertAdmin(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    await loadProject(sb, data.projectId);
    const mockup = await loadMockup(sb, data.mockupId);
    if (mockup.project_id !== data.projectId) throw new Error("Project scope mismatch");
    if (mockup.status === "archived") return { mockup };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: upd, error } = await supabaseAdmin
      .from("engine_project_mockups")
      .update({ status: "archived" })
      .eq("id", data.mockupId)
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "Failed to archive mockup");

    await insertAuditEvent(sb, {
      projectId: data.projectId,
      userId: staff.userId,
      email: staff.email,
      eventType: "mockup_archived",
    });
    await insertActivity(
      sb,
      data.projectId,
      "mockup_archived",
      `Mockup archived`,
      `${staff.email} archived "${mockup.title.slice(0, 80)}".`,
    );
    return { mockup: upd as MockupRow };
  });
