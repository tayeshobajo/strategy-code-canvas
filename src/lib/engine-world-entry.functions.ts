/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Phase RT-2 — World Entry Workspace server functions.
 *
 * World Entry is the first doctrine gate: the operator confirms the
 * industry destination, competitor review, category vocabulary, and
 * attached evidence before any milestone synthesis is trusted.
 *
 * Storage: because `engine_spine_field_truth.spine_check` currently
 * restricts `spine` to `point-a | point-b`, RT-2 persists to a sidecar
 * bucket on `engine_projects.spirit_first_analysis.world_entry` under
 * an isolated key. When the schema constraint is relaxed (documented in
 * `.orchestrator/PENDING_MIGRATIONS.md`), migrate readers/writers to
 * `engine_spine_field_truth` with `spine = 'world-entry'`. Gate reader
 * (`roadmap-synthesis/gates.ts`) already reads both sources.
 *
 * Human approval rule: the person who approves a version MUST NOT be
 * the person who drafted the latest version (second-reviewer check).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminOrOperator, type AuthCtx } from "@/lib/engine-epistemic.server";
import { insertEngineActivity } from "@/lib/engine-activity";

// ---------- Contract ----------

export type WorldEntryCompetitor = {
  id: string;
  name: string;
  positioning: string;
  why_relevant: string;
};

export type WorldEntryEvidence = {
  id: string;
  label: string;
  url?: string;
  source_id?: string;
  quote?: string;
  added_by_email: string;
  added_at: string;
};

export type WorldEntryVersion = {
  version: number;
  status: "drafted" | "awaiting_review" | "approved";
  destination_summary: string;
  competitors: WorldEntryCompetitor[];
  vocabulary: string[];
  evidence: WorldEntryEvidence[];
  drafted_by_email: string;
  drafted_by_actor: "human" | "ai";
  drafted_at: string;
  submitted_for_review_at?: string;
  approved_by_email?: string;
  approved_at?: string;
  reason?: string;
};

export type WorldEntryState = {
  current: WorldEntryVersion | null;
  history: WorldEntryVersion[];
};

const WORLD_ENTRY_SIDECAR_KEY = "world_entry_workspace";

// ---------- Zod ----------

const projectIdInput = z.object({ projectId: z.string().uuid() });

const competitorSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  positioning: z.string().trim().max(600).default(""),
  why_relevant: z.string().trim().max(600).default(""),
});

const evidenceSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().trim().min(1).max(200),
  url: z.string().trim().max(800).optional(),
  source_id: z.string().trim().max(80).optional(),
  quote: z.string().trim().max(1200).optional(),
});

const saveDraftInput = z.object({
  projectId: z.string().uuid(),
  destination_summary: z.string().trim().max(2000).default(""),
  competitors: z.array(competitorSchema).max(20).default([]),
  vocabulary: z.array(z.string().trim().min(1).max(60)).max(40).default([]),
  evidence: z.array(evidenceSchema).max(30).default([]),
  submit_for_review: z.boolean().default(false),
});

const approveInput = z.object({
  projectId: z.string().uuid(),
  version: z.number().int().positive(),
  reason: z.string().trim().max(1000).optional(),
});

// ---------- Helpers ----------

async function readSidecar(sb: any, projectId: string): Promise<{
  spirit: Record<string, unknown>;
  state: WorldEntryState;
}> {
  const { data, error } = await sb
    .from("engine_projects")
    .select("spirit_first_analysis")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const spirit = ((data?.spirit_first_analysis as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
  const raw = (spirit[WORLD_ENTRY_SIDECAR_KEY] as WorldEntryState | undefined) ?? {
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
  next: WorldEntryState,
): Promise<void> {
  const updated = { ...spirit, [WORLD_ENTRY_SIDECAR_KEY]: next };
  const { error } = await sb
    .from("engine_projects")
    .update({ spirit_first_analysis: updated })
    .eq("id", projectId);
  if (error) throw new Error(error.message);
}

/**
 * Mirror the current World Entry version to `engine_spine_field_truth`
 * so doctrine gate readers and other spine consumers see canonical rows.
 * The sidecar remains the source of truth for full version history
 * (drafts, submissions, approver identity).
 */
export async function mirrorWorldEntryToFieldTruth(
  sb: any,
  projectId: string,
  version: WorldEntryVersion,
  actorEmail: string,
  actor: "human" | "ai",
): Promise<void> {
  const status =
    version.status === "approved"
      ? "approved_truth"
      : version.status === "awaiting_review"
        ? "needs_confirmation"
        : "inferred";
  const now = new Date().toISOString();
  const rows = [
    { field_key: "destination_summary", source_ref: { text: version.destination_summary, version: version.version } },
    { field_key: "competitors", source_ref: { items: version.competitors, version: version.version } },
    { field_key: "vocabulary", source_ref: { tokens: version.vocabulary, version: version.version } },
    { field_key: "evidence", source_ref: { items: version.evidence, version: version.version } },
  ].map((r) => ({
    project_id: projectId,
    spine: "world-entry",
    field_key: r.field_key,
    status,
    source_ref: r.source_ref,
    updated_at: now,
    updated_by_email: actorEmail,
    updated_by_actor: actor,
  }));
  const { error } = await sb
    .from("engine_spine_field_truth")
    .upsert(rows, { onConflict: "project_id,spine,field_key" });
  if (error) throw new Error(`Mirror to field_truth failed: ${error.message}`);
}

function nextVersionNumber(state: WorldEntryState): number {
  const all = [...state.history, ...(state.current ? [state.current] : [])];
  return all.reduce((m, v) => Math.max(m, v.version), 0) + 1;
}

// ---------- Server functions ----------

export const getWorldEntry = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => projectIdInput.parse(raw))
  .handler(async ({ context, data }): Promise<WorldEntryState> => {
    const ctx = context as unknown as AuthCtx;
    const { state } = await readSidecar(ctx.supabase as any, data.projectId);
    return state;
  });

export const saveWorldEntryDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => saveDraftInput.parse(raw))
  .handler(async ({ context, data }): Promise<WorldEntryState> => {
    const ctx = context as unknown as AuthCtx;
    const actor = await assertAdminOrOperator(ctx);
    const sb = ctx.supabase as any;
    const { spirit, state } = await readSidecar(sb, data.projectId);

    const now = new Date().toISOString();
    const currentIsApproved = state.current?.status === "approved";

    // If current is approved, snapshot it into history before overwriting.
    const nextHistory = currentIsApproved && state.current
      ? [...state.history, state.current]
      : state.history;

    const version = currentIsApproved
      ? nextVersionNumber({ current: null, history: nextHistory })
      : state.current?.version ?? nextVersionNumber(state);

    // Merge evidence: keep prior added_by/added_at when id matches.
    const priorEvidenceById = new Map(
      (state.current?.evidence ?? []).map((e) => [e.id, e]),
    );
    const evidence: WorldEntryEvidence[] = data.evidence.map((e) => {
      const prior = priorEvidenceById.get(e.id);
      return {
        id: e.id,
        label: e.label,
        url: e.url,
        source_id: e.source_id,
        quote: e.quote,
        added_by_email: prior?.added_by_email ?? actor,
        added_at: prior?.added_at ?? now,
      };
    });

    const nextCurrent: WorldEntryVersion = {
      version,
      status: data.submit_for_review ? "awaiting_review" : "drafted",
      destination_summary: data.destination_summary,
      competitors: data.competitors,
      vocabulary: Array.from(new Set(data.vocabulary.map((v) => v.trim()).filter(Boolean))),
      evidence,
      drafted_by_email: actor,
      drafted_by_actor: "human",
      drafted_at: now,
      submitted_for_review_at: data.submit_for_review ? now : undefined,
    };

    const nextState: WorldEntryState = {
      current: nextCurrent,
      history: nextHistory,
    };
    await writeSidecar(sb, data.projectId, spirit, nextState);

    await insertEngineActivity(sb, {
      project_id: data.projectId,
      kind: data.submit_for_review ? "world_entry.submitted" : "world_entry.drafted",
      title: data.submit_for_review
        ? `World Entry v${version} submitted for review`
        : `World Entry v${version} draft saved`,
      severity: "info",
      actor_email: actor,
    });

    return nextState;
  });

export const approveWorldEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => approveInput.parse(raw))
  .handler(async ({ context, data }): Promise<WorldEntryState> => {
    const ctx = context as unknown as AuthCtx;
    const actor = await assertAdminOrOperator(ctx);
    const sb = ctx.supabase as any;
    const { spirit, state } = await readSidecar(sb, data.projectId);
    const current = state.current;

    if (!current) throw new Error("No World Entry draft to approve.");
    if (current.version !== data.version) {
      throw new Error(`Version mismatch: current is v${current.version}, tried to approve v${data.version}. Reload and try again.`);
    }
    if (current.status === "approved") {
      throw new Error("This version is already approved.");
    }
    if (current.status !== "awaiting_review") {
      throw new Error("Only versions submitted for review can be approved.");
    }
    if (current.drafted_by_email.toLowerCase() === actor.toLowerCase()) {
      throw new Error("Second-reviewer rule: the person who drafted this version cannot approve it. Ask another admin or operator to approve.");
    }
    if (!current.destination_summary || current.destination_summary.trim().length < 20) {
      throw new Error("Destination summary must be at least 20 characters before approval.");
    }
    if (current.competitors.length < 3) {
      throw new Error(`Competitor review needs at least 3 entries (currently ${current.competitors.length}).`);
    }
    if (current.vocabulary.length < 5) {
      throw new Error(`Category vocabulary needs at least 5 tokens (currently ${current.vocabulary.length}).`);
    }
    if (current.evidence.length < 1) {
      throw new Error("At least one evidence attachment is required before approval.");
    }

    const now = new Date().toISOString();
    const approved: WorldEntryVersion = {
      ...current,
      status: "approved",
      approved_by_email: actor,
      approved_at: now,
      reason: data.reason,
    };
    const nextState: WorldEntryState = {
      current: approved,
      history: state.history,
    };
    await writeSidecar(sb, data.projectId, spirit, nextState);

    await insertEngineActivity(sb, {
      project_id: data.projectId,
      kind: "world_entry.approved",
      title: `World Entry v${approved.version} approved`,
      body: data.reason,
      severity: "success",
      actor_email: actor,
    });

    return nextState;
  });
