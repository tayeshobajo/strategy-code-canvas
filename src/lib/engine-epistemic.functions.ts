/**
 * Phase 1 (Revision R3 — Variant B) — Epistemic-Status server functions.
 *
 * Reads and writes now target the canonical normalized table
 * `public.engine_spine_field_truth`. The R2 sidecars
 * (`engine_projects.point_a_status` / `point_b_status`) are gone from the
 * plan and are not referenced here.
 *
 * Thin `createServerFn` wrappers. All validators, evidence rules, field
 * allowlists, and role helpers live in `./engine-epistemic.server.ts` so
 * the TanStack server-fn split transform never strips a module-scope
 * reference the handler needs.
 *
 * Requires the pending migration in `.orchestrator/PENDING_MIGRATIONS.md`
 * (Phase 1 R3). Until applied, writes fail loudly with an unknown-table
 * error; `getSpineFieldStatus` degrades to an empty map so the UI keeps
 * rendering neutral "No status" pills.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertAdminOrOperator,
  assertEvidenceForStatus,
  assertKnownFieldKey,
  assertStatusAllowedForActor,
  detectContradictionsInput,
  enrichSourceRefForHuman,
  getSpineFieldStatusInput,
  markSpineFieldStatusInput,
  promoteSignalToSpineInput,
  type AuthCtx,
  type FieldStatusEntry,
  type SourceRef,
} from "@/lib/engine-epistemic.server";

// Re-export the taxonomy so existing imports from this module keep working.
export {
  EPISTEMIC_STATUSES,
  AI_WRITABLE_STATUSES,
  type EpistemicStatus,
  type SourceRef,
  type FieldStatusEntry,
} from "@/lib/engine-epistemic.server";

const TRUTH_TABLE = "engine_spine_field_truth";

// ---------- markSpineFieldStatus ----------

export const markSpineFieldStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => markSpineFieldStatusInput.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthCtx;
    const actor = await assertAdminOrOperator(ctx);

    // Reject unknown field keys — sidecar-drift guardrail (still enforced
    // in-app even though the truth store is now normalized).
    assertKnownFieldKey(data.spine, data.fieldKey);

    // Human operator via server-fn. AI writes go through a different path.
    assertStatusAllowedForActor(data.status, "human");

    const enriched: SourceRef = enrichSourceRefForHuman(data.sourceRef, actor);
    assertEvidenceForStatus(data.status, enriched, "human");

    const { error } = await (ctx.supabase as any)
      .from(TRUTH_TABLE)
      .upsert(
        {
          project_id: data.projectId,
          spine: data.spine,
          field_key: data.fieldKey,
          status: data.status,
          source_ref: enriched,
          updated_by_email: actor,
          updated_by_actor: "human",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "project_id,spine,field_key" },
      );
    if (error) {
      console.error("markSpineFieldStatus upsert", error);
      throw new Error("Failed to save status");
    }
    return { ok: true, fieldKey: data.fieldKey, status: data.status };
  });

// ---------- promoteSignalToSpine ----------

export const promoteSignalToSpine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => promoteSignalToSpineInput.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthCtx;
    const actor = await assertAdminOrOperator(ctx);

    assertKnownFieldKey(data.spine, data.fieldKey);
    assertStatusAllowedForActor(data.status, "human");

    const { data: sig, error: sigErr } = await (ctx.supabase as any)
      .from("engine_extracted_signals")
      .select("id, project_id, label, detail, source_id, created_at, status")
      .eq("id", data.signalId)
      .maybeSingle();
    if (sigErr) {
      console.error("promoteSignalToSpine read signal", sigErr);
      throw new Error("Failed to read signal");
    }
    if (!sig) throw new Error("Signal not found");
    if ((sig as { project_id: string }).project_id !== data.projectId) {
      throw new Error("Signal does not belong to this project");
    }

    const built: SourceRef = enrichSourceRefForHuman(
      {
        kind: "extracted_signal",
        id: (sig as { id: string }).id,
        quote: (sig as { detail: string | null }).detail ?? undefined,
        timestamp: (sig as { created_at: string }).created_at,
      },
      actor,
    );
    assertEvidenceForStatus(data.status, built, "human");

    const { error } = await (ctx.supabase as any)
      .from(TRUTH_TABLE)
      .upsert(
        {
          project_id: data.projectId,
          spine: data.spine,
          field_key: data.fieldKey,
          status: data.status,
          source_ref: built,
          updated_by_email: actor,
          updated_by_actor: "human",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "project_id,spine,field_key" },
      );
    if (error) {
      console.error("promoteSignalToSpine upsert", error);
      throw new Error("Failed to promote signal");
    }
    return { ok: true, fieldKey: data.fieldKey };
  });

// ---------- detectContradictions ----------

export const detectContradictions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => detectContradictionsInput.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthCtx;
    await assertAdminOrOperator(ctx);

    // (a) Contradicted extracted signals — pre-existing surface.
    const { data: sigRows, error: sigErr } = await (ctx.supabase as any)
      .from("engine_extracted_signals")
      .select("id, label, detail, category, created_at")
      .eq("project_id", data.projectId)
      .eq("status", "contradicted")
      .is("superseded_by", null)
      .order("created_at", { ascending: false })
      .limit(50);
    if (sigErr) {
      console.error("detectContradictions signals", sigErr);
      throw new Error("Failed to detect contradictions (signals)");
    }

    // (b) Contradicted spine-field truth rows — new surface in R3.
    const { data: truthRows, error: truthErr } = await (ctx.supabase as any)
      .from(TRUTH_TABLE)
      .select("id, spine, field_key, source_ref, updated_at, updated_by_email")
      .eq("project_id", data.projectId)
      .eq("status", "contradicted")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (truthErr) {
      // Pre-migration: table may not exist. Log + degrade to signals-only.
      console.warn("detectContradictions truth (pre-migration?)", truthErr);
    }

    const signals = sigRows ?? [];
    const spineFields = truthRows ?? [];
    return {
      hasContradictions: signals.length + spineFields.length > 0,
      count: signals.length + spineFields.length,
      signals,
      spineFields,
    };
  });

// ---------- getSpineFieldStatus ----------

export const getSpineFieldStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => getSpineFieldStatusInput.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthCtx;

    const { data: rows, error } = await (ctx.supabase as any)
      .from(TRUTH_TABLE)
      .select("field_key, status, source_ref, updated_at, updated_by_email")
      .eq("project_id", data.projectId)
      .eq("spine", data.spine);

    if (error) {
      // Pre-migration: table doesn't exist — degrade gracefully so the UI
      // keeps rendering neutral "unclassified" pills.
      console.warn("getSpineFieldStatus (pre-migration?)", error);
      return { statuses: {} as Record<string, FieldStatusEntry> };
    }

    const statuses: Record<string, FieldStatusEntry> = {};
    for (const row of (rows ?? []) as Array<{
      field_key: string;
      status: FieldStatusEntry["status"];
      source_ref: SourceRef;
      updated_at: string;
      updated_by_email: string | null;
    }>) {
      statuses[row.field_key] = {
        status: row.status,
        source_ref: row.source_ref ?? { kind: "unknown" },
        updated_at: row.updated_at,
        updated_by_email: row.updated_by_email,
      };
    }
    return { statuses };
  });
