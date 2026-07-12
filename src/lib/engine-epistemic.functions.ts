/**
 * Phase 1 (Revision R2) — Epistemic-Status server functions.
 *
 * Thin `createServerFn` wrappers. All validators, evidence rules, field
 * allowlists, and role helpers live in `./engine-epistemic.server.ts` so
 * the TanStack server-fn split transform never strips a module-scope
 * reference the handler needs.
 *
 * Requires the pending migration in `.orchestrator/PENDING_MIGRATIONS.md`
 * (Phase 1). Until applied, calls that touch `point_a_status`,
 * `point_b_status`, `status`, or `source_ref` fail with a
 * `column ... does not exist` Postgres error — intentional loud failure.
 * `getSpineFieldStatus` degrades to an empty map so the UI stays alive.
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

// ---------- markSpineFieldStatus ----------

export const markSpineFieldStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => markSpineFieldStatusInput.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthCtx;
    const actor = await assertAdminOrOperator(ctx);

    // Reject unknown field keys — sidecar-drift guardrail.
    assertKnownFieldKey(data.spine, data.fieldKey);

    // Human operator via server-fn. AI writes go through a different path.
    assertStatusAllowedForActor(data.status, "human");

    // Enrich then validate evidence rule.
    const enriched: SourceRef = enrichSourceRefForHuman(data.sourceRef, actor);
    assertEvidenceForStatus(data.status, enriched, "human");

    const column = data.spine === "point-a" ? "point_a_status" : "point_b_status";

    const { data: row, error: readErr } = await (ctx.supabase as any)
      .from("engine_projects")
      .select(`id, ${column}`)
      .eq("id", data.projectId)
      .maybeSingle();
    if (readErr) {
      console.error("markSpineFieldStatus read", readErr);
      throw new Error("Failed to read project");
    }
    if (!row) throw new Error("Project not found");

    const current = ((row as Record<string, unknown>)[column] ?? {}) as Record<
      string,
      FieldStatusEntry
    >;
    const next: Record<string, FieldStatusEntry> = {
      ...current,
      [data.fieldKey]: {
        status: data.status,
        source_ref: enriched,
        updated_at: new Date().toISOString(),
        updated_by_email: actor,
      },
    };

    const { error: writeErr } = await (ctx.supabase as any)
      .from("engine_projects")
      .update({ [column]: next })
      .eq("id", data.projectId);
    if (writeErr) {
      console.error("markSpineFieldStatus write", writeErr);
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

    const column = data.spine === "point-a" ? "point_a_status" : "point_b_status";
    const { data: row, error: readErr } = await (ctx.supabase as any)
      .from("engine_projects")
      .select(`id, ${column}`)
      .eq("id", data.projectId)
      .maybeSingle();
    if (readErr || !row) {
      console.error("promoteSignalToSpine read project", readErr);
      throw new Error("Failed to read project");
    }

    const current = ((row as Record<string, unknown>)[column] ?? {}) as Record<
      string,
      FieldStatusEntry
    >;
    const entry: FieldStatusEntry = {
      status: data.status,
      source_ref: built,
      updated_at: new Date().toISOString(),
      updated_by_email: actor,
    };
    const next = { ...current, [data.fieldKey]: entry };

    const { error: writeErr } = await (ctx.supabase as any)
      .from("engine_projects")
      .update({ [column]: next })
      .eq("id", data.projectId);
    if (writeErr) {
      console.error("promoteSignalToSpine write", writeErr);
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
    const { data: rows, error } = await (ctx.supabase as any)
      .from("engine_extracted_signals")
      .select("id, label, detail, category, created_at")
      .eq("project_id", data.projectId)
      .eq("status", "contradicted")
      .is("superseded_by", null)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      console.error("detectContradictions", error);
      throw new Error("Failed to detect contradictions");
    }
    return {
      hasContradictions: (rows?.length ?? 0) > 0,
      count: rows?.length ?? 0,
      signals: rows ?? [],
    };
  });

// ---------- getSpineFieldStatus ----------

export const getSpineFieldStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => getSpineFieldStatusInput.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthCtx;
    const column = data.spine === "point-a" ? "point_a_status" : "point_b_status";
    const { data: row, error } = await (ctx.supabase as any)
      .from("engine_projects")
      .select(`id, ${column}`)
      .eq("id", data.projectId)
      .maybeSingle();
    if (error) {
      // Pre-migration: column doesn't exist — degrade gracefully so the UI
      // continues to render neutral "unclassified" pills.
      console.warn("getSpineFieldStatus (pre-migration?)", error);
      return { statuses: {} as Record<string, FieldStatusEntry> };
    }
    const statuses = ((row as Record<string, unknown> | null)?.[column] ??
      {}) as Record<string, FieldStatusEntry>;
    return { statuses };
  });
