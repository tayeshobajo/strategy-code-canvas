/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Phase RT-3 — Per-project Execution Boundary.
 *
 * The Execution Boundary declares which Trust Tai capabilities are in
 * scope for a project, which areas the client owns, and what's
 * explicitly excluded. It is one of the doctrine gates the RT-1
 * synthesis registry reads (`execution_boundary` gate in
 * `roadmap-synthesis/gates.ts`).
 *
 * Storage strategy (mirrors World Entry): full version history lives
 * on a sidecar bucket at
 * `engine_projects.spirit_first_analysis.execution_boundary`. On
 * approval, mirror the two rows the gate reads
 * (`approved_capabilities`, `client_owned_areas`) into
 * `engine_spine_field_truth` under `spine = 'execution-boundary'`.
 *
 * The sidecar approach keeps this fully functional before the RT-3
 * SQL migration lands. Once `engine_project_execution_boundary`
 * exists, a follow-up patch will migrate readers/writers to the
 * dedicated table without changing the gate contract.
 *
 * Human approval rule: the proposer MUST NOT approve their own
 * boundary (second-reviewer check).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminOrOperator, type AuthCtx } from "@/lib/engine-epistemic.server";
import { insertEngineActivity } from "@/lib/engine-activity";
import { loadCapabilityMenu } from "@/lib/engine-capability-registry.functions";

// ---------- Contract ----------

export type ExecutionBoundaryVersion = {
  version: number;
  status: "draft" | "proposed" | "approved" | "superseded";
  capability_ids: string[];
  client_owned_areas: string[];
  exclusions: string[];
  notes: string;
  proposed_by_email: string;
  proposed_by_actor: "human" | "ai";
  proposed_at: string;
  approved_by_email?: string;
  approved_at?: string;
  reason?: string;
};

export type ExecutionBoundaryState = {
  current: ExecutionBoundaryVersion | null;
  history: ExecutionBoundaryVersion[];
};

const SIDECAR_KEY = "execution_boundary_workspace";

// ---------- Zod ----------

const projectIdInput = z.object({ projectId: z.string().uuid() });

const proposeInput = z.object({
  projectId: z.string().uuid(),
  capability_ids: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  client_owned_areas: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
  exclusions: z.array(z.string().trim().min(1).max(160)).max(30).default([]),
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

async function readSidecar(sb: any, projectId: string): Promise<{
  spirit: Record<string, unknown>;
  state: ExecutionBoundaryState;
}> {
  const { data, error } = await sb
    .from("engine_projects")
    .select("spirit_first_analysis")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const spirit = ((data?.spirit_first_analysis as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
  const raw = (spirit[SIDECAR_KEY] as ExecutionBoundaryState | undefined) ?? {
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
  next: ExecutionBoundaryState,
): Promise<void> {
  const updated = { ...spirit, [SIDECAR_KEY]: next };
  const { error } = await sb
    .from("engine_projects")
    .update({ spirit_first_analysis: updated })
    .eq("id", projectId);
  if (error) throw new Error(error.message);
}

function nextVersionNumber(state: ExecutionBoundaryState): number {
  const all = [...state.history, ...(state.current ? [state.current] : [])];
  return all.reduce((m, v) => Math.max(m, v.version), 0) + 1;
}

async function mirrorApprovedBoundaryToFieldTruth(
  sb: any,
  projectId: string,
  v: ExecutionBoundaryVersion,
  actorEmail: string,
): Promise<void> {
  const now = new Date().toISOString();
  const rows = [
    { field_key: "approved_capabilities", source_ref: { items: v.capability_ids, version: v.version } },
    { field_key: "client_owned_areas", source_ref: { items: v.client_owned_areas, version: v.version } },
    { field_key: "exclusions", source_ref: { items: v.exclusions, version: v.version } },
  ].map((r) => ({
    project_id: projectId,
    spine: "execution-boundary",
    field_key: r.field_key,
    status: "approved_truth",
    source_ref: r.source_ref,
    updated_at: now,
    updated_by_email: actorEmail,
    updated_by_actor: "human",
  }));
  const { error } = await sb
    .from("engine_spine_field_truth")
    .upsert(rows, { onConflict: "project_id,spine,field_key" });
  if (error) {
    // Best-effort: doctrine gate has a legacy sidecar path too, so a
    // mirror failure shouldn't block approval. Surface via activity.
    console.warn("[execution-boundary] field-truth mirror failed", error.message ?? error);
  }
}

// ---------- Server functions ----------

export const getExecutionBoundary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => projectIdInput.parse(raw))
  .handler(async ({ context, data }): Promise<ExecutionBoundaryState> => {
    const ctx = context as unknown as AuthCtx;
    const { state } = await readSidecar(ctx.supabase as any, data.projectId);
    return state;
  });

export const proposeExecutionBoundary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => proposeInput.parse(raw))
  .handler(async ({ context, data }): Promise<ExecutionBoundaryState> => {
    const ctx = context as unknown as AuthCtx;
    const actor = await assertAdminOrOperator(ctx);
    const sb = ctx.supabase as any;

    // Validate capability_ids against the live menu (registry or fallback).
    const menu = await loadCapabilityMenu(sb);
    const validIds = new Set(menu.filter((c) => !c.retired_at).map((c) => c.id));
    const unknown = data.capability_ids.filter((id) => !validIds.has(id));
    if (unknown.length > 0) {
      throw new Error(`Unknown or retired capability ids: ${unknown.join(", ")}`);
    }

    const { spirit, state } = await readSidecar(sb, data.projectId);
    const now = new Date().toISOString();
    const currentIsApproved = state.current?.status === "approved";

    const nextHistory = currentIsApproved && state.current
      ? [...state.history, { ...state.current, status: "superseded" as const }]
      : state.history;

    const version = currentIsApproved
      ? nextVersionNumber({ current: null, history: nextHistory })
      : state.current?.version ?? nextVersionNumber(state);

    const nextCurrent: ExecutionBoundaryVersion = {
      version,
      status: data.submit_for_review ? "proposed" : "draft",
      capability_ids: Array.from(new Set(data.capability_ids)),
      client_owned_areas: Array.from(new Set(data.client_owned_areas)),
      exclusions: Array.from(new Set(data.exclusions)),
      notes: data.notes,
      proposed_by_email: actor,
      proposed_by_actor: "human",
      proposed_at: now,
    };

    const nextState: ExecutionBoundaryState = {
      current: nextCurrent,
      history: nextHistory,
    };
    await writeSidecar(sb, data.projectId, spirit, nextState);

    await insertEngineActivity(sb, {
      project_id: data.projectId,
      kind: data.submit_for_review ? "execution_boundary_proposed" : "execution_boundary_drafted",
      title: data.submit_for_review
        ? `Execution Boundary v${version} proposed for approval`
        : `Execution Boundary v${version} draft saved`,
      severity: "info",
      actor_email: actor,
    });

    return nextState;
  });

export const approveExecutionBoundary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => approveInput.parse(raw))
  .handler(async ({ context, data }): Promise<ExecutionBoundaryState> => {
    const ctx = context as unknown as AuthCtx;
    const actor = await assertAdminOrOperator(ctx);
    const sb = ctx.supabase as any;
    const { spirit, state } = await readSidecar(sb, data.projectId);
    const current = state.current;

    if (!current) throw new Error("No Execution Boundary draft to approve.");
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
        "Second-reviewer rule: the person who proposed this boundary cannot approve it. Ask another admin or operator to approve.",
      );
    }
    if (current.capability_ids.length < 1) {
      throw new Error("At least one approved Trust Tai capability is required.");
    }
    if (current.client_owned_areas.length < 1) {
      throw new Error("At least one client-owned area must be listed explicitly.");
    }

    const now = new Date().toISOString();
    const approved: ExecutionBoundaryVersion = {
      ...current,
      status: "approved",
      approved_by_email: actor,
      approved_at: now,
      reason: data.reason,
    };
    const nextState: ExecutionBoundaryState = { current: approved, history: state.history };
    await writeSidecar(sb, data.projectId, spirit, nextState);
    await mirrorApprovedBoundaryToFieldTruth(sb, data.projectId, approved, actor);

    await insertEngineActivity(sb, {
      project_id: data.projectId,
      kind: "execution_boundary_approved",
      title: `Execution Boundary v${approved.version} approved`,
      body: data.reason,
      severity: "success",
      actor_email: actor,
    });

    return nextState;
  });

export const rejectExecutionBoundary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => rejectInput.parse(raw))
  .handler(async ({ context, data }): Promise<ExecutionBoundaryState> => {
    const ctx = context as unknown as AuthCtx;
    const actor = await assertAdminOrOperator(ctx);
    const sb = ctx.supabase as any;
    const { spirit, state } = await readSidecar(sb, data.projectId);
    const current = state.current;
    if (!current || current.status !== "proposed" || current.version !== data.version) {
      throw new Error("No matching proposed boundary to reject.");
    }
    const rejected: ExecutionBoundaryVersion = { ...current, status: "draft", reason: data.reason };
    const nextState: ExecutionBoundaryState = { current: rejected, history: state.history };
    await writeSidecar(sb, data.projectId, spirit, nextState);
    await insertEngineActivity(sb, {
      project_id: data.projectId,
      kind: "execution_boundary_rejected",
      title: `Execution Boundary v${current.version} rejected`,
      body: data.reason,
      severity: "warn",
      actor_email: actor,
    });
    return nextState;
  });

export const aiDraftExecutionBoundary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => projectIdInput.parse(raw))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as AuthCtx;
    const actor = await assertAdminOrOperator(ctx);
    const sb = ctx.supabase as any;

    // Pull World Entry + intake to inform the draft.
    const { data: proj } = await sb
      .from("engine_projects")
      .select("id, name, spirit_first_analysis, intake_summary, context_snapshot")
      .eq("id", data.projectId)
      .maybeSingle();
    const spirit = ((proj?.spirit_first_analysis as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
    const worldEntry = (spirit["world_entry_workspace"] as any)?.current ?? null;
    const menu = await loadCapabilityMenu(sb);

    // Deterministic, LLM-free draft:
    //  - Start with a conservative default set (site + knowledge hub +
    //    lead capture + client portal) — the most common Trust Tai
    //    launch stack. Operator can prune / extend.
    //  - Client-owned areas draw from any explicit intake mentions of
    //    payroll, HR, sales team ops, legal, finance, IT. Fall back to
    //    a single generic reminder.
    //  - Exclusions include any competitor names surfaced by World
    //    Entry to keep positioning discipline explicit.
    const defaultCaps = ["web.category_site", "content.knowledge_hub", "audience.lead_capture", "ops.client_portal"];
    const availableIds = new Set(menu.filter((c) => !c.retired_at).map((c) => c.id));
    const capability_ids = defaultCaps.filter((id) => availableIds.has(id));

    const intakeText = (
      (proj?.intake_summary as string | null) ??
      JSON.stringify(proj?.context_snapshot ?? {})
    ).toLowerCase();
    const CLIENT_OWNED_HINTS: Array<{ token: string; label: string }> = [
      { token: "payroll", label: "Payroll operations" },
      { token: "sales team", label: "Sales team ownership" },
      { token: "legal", label: "Legal review" },
      { token: "finance", label: "Finance & accounting" },
      { token: "hr", label: "HR & recruiting" },
      { token: "support", label: "Customer support operations" },
    ];
    const client_owned_areas = CLIENT_OWNED_HINTS
      .filter((h) => intakeText.includes(h.token))
      .map((h) => h.label);
    if (client_owned_areas.length === 0) {
      client_owned_areas.push("Day-to-day operations outside the approved capabilities");
    }

    const competitors: string[] = Array.isArray(worldEntry?.competitors)
      ? worldEntry.competitors.map((c: any) => String(c?.name ?? "")).filter(Boolean)
      : [];
    const exclusions: string[] = [];
    if (competitors.length > 0) {
      exclusions.push(`No positioning or content that copies: ${competitors.slice(0, 5).join(", ")}`);
    }
    exclusions.push("No custom mobile app work in this scope");
    exclusions.push("No paid media buys unless separately contracted");

    const notes = [
      "AI-drafted starting boundary. Review every capability, ownership area, and exclusion with the client before proposing for approval.",
      worldEntry ? `Grounded in World Entry v${worldEntry.version ?? "?"}.` : "No approved World Entry yet — refine after World Entry is settled.",
    ].join(" ");

    // Persist as a draft (not submitted), attributed to the AI actor.
    const { spirit: spiritNow, state } = await readSidecar(sb, data.projectId);
    const now = new Date().toISOString();
    const version = state.current?.status === "approved"
      ? nextVersionNumber({ current: null, history: [...state.history, state.current!] })
      : state.current?.version ?? nextVersionNumber(state);
    const nextCurrent: ExecutionBoundaryVersion = {
      version,
      status: "draft",
      capability_ids,
      client_owned_areas,
      exclusions,
      notes,
      proposed_by_email: actor,
      proposed_by_actor: "ai",
      proposed_at: now,
    };
    const nextHistory = state.current?.status === "approved" && state.current
      ? [...state.history, { ...state.current, status: "superseded" as const }]
      : state.history;
    const nextState: ExecutionBoundaryState = { current: nextCurrent, history: nextHistory };
    await writeSidecar(sb, data.projectId, spiritNow, nextState);

    await insertEngineActivity(sb, {
      project_id: data.projectId,
      kind: "execution_boundary_drafted",
      title: `Execution Boundary v${version} AI-drafted`,
      severity: "info",
      actor_email: actor,
    });

    return nextState;
  });
