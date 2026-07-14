/* eslint-disable @typescript-eslint/no-explicit-any */
// Milestone → Engine Promotion (closes M12)
//
// Turns a completed operational milestone into a business engine only after
// required governance approvals. No engine ever becomes active until:
//
//   1. proposeEnginePromotion() creates a DRAFT engine_business_engines row
//      linked to the source milestone, plus an engine_review_items entry and
//      audit trail. Nothing running yet.
//   2. approveEnginePromotion() activates via activate_business_engine() RPC.
//      The activator's email is enforced ≠ proposer email (no self-approval),
//      and the existing engine_business_engines_no_self_approve trigger
//      double-checks at the DB layer.
//
// Eligibility:
//   - milestone.approval_status = 'approved'
//   - milestone.status IN ('complete','completed','delivered')
//   - milestone.phase mentions operate/ongoing/live OR metadata explicitly
//     flags operational
//   - No existing engine_business_engines row with milestone_id = this
//
// No schema changes. All state uses existing engine_* tables.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail, isAdminEmail, isOperatorEmail } from "@/lib/ops/access";

type Sb = any;
type Ctx = { claims?: Record<string, unknown>; supabase: Sb };

async function assertStaff(ctx: Ctx) {
  const email = ((ctx.claims?.email as string | undefined) ?? "").toLowerCase();
  if (isOperatorEmail(email) || isAdminEmail(email)) return;
  const ok = await hasRoleForEmail(ctx.supabase, email, "admin");
  if (!ok) throw new Error("Forbidden: engine staff role required");
}

// -------------------------------------------------------
// Types
// -------------------------------------------------------

export type PromotionCandidate = {
  milestoneId: string;
  milestoneName: string;
  projectId: string;
  projectName: string;
  phase: string | null;
  status: string;
  approvedAt: string | null;
  approvedBy: string | null;
  alreadyPromoted: boolean;
  existingEngineId: string | null;
  existingEngineStatus: string | null;
  reason: string;
};

export type PromotionReport = {
  generatedAt: string;
  candidates: PromotionCandidate[];
};

// -------------------------------------------------------
// List candidates
// -------------------------------------------------------

function looksOperational(phase: string | null): boolean {
  if (!phase) return false;
  const p = phase.toLowerCase();
  return (
    p.includes("operate") ||
    p.includes("ongoing") ||
    p.includes("run") ||
    p.includes("live") ||
    p.includes("scale") ||
    p.includes("optimize") ||
    p.includes("launch")
  );
}

export const listPromotionCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as Ctx);
    const supabase = (context as Ctx).supabase;

    const { data: milestones, error: mErr } = await supabase
      .from("engine_milestones")
      .select(
        "id, name, project_id, phase, status, approval_status, approved_at, approved_by_email",
      )
      .eq("approval_status", "approved")
      .in("status", ["complete", "completed", "delivered"])
      .order("approved_at", { ascending: false })
      .limit(200);
    if (mErr) throw new Error(mErr.message);

    const eligible = (milestones ?? []).filter((m: any) => looksOperational(m.phase));
    if (eligible.length === 0) {
      return { generatedAt: new Date().toISOString(), candidates: [] } as PromotionReport;
    }

    const milestoneIds = eligible.map((m: any) => m.id);
    const projectIds = Array.from(new Set(eligible.map((m: any) => m.project_id)));

    const [{ data: projects }, { data: engines }] = await Promise.all([
      supabase.from("engine_projects").select("id, company_name").in("id", projectIds),
      supabase
        .from("engine_business_engines")
        .select("id, milestone_id, status")
        .in("milestone_id", milestoneIds),
    ]);

    const projectMap = new Map<string, string>();
    for (const p of projects ?? []) projectMap.set(p.id, p.company_name ?? "Unnamed project");
    const engineByMilestone = new Map<string, { id: string; status: string }>();
    for (const e of engines ?? [])
      if (e.milestone_id) engineByMilestone.set(e.milestone_id, { id: e.id, status: e.status });

    const candidates: PromotionCandidate[] = eligible.map((m: any) => {
      const existing = engineByMilestone.get(m.id) ?? null;
      const already = !!existing;
      return {
        milestoneId: m.id,
        milestoneName: m.name,
        projectId: m.project_id,
        projectName: projectMap.get(m.project_id) ?? "Unnamed project",
        phase: m.phase,
        status: m.status,
        approvedAt: m.approved_at,
        approvedBy: m.approved_by_email,
        alreadyPromoted: already,
        existingEngineId: existing?.id ?? null,
        existingEngineStatus: existing?.status ?? null,
        reason: already
          ? `Already promoted to engine (${existing?.status}).`
          : "Operational milestone approved & complete. Eligible for engine promotion.",
      };
    });

    candidates.sort((a, b) => Number(a.alreadyPromoted) - Number(b.alreadyPromoted));
    return { generatedAt: new Date().toISOString(), candidates } as PromotionReport;
  });

// -------------------------------------------------------
// Propose promotion (draft engine + review item + audit)
// -------------------------------------------------------

const ProposeSchema = z.object({
  milestoneId: z.string().uuid(),
  engineKind: z
    .enum(["intake", "delivery", "learning", "sales", "ops", "reporting", "custom"])
    .default("ops"),
  cadence: z
    .enum(["daily", "weekly", "biweekly", "monthly", "quarterly", "ad_hoc"])
    .default("weekly"),
  ownerEmail: z.string().email().optional().nullable(),
  outcome: z.string().min(4).max(400).optional(),
});

export const proposeEnginePromotion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ProposeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const supabase = (context as Ctx).supabase;
    const email = ((context as Ctx).claims?.email as string | undefined) ?? "system";

    const { data: milestone, error: mErr } = await supabase
      .from("engine_milestones")
      .select(
        "id, name, project_id, phase, status, approval_status, brief_md, acceptance_criteria",
      )
      .eq("id", data.milestoneId)
      .single();
    if (mErr) throw new Error(mErr.message);
    if (!milestone) throw new Error("Milestone not found");
    if (milestone.approval_status !== "approved") {
      throw new Error("Milestone must be approved before promotion.");
    }
    if (!["complete", "completed", "delivered"].includes(milestone.status)) {
      throw new Error("Milestone must be complete or delivered before promotion.");
    }
    if (!looksOperational(milestone.phase)) {
      throw new Error("Milestone is not operational — promotion not applicable.");
    }

    // Duplicate check
    const { data: existing } = await supabase
      .from("engine_business_engines")
      .select("id, status")
      .eq("milestone_id", milestone.id)
      .maybeSingle();
    if (existing) {
      throw new Error(`Milestone already promoted (engine ${existing.id}, status ${existing.status}).`);
    }

    const outcome =
      data.outcome ??
      `Operate the "${milestone.name}" capability delivered by this milestone as an ongoing engine.`;

    const workflow = Array.isArray(milestone.acceptance_criteria)
      ? (milestone.acceptance_criteria as any[]).slice(0, 20).map((ac, i) => ({
          type: "step",
          index: i,
          label: typeof ac === "string" ? ac : (ac.label ?? ac.title ?? `Step ${i + 1}`),
          source: "milestone_acceptance_criterion",
        }))
      : [];

    const { data: engine, error: eErr } = await supabase
      .from("engine_business_engines")
      .insert({
        project_id: milestone.project_id,
        milestone_id: milestone.id,
        kind: data.engineKind,
        name: milestone.name,
        outcome,
        cadence: data.cadence,
        owner_email: data.ownerEmail ?? null,
        workflow,
        triggers: { source_milestone: milestone.id, phase: milestone.phase },
        approval_rules: { requires_separate_approver: true },
        metrics: [],
        exception_rules: [],
        status: "draft",
        created_by: email,
        metadata: {
          promoted_from_milestone: true,
          promoted_by: email,
          source_brief: milestone.brief_md ?? null,
        },
      })
      .select("id")
      .single();
    if (eErr) throw new Error(eErr.message);

    const { data: reviewItem, error: rErr } = await supabase
      .from("engine_review_items")
      .insert({
        project_id: milestone.project_id,
        project: milestone.name,
        item_type: "engine_promotion",
        title: `Promote milestone → engine: ${milestone.name}`,
        impact: "high",
        source: "milestone_promotion",
        requested_by: email,
        status: "pending",
      })
      .select("id")
      .single();
    if (rErr) throw new Error(rErr.message);

    await supabase.from("engine_audit_log").insert({
      project_id: milestone.project_id,
      actor_email: email,
      action: "engine.promotion.proposed",
      summary: `Milestone "${milestone.name}" proposed for engine promotion`,
      target_id: engine.id,
      affected_modules: ["milestones", "business_engines"],
      metadata: {
        milestone_id: milestone.id,
        engine_id: engine.id,
        review_item_id: reviewItem.id,
        cadence: data.cadence,
        engine_kind: data.engineKind,
      },
    });

    await supabase.from("engine_activity").insert({
      project_id: milestone.project_id,
      kind: "engine.promotion.proposed",
      title: `Engine promotion pending: ${milestone.name}`,
      body: `Milestone completed and proposed for promotion to a ${data.cadence} ${data.engineKind} engine. Awaiting separate-approver activation.`,
      severity: "info",
    });

    return {
      engineId: engine.id as string,
      reviewItemId: reviewItem.id as string,
    };
  });

// -------------------------------------------------------
// Approve promotion → activate engine (separate-approver required)
// -------------------------------------------------------

const ApproveSchema = z.object({
  engineId: z.string().uuid(),
  reviewItemId: z.string().uuid(),
  ownerEmail: z.string().email(),
  approverEmail: z.string().email(),
});

export const approveEnginePromotion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ApproveSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const supabase = (context as Ctx).supabase;
    const approver = data.approverEmail.toLowerCase();
    const callerEmail = ((context as Ctx).claims?.email as string | undefined)?.toLowerCase() ?? "";
    if (approver !== callerEmail) {
      throw new Error("Approver email must match the signed-in user.");
    }

    const { data: engine, error: eErr } = await supabase
      .from("engine_business_engines")
      .select("id, name, project_id, milestone_id, created_by, status")
      .eq("id", data.engineId)
      .single();
    if (eErr) throw new Error(eErr.message);
    if (!engine) throw new Error("Engine not found");
    if (engine.status === "active") {
      throw new Error("Engine already active.");
    }
    if (!engine.milestone_id) {
      throw new Error("Engine is not linked to a milestone — not a promotion flow.");
    }
    const creator = (engine.created_by ?? "").toLowerCase();
    if (creator && creator === approver) {
      throw new Error("Self-approval forbidden: promoter cannot activate their own engine.");
    }

    // activate_business_engine RPC records approved_by/at + flips status to active
    // and is gated by engine_business_engines_no_self_approve at the DB layer.
    const { error: actErr } = await supabase.rpc("activate_business_engine", {
      _engine_id: data.engineId,
      _owner_email: data.ownerEmail,
    });
    if (actErr) throw new Error(actErr.message);

    await supabase
      .from("engine_review_items")
      .update({ status: "approved" })
      .eq("id", data.reviewItemId);

    await supabase.from("engine_audit_log").insert({
      project_id: engine.project_id,
      actor_email: approver,
      action: "engine.promotion.approved",
      summary: `Engine "${engine.name}" activated via milestone promotion`,
      target_id: engine.id,
      affected_modules: ["milestones", "business_engines"],
      field_changed: "status",
      old_value: { status: engine.status } as any,
      new_value: { status: "active" } as any,
      metadata: {
        milestone_id: engine.milestone_id,
        review_item_id: data.reviewItemId,
        owner_email: data.ownerEmail,
        approver_email: approver,
      },
    });

    await supabase.from("engine_activity").insert({
      project_id: engine.project_id,
      kind: "engine.promotion.approved",
      title: `Engine activated: ${engine.name}`,
      body: `Approved by ${approver}. Owner: ${data.ownerEmail}.`,
      severity: "info",
    });

    return { ok: true, engineId: data.engineId };
  });

// -------------------------------------------------------
// Reject promotion (cancels the draft engine + closes review)
// -------------------------------------------------------

const RejectSchema = z.object({
  engineId: z.string().uuid(),
  reviewItemId: z.string().uuid(),
  reason: z.string().min(4).max(2000),
});

export const rejectEnginePromotion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RejectSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const supabase = (context as Ctx).supabase;
    const email = ((context as Ctx).claims?.email as string | undefined) ?? "system";

    const { data: engine, error: eErr } = await supabase
      .from("engine_business_engines")
      .select("id, name, project_id, status")
      .eq("id", data.engineId)
      .single();
    if (eErr) throw new Error(eErr.message);
    if (!engine) throw new Error("Engine not found");
    if (engine.status !== "draft" && engine.status !== "pending_approval") {
      throw new Error(`Cannot reject engine in status ${engine.status}.`);
    }

    const { error: uErr } = await supabase
      .from("engine_business_engines")
      .update({ status: "archived" })
      .eq("id", data.engineId);
    if (uErr) throw new Error(uErr.message);

    await supabase
      .from("engine_review_items")
      .update({ status: "rejected" })
      .eq("id", data.reviewItemId);

    await supabase.from("engine_audit_log").insert({
      project_id: engine.project_id,
      actor_email: email,
      action: "engine.promotion.rejected",
      summary: `Engine "${engine.name}" promotion rejected`,
      target_id: engine.id,
      affected_modules: ["milestones", "business_engines"],
      reason: data.reason,
      metadata: { review_item_id: data.reviewItemId },
    });

    await supabase.from("engine_activity").insert({
      project_id: engine.project_id,
      kind: "engine.promotion.rejected",
      title: `Engine promotion rejected: ${engine.name}`,
      body: data.reason,
      severity: "warning",
    });

    return { ok: true };
  });
