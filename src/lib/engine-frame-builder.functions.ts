// Frame Builder v1 — server functions.
//
// Staff-only (operator/admin). All mutations flow through supabaseAdmin so
// the RLS write-lock stays effective. Every mutation writes an audit event
// (engine_project_chat_events) + engine_activity row, verifies project scope,
// and refuses to silently overwrite an approved frame (the DB trigger also
// enforces this).
//
// This file NEVER writes to client_portal_*, roadmap_approvals, or engine
// tasks/milestones. Approval sets the frame row status only; it does not
// publish to any client surface, and no mockup generation happens
// automatically.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import { getProjectSpine, type ProjectSpinePayload } from "@/lib/engine.functions";
import {
  buildFramePrompt,
  assessFrameReadiness,
  type FrameInputBundle,
  type MissingInput,
} from "@/lib/engine-frame-builder-prompt.server";
import type { Json } from "@/lib/engine-workspace";

const uuid = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "Invalid UUID",
  );

// --------------------- types ---------------------

export type FrameStatus = "draft" | "in_review" | "approved" | "archived";
export type FrameGeneratedBy = "ai" | "human" | "hybrid";

export type FramePagePriority = "must" | "should" | "later";

export type FramePage = {
  id: string;
  title: string;
  type: string;
  goal: string;
  primary_user: string;
  roles_allowed: string[];
  entry_points: string[];
  primary_actions: string[];
  secondary_actions: string[];
  states: string[];
  data_reads: string[];
  data_writes: string[];
  backend_requirements: string[];
  integrations: string[];
  qa_checks: string[];
  open_questions: string[];
  priority: FramePagePriority;
};

export type FrameFlow = {
  title: string;
  actor: string;
  steps: string[];
  success_condition: string;
  edge_cases: string[];
};

export type FrameOpenDecision = {
  question: string;
  blocks: Array<"mockups" | "backend" | "delivery">;
  recommended_owner: string;
  suggested_next_action: string;
};

export type FramePayload = {
  project_summary: string;
  frame_goal: string;
  roles: Array<{ id: string; label: string; description: string }>;
  pages: FramePage[];
  flows: FrameFlow[];
  data_objects: Array<{ name: string; purpose: string; owned_by: string }>;
  backend_requirements: string[];
  permissions: Array<{ role: string; can: string[] }>;
  qa_gates: Array<{ name: string; detail: string }>;
  open_decisions: FrameOpenDecision[];
};

export type FrameRow = {
  id: string;
  project_id: string;
  source_version_id: string | null;
  source_artifact_id: string | null;
  title: string;
  summary: string | null;
  status: FrameStatus;
  generated_by: FrameGeneratedBy;
  payload: FramePayload;
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

async function assertStaff(context: StaffContext): Promise<{
  email: string;
  userId: string | null;
  isAdmin: boolean;
  isOperator: boolean;
}> {
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
  severity: "info" | "warning" | "error" = "info",
) {
  try {
    await sb.from("engine_activity").insert({ project_id: projectId, kind, title, body, severity });
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
      "id,name,status,current_step,current_step_num,point_a,point_b,roadmap,blueprint,approved_version,action_mode_enabled, engine_clients(company)",
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
    point_a: Json;
    point_b: Json;
    roadmap: Json;
    blueprint: Json;
    approved_version: string | null;
    action_mode_enabled: boolean;
    engine_clients: { company: string } | null;
  };
}

async function loadFrame(sb: Sb, frameId: string): Promise<FrameRow> {
  const { data, error } = await sb
    .from("engine_project_frames")
    .select("*")
    .eq("id", frameId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load frame");
  if (!data) throw new Error("Frame not found");
  return data as FrameRow;
}

// --------------------- getProjectFrameBuilder ---------------------

export type FrameBuilderState = {
  project: {
    id: string;
    name: string;
    client_company: string;
    status: string;
    current_step: string;
    action_mode_enabled: boolean;
  };
  latest: FrameRow | null;
  latest_approved: FrameRow | null;
  history: Array<Pick<FrameRow, "id" | "title" | "status" | "generated_by" | "created_by_email" | "created_at" | "updated_at" | "approved_at">>;
  readiness: { ready: boolean; missing: MissingInput[] };
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

export const getProjectFrameBuilder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<FrameBuilderState> => {
    const staff = await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;

    const project = await loadProject(sb, data.projectId);

    const { data: rows, error } = await sb
      .from("engine_project_frames")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message ?? "Failed to load frames");
    const frames = (rows ?? []) as FrameRow[];
    const latest = frames[0] ?? null;
    const latest_approved = frames.find((f) => f.status === "approved") ?? null;

    const bundle = await gatherFrameBundle(sb, project);
    const missing = assessFrameReadiness(bundle);

    return {
      project: {
        id: project.id,
        name: project.name ?? "",
        client_company: project.engine_clients?.company ?? "—",
        status: project.status,
        current_step: project.current_step,
        action_mode_enabled: !!project.action_mode_enabled,
      },
      latest,
      latest_approved,
      history: frames.map((f) => ({
        id: f.id,
        title: f.title,
        status: f.status,
        generated_by: f.generated_by,
        created_by_email: f.created_by_email,
        created_at: f.created_at,
        updated_at: f.updated_at,
        approved_at: f.approved_at,
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

// --------------------- generateProjectFrame ---------------------

async function gatherFrameBundle(
  sb: Sb,
  project: Awaited<ReturnType<typeof loadProject>>,
): Promise<FrameInputBundle> {
  const { data: msRows } = await sb
    .from("engine_milestones")
    .select("id,name,phase,status,approval_status")
    .eq("project_id", project.id)
    .order("sort_index", { ascending: true })
    .limit(60);

  const { data: artRows } = await sb
    .from("engine_project_artifacts")
    .select("artifact_type,title,summary")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(30);

  const { data: propRows } = await sb
    .from("engine_project_chat_proposals")
    .select("proposal_type,title,summary,status")
    .eq("project_id", project.id)
    .in("status", ["saved", "submitted_for_review"])
    .order("created_at", { ascending: false })
    .limit(30);

  const roadmap = (project.roadmap ?? {}) as Record<string, unknown>;
  const goal =
    (roadmap.goal as string | undefined) ??
    ((project.point_b as Record<string, unknown> | null)?.goal as string | undefined) ??
    null;
  const frame =
    (roadmap.frame as string | undefined) ??
    ((project.blueprint as Record<string, unknown> | null)?.frame as string | undefined) ??
    null;

  return {
    project: {
      id: project.id,
      name: project.name ?? "",
      client_company: project.engine_clients?.company ?? "—",
      status: project.status,
      current_step: project.current_step,
      frame,
      goal,
      point_a: project.point_a,
      point_b: project.point_b,
    },
    approved_roadmap: project.approved_version ? roadmap : null,
    milestones: (msRows ?? []) as FrameInputBundle["milestones"],
    artifacts: (artRows ?? []) as FrameInputBundle["artifacts"],
    chat_proposals_saved: ((propRows ?? []) as Array<{
      proposal_type: string;
      title: string;
      summary: string | null;
    }>).map((p) => ({
      proposal_type: p.proposal_type,
      title: p.title,
      summary: p.summary,
    })),
  };
}

export const generateProjectFrame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid }).parse(raw))
  .handler(
    async ({
      context,
      data,
    }): Promise<{
      ok: boolean;
      frame?: FrameRow;
      missing_inputs?: MissingInput[];
      message?: string;
    }> => {
      const staff = await assertStaff(context as unknown as StaffContext);
      const sb = (context as unknown as StaffContext).supabase;

      const project = await loadProject(sb, data.projectId);
      const bundle = await gatherFrameBundle(sb, project);
      const missing = assessFrameReadiness(bundle);
      if (missing.length) {
        await insertAuditEvent(sb, {
          projectId: data.projectId,
          userId: staff.userId,
          email: staff.email,
          eventType: "frame_generation_refused",
          success: false,
          errorCode: "insufficient_direction",

        });
        return {
          ok: false,
          missing_inputs: missing,
          message: "Insufficient approved direction to synthesize a frame.",
        };
      }

      // Best-effort spine snapshot (staff-scoped; server fns are direct-callable server-side).
      let spine: ProjectSpinePayload | null = null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        spine = (await (getProjectSpine as any)({ data: { id: data.projectId } })) as ProjectSpinePayload;
      } catch {
        spine = null;
      }

      const { system, user } = buildFramePrompt(bundle, spine);

      const { callLovableAi, parseJsonOutput } = await import("@/lib/engine-ai.server");
      const ai = await callLovableAi(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        { json: true, temperature: 0.2 },
      );

      const parsed = parseJsonOutput<{
        title?: string;
        summary?: string;
      } & FramePayload>(ai.text);
      if (!parsed) {
        await insertAuditEvent(sb, {
          projectId: data.projectId,
          userId: staff.userId,
          email: staff.email,
          eventType: "frame_generation_failed",
          success: false,
          errorCode: "invalid_json",
        });
        throw new Error("AI returned invalid JSON for the frame.");
      }

      const payload: FramePayload = {
        project_summary: parsed.project_summary ?? "",
        frame_goal: parsed.frame_goal ?? "",
        roles: parsed.roles ?? [],
        pages: (parsed.pages ?? []).map((p) => ({
          id: p.id ?? cryptoRandom(),
          title: p.title ?? "",
          type: p.type ?? "other",
          goal: p.goal ?? "",
          primary_user: p.primary_user ?? "",
          roles_allowed: p.roles_allowed ?? [],
          entry_points: p.entry_points ?? [],
          primary_actions: p.primary_actions ?? [],
          secondary_actions: p.secondary_actions ?? [],
          states: p.states ?? [],
          data_reads: p.data_reads ?? [],
          data_writes: p.data_writes ?? [],
          backend_requirements: p.backend_requirements ?? [],
          integrations: p.integrations ?? [],
          qa_checks: p.qa_checks ?? [],
          open_questions: p.open_questions ?? [],
          priority: (["must", "should", "later"].includes(p.priority) ? p.priority : "should") as FramePagePriority,
        })),
        flows: parsed.flows ?? [],
        data_objects: parsed.data_objects ?? [],
        backend_requirements: parsed.backend_requirements ?? [],
        permissions: parsed.permissions ?? [],
        qa_gates: parsed.qa_gates ?? [],
        open_decisions: parsed.open_decisions ?? [],
      };

      const title = (parsed.title ?? `Frame · ${project.name ?? project.id}`).slice(0, 200);
      const summary = (parsed.summary ?? "").slice(0, 2000);

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("engine_project_frames")
        .insert({
          project_id: data.projectId,
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
      if (insErr) throw new Error(insErr.message ?? "Failed to save frame draft");

      await insertAuditEvent(sb, {
        projectId: data.projectId,
        userId: staff.userId,
        email: staff.email,
        eventType: "frame_generated",
      });
      await insertActivity(
        sb,
        data.projectId,
        "frame_generated",
        `Frame draft generated`,
        `${staff.email} generated a Frame Builder draft (${payload.pages.length} pages, ${payload.flows.length} flows).`,
      );

      return { ok: true, frame: inserted as FrameRow };
    },
  );

// --------------------- saveProjectFrameDraft ---------------------

const FramePayloadSchema: z.ZodType<FramePayload> = z
  .object({
    project_summary: z.string().default(""),
    frame_goal: z.string().default(""),
    roles: z.array(z.object({ id: z.string(), label: z.string(), description: z.string() })).default([]),
    pages: z.array(z.any()).default([]),
    flows: z.array(z.any()).default([]),
    data_objects: z.array(z.any()).default([]),
    backend_requirements: z.array(z.string()).default([]),
    permissions: z.array(z.any()).default([]),
    qa_gates: z.array(z.any()).default([]),
    open_decisions: z.array(z.any()).default([]),
  })
  .passthrough() as unknown as z.ZodType<FramePayload>;

export const saveProjectFrameDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: uuid,
        frameId: uuid.nullish(),
        title: z.string().trim().min(1).max(200),
        summary: z.string().trim().max(2000).nullish(),
        payload: FramePayloadSchema,
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ frame: FrameRow }> => {
    const staff = await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    await loadProject(sb, data.projectId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let row: FrameRow;
    if (data.frameId) {
      const existing = await loadFrame(sb, data.frameId);
      if (existing.project_id !== data.projectId) throw new Error("Project scope mismatch");
      if (existing.status !== "draft") {
        throw new Error(`Cannot edit frame in status ${existing.status}; create a new draft`);
      }
      const { data: upd, error } = await supabaseAdmin
        .from("engine_project_frames")
        .update({
          title: data.title,
          summary: data.summary ?? null,
          payload: data.payload,
          generated_by: existing.generated_by === "ai" ? "hybrid" : existing.generated_by,
        })
        .eq("id", data.frameId)
        .select("*")
        .single();
      if (error) throw new Error(error.message ?? "Failed to update frame draft");
      row = upd as FrameRow;
    } else {
      const { data: ins, error } = await supabaseAdmin
        .from("engine_project_frames")
        .insert({
          project_id: data.projectId,
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
      if (error) throw new Error(error.message ?? "Failed to create frame draft");
      row = ins as FrameRow;
    }

    await insertAuditEvent(sb, {
      projectId: data.projectId,
      userId: staff.userId,
      email: staff.email,
      eventType: data.frameId ? "frame_draft_updated" : "frame_draft_created",
    });
    await insertActivity(
      sb,
      data.projectId,
      data.frameId ? "frame_draft_updated" : "frame_draft_created",
      `Frame draft ${data.frameId ? "updated" : "created"}: ${row.title.slice(0, 80)}`,
      `${staff.email} ${data.frameId ? "updated" : "created"} a Frame Builder draft.`,
    );
    return { frame: row };
  });

// --------------------- submitProjectFrameToReview ---------------------

export const submitProjectFrameToReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid, frameId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<{ frame: FrameRow; reviewItemId: string }> => {
    const staff = await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    const project = await loadProject(sb, data.projectId);
    const frame = await loadFrame(sb, data.frameId);
    if (frame.project_id !== data.projectId) throw new Error("Project scope mismatch");
    if (frame.status !== "draft") {
      throw new Error(`Frame is in status ${frame.status}; only drafts can be submitted to review`);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: upd, error: updErr } = await supabaseAdmin
      .from("engine_project_frames")
      .update({ status: "in_review" })
      .eq("id", data.frameId)
      .select("*")
      .single();
    if (updErr) throw new Error(updErr.message ?? "Failed to submit frame to review");

    const { data: rev, error: revErr } = await supabaseAdmin
      .from("engine_review_items")
      .insert({
        project_id: data.projectId,
        project: project.name ?? project.id,
        item_type: "frame_set",
        title: `Review frame set: ${frame.title}`.slice(0, 240),
        impact: "high",
        source: "frame_builder",
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
      eventType: "frame_submitted_for_review",
    });
    await insertActivity(
      sb,
      data.projectId,
      "frame_submitted_for_review",
      `Frame submitted to review`,
      `${staff.email} submitted "${frame.title.slice(0, 80)}" to the review queue.`,
    );
    return { frame: upd as FrameRow, reviewItemId: (rev as { id: string }).id };
  });

// --------------------- approveProjectFrame ---------------------

export const approveProjectFrame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid, frameId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<{ frame: FrameRow }> => {
    const staff = await assertAdmin(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    await loadProject(sb, data.projectId);
    const frame = await loadFrame(sb, data.frameId);
    if (frame.project_id !== data.projectId) throw new Error("Project scope mismatch");
    if (frame.status !== "in_review") {
      throw new Error(`Frame must be in_review to approve; currently ${frame.status}`);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();
    const { data: upd, error } = await supabaseAdmin
      .from("engine_project_frames")
      .update({
        status: "approved",
        approved_by_email: staff.email,
        approved_by_user_id: staff.userId,
        approved_at: nowIso,
      })
      .eq("id", data.frameId)
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "Failed to approve frame");

    await insertAuditEvent(sb, {
      projectId: data.projectId,
      userId: staff.userId,
      email: staff.email,
      eventType: "frame_approved",
    });
    await insertActivity(
      sb,
      data.projectId,
      "frame_approved",
      `Frame approved`,
      `${staff.email} approved "${frame.title.slice(0, 80)}". Next best action: move to Mockup Builder.`,
    );
    return { frame: upd as FrameRow };
  });

// --------------------- archiveProjectFrame ---------------------

export const archiveProjectFrame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid, frameId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<{ frame: FrameRow }> => {
    const staff = await assertAdmin(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    await loadProject(sb, data.projectId);
    const frame = await loadFrame(sb, data.frameId);
    if (frame.project_id !== data.projectId) throw new Error("Project scope mismatch");
    if (frame.status === "archived") return { frame };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: upd, error } = await supabaseAdmin
      .from("engine_project_frames")
      .update({ status: "archived" })
      .eq("id", data.frameId)
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "Failed to archive frame");

    await insertAuditEvent(sb, {
      projectId: data.projectId,
      userId: staff.userId,
      email: staff.email,
      eventType: "frame_archived",
    });
    await insertActivity(
      sb,
      data.projectId,
      "frame_archived",
      `Frame archived`,
      `${staff.email} archived "${frame.title.slice(0, 80)}".`,
    );
    return { frame: upd as FrameRow };
  });

// --------------------- utils ---------------------

function cryptoRandom(): string {
  return Math.random().toString(36).slice(2, 10);
}
