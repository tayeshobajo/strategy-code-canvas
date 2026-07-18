/**
 * Phase 2 (R4) — Point A / Point B approval ceremony server functions.
 *
 * Ceremonies formalize the operator walkthrough that promotes spine fields
 * toward `approved_truth`. DB triggers own the invariants (decision/ceremony
 * consistency, Point A precedence, approved_truth provenance, completion
 * rule); these server functions surface friendly errors and enrich the
 * source_ref stamp with the acting operator's identity.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertAdminOrOperator,
  assertEvidenceForStatus,
  assertKnownFieldKey,
  assertStatusAllowedForActor,
  enrichSourceRefForHuman,
  sourceRefSchema,
  spineSchema,
  statusSchema,
  uuidSchema,
  type AuthCtx,
  type FieldStatusEntry,
  type SourceRef,
} from "@/lib/engine-epistemic.server";
import { insertEngineActivity } from "@/lib/engine-activity";

const CEREMONIES = "engine_spine_ceremonies";
const DECISIONS = "engine_spine_ceremony_decisions";
const TRUTH = "engine_spine_field_truth";

type DbError = { message?: string } | null;
type SpineCeremonyDbClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: DbError }>;
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => Promise<{ data: unknown; error: DbError }>;
    };
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: unknown) => Promise<{ error: DbError }>;
    };
    insert: (payload: unknown) => Promise<{ error: unknown }>;
  };
};

// ---------- Inputs ----------

const startCeremonyInput = z.object({
  projectId: uuidSchema,
  spine: spineSchema,
  notes: z.string().max(2000).optional(),
});

const listCeremonyFieldsInput = z.object({
  ceremonyId: uuidSchema,
});

const recordDecisionInput = z.object({
  ceremonyId: uuidSchema,
  fieldKey: z.string().min(1).max(200),
  newStatus: statusSchema,
  sourceRef: sourceRefSchema,
});

const completeCeremonyInput = z.object({
  ceremonyId: uuidSchema,
});

const abandonCeremonyInput = z.object({
  ceremonyId: uuidSchema,
  reason: z.string().min(1).max(2000),
});

const batchApproveDraftedInput = z.object({
  projectId: uuidSchema,
  reason: z.string().trim().min(6).max(1000).optional(),
});

// ---------- Helpers ----------

async function loadCeremony(ctx: AuthCtx, ceremonyId: string) {
  const { data, error } = await (ctx.supabase as any)
    .from(CEREMONIES)
    .select("*")
    .eq("id", ceremonyId)
    .maybeSingle();
  if (error) {
    console.error("loadCeremony", error);
    throw new Error("Failed to load ceremony");
  }
  if (!data) throw new Error("Ceremony not found");
  return data as {
    id: string;
    project_id: string;
    spine: "point-a" | "point-b";
    status: "in_progress" | "completed" | "abandoned";
    opened_by_email: string;
  };
}

// ---------- startCeremony ----------

export const startCeremony = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => startCeremonyInput.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthCtx;
    const actor = await assertAdminOrOperator(ctx);

    // Defense-in-depth: pre-check Point A precedence so we can return a
    // friendlier message than the DB trigger's SQLSTATE.
    if (data.spine === "point-b") {
      const { data: prior, error: priorErr } = await (ctx.supabase as any)
        .from(CEREMONIES)
        .select("id")
        .eq("project_id", data.projectId)
        .eq("spine", "point-a")
        .eq("status", "completed")
        .limit(1)
        .maybeSingle();
      if (priorErr) {
        console.error("startCeremony point-a precheck", priorErr);
        throw new Error("Failed to check Point A precedence");
      }
      if (!prior) {
        throw new Error(
          "Point B ceremony cannot open before a Point A ceremony is completed for this project.",
        );
      }
    }

    // Return the existing in-progress ceremony if one already exists.
    const { data: existing, error: existingErr } = await (ctx.supabase as any)
      .from(CEREMONIES)
      .select("*")
      .eq("project_id", data.projectId)
      .eq("spine", data.spine)
      .eq("status", "in_progress")
      .limit(1)
      .maybeSingle();
    if (existingErr) {
      console.error("startCeremony existing check", existingErr);
      throw new Error("Failed to check active ceremony");
    }
    if (existing) return { ok: true, ceremony: existing, reused: true };

    const { data: inserted, error: insertErr } = await (ctx.supabase as any)
      .from(CEREMONIES)
      .insert({
        project_id: data.projectId,
        spine: data.spine,
        opened_by_email: actor,
        notes: data.notes ?? null,
      })
      .select("*")
      .single();
    if (insertErr) {
      console.error("startCeremony insert", insertErr);
      throw new Error(insertErr.message ?? "Failed to open ceremony");
    }
    return { ok: true, ceremony: inserted, reused: false };
  });

// ---------- listCeremonyFields ----------

export const listCeremonyFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => listCeremonyFieldsInput.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthCtx;
    await assertAdminOrOperator(ctx);
    const ceremony = await loadCeremony(ctx, data.ceremonyId);

    const { data: keyRows, error: keysErr } = await (ctx.supabase as any).rpc(
      "spine_field_keys",
      { _project_id: ceremony.project_id, _spine: ceremony.spine },
    );
    if (keysErr) {
      console.error("listCeremonyFields spine_field_keys", keysErr);
      throw new Error("Failed to load field universe");
    }
    const keys: string[] = ((keyRows ?? []) as Array<string | { spine_field_keys: string }>).map(
      (r) => (typeof r === "string" ? r : r.spine_field_keys),
    );

    const { data: truthRows, error: truthErr } = await (ctx.supabase as any)
      .from(TRUTH)
      .select("field_key, status, source_ref, updated_at, updated_by_email, ceremony_id")
      .eq("project_id", ceremony.project_id)
      .eq("spine", ceremony.spine);
    if (truthErr) {
      console.error("listCeremonyFields truth", truthErr);
      throw new Error("Failed to load field statuses");
    }
    const byKey = new Map<string, FieldStatusEntry & { ceremony_id: string | null }>();
    for (const row of (truthRows ?? []) as any[]) {
      byKey.set(row.field_key, {
        status: row.status,
        source_ref: row.source_ref ?? { kind: "unknown" },
        updated_at: row.updated_at,
        updated_by_email: row.updated_by_email,
        ceremony_id: row.ceremony_id ?? null,
      });
    }

    return {
      ceremony,
      fields: keys.map((fieldKey) => ({
        fieldKey,
        entry: byKey.get(fieldKey) ?? null,
      })),
    };
  });

// ---------- recordCeremonyDecision ----------

export const recordCeremonyDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => recordDecisionInput.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthCtx;
    const actor = await assertAdminOrOperator(ctx);
    const ceremony = await loadCeremony(ctx, data.ceremonyId);

    if (ceremony.status !== "in_progress") {
      throw new Error(`Cannot record decisions on a ${ceremony.status} ceremony`);
    }
    assertKnownFieldKey(ceremony.spine, data.fieldKey);
    assertStatusAllowedForActor(data.newStatus, "human");

    // Enrich source_ref for humans (operator_confirmed_by + timestamp)
    let enriched: SourceRef = enrichSourceRefForHuman(data.sourceRef, actor);
    // Stamp ceremony provenance for approved_truth decisions.
    if (data.newStatus === "approved_truth") {
      enriched = {
        ...enriched,
        approval_kind: "ceremony",
        ceremony_id: ceremony.id,
        operator_confirmed_by: enriched.operator_confirmed_by ?? actor,
      };
    }
    assertEvidenceForStatus(data.newStatus, enriched, "human");

    // Read prior status (if any) for the audit row.
    const { data: prior } = await (ctx.supabase as any)
      .from(TRUTH)
      .select("status")
      .eq("project_id", ceremony.project_id)
      .eq("spine", ceremony.spine)
      .eq("field_key", data.fieldKey)
      .maybeSingle();
    const priorStatus = (prior as { status?: string } | null)?.status ?? null;

    // Insert decision row (DB trigger re-verifies provenance stamp).
    const { error: decErr } = await (ctx.supabase as any)
      .from(DECISIONS)
      .insert({
        ceremony_id: ceremony.id,
        project_id: ceremony.project_id,
        spine: ceremony.spine,
        field_key: data.fieldKey,
        prior_status: priorStatus,
        new_status: data.newStatus,
        source_ref: enriched,
        decided_by_email: actor,
      });
    if (decErr) {
      console.error("recordCeremonyDecision insert decision", decErr);
      throw new Error(decErr.message ?? "Failed to record decision");
    }

    // Upsert truth row with ceremony stamp.
    const { error: truthErr } = await (ctx.supabase as any)
      .from(TRUTH)
      .upsert(
        {
          project_id: ceremony.project_id,
          spine: ceremony.spine,
          field_key: data.fieldKey,
          status: data.newStatus,
          source_ref: enriched,
          updated_by_email: actor,
          updated_by_actor: "human",
          updated_at: new Date().toISOString(),
          ceremony_id: ceremony.id,
        },
        { onConflict: "project_id,spine,field_key" },
      );
    if (truthErr) {
      console.error("recordCeremonyDecision upsert truth", truthErr);
      throw new Error(truthErr.message ?? "Failed to save field status");
    }

    return { ok: true, fieldKey: data.fieldKey, newStatus: data.newStatus };
  });

// ---------- completeCeremony ----------

export const completeCeremony = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => completeCeremonyInput.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthCtx;
    const actor = await assertAdminOrOperator(ctx);
    const ceremony = await loadCeremony(ctx, data.ceremonyId);

    if (ceremony.status !== "in_progress") {
      throw new Error(`Ceremony is already ${ceremony.status}`);
    }

    // Flip the row — DB trigger enforces the canonical completion rule.
    const { data: updated, error } = await (ctx.supabase as any)
      .from(CEREMONIES)
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_by_email: actor,
      })
      .eq("id", ceremony.id)
      .select("*")
      .single();
    if (error) {
      console.error("completeCeremony update", error);
      throw new Error(error.message ?? "Cannot complete ceremony");
    }
    return { ok: true, ceremony: updated };
  });

// ---------- abandonCeremony ----------

export const abandonCeremony = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => abandonCeremonyInput.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthCtx;
    const actor = await assertAdminOrOperator(ctx);
    const ceremony = await loadCeremony(ctx, data.ceremonyId);

    if (ceremony.status !== "in_progress") {
      throw new Error(`Ceremony is already ${ceremony.status}`);
    }

    const { data: updated, error } = await (ctx.supabase as any)
      .from(CEREMONIES)
      .update({
        status: "abandoned",
        abandoned_at: new Date().toISOString(),
        abandoned_by_email: actor,
        abandon_reason: data.reason,
      })
      .eq("id", ceremony.id)
      .select("*")
      .single();
    if (error) {
      console.error("abandonCeremony update", error);
      throw new Error(error.message ?? "Cannot abandon ceremony");
    }
    return { ok: true, ceremony: updated };
  });

// ---------- getCeremonySummary ----------
//
// Lightweight per-project summary powering the WorkspaceStepper badge on
// Point A / Point B steps. Returns the latest ceremony row per spine plus a
// derived badge tone so callers do not have to reimplement the label logic.

const ceremonySummaryInput = z.object({ projectId: uuidSchema });

export type CeremonyBadgeState =
  | "none"
  | "in_progress"
  | "stale"
  | "completed"
  | "abandoned"
  | "re_review";

export type CeremonySpineSummary = {
  spine: "point-a" | "point-b";
  status: "none" | "in_progress" | "completed" | "abandoned";
  badge: CeremonyBadgeState;
  stale_since: string | null;
  stale_reason: string | null;
  re_review_required: boolean;
  opened_at: string | null;
  completed_at: string | null;
  ceremony_id: string | null;
};

function deriveBadge(row: {
  status: string;
  stale_since: string | null;
  re_review_required: boolean;
} | null): CeremonyBadgeState {
  if (!row) return "none";
  if (row.status === "completed") {
    return row.re_review_required ? "re_review" : "completed";
  }
  if (row.status === "abandoned") return "abandoned";
  if (row.status === "in_progress") {
    return row.stale_since ? "stale" : "in_progress";
  }
  return "none";
}

export const getCeremonySummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ceremonySummaryInput.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthCtx;
    // No role assertion: read-only summary consumed by the internal
    // WorkspaceStepper for any authenticated internal viewer.
    const { data: rows, error } = await (ctx.supabase as any)
      .from(CEREMONIES)
      .select(
        "id, spine, status, stale_since, stale_reason, re_review_required, opened_at, completed_at, updated_at",
      )
      .eq("project_id", data.projectId)
      .order("updated_at", { ascending: false });
    if (error) {
      console.error("getCeremonySummary", error);
      throw new Error("Failed to load ceremony summary");
    }

    const bySpine = new Map<string, any>();
    for (const r of (rows ?? []) as any[]) {
      if (!bySpine.has(r.spine)) bySpine.set(r.spine, r);
    }

    const build = (spine: "point-a" | "point-b"): CeremonySpineSummary => {
      const r = bySpine.get(spine) ?? null;
      return {
        spine,
        status: (r?.status as CeremonySpineSummary["status"]) ?? "none",
        badge: deriveBadge(r),
        stale_since: r?.stale_since ?? null,
        stale_reason: r?.stale_reason ?? null,
        re_review_required: Boolean(r?.re_review_required),
        opened_at: r?.opened_at ?? null,
        completed_at: r?.completed_at ?? null,
        ceremony_id: r?.id ?? null,
      };
    };

    return {
      ok: true as const,
      summary: {
        "point-a": build("point-a"),
        "point-b": build("point-b"),
      } satisfies Record<"point-a" | "point-b", CeremonySpineSummary>,
    };
  });

// ---------- batchApproveDraftedSpineTruth ----------
//
// AI may draft or mark fields for review, but only a human operator can
// promote those fields into approved truth. This uses the existing DB-audited
// operator override path instead of weakening the roadmap approval gate.

export const batchApproveDraftedSpineTruth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => batchApproveDraftedInput.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthCtx;
    const actor = await assertAdminOrOperator(ctx);
    const sb = ctx.supabase as unknown as SpineCeremonyDbClient;
    const now = new Date().toISOString();
    const reason =
      data.reason ??
      "Operator reviewed AI-drafted Spine details and approved them for roadmap baseline gating.";

    const requiredFields: Array<{ spine: "point-a" | "point-b"; fieldKey: string }> = [];
    const seen = new Set<string>();
    for (const spine of ["point-a", "point-b"] as const) {
      const { data: keyRows, error } = await sb.rpc("spine_field_keys", {
        _project_id: data.projectId,
        _spine: spine,
      });
      if (error) {
        console.error("batchApproveDraftedSpineTruth spine_field_keys", error);
        throw new Error("Failed to load Spine field keys");
      }
      for (const row of (keyRows ?? []) as Array<string | { spine_field_keys: string }>) {
        const fieldKey = typeof row === "string" ? row : row.spine_field_keys;
        assertKnownFieldKey(spine, fieldKey);
        const uniqueKey = `${spine}\u001f${fieldKey}`;
        if (!seen.has(uniqueKey)) {
          seen.add(uniqueKey);
          requiredFields.push({ spine, fieldKey });
        }
      }
    }

    const { data: rows, error: rowsErr } = await sb
      .from(TRUTH)
      .select("id, spine, field_key, status, source_ref, updated_by_actor, updated_by_email")
      .eq("project_id", data.projectId);
    if (rowsErr) {
      console.error("batchApproveDraftedSpineTruth load truth", rowsErr);
      throw new Error("Failed to load drafted Spine truth");
    }

    const truthRows = (rows ?? []) as Array<{
      id: string;
      spine: "point-a" | "point-b";
      field_key: string;
      status: string;
      source_ref: SourceRef | null;
      updated_by_actor: string | null;
      updated_by_email: string | null;
    }>;

    const byKey = new Map(truthRows.map((row) => [`${row.spine}\u001f${row.field_key}`, row]));
    const approved: Array<{ spine: "point-a" | "point-b"; fieldKey: string; priorStatus: string }> = [];
    const skipped: Array<{ spine: "point-a" | "point-b"; fieldKey: string; reason: string }> = [];

    for (const field of requiredFields) {
      const row = byKey.get(`${field.spine}\u001f${field.fieldKey}`);
      if (!row) {
        skipped.push({ ...field, reason: "No durable truth row exists yet" });
        continue;
      }
      if (row.status === "approved_truth") continue;

      const sourceKind = row.source_ref?.kind ?? "";
      const isAiDraft =
        row.updated_by_actor === "ai" ||
        sourceKind === "ai_inference" ||
        sourceKind === "ai_fill_review";
      if (!isAiDraft) {
        skipped.push({ ...field, reason: `Current status is ${row.status}; not an AI draft` });
        continue;
      }
      if (!["inferred", "needs_confirmation", "assumed", "stated", "verified"].includes(row.status)) {
        skipped.push({ ...field, reason: `Current status is ${row.status}; cannot batch approve` });
        continue;
      }

      const sourceRef = enrichSourceRefForHuman(
        {
          kind: "operator_override",
          approval_kind: "operator_override",
          operator_email: actor,
          reason,
          prior_status: row.status,
          prior_source_ref: row.source_ref ?? null,
        } as SourceRef,
        actor,
      );
      assertStatusAllowedForActor("approved_truth", "human");
      assertEvidenceForStatus("approved_truth", sourceRef, "human");

      const { error: updateErr } = await sb
        .from(TRUTH)
        .update({
          status: "approved_truth",
          source_ref: sourceRef,
          updated_by_email: actor,
          updated_by_actor: "human",
          updated_at: now,
          ceremony_id: null,
        })
        .eq("id", row.id);
      if (updateErr) {
        console.error("batchApproveDraftedSpineTruth update", updateErr);
        throw new Error(updateErr.message ?? "Failed to approve drafted Spine truth");
      }
      approved.push({ ...field, priorStatus: row.status });
    }

    if (approved.length) {
      await insertEngineActivity(sb, {
        project_id: data.projectId,
        kind: "spine_truth.batch_approved",
        title: `Approved ${approved.length} drafted Spine truth${approved.length === 1 ? "" : "s"}`,
        body: reason,
        severity: "success",
        actor_email: actor,
      });
    }

    return { ok: true as const, approved, skipped };
  });
