/**
 * Phase 2B — Ceremony reversal + invalidation server functions.
 *
 * Two operator surfaces:
 *
 * 1. `reverseFieldApproval` — flips a single `approved_truth` spine field back
 *    to `needs_confirmation` with an operator override + reason. The DB
 *    cascade trigger marks all Point B ceremonies + truth rows stale.
 *
 * 2. `invalidatePointACeremony` — records a formal invalidation of a completed
 *    Point A ceremony, which is the unlock the trigger requires before that
 *    ceremony can be reopened. The invalidation insert cascades staleness to
 *    Point B and writes an audit row. `reopenCeremony` then flips the row
 *    back to `in_progress`.
 *
 * `listCeremonyInvalidations` powers the panel history read.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertAdminOrOperator,
  spineSchema,
  uuidSchema,
  type AuthCtx,
} from "@/lib/engine-epistemic.server";

const CEREMONIES = "engine_spine_ceremonies";
const TRUTH = "engine_spine_field_truth";
const INVALIDATIONS = "engine_spine_ceremony_invalidations";

// ---------- Inputs ----------

const reverseFieldInput = z.object({
  projectId: uuidSchema,
  spine: spineSchema,
  fieldKey: z.string().min(1).max(200),
  reason: z.string().min(4).max(2000),
});

const invalidateInput = z.object({
  ceremonyId: uuidSchema,
  reason: z.string().min(4).max(2000),
  reversedFieldKeys: z.array(z.string().min(1).max(200)).default([]),
});

const reopenCeremonyInput = z.object({
  ceremonyId: uuidSchema,
});

const listInvalidationsInput = z.object({
  projectId: uuidSchema,
});

// ---------- reverseFieldApproval ----------

export const reverseFieldApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => reverseFieldInput.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthCtx;
    const actor = await assertAdminOrOperator(ctx);

    // Load the current row.
    const { data: row, error: readErr } = await (ctx.supabase as any)
      .from(TRUTH)
      .select("id, status, source_ref, ceremony_id")
      .eq("project_id", data.projectId)
      .eq("spine", data.spine)
      .eq("field_key", data.fieldKey)
      .maybeSingle();
    if (readErr) {
      console.error("reverseFieldApproval read", readErr);
      throw new Error("Failed to load field");
    }
    if (!row) throw new Error("Field has no recorded status; nothing to reverse");
    if ((row as { status: string }).status !== "approved_truth") {
      throw new Error(
        `Field is "${(row as { status: string }).status}", not approved_truth. Only approved_truth can be reversed here.`,
      );
    }

    const nextRef = {
      kind: "gap_note",
      approval_kind: "operator_override" as const,
      reason: data.reason,
      operator_confirmed_by: actor,
      timestamp: new Date().toISOString(),
      prior_ceremony_id: (row as { ceremony_id: string | null }).ceremony_id ?? undefined,
      prior_source_ref: (row as { source_ref: unknown }).source_ref ?? undefined,
    };

    // Write directly (bypasses ceremony fn — this IS the reversal path).
    // The DB `cascade_point_a_truth_reversal` trigger fires from this update
    // and marks Point B stale when spine='point-a'.
    const { error: updErr } = await (ctx.supabase as any)
      .from(TRUTH)
      .update({
        status: "needs_confirmation",
        source_ref: nextRef,
        updated_by_email: actor,
        updated_by_actor: "human",
        updated_at: new Date().toISOString(),
        ceremony_id: null,
      })
      .eq("project_id", data.projectId)
      .eq("spine", data.spine)
      .eq("field_key", data.fieldKey);
    if (updErr) {
      console.error("reverseFieldApproval update", updErr);
      throw new Error(updErr.message ?? "Failed to reverse field");
    }

    return { ok: true, fieldKey: data.fieldKey };
  });

// ---------- invalidatePointACeremony ----------

export const invalidatePointACeremony = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => invalidateInput.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthCtx;
    const actor = await assertAdminOrOperator(ctx);

    const { data: cer, error: cerErr } = await (ctx.supabase as any)
      .from(CEREMONIES)
      .select("id, project_id, spine, status")
      .eq("id", data.ceremonyId)
      .maybeSingle();
    if (cerErr) {
      console.error("invalidatePointACeremony read", cerErr);
      throw new Error("Failed to load ceremony");
    }
    if (!cer) throw new Error("Ceremony not found");
    if ((cer as { spine: string }).spine !== "point-a") {
      throw new Error("Only Point A ceremonies carry the downstream lock; nothing to invalidate on Point B.");
    }
    if ((cer as { status: string }).status !== "completed") {
      throw new Error("Only completed ceremonies can be invalidated.");
    }

    const { data: inserted, error: insErr } = await (ctx.supabase as any)
      .from(INVALIDATIONS)
      .insert({
        project_id: (cer as { project_id: string }).project_id,
        ceremony_id: (cer as { id: string }).id,
        reason: data.reason,
        reversed_field_keys: data.reversedFieldKeys,
        created_by_email: actor,
      })
      .select("*")
      .single();
    if (insErr) {
      console.error("invalidatePointACeremony insert", insErr);
      throw new Error(insErr.message ?? "Failed to record invalidation");
    }
    return { ok: true, invalidation: inserted };
  });

// ---------- reopenCeremony ----------
// Separate call so operator can invalidate + acknowledge cascade before
// actually flipping the ceremony back to in_progress.

export const reopenCeremony = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => reopenCeremonyInput.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthCtx;
    await assertAdminOrOperator(ctx);

    const { data: cer, error: cerErr } = await (ctx.supabase as any)
      .from(CEREMONIES)
      .select("id, status, spine")
      .eq("id", data.ceremonyId)
      .maybeSingle();
    if (cerErr) {
      console.error("reopenCeremony read", cerErr);
      throw new Error("Failed to load ceremony");
    }
    if (!cer) throw new Error("Ceremony not found");
    if ((cer as { status: string }).status !== "completed") {
      throw new Error("Only completed ceremonies can be reopened.");
    }

    // DB trigger enforces that an active invalidation exists (when Point B
    // downstream ceremonies are present). Surface its message.
    const { data: updated, error } = await (ctx.supabase as any)
      .from(CEREMONIES)
      .update({
        status: "in_progress",
        completed_at: null,
        completed_by_email: null,
      })
      .eq("id", data.ceremonyId)
      .select("*")
      .single();
    if (error) {
      console.error("reopenCeremony update", error);
      throw new Error(error.message ?? "Cannot reopen ceremony");
    }
    return { ok: true, ceremony: updated };
  });

// ---------- listCeremonyInvalidations ----------

export const listCeremonyInvalidations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => listInvalidationsInput.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthCtx;
    await assertAdminOrOperator(ctx);

    const { data: rows, error } = await (ctx.supabase as any)
      .from(INVALIDATIONS)
      .select("id, ceremony_id, reason, reversed_field_keys, created_by_email, created_at, resolved_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      console.error("listCeremonyInvalidations", error);
      throw new Error("Failed to load invalidations");
    }
    return { invalidations: rows ?? [] };
  });
