/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Phase RT-4 — Strategic Thesis artifact.
 *
 * The Strategic Thesis converts the approved World Entry (RT-2) and
 * Execution Boundary (RT-3) into a testable bet: what we believe,
 * why now, the wedge, proof metrics, kill criteria, and assumptions.
 *
 * Storage strategy (mirrors RT-2/RT-3): full version history lives in
 * `engine_projects.spirit_first_analysis.strategic_thesis_workspace`
 * until the RT-4 tables in PENDING_MIGRATIONS.md land. On approval,
 * mirror a summary row into `engine_spine_field_truth`
 * (spine = 'strategic-thesis', field_key = 'thesis') so the doctrine
 * gate reader can find it without knowing about the sidecar.
 *
 * Second-Reviewer Rule: the proposer MUST NOT approve their own thesis.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminOrOperator, type AuthCtx } from "@/lib/engine-epistemic.server";
import { insertEngineActivity } from "@/lib/engine-activity";

// ---------- Contract ----------

export type ProofMetric = {
  id: string;
  metric: string;
  target: string;
  horizon: string;
};

export type KillCriterion = {
  id: string;
  statement: string;
};

export type ThesisAssumption = {
  id: string;
  statement: string;
  confidence: "low" | "medium" | "high";
};

export type StrategicThesisVersion = {
  version: number;
  status: "draft" | "proposed" | "approved" | "superseded";
  bet_statement: string;
  why_now: string;
  wedge: string;
  proof_metrics: ProofMetric[];
  kill_criteria: KillCriterion[];
  assumptions: ThesisAssumption[];
  linked_world_entry_version: number | null;
  linked_execution_boundary_version: number | null;
  notes: string;
  proposed_by_email: string;
  proposed_by_actor: "human" | "ai";
  proposed_at: string;
  approved_by_email?: string;
  approved_at?: string;
  reason?: string;
};

export type StrategicThesisState = {
  current: StrategicThesisVersion | null;
  history: StrategicThesisVersion[];
};

const SIDECAR_KEY = "strategic_thesis_workspace";

// ---------- Zod ----------

const projectIdInput = z.object({ projectId: z.string().uuid() });

const proofMetricSchema = z.object({
  id: z.string().min(1).max(80),
  metric: z.string().trim().min(1).max(200),
  target: z.string().trim().min(1).max(200),
  horizon: z.string().trim().min(1).max(120),
});

const killSchema = z.object({
  id: z.string().min(1).max(80),
  statement: z.string().trim().min(1).max(400),
});

const assumptionSchema = z.object({
  id: z.string().min(1).max(80),
  statement: z.string().trim().min(1).max(400),
  confidence: z.enum(["low", "medium", "high"]),
});

const proposeInput = z.object({
  projectId: z.string().uuid(),
  bet_statement: z.string().trim().max(1000).default(""),
  why_now: z.string().trim().max(1500).default(""),
  wedge: z.string().trim().max(1000).default(""),
  proof_metrics: z.array(proofMetricSchema).max(10).default([]),
  kill_criteria: z.array(killSchema).max(10).default([]),
  assumptions: z.array(assumptionSchema).max(15).default([]),
  notes: z.string().trim().max(2000).default(""),
  submit_for_review: z.boolean().default(false),
});

const approveInput = z.object({
  projectId: z.string().uuid(),
  version: z.number().int().positive(),
  reason: z.string().trim().max(1000).optional(),
});

const rejectInput = z.object({
  projectId: z.string().uuid(),
  version: z.number().int().positive(),
  reason: z.string().trim().min(1).max(1000),
});

// ---------- Sidecar helpers ----------

async function readSidecar(
  sb: any,
  projectId: string,
): Promise<{ spirit: Record<string, unknown>; state: StrategicThesisState }> {
  const { data, error } = await sb
    .from("engine_projects")
    .select("spirit_first_analysis")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const spirit = ((data?.spirit_first_analysis as Record<string, unknown> | null) ?? {}) as Record<
    string,
    unknown
  >;
  const raw = (spirit[SIDECAR_KEY] as StrategicThesisState | undefined) ?? {
    current: null,
    history: [],
  };
  return {
    spirit,
    state: {
      current: raw.current ?? null,
      history: Array.isArray(raw.history) ? raw.history : [],
    },
  };
}

async function writeSidecar(
  sb: any,
  projectId: string,
  spirit: Record<string, unknown>,
  next: StrategicThesisState,
): Promise<void> {
  const { error } = await sb
    .from("engine_projects")
    .update({ spirit_first_analysis: { ...spirit, [SIDECAR_KEY]: next } })
    .eq("id", projectId);
  if (error) throw new Error(error.message);
}

function nextVersionNumber(state: StrategicThesisState): number {
  const all = [...state.history, ...(state.current ? [state.current] : [])];
  return all.reduce((m, v) => Math.max(m, v.version), 0) + 1;
}

async function mirrorApprovedThesisToFieldTruth(
  sb: any,
  projectId: string,
  v: StrategicThesisVersion,
  actorEmail: string,
): Promise<void> {
  const row = {
    project_id: projectId,
    spine: "strategic-thesis",
    field_key: "thesis",
    status: "approved_truth",
    source_ref: {
      version: v.version,
      bet_statement: v.bet_statement,
      why_now: v.why_now,
      wedge: v.wedge,
      proof_metrics: v.proof_metrics,
      kill_criteria: v.kill_criteria,
      linked_world_entry_version: v.linked_world_entry_version,
      linked_execution_boundary_version: v.linked_execution_boundary_version,
    },
    updated_at: new Date().toISOString(),
    updated_by_email: actorEmail,
    updated_by_actor: "human",
  };
  const { error } = await sb
    .from("engine_spine_field_truth")
    .upsert([row], { onConflict: "project_id,spine,field_key" });
  if (error) {
    // Doctrine gate reader has a sidecar fallback (see gates.ts) so
    // don't block approval — surface via console.
    console.warn("[strategic-thesis] field-truth mirror failed", error.message ?? error);
  }
}

// ---------- Server functions ----------

export const getStrategicThesis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => projectIdInput.parse(raw))
  .handler(async ({ context, data }): Promise<StrategicThesisState> => {
    const ctx = context as unknown as AuthCtx;
    const { state } = await readSidecar(ctx.supabase as any, data.projectId);
    return state;
  });

export const proposeStrategicThesis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => proposeInput.parse(raw))
  .handler(async ({ context, data }): Promise<StrategicThesisState> => {
    const ctx = context as unknown as AuthCtx;
    const actor = await assertAdminOrOperator(ctx);
    const sb = ctx.supabase as any;

    const { spirit, state } = await readSidecar(sb, data.projectId);
    const now = new Date().toISOString();
    const currentIsApproved = state.current?.status === "approved";
    const nextHistory = currentIsApproved && state.current
      ? [...state.history, { ...state.current, status: "superseded" as const }]
      : state.history;
    const version = currentIsApproved
      ? nextVersionNumber({ current: null, history: nextHistory })
      : state.current?.version ?? nextVersionNumber(state);

    // Snapshot links to the currently-approved upstream artifacts.
    const worldEntry = (spirit["world_entry_workspace"] as any)?.current ?? null;
    const boundary = (spirit["execution_boundary_workspace"] as any)?.current ?? null;

    const nextCurrent: StrategicThesisVersion = {
      version,
      status: data.submit_for_review ? "proposed" : "draft",
      bet_statement: data.bet_statement,
      why_now: data.why_now,
      wedge: data.wedge,
      proof_metrics: data.proof_metrics,
      kill_criteria: data.kill_criteria,
      assumptions: data.assumptions,
      linked_world_entry_version:
        worldEntry?.status === "approved" ? worldEntry.version ?? null : null,
      linked_execution_boundary_version:
        boundary?.status === "approved" ? boundary.version ?? null : null,
      notes: data.notes,
      proposed_by_email: actor,
      proposed_by_actor: "human",
      proposed_at: now,
    };

    const nextState: StrategicThesisState = { current: nextCurrent, history: nextHistory };
    await writeSidecar(sb, data.projectId, spirit, nextState);

    await insertEngineActivity(sb, {
      project_id: data.projectId,
      kind: data.submit_for_review ? "strategic_thesis.proposed" : "strategic_thesis.drafted",
      title: data.submit_for_review
        ? `Strategic Thesis v${version} proposed for approval`
        : `Strategic Thesis v${version} draft saved`,
      severity: "info",
      actor_email: actor,
    });

    return nextState;
  });

export const approveStrategicThesis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => approveInput.parse(raw))
  .handler(async ({ context, data }): Promise<StrategicThesisState> => {
    const ctx = context as unknown as AuthCtx;
    const actor = await assertAdminOrOperator(ctx);
    const sb = ctx.supabase as any;
    const { spirit, state } = await readSidecar(sb, data.projectId);
    const current = state.current;

    if (!current) throw new Error("No Strategic Thesis draft to approve.");
    if (current.version !== data.version) {
      throw new Error(
        `Version mismatch: current is v${current.version}, tried to approve v${data.version}. Reload and try again.`,
      );
    }
    if (current.status === "approved") throw new Error("This version is already approved.");
    if (current.status !== "proposed") {
      throw new Error("Only versions submitted for approval can be approved.");
    }
    if (current.proposed_by_email.toLowerCase() === actor.toLowerCase()) {
      throw new Error(
        "Second-reviewer rule: the person who proposed this thesis cannot approve it. Ask another admin or operator to approve.",
      );
    }
    if (current.bet_statement.trim().length < 20) {
      throw new Error("Bet statement must be at least 20 characters before approval.");
    }
    if (current.wedge.trim().length < 10) {
      throw new Error("Wedge must be filled in before approval.");
    }
    if (current.proof_metrics.length < 1) {
      throw new Error("At least one proof metric is required.");
    }
    if (current.kill_criteria.length < 1) {
      throw new Error("At least one kill criterion is required — how would you know you were wrong?");
    }

    const now = new Date().toISOString();
    const approved: StrategicThesisVersion = {
      ...current,
      status: "approved",
      approved_by_email: actor,
      approved_at: now,
      reason: data.reason,
    };
    const nextState: StrategicThesisState = { current: approved, history: state.history };
    await writeSidecar(sb, data.projectId, spirit, nextState);
    await mirrorApprovedThesisToFieldTruth(sb, data.projectId, approved, actor);

    await insertEngineActivity(sb, {
      project_id: data.projectId,
      kind: "strategic_thesis.approved",
      title: `Strategic Thesis v${approved.version} approved`,
      body: data.reason,
      severity: "success",
      actor_email: actor,
    });

    return nextState;
  });

export const rejectStrategicThesis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => rejectInput.parse(raw))
  .handler(async ({ context, data }): Promise<StrategicThesisState> => {
    const ctx = context as unknown as AuthCtx;
    const actor = await assertAdminOrOperator(ctx);
    const sb = ctx.supabase as any;
    const { spirit, state } = await readSidecar(sb, data.projectId);
    const current = state.current;
    if (!current || current.status !== "proposed" || current.version !== data.version) {
      throw new Error("No matching proposed thesis to reject.");
    }
    const rejected: StrategicThesisVersion = { ...current, status: "draft", reason: data.reason };
    const nextState: StrategicThesisState = { current: rejected, history: state.history };
    await writeSidecar(sb, data.projectId, spirit, nextState);
    await insertEngineActivity(sb, {
      project_id: data.projectId,
      kind: "strategic_thesis.rejected",
      title: `Strategic Thesis v${current.version} rejected`,
      body: data.reason,
      severity: "warn",
      actor_email: actor,
    });
    return nextState;
  });

// AI-draft is in engine-strategic-thesis-ai.functions.ts to keep the
// LLM/heuristic code out of the read/write path.
