// Build Execution / OpenClaw Handoff v1 — server functions.
//
// Staff-only (operator/admin). Mirrors Implementation Plan v1: all mutations
// flow through supabaseAdmin (RLS blocks direct writes). Every mutation
// writes an audit event + engine_activity row, verifies project scope, and
// refuses invalid state transitions (DB trigger also enforces).
//
// This layer PACKAGES the approved implementation plan into controlled
// build packets. It never:
//   - runs shell commands
//   - calls OpenClaw or Lovable automatically
//   - applies migrations
//   - deploys code
//   - marks QA tests passed
//   - marks the project delivered
//   - mutates approved upstream payloads (implementation / QA / backend /
//     mockup / frame / roadmap / portal / investment)

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import { getProjectSpine, type ProjectSpinePayload } from "@/lib/engine.functions";
import type { BackendPlanRow } from "@/lib/engine-backend-builder.functions";
import type { MockupRow } from "@/lib/engine-mockup-builder.functions";
import type { FrameRow } from "@/lib/engine-frame-builder.functions";
import type { QaPlanRow } from "@/lib/engine-qa-factory.functions";
import type { ImplPlanRow } from "@/lib/engine-implementation-plan.functions";
import {
  assessBuildExecutionReadiness,
  buildBuildExecutionPrompt,
  type BuildExecutionInputBundle,
  type MissingBuildExecutionInput,
} from "@/lib/engine-build-execution-prompt.server";
import type { Json } from "@/lib/engine-workspace";

const uuid = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "Invalid UUID",
  );

// ------------------------- types -------------------------

export type BuildPacketStatus =
  | "draft"
  | "ready"
  | "handed_off"
  | "in_progress"
  | "returned"
  | "qa_required"
  | "accepted"
  | "rejected"
  | "archived";

export type BuildPacketType = "lovable" | "openclaw" | "developer" | "qa" | "mixed";
export type BuildPacketPriority = "p0" | "p1" | "p2";
export type BuildTargetBuilder = "Lovable" | "OpenClaw" | "Developer" | "QA";
export type BuildEvidenceType =
  | "screenshot"
  | "log"
  | "diff_summary"
  | "qa_report"
  | "link"
  | "note"
  | "artifact";

export type BuildPacketPayload = {
  packet_goal: string;
  source_implementation_steps: string[];
  target_builder: BuildTargetBuilder;
  execution_scope: {
    included: string[];
    excluded: string[];
    expected_files_or_surfaces: string[];
    do_not_touch: string[];
  };
  handoff_prompt: string;
  context_summary: string;
  implementation_steps: string[];
  acceptance_criteria: string[];
  qa_requirements: string[];
  evidence_required: string[];
  risk_notes: string[];
  rollback_notes: string[];
  dependencies: string[];
  blocking_conditions: string[];
  post_execution_checks: string[];
  open_decisions: string[];
};

export type BuildPacketRow = {
  id: string;
  project_id: string;
  implementation_plan_id: string;
  title: string;
  summary: string | null;
  status: BuildPacketStatus;
  packet_type: BuildPacketType;
  sequence_number: number;
  priority: BuildPacketPriority;
  payload: BuildPacketPayload;
  created_by_user_id: string | null;
  created_by_email: string | null;
  assigned_to: string | null;
  handed_off_at: string | null;
  accepted_by_user_id: string | null;
  accepted_by_email: string | null;
  accepted_at: string | null;
  rejected_reason: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};



export type BuildEvidenceRow = {
  id: string;
  project_id: string;
  build_packet_id: string;
  evidence_type: BuildEvidenceType;
  title: string;
  summary: string | null;
  payload: Json;
  created_by_user_id: string | null;
  created_by_email: string | null;
  created_at: string;
};

// ------------------------- helpers -------------------------

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
  severity: "info" | "warn" | "error" = "info",
) {
  try {
    await sb
      .from("engine_activity")
      .insert({ project_id: projectId, kind, title, body, severity });
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

async function loadLatestApprovedImplementationPlan(
  sb: Sb,
  projectId: string,
): Promise<ImplPlanRow | null> {
  const { data } = await sb
    .from("engine_project_implementation_plans")
    .select("*")
    .eq("project_id", projectId)
    .eq("status", "approved")
    .order("approved_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ImplPlanRow | null) ?? null;
}

async function loadPacket(sb: Sb, packetId: string): Promise<BuildPacketRow> {
  const { data, error } = await sb
    .from("engine_project_build_packets")
    .select("*")
    .eq("id", packetId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load build packet");
  if (!data) throw new Error("Build packet not found");
  return data as BuildPacketRow;
}

// ------------------------- getProjectBuildExecution -------------------------

export type BuildExecutionState = {
  project: {
    id: string;
    name: string;
    client_company: string;
    status: string;
    current_step: string;
  };
  approved_implementation_plan: {
    id: string;
    title: string;
    approved_at: string | null;
    phase_count: number;
    build_step_count: number;
    p0_count: number;
    high_risk_count: number;
  } | null;
  packets: BuildPacketRow[];
  packet_counts: Record<BuildPacketStatus, number>;
  evidence_counts: Record<string, number>;
  next_packet: BuildPacketRow | null;
  next_best_action: { action: string; reason: string; href: string | null; severity: string } | null;
  readiness: { ready: boolean; missing: MissingBuildExecutionInput[] };
  capabilities: {
    isStaff: boolean;
    isAdmin: boolean;
    canGenerate: boolean;
    canMarkReady: boolean;
    canHandoff: boolean;
    canMarkInProgress: boolean;
    canMarkReturned: boolean;
    canMarkQaRequired: boolean;
    canAccept: boolean;
    canReject: boolean;
    canArchive: boolean;
    canAddEvidence: boolean;
  };
};

export const getProjectBuildExecution = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<BuildExecutionState> => {
    const staff = await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;

    const project = await loadProject(sb, data.projectId);
    const approvedImpl = await loadLatestApprovedImplementationPlan(sb, data.projectId);

    const { data: pktRows, error: pktErr } = await sb
      .from("engine_project_build_packets")
      .select("*")
      .eq("project_id", data.projectId)
      .order("sequence_number", { ascending: true })
      .order("created_at", { ascending: true });
    if (pktErr) throw new Error(pktErr.message ?? "Failed to load build packets");
    const packets = (pktRows ?? []) as BuildPacketRow[];

    const packet_counts: Record<BuildPacketStatus, number> = {
      draft: 0,
      ready: 0,
      handed_off: 0,
      in_progress: 0,
      returned: 0,
      qa_required: 0,
      accepted: 0,
      rejected: 0,
      archived: 0,
    };
    for (const p of packets) packet_counts[p.status]++;

    const { data: evRows } = await sb
      .from("engine_project_build_evidence")
      .select("build_packet_id")
      .eq("project_id", data.projectId);
    const evidence_counts: Record<string, number> = {};
    for (const r of (evRows ?? []) as Array<{ build_packet_id: string }>) {
      evidence_counts[r.build_packet_id] = (evidence_counts[r.build_packet_id] ?? 0) + 1;
    }

    // Next packet: highest-priority packet in ready → returned → in_progress order
    const priorityOrder: BuildPacketPriority[] = ["p0", "p1", "p2"];
    const readyLike = packets.filter((p) =>
      ["ready", "returned", "in_progress"].includes(p.status),
    );
    readyLike.sort((a, b) => {
      const pa = priorityOrder.indexOf(a.priority);
      const pb = priorityOrder.indexOf(b.priority);
      if (pa !== pb) return pa - pb;
      return a.sequence_number - b.sequence_number;
    });
    const next_packet = readyLike[0] ?? null;

    let next_best_action:
      | { action: string; reason: string; href: string | null; severity: string }
      | null = null;
    try {
      const { data: rows } = await sb.rpc("compute_engine_next_best_action", {
        _project_id: data.projectId,
      });
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row) {
        next_best_action = {
          action: (row.action as string) ?? "",
          reason: (row.reason as string) ?? "",
          href: (row.href as string | null) ?? null,
          severity: (row.severity as string) ?? "info",
        };
      }
    } catch {
      /* best-effort */
    }

    const missing = assessBuildExecutionReadiness({
      approved_implementation_plan: approvedImpl,
    });

    const impl = approvedImpl?.payload;
    const p0 = impl?.build_steps?.filter((s) => s.priority === "p0").length ?? 0;
    const highRisk = impl?.build_steps?.filter((s) => s.risk_level === "high").length ?? 0;

    return {
      project: {
        id: project.id,
        name: project.name ?? "",
        client_company: project.engine_clients?.company ?? "—",
        status: project.status,
        current_step: project.current_step,
      },
      approved_implementation_plan: approvedImpl
        ? {
            id: approvedImpl.id,
            title: approvedImpl.title,
            approved_at: approvedImpl.approved_at,
            phase_count: impl?.phases?.length ?? 0,
            build_step_count: impl?.build_steps?.length ?? 0,
            p0_count: p0,
            high_risk_count: highRisk,
          }
        : null,
      packets,
      packet_counts,
      evidence_counts,
      next_packet,
      next_best_action,
      readiness: { ready: missing.length === 0, missing },
      capabilities: {
        isStaff: true,
        isAdmin: staff.isAdmin,
        canGenerate: missing.length === 0,
        canMarkReady: true,
        canHandoff: true,
        canMarkInProgress: true,
        canMarkReturned: true,
        canMarkQaRequired: true,
        canAccept: staff.isAdmin || staff.isOperator,
        canReject: staff.isAdmin || staff.isOperator,
        canArchive: staff.isAdmin,
        canAddEvidence: true,
      },
    };
  });

// ------------------------- generateBuildPackets -------------------------

async function gatherBuildBundle(
  sb: Sb,
  project: Awaited<ReturnType<typeof loadProject>>,
  approvedImpl: ImplPlanRow,
): Promise<BuildExecutionInputBundle> {
  const [
    { data: backendRow },
    { data: qaRow },
    { data: mockupRow },
    { data: frameRow },
    { data: artRows },
    { data: msRows },
  ] = await Promise.all([
    sb
      .from("engine_project_backend_plans")
      .select("*")
      .eq("id", approvedImpl.backend_plan_id)
      .maybeSingle(),
    sb
      .from("engine_project_qa_plans")
      .select("*")
      .eq("id", approvedImpl.qa_plan_id)
      .maybeSingle(),
    approvedImpl.mockup_id
      ? sb
          .from("engine_project_mockups")
          .select("*")
          .eq("id", approvedImpl.mockup_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    approvedImpl.frame_id
      ? sb
          .from("engine_project_frames")
          .select("*")
          .eq("id", approvedImpl.frame_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    sb
      .from("engine_project_artifacts")
      .select("artifact_type,title,summary")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false })
      .limit(20),
    sb
      .from("engine_milestones")
      .select("id,name,phase")
      .eq("project_id", project.id)
      .order("sort_index", { ascending: true, nullsFirst: false })
      .limit(30),
  ]);

  const milestones: BuildExecutionInputBundle["milestones"] = [];
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
    approved_implementation_plan: approvedImpl,
    approved_backend_plan: (backendRow as BackendPlanRow | null) ?? null,
    approved_qa_plan: (qaRow as QaPlanRow | null) ?? null,
    approved_mockup: (mockupRow as MockupRow | null) ?? null,
    approved_frame: (frameRow as FrameRow | null) ?? null,
    milestones,
    artifacts: (artRows ?? []) as BuildExecutionInputBundle["artifacts"],
  };
}

const PACKET_TYPES = new Set<BuildPacketType>([
  "lovable",
  "openclaw",
  "developer",
  "qa",
  "mixed",
]);
const PRIORITIES = new Set<BuildPacketPriority>(["p0", "p1", "p2"]);
const TARGET_BUILDERS = new Set<BuildTargetBuilder>([
  "Lovable",
  "OpenClaw",
  "Developer",
  "QA",
]);

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x ?? "")).filter(Boolean) : [];
}

const REQUIRED_DO_NOT_TOUCH: string[] = [
  "approved implementation plan payload",
  "approved backend plan payload",
  "approved QA plan payload",
  "roadmap approvals",
  "client_portal_* tables",
  "investment terms",
  "engine_projects.status = delivered flag",
];

const SAFETY_SUFFIX = `

---
SAFETY:
- DO NOT deploy code.
- DO NOT mark QA tests passed.
- DO NOT mark the project delivered.
- DO NOT modify approved upstream payloads.`;

function normalizePacketPayload(raw: unknown): BuildPacketPayload {
  const r = (raw ?? {}) as Record<string, unknown>;
  const scopeRaw = (r.execution_scope ?? {}) as Record<string, unknown>;
  const target = TARGET_BUILDERS.has(r.target_builder as BuildTargetBuilder)
    ? (r.target_builder as BuildTargetBuilder)
    : "Developer";
  const doNotTouch = strList(scopeRaw.do_not_touch);
  for (const rule of REQUIRED_DO_NOT_TOUCH) {
    if (!doNotTouch.some((d) => d.toLowerCase().includes(rule.toLowerCase()))) {
      doNotTouch.push(rule);
    }
  }
  const handoffPromptRaw = String(r.handoff_prompt ?? "").trim();
  const handoffPrompt = handoffPromptRaw.includes("DO NOT deploy code")
    ? handoffPromptRaw
    : `${handoffPromptRaw}${SAFETY_SUFFIX}`;
  return {
    packet_goal: String(r.packet_goal ?? "").trim(),
    source_implementation_steps: strList(r.source_implementation_steps),
    target_builder: target,
    execution_scope: {
      included: strList(scopeRaw.included),
      excluded: strList(scopeRaw.excluded),
      expected_files_or_surfaces: strList(scopeRaw.expected_files_or_surfaces),
      do_not_touch: doNotTouch,
    },
    handoff_prompt: handoffPrompt,
    context_summary: String(r.context_summary ?? "").trim(),
    implementation_steps: strList(r.implementation_steps),
    acceptance_criteria: strList(r.acceptance_criteria),
    qa_requirements: strList(r.qa_requirements),
    evidence_required: strList(r.evidence_required),
    risk_notes: strList(r.risk_notes),
    rollback_notes: strList(r.rollback_notes),
    dependencies: strList(r.dependencies),
    blocking_conditions: strList(r.blocking_conditions),
    post_execution_checks: strList(r.post_execution_checks),
    open_decisions: strList(r.open_decisions),
  };
}

type NormalizedPacket = {
  title: string;
  summary: string;
  packet_type: BuildPacketType;
  sequence_number: number;
  priority: BuildPacketPriority;
  payload: BuildPacketPayload;
};

function normalizeAiPackets(raw: unknown): NormalizedPacket[] {
  const list = Array.isArray((raw as { packets?: unknown })?.packets)
    ? ((raw as { packets: unknown[] }).packets as unknown[])
    : Array.isArray(raw)
      ? (raw as unknown[])
      : [];
  return list.map((p, i) => {
    const pp = (p ?? {}) as Record<string, unknown>;
    const packet_type = PACKET_TYPES.has(pp.packet_type as BuildPacketType)
      ? (pp.packet_type as BuildPacketType)
      : "developer";
    const priority = PRIORITIES.has(pp.priority as BuildPacketPriority)
      ? (pp.priority as BuildPacketPriority)
      : "p2";
    const seq =
      typeof pp.sequence_number === "number" ? pp.sequence_number : i + 1;
    return {
      title: String(pp.title ?? `Build packet ${i + 1}`).slice(0, 200),
      summary: String(pp.summary ?? "").slice(0, 2000),
      packet_type,
      sequence_number: seq,
      priority,
      payload: normalizePacketPayload(pp.payload),
    };
  });
}

export const generateBuildPackets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid }).parse(raw))
  .handler(
    async ({
      context,
      data,
    }): Promise<{
      ok: boolean;
      packets?: BuildPacketRow[];
      missing_inputs?: MissingBuildExecutionInput[];
      message?: string;
    }> => {
      const staff = await assertStaff(context as unknown as StaffContext);
      const sb = (context as unknown as StaffContext).supabase;

      const project = await loadProject(sb, data.projectId);
      const approvedImpl = await loadLatestApprovedImplementationPlan(sb, data.projectId);
      const missing = assessBuildExecutionReadiness({
        approved_implementation_plan: approvedImpl,
      });
      if (missing.length || !approvedImpl) {
        await insertAuditEvent(sb, {
          projectId: data.projectId,
          userId: staff.userId,
          email: staff.email,
          eventType: "build_execution_generation_refused",
          success: false,
          errorCode: "missing_inputs",
        });
        return {
          ok: false,
          missing_inputs: missing,
          message: "Approve an implementation plan before generating build packets.",
        };
      }

      let spine: ProjectSpinePayload | null = null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        spine = (await (getProjectSpine as any)({
          data: { id: data.projectId },
        })) as ProjectSpinePayload;
      } catch {
        spine = null;
      }

      const bundle = await gatherBuildBundle(sb, project, approvedImpl);
      const { system, user } = buildBuildExecutionPrompt(bundle, spine);

      const { callLovableAi, parseJsonOutput } = await import("@/lib/engine-ai.server");
      const ai = await callLovableAi(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        { json: true, temperature: 0.2 },
      );

      const parsed = parseJsonOutput<unknown>(ai.text);
      if (!parsed) {
        await insertAuditEvent(sb, {
          projectId: data.projectId,
          userId: staff.userId,
          email: staff.email,
          eventType: "build_execution_generation_failed",
          success: false,
          errorCode: "invalid_json",
        });
        throw new Error("AI returned invalid JSON for the build packets.");
      }

      const packets = normalizeAiPackets(parsed);
      if (packets.length === 0) {
        await insertAuditEvent(sb, {
          projectId: data.projectId,
          userId: staff.userId,
          email: staff.email,
          eventType: "build_execution_generation_failed",
          success: false,
          errorCode: "no_packets",
        });
        throw new Error("Build execution generation produced no packets.");
      }

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const rows = packets.map((p) => ({
        project_id: data.projectId,
        implementation_plan_id: approvedImpl.id,
        title: p.title,
        summary: p.summary || null,
        status: "draft" as BuildPacketStatus,
        packet_type: p.packet_type,
        sequence_number: p.sequence_number,
        priority: p.priority,
        payload: p.payload,
        created_by_email: staff.email,
        created_by_user_id: staff.userId,
      }));
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("engine_project_build_packets")
        .insert(rows)
        .select("*");
      if (insErr) throw new Error(insErr.message ?? "Failed to insert build packets");

      await insertAuditEvent(sb, {
        projectId: data.projectId,
        userId: staff.userId,
        email: staff.email,
        eventType: "build_packets_generated",
      });
      await insertActivity(
        sb,
        data.projectId,
        "build_packets_generated",
        `Build packets generated (${packets.length})`,
        `${staff.email} generated ${packets.length} build packet(s) from approved implementation plan ${approvedImpl.id}.`,
      );

      return { ok: true, packets: inserted as BuildPacketRow[] };
    },
  );

// ------------------------- lifecycle transitions -------------------------

async function transitionPacket(
  ctx: StaffContext,
  args: {
    projectId: string;
    packetId: string;
    from: BuildPacketStatus[];
    to: BuildPacketStatus;
    extra?: Record<string, unknown>;
    eventType: string;
    activityTitle: string;
    activityBody: (staffEmail: string, packet: BuildPacketRow) => string;
    adminOnly?: boolean;
  },
): Promise<{ packet: BuildPacketRow }> {
  const staff = args.adminOnly
    ? await assertAdmin(ctx)
    : await assertStaff(ctx);
  const sb = ctx.supabase;
  await loadProject(sb, args.projectId);
  const packet = await loadPacket(sb, args.packetId);
  if (packet.project_id !== args.projectId) {
    throw new Error("Project scope mismatch");
  }
  if (!args.from.includes(packet.status)) {
    throw new Error(
      `Build packet is in status ${packet.status}; cannot transition to ${args.to}`,
    );
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: upd, error } = await supabaseAdmin
    .from("engine_project_build_packets")
    .update({ status: args.to, ...(args.extra ?? {}) })
    .eq("id", args.packetId)
    .select("*")
    .single();
  if (error) throw new Error(error.message ?? "Failed to update build packet");

  await insertAuditEvent(sb, {
    projectId: args.projectId,
    userId: staff.userId,
    email: staff.email,
    eventType: args.eventType,
  });
  await insertActivity(
    sb,
    args.projectId,
    args.eventType,
    args.activityTitle,
    args.activityBody(staff.email, upd as BuildPacketRow),
  );
  return { packet: upd as BuildPacketRow };
}

export const saveBuildPacketDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: uuid,
        packetId: uuid,
        title: z.string().trim().min(1).max(200),
        summary: z.string().trim().max(2000).nullish(),
        payload: z.any(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ packet: BuildPacketRow }> => {
    const staff = await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    await loadProject(sb, data.projectId);
    const existing = await loadPacket(sb, data.packetId);
    if (existing.project_id !== data.projectId)
      throw new Error("Project scope mismatch");
    if (!["draft", "returned", "ready"].includes(existing.status)) {
      throw new Error(
        `Cannot edit packet in status ${existing.status}; only draft/ready/returned are editable`,
      );
    }
    const sanitized = normalizePacketPayload(data.payload);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: upd, error } = await supabaseAdmin
      .from("engine_project_build_packets")
      .update({
        title: data.title,
        summary: data.summary ?? null,
        payload: sanitized,
      })
      .eq("id", data.packetId)
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "Failed to save packet");

    await insertAuditEvent(sb, {
      projectId: data.projectId,
      userId: staff.userId,
      email: staff.email,
      eventType: "build_packet_draft_saved",
    });
    await insertActivity(
      sb,
      data.projectId,
      "build_packet_draft_saved",
      `Build packet updated`,
      `${staff.email} updated build packet "${data.title.slice(0, 80)}".`,
    );
    return { packet: upd as BuildPacketRow };
  });

export const markBuildPacketReady = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: uuid, packetId: uuid }).parse(raw),
  )
  .handler(async ({ context, data }) =>
    transitionPacket(context as unknown as StaffContext, {
      projectId: data.projectId,
      packetId: data.packetId,
      from: ["draft", "returned", "rejected"],
      to: "ready",
      eventType: "build_packet_ready",
      activityTitle: "Build packet marked ready",
      activityBody: (email, packet) =>
        `${email} marked packet "${packet.title.slice(0, 80)}" ready for handoff.`,
    }),
  );

export const handoffBuildPacket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: uuid,
        packetId: uuid,
        assignedTo: z.string().trim().max(200).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) =>
    transitionPacket(context as unknown as StaffContext, {
      projectId: data.projectId,
      packetId: data.packetId,
      from: ["ready"],
      to: "handed_off",
      extra: {
        handed_off_at: new Date().toISOString(),
        assigned_to: data.assignedTo ?? null,
      },
      eventType: "build_packet_handed_off",
      activityTitle: "Build packet handed off",
      activityBody: (email, packet) =>
        `${email} handed off packet "${packet.title.slice(0, 80)}" to ${packet.payload?.target_builder ?? packet.packet_type}${data.assignedTo ? ` (${data.assignedTo})` : ""}.`,
    }),
  );

export const markBuildPacketInProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: uuid, packetId: uuid }).parse(raw),
  )
  .handler(async ({ context, data }) =>
    transitionPacket(context as unknown as StaffContext, {
      projectId: data.projectId,
      packetId: data.packetId,
      from: ["handed_off", "returned", "qa_required"],
      to: "in_progress",
      eventType: "build_packet_in_progress",
      activityTitle: "Build packet in progress",
      activityBody: (email, packet) =>
        `${email} marked packet "${packet.title.slice(0, 80)}" in progress.`,
    }),
  );

export const markBuildPacketReturned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: uuid,
        packetId: uuid,
        note: z.string().trim().max(4000).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const res = await transitionPacket(context as unknown as StaffContext, {
      projectId: data.projectId,
      packetId: data.packetId,
      from: ["handed_off", "in_progress"],
      to: "returned",
      eventType: "build_packet_returned",
      activityTitle: "Build packet returned",
      activityBody: (email, packet) =>
        `${email} marked packet "${packet.title.slice(0, 80)}" returned${data.note ? ` — ${data.note.slice(0, 200)}` : ""}.`,
    });
    if (data.note) {
      const staff = await assertStaff(context as unknown as StaffContext);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("engine_project_build_evidence").insert({
        project_id: data.projectId,
        build_packet_id: data.packetId,
        evidence_type: "note",
        title: "Return note",
        summary: data.note.slice(0, 2000),
        payload: { source: "return" },
        created_by_email: staff.email,
        created_by_user_id: staff.userId,
      });
    }
    return res;
  });

export const markBuildPacketQaRequired = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: uuid, packetId: uuid }).parse(raw),
  )
  .handler(async ({ context, data }) =>
    transitionPacket(context as unknown as StaffContext, {
      projectId: data.projectId,
      packetId: data.packetId,
      from: ["in_progress", "returned"],
      to: "qa_required",
      eventType: "build_packet_qa_required",
      activityTitle: "Build packet needs QA",
      activityBody: (email, packet) =>
        `${email} marked packet "${packet.title.slice(0, 80)}" as needing QA.`,
    }),
  );

export const acceptBuildPacket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: uuid,
        packetId: uuid,
        evidenceAck: z.string().trim().max(500).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const staff = await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    const packet = await loadPacket(sb, data.packetId);
    if (packet.project_id !== data.projectId)
      throw new Error("Project scope mismatch");
    if (packet.status !== "qa_required") {
      throw new Error(
        `Only packets in qa_required can be accepted; currently ${packet.status}`,
      );
    }
    const { data: evRows } = await sb
      .from("engine_project_build_evidence")
      .select("id")
      .eq("build_packet_id", data.packetId)
      .limit(1);
    const hasEvidence = (evRows ?? []).length > 0;
    if (!hasEvidence && !data.evidenceAck) {
      throw new Error(
        "This packet has no evidence yet. Add evidence or provide an evidenceAck note explaining why acceptance is proceeding without evidence.",
      );
    }
    return transitionPacket(context as unknown as StaffContext, {
      projectId: data.projectId,
      packetId: data.packetId,
      from: ["qa_required"],
      to: "accepted",
      extra: {
        accepted_at: new Date().toISOString(),
        accepted_by_email: staff.email,
        accepted_by_user_id: staff.userId,
      },
      eventType: "build_packet_accepted",
      activityTitle: "Build packet accepted",
      activityBody: (email, p) =>
        `${email} accepted packet "${p.title.slice(0, 80)}"${data.evidenceAck ? ` — ack: ${data.evidenceAck.slice(0, 160)}` : ""}. Project is NOT marked delivered.`,
    });
  });

export const rejectBuildPacket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: uuid,
        packetId: uuid,
        reason: z.string().trim().min(3).max(2000),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) =>
    transitionPacket(context as unknown as StaffContext, {
      projectId: data.projectId,
      packetId: data.packetId,
      from: ["qa_required"],
      to: "rejected",
      extra: { rejected_reason: data.reason },
      eventType: "build_packet_rejected",
      activityTitle: "Build packet rejected",
      activityBody: (email, packet) =>
        `${email} rejected packet "${packet.title.slice(0, 80)}" — ${data.reason.slice(0, 200)}`,
    }),
  );

export const archiveBuildPacket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: uuid, packetId: uuid }).parse(raw),
  )
  .handler(async ({ context, data }) =>
    transitionPacket(context as unknown as StaffContext, {
      projectId: data.projectId,
      packetId: data.packetId,
      from: [
        "draft",
        "ready",
        "handed_off",
        "in_progress",
        "returned",
        "qa_required",
        "accepted",
        "rejected",
      ],
      to: "archived",
      extra: { archived_at: new Date().toISOString() },
      eventType: "build_packet_archived",
      activityTitle: "Build packet archived",
      activityBody: (email, packet) =>
        `${email} archived packet "${packet.title.slice(0, 80)}".`,
      adminOnly: true,
    }),
  );

// ------------------------- addBuildEvidence -------------------------

export const addBuildEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: uuid,
        packetId: uuid,
        evidenceType: z.enum([
          "screenshot",
          "log",
          "diff_summary",
          "qa_report",
          "link",
          "note",
          "artifact",
        ]),
        title: z.string().trim().min(1).max(200),
        summary: z.string().trim().max(4000).nullish(),
        payload: z.record(z.string(), z.any()).default({}),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ evidence: BuildEvidenceRow }> => {
    const staff = await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    await loadProject(sb, data.projectId);
    const packet = await loadPacket(sb, data.packetId);
    if (packet.project_id !== data.projectId)
      throw new Error("Project scope mismatch");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ev, error } = await supabaseAdmin
      .from("engine_project_build_evidence")
      .insert({
        project_id: data.projectId,
        build_packet_id: data.packetId,
        evidence_type: data.evidenceType,
        title: data.title,
        summary: data.summary ?? null,
        payload: data.payload ?? {},
        created_by_email: staff.email,
        created_by_user_id: staff.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "Failed to add evidence");

    await insertAuditEvent(sb, {
      projectId: data.projectId,
      userId: staff.userId,
      email: staff.email,
      eventType: "build_packet_evidence_added",
    });
    await insertActivity(
      sb,
      data.projectId,
      "build_packet_evidence_added",
      `Build packet evidence added`,
      `${staff.email} added ${data.evidenceType} evidence to packet "${packet.title.slice(0, 80)}".`,
    );
    return { evidence: ev as BuildEvidenceRow };
  });

// ------------------------- listPacketEvidence -------------------------

export const listPacketEvidence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: uuid, packetId: uuid }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ evidence: BuildEvidenceRow[] }> => {
    await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    const packet = await loadPacket(sb, data.packetId);
    if (packet.project_id !== data.projectId)
      throw new Error("Project scope mismatch");
    const { data: rows, error } = await sb
      .from("engine_project_build_evidence")
      .select("*")
      .eq("build_packet_id", data.packetId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message ?? "Failed to load evidence");
    return { evidence: (rows ?? []) as BuildEvidenceRow[] };
  });
