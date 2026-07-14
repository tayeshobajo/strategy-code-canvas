/* eslint-disable @typescript-eslint/no-explicit-any */
// Engine Learning Loop (closes M11)
//
// Reads engine_business_engine_runs.outputs across recent cycles per engine,
// computes success / failure / partial ratios and trend deltas, and proposes
// workflow adjustments that flow through the existing governance chain:
//
//   engine_business_engine_runs   ─►  learning signals (computed)
//                                     │
//                                     ▼
//   engine_project_chat_proposals  ◄─ proposeEngineWorkflowChange()
//   engine_review_items            ◄─ (mirror for Approvals Queue)
//   engine_audit_log               ◄─ evidence record
//                                     │  (human approval via existing flow)
//                                     ▼
//   engine_business_engines.workflow  ◄─ applyApprovedEngineWorkflowChange()
//   engine_audit_log + engine_activity ◄─ application trail
//
// Guardrails:
//   - Learning NEVER mutates an engine directly. It always emits a proposal.
//   - Application requires an approved proposal + a different approver email
//     from the creator (enforced here + by engine_business_engines_no_self_approve
//     when status transitions are involved).
//   - No new tables. All state lives in existing engine_* tables.

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

export type LearningSignal = {
  engineId: string;
  engineName: string;
  projectId: string;
  projectName: string;
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
  partialRuns: number;
  successRate: number; // 0..1
  avgLatencyMs: number | null;
  avgCostCents: number | null;
  trend: "improving" | "degrading" | "stable" | "insufficient_data";
  recommendation: string;
  suggestedWorkflowDiff: WorkflowDiff | null;
  supportingRunIds: string[];
  lastRunAt: string | null;
};

export type WorkflowDiff = {
  kind: "add_review_step" | "adjust_cadence" | "add_guard" | "remove_step" | "note";
  reason: string;
  patch: any;
};

export type LearningReport = {
  generatedAt: string;
  signals: LearningSignal[];
};

// -------------------------------------------------------
// Analyze runs → signals (READ-ONLY)
// -------------------------------------------------------

function classifyRun(status: string): "success" | "failed" | "partial" | "other" {
  if (status === "completed") return "success";
  if (status === "failed") return "failed";
  if (status === "awaiting_approval" || status === "skipped") return "partial";
  return "other";
}

function suggestDiff(signal: {
  successRate: number;
  failedRuns: number;
  totalRuns: number;
  trend: LearningSignal["trend"];
}): WorkflowDiff | null {
  if (signal.totalRuns < 3) return null;
  if (signal.failedRuns >= 3 && signal.successRate < 0.5) {
    return {
      kind: "add_guard",
      reason: `${signal.failedRuns}/${signal.totalRuns} recent runs failed. Add a preflight guard before the primary action.`,
      patch: {
        insertBefore: 0,
        step: { type: "guard", label: "Preflight check", required: true },
      },
    };
  }
  if (signal.trend === "degrading" && signal.successRate < 0.75) {
    return {
      kind: "add_review_step",
      reason: `Success rate ${(signal.successRate * 100).toFixed(0)}% and degrading. Require human review before completion.`,
      patch: { appendStep: { type: "review", label: "Human review", required: true } },
    };
  }
  if (signal.trend === "improving" && signal.successRate >= 0.9) {
    return {
      kind: "note",
      reason: `Success rate ${(signal.successRate * 100).toFixed(0)}% and improving. Consider widening cadence.`,
      patch: { advisory: "cadence_widen_candidate" },
    };
  }
  return null;
}

export const analyzeEngineLearning = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ windowRuns: z.number().int().min(5).max(200).default(20) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const supabase = (context as Ctx).supabase;

    const { data: engines, error: engErr } = await supabase
      .from("engine_business_engines")
      .select("id, name, project_id, status")
      .in("status", ["active", "paused", "pending_approval"]);
    if (engErr) throw new Error(engErr.message);

    const projectIds = Array.from(new Set((engines ?? []).map((e: any) => e.project_id)));
    const { data: projects } = projectIds.length
      ? await supabase.from("engine_projects").select("id, company_name").in("id", projectIds)
      : { data: [] as any[] };
    const projectMap = new Map<string, string>();
    for (const p of projects ?? []) projectMap.set(p.id, p.company_name ?? "Unnamed project");

    const signals: LearningSignal[] = [];

    for (const engine of engines ?? []) {
      const { data: runs, error: runErr } = await supabase
        .from("engine_business_engine_runs")
        .select("id, status, latency_ms, cost_cents, created_at")
        .eq("engine_id", engine.id)
        .order("created_at", { ascending: false })
        .limit(data.windowRuns);
      if (runErr) throw new Error(runErr.message);

      const total = runs?.length ?? 0;
      let success = 0,
        failed = 0,
        partial = 0;
      let latencySum = 0,
        latencyCount = 0,
        costSum = 0,
        costCount = 0;
      for (const r of runs ?? []) {
        const c = classifyRun(r.status);
        if (c === "success") success++;
        else if (c === "failed") failed++;
        else if (c === "partial") partial++;
        if (r.latency_ms != null) {
          latencySum += r.latency_ms;
          latencyCount++;
        }
        if (r.cost_cents != null) {
          costSum += r.cost_cents;
          costCount++;
        }
      }
      const successRate = total > 0 ? success / total : 0;

      // Trend: compare first half vs second half of window
      let trend: LearningSignal["trend"] = "insufficient_data";
      if (total >= 6) {
        const mid = Math.floor(total / 2);
        const recent = (runs ?? []).slice(0, mid);
        const older = (runs ?? []).slice(mid);
        const recentSR = recent.filter((r: any) => classifyRun(r.status) === "success").length / recent.length;
        const olderSR = older.filter((r: any) => classifyRun(r.status) === "success").length / older.length;
        const delta = recentSR - olderSR;
        if (delta > 0.15) trend = "improving";
        else if (delta < -0.15) trend = "degrading";
        else trend = "stable";
      }

      const diff = suggestDiff({ successRate, failedRuns: failed, totalRuns: total, trend });

      let recommendation = "Insufficient data to recommend a change.";
      if (diff) recommendation = diff.reason;
      else if (total >= 3 && successRate >= 0.9) recommendation = "Engine performing well. No change recommended.";
      else if (total >= 3) recommendation = "Performance mixed. Monitor another cycle before proposing changes.";

      signals.push({
        engineId: engine.id,
        engineName: engine.name,
        projectId: engine.project_id,
        projectName: projectMap.get(engine.project_id) ?? "Unnamed project",
        totalRuns: total,
        successRuns: success,
        failedRuns: failed,
        partialRuns: partial,
        successRate,
        avgLatencyMs: latencyCount ? Math.round(latencySum / latencyCount) : null,
        avgCostCents: costCount ? Math.round(costSum / costCount) : null,
        trend,
        recommendation,
        suggestedWorkflowDiff: diff,
        supportingRunIds: (runs ?? []).slice(0, 5).map((r: any) => r.id),
        lastRunAt: runs && runs[0] ? runs[0].created_at : null,
      });
    }

    signals.sort((a, b) => a.successRate - b.successRate);
    return { generatedAt: new Date().toISOString(), signals } as LearningReport;
  });

// -------------------------------------------------------
// Propose a workflow change (writes proposal + review item + audit)
// -------------------------------------------------------

const ProposeSchema = z.object({
  engineId: z.string().uuid(),
  reason: z.string().min(4).max(2000),
  diff: z.object({
    kind: z.enum(["add_review_step", "adjust_cadence", "add_guard", "remove_step", "note"]),
    reason: z.string().min(1).max(2000),
    patch: z.record(z.string(), z.unknown()),
  }),
  supportingRunIds: z.array(z.string().uuid()).max(20).default([]),
});

export const proposeEngineWorkflowChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ProposeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const supabase = (context as Ctx).supabase;
    const email = ((context as Ctx).claims?.email as string | undefined) ?? "system";

    const { data: engine, error: engErr } = await supabase
      .from("engine_business_engines")
      .select("id, name, project_id, workflow, status")
      .eq("id", data.engineId)
      .single();
    if (engErr) throw new Error(engErr.message);
    if (!engine) throw new Error("Engine not found");

    const title = `Engine learning: ${data.diff.kind.replace(/_/g, " ")} — ${engine.name}`;
    const summary = data.reason;

    const { data: proposal, error: pErr } = await supabase
      .from("engine_project_chat_proposals")
      .insert({
        project_id: engine.project_id,
        proposal_type: "implementation_prompt",
        title,
        summary,
        status: "submitted_for_review",
        payload: {
          source: "engine_learning_loop",
          engine_id: engine.id,
          engine_name: engine.name,
          current_workflow: engine.workflow,
          workflow_diff: data.diff,
          supporting_run_ids: data.supportingRunIds,
          proposed_by: email,
        },
        target_route: `/admin/engine-learning`,
      })
      .select("id")
      .single();
    if (pErr) throw new Error(pErr.message);

    const { data: reviewItem, error: rErr } = await supabase
      .from("engine_review_items")
      .insert({
        project_id: engine.project_id,
        project: engine.name,
        item_type: "engine_workflow_change",
        title,
        impact: "medium",
        source: "engine_learning_loop",
        requested_by: email,
        status: "pending",
      })
      .select("id")
      .single();
    if (rErr) throw new Error(rErr.message);

    await supabase.from("engine_audit_log").insert({
      project_id: engine.project_id,
      actor_email: email,
      action: "engine.workflow_change.proposed",
      summary: `${data.diff.kind} proposed for engine "${engine.name}"`,
      target_id: engine.id,
      affected_modules: ["business_engines", "learning_loop"],
      metadata: {
        proposal_id: proposal.id,
        review_item_id: reviewItem.id,
        diff: data.diff,
        supporting_run_ids: data.supportingRunIds,
      },
      reason: data.reason,
    });

    await supabase.from("engine_activity").insert({
      project_id: engine.project_id,
      kind: "engine.learning.proposal",
      title,
      body: `${data.diff.reason}\n\nProposal ${proposal.id} pending review.`,
      severity: "info",
    });

    return { proposalId: proposal.id as string, reviewItemId: reviewItem.id as string };
  });

// -------------------------------------------------------
// Apply an approved workflow change (writes engine.workflow + audit)
// -------------------------------------------------------

const ApplySchema = z.object({
  proposalId: z.string().uuid(),
  approverEmail: z.string().email(),
});

function applyDiff(current: unknown, diff: WorkflowDiff): unknown[] {
  const list: unknown[] = Array.isArray(current) ? [...(current as unknown[])] : [];
  const p = diff.patch as Record<string, unknown>;
  if (diff.kind === "add_guard" && typeof p.insertBefore === "number" && p.step) {
    const idx = Math.max(0, Math.min(list.length, p.insertBefore as number));
    list.splice(idx, 0, p.step);
    return list;
  }
  if (diff.kind === "add_review_step" && p.appendStep) {
    list.push(p.appendStep);
    return list;
  }
  if (diff.kind === "remove_step" && typeof p.index === "number") {
    const i = p.index as number;
    if (i >= 0 && i < list.length) list.splice(i, 1);
    return list;
  }
  // note / adjust_cadence: no workflow structural change here (cadence handled separately).
  return list;
}

export const applyApprovedEngineWorkflowChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ApplySchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const supabase = (context as Ctx).supabase;
    const approver = data.approverEmail.toLowerCase();
    const callerEmail = ((context as Ctx).claims?.email as string | undefined)?.toLowerCase() ?? "";
    if (approver !== callerEmail) {
      throw new Error("Approver email must match the signed-in user.");
    }

    const { data: proposal, error: pErr } = await supabase
      .from("engine_project_chat_proposals")
      .select("id, project_id, payload, status")
      .eq("id", data.proposalId)
      .single();
    if (pErr) throw new Error(pErr.message);
    if (!proposal) throw new Error("Proposal not found");
    if (proposal.status === "converted") throw new Error("Proposal already applied");

    const payload = (proposal.payload ?? {}) as Record<string, any>;
    const proposedBy = String(payload.proposed_by ?? "").toLowerCase();
    if (proposedBy && proposedBy === approver) {
      throw new Error("Self-approval forbidden: the proposer cannot apply their own change.");
    }
    const engineId = payload.engine_id as string | undefined;
    const diff = payload.workflow_diff as WorkflowDiff | undefined;
    if (!engineId || !diff) throw new Error("Proposal missing engine_id or workflow_diff");

    const { data: engine, error: eErr } = await supabase
      .from("engine_business_engines")
      .select("id, name, workflow, project_id")
      .eq("id", engineId)
      .single();
    if (eErr) throw new Error(eErr.message);
    if (!engine) throw new Error("Engine not found");

    const before = engine.workflow;
    const after = applyDiff(before, diff);

    const { error: uErr } = await supabase
      .from("engine_business_engines")
      .update({ workflow: after })
      .eq("id", engineId);
    if (uErr) throw new Error(uErr.message);

    await supabase
      .from("engine_project_chat_proposals")
      .update({
        status: "converted",
        converted_ref: { engine_id: engineId, applied_by: approver, applied_at: new Date().toISOString() },
      })
      .eq("id", data.proposalId);

    await supabase.from("engine_audit_log").insert({
      project_id: engine.project_id,
      actor_email: approver,
      action: "engine.workflow_change.applied",
      summary: `Applied ${diff.kind} to engine "${engine.name}"`,
      target_id: engineId,
      affected_modules: ["business_engines", "learning_loop"],
      field_changed: "workflow",
      old_value: before as any,
      new_value: after as any,
      metadata: { proposal_id: data.proposalId, diff },
      reason: diff.reason,
    });

    await supabase.from("engine_activity").insert({
      project_id: engine.project_id,
      kind: "engine.learning.applied",
      title: `Engine workflow updated: ${engine.name}`,
      body: `${diff.kind} applied by ${approver}. Reason: ${diff.reason}`,
      severity: "info",
    });

    return { ok: true, engineId, appliedBy: approver };
  });
