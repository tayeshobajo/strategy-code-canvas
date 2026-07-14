/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase H1 — Cost-Overrun Auto-Pause (app side)
//
// Pairs with the migration proposed in .orchestrator/PENDING_MIGRATIONS.md
// ("Phase H1 — Cost-Overrun Auto-Pause"). Trigger + pause columns land in
// the DB; this module exposes:
//
//   - getCostGuardReport(): month-to-date spend per project vs its
//     agent_budget_monthly_cents, ranked by utilization. Works today with
//     existing columns; surfaces `cost_paused_at` / `cost_paused_reason`
//     when they exist after the migration lands (accessed via any-cast so
//     types.ts regen is not required).
//
//   - resumeProjectAfterCostReview(): staff-gated. Clears cost_paused_at /
//     cost_paused_reason on a paused project. Enforces separate-approver:
//     the resuming email MUST differ from actor_email on the cost row that
//     tripped the cap. Writes engine_audit_log + engine_activity.
//
// No AI can approve its own cost-review resume. No schema changes here.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail, isAdminEmail, isOperatorEmail } from "@/lib/ops/access";

type Sb = any;
type Ctx = { claims?: Record<string, unknown>; supabase: Sb };

async function assertStaff(ctx: Ctx): Promise<string> {
  const email = ((ctx.claims?.email as string | undefined) ?? "").toLowerCase();
  if (isOperatorEmail(email) || isAdminEmail(email)) return email;
  const ok = await hasRoleForEmail(ctx.supabase, email, "admin");
  if (!ok) throw new Error("Forbidden: engine staff role required");
  return email;
}

export type CostGuardRow = {
  projectId: string;
  projectName: string;
  clientId: string;
  budgetCents: number;
  monthToDateCents: number;
  utilizationPct: number;
  status: "ok" | "warning" | "over" | "paused";
  costPausedAt: string | null;
  costPausedReason: string | null;
  lastCostAt: string | null;
  lastActorEmail: string | null;
};

export type CostGuardReport = {
  generatedAt: string;
  monthStart: string;
  rows: CostGuardRow[];
  summary: {
    total: number;
    warning: number;
    over: number;
    paused: number;
  };
};

// -------------------------------------------------------
// getCostGuardReport
// -------------------------------------------------------

export const getCostGuardReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CostGuardReport> => {
    await assertStaff(context);
    const sb = (context as unknown as Ctx).supabase;

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const monthStartIso = monthStart.toISOString();

    const { data: projects, error: pErr } = await sb
      .from("engine_projects")
      .select(
        "id, name, client_id, agent_budget_monthly_cents, cost_paused_at, cost_paused_reason",
      );
    if (pErr) {
      // Fallback: cost_paused_* columns not yet migrated → retry without them.
      const { data: p2, error: p2Err } = await sb
        .from("engine_projects")
        .select("id, name, client_id, agent_budget_monthly_cents");
      if (p2Err) throw new Error(p2Err.message);
      return buildReport(sb, p2 ?? [], monthStartIso);
    }
    return buildReport(sb, projects ?? [], monthStartIso);
  });

async function buildReport(
  sb: Sb,
  projects: any[],
  monthStartIso: string,
): Promise<CostGuardReport> {
  const projectIds = projects.map((p) => p.id);
  const rows: CostGuardRow[] = [];

  if (projectIds.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      monthStart: monthStartIso,
      rows: [],
      summary: { total: 0, warning: 0, over: 0, paused: 0 },
    };
  }

  const { data: costs, error: cErr } = await sb
    .from("engine_agent_costs")
    .select("project_id, cost_cents, created_at, actor_email")
    .gte("created_at", monthStartIso)
    .in("project_id", projectIds)
    .order("created_at", { ascending: false });
  if (cErr) throw new Error(cErr.message);

  const byProject = new Map<
    string,
    { total: number; lastAt: string | null; lastActor: string | null }
  >();
  for (const c of costs ?? []) {
    const prev = byProject.get(c.project_id) ?? { total: 0, lastAt: null, lastActor: null };
    prev.total += c.cost_cents ?? 0;
    if (!prev.lastAt) {
      prev.lastAt = c.created_at;
      prev.lastActor = c.actor_email ?? null;
    }
    byProject.set(c.project_id, prev);
  }

  for (const p of projects) {
    const agg = byProject.get(p.id) ?? { total: 0, lastAt: null, lastActor: null };
    const budget = p.agent_budget_monthly_cents ?? 0;
    const mtd = agg.total;
    const util = budget > 0 ? Math.round((mtd / budget) * 100) : 0;
    let status: CostGuardRow["status"] = "ok";
    if (p.cost_paused_at) status = "paused";
    else if (budget > 0 && mtd > budget) status = "over";
    else if (budget > 0 && util >= 80) status = "warning";

    rows.push({
      projectId: p.id,
      projectName: p.name,
      clientId: p.client_id,
      budgetCents: budget,
      monthToDateCents: mtd,
      utilizationPct: util,
      status,
      costPausedAt: p.cost_paused_at ?? null,
      costPausedReason: p.cost_paused_reason ?? null,
      lastCostAt: agg.lastAt,
      lastActorEmail: agg.lastActor,
    });
  }

  rows.sort((a, b) => {
    const rank = (s: CostGuardRow["status"]) =>
      s === "paused" ? 0 : s === "over" ? 1 : s === "warning" ? 2 : 3;
    const d = rank(a.status) - rank(b.status);
    if (d !== 0) return d;
    return b.utilizationPct - a.utilizationPct;
  });

  return {
    generatedAt: new Date().toISOString(),
    monthStart: monthStartIso,
    rows,
    summary: {
      total: rows.length,
      warning: rows.filter((r) => r.status === "warning").length,
      over: rows.filter((r) => r.status === "over").length,
      paused: rows.filter((r) => r.status === "paused").length,
    },
  };
}

// -------------------------------------------------------
// resumeProjectAfterCostReview
// -------------------------------------------------------

const ResumeInput = z.object({
  projectId: z.string().uuid(),
  approverEmail: z.string().email(),
  reason: z.string().min(4).max(500),
  newBudgetCents: z.number().int().nonnegative().optional(),
});

export const resumeProjectAfterCostReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ResumeInput.parse(raw))
  .handler(async ({ data, context }) => {
    const staffEmail = await assertStaff(context);
    const sb = (context as unknown as Ctx).supabase;
    const approver = data.approverEmail.toLowerCase();

    if (approver !== staffEmail) {
      throw new Error(
        "Approver email must match the signed-in staff account.",
      );
    }

    const { data: project, error: pErr } = await sb
      .from("engine_projects")
      .select("id, name, cost_paused_at, cost_paused_reason, agent_budget_monthly_cents")
      .eq("id", data.projectId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!project) throw new Error("Project not found");
    if (!project.cost_paused_at) throw new Error("Project is not cost-paused");

    // Separate-approver: resumer must not be the actor on the triggering cost row.
    const { data: lastCost } = await sb
      .from("engine_agent_costs")
      .select("actor_email, created_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastCost?.actor_email && lastCost.actor_email.toLowerCase() === approver) {
      throw new Error(
        "Separate-approver required: you committed the last cost row for this project.",
      );
    }

    const patch: Record<string, unknown> = {
      cost_paused_at: null,
      cost_paused_reason: null,
    };
    if (typeof data.newBudgetCents === "number") {
      patch.agent_budget_monthly_cents = data.newBudgetCents;
    }

    const { error: uErr } = await sb
      .from("engine_projects")
      .update(patch)
      .eq("id", data.projectId);
    if (uErr) throw new Error(uErr.message);

    await sb.from("engine_audit_log").insert({
      project_id: data.projectId,
      action: "project.cost.resume",
      actor_email: approver,
      field_changed: "cost_paused_at",
      old_value: project.cost_paused_at,
      new_value: null,
      reason: data.reason,
      metadata: {
        prior_reason: project.cost_paused_reason,
        new_budget_cents: data.newBudgetCents ?? null,
      },
    });

    await sb.from("engine_activity").insert({
      project_id: data.projectId,
      kind: "project.cost.resume",
      actor_email: approver,
      summary: `Cost pause cleared: ${data.reason}`,
    });

    // Resolve any pending cost_overrun review items for this project.
    await sb
      .from("engine_review_items")
      .update({ status: "resolved" })
      .eq("project_id", data.projectId)
      .eq("item_type", "cost_overrun")
      .eq("status", "pending");

    return { ok: true as const, projectId: data.projectId };
  });
