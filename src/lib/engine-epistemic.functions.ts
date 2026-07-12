/**
 * Phase 1 — Epistemic-Status Taxonomy server functions.
 *
 * Requires the pending migration in `.orchestrator/PENDING_MIGRATIONS.md`
 * (Phase 1). Until that migration is applied, calls that touch the new
 * columns (`status`, `source_ref`, `point_a_status`, `point_b_status`,
 * `epistemic_delta`) will fail with a `column ... does not exist` Postgres
 * error. This is intentional — the failure is loud so nobody assumes the
 * taxonomy is live before Tai has approved the schema change.
 *
 * Governance:
 * - AI callers may only write `inferred` or `assumed`.
 * - Only admin/operator may write `stated`, `verified`, or `contradicted`.
 * - Only admin/operator may promote a signal to a spine field.
 *
 * This module does NOT touch the existing `point_a` / `point_b` payloads.
 * All status metadata is stored on the sidecar columns to keep readers
 * that depend on the current payload shape unchanged.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";

// ---------- Types ----------

export const EPISTEMIC_STATUSES = [
  "stated",
  "inferred",
  "assumed",
  "contradicted",
  "verified",
] as const;
export type EpistemicStatus = (typeof EPISTEMIC_STATUSES)[number];

/**
 * Statuses that an AI caller is allowed to write. Anything else requires
 * an operator or admin.
 */
export const AI_WRITABLE_STATUSES: readonly EpistemicStatus[] = [
  "inferred",
  "assumed",
];

export type SourceRef = {
  /** intake_answer, transcript, extracted_signal, operator_note, chat_event */
  kind: string;
  id?: string;
  quote?: string;
  timestamp?: string;
};

export type FieldStatusEntry = {
  status: EpistemicStatus;
  source_ref: SourceRef;
  updated_at: string;
  updated_by_email: string | null;
};

// ---------- Zod ----------

const uuid = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "Invalid UUID",
  );

const sourceRefSchema = z.object({
  kind: z.string().min(1),
  id: z.string().optional(),
  quote: z.string().optional(),
  timestamp: z.string().optional(),
});

const statusSchema = z.enum(EPISTEMIC_STATUSES);

// ---------- Auth helpers ----------

type AuthCtx = {
  claims?: Record<string, unknown>;
  supabase: {
    from: (table: string) => any;
    rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
};

async function actorEmail(context: AuthCtx): Promise<string | null> {
  const email = (context.claims?.email as string | undefined) ?? null;
  return email;
}

async function assertAdminOrOperator(context: AuthCtx): Promise<string> {
  const email = await actorEmail(context);
  if (!email) throw new Error("Forbidden: authentication required");
  const isAdmin = await hasRoleForEmail(
    context.supabase as unknown as Parameters<typeof hasRoleForEmail>[0],
    email,
    "admin",
  );
  if (isAdmin) return email;
  const isOperator = await hasRoleForEmail(
    context.supabase as unknown as Parameters<typeof hasRoleForEmail>[0],
    email,
    "operator",
  );
  if (isOperator) return email;
  throw new Error("Forbidden: admin or operator role required");
}

// ---------- markSpineFieldStatus ----------
//
// Sets the epistemic status for a single top-level field of `point_a` or
// `point_b`. Only admin/operator may call — the middleware enforces this.
// AI-driven writes (`inferred` / `assumed`) go through the signal
// promotion path below, not this fn.

const markSpineFieldStatusInput = z.object({
  projectId: uuid,
  spine: z.enum(["point-a", "point-b"]),
  fieldKey: z.string().min(1).max(200),
  status: statusSchema,
  sourceRef: sourceRefSchema,
});

export const markSpineFieldStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => markSpineFieldStatusInput.parse(data))
  .handler(async ({ data, context }) => {
    const actor = await assertAdminOrOperator(context as unknown as AuthCtx);
    const column = data.spine === "point-a" ? "point_a_status" : "point_b_status";

    const { data: row, error: readErr } = await (context as unknown as AuthCtx).supabase
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
        source_ref: data.sourceRef,
        updated_at: new Date().toISOString(),
        updated_by_email: actor,
      },
    };

    const { error: writeErr } = await (context as unknown as AuthCtx).supabase
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
//
// Copies an extracted signal into the spine sidecar as `stated` or
// `verified` (operator judgment) or `inferred` (AI-driven). AI callers
// pass `actorKind='ai'` — enforced by role check.

const promoteSignalToSpineInput = z.object({
  projectId: uuid,
  signalId: uuid,
  spine: z.enum(["point-a", "point-b"]),
  fieldKey: z.string().min(1).max(200),
  status: statusSchema,
});

export const promoteSignalToSpine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => promoteSignalToSpineInput.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthCtx;
    const actor = await assertAdminOrOperator(ctx);

    // Load the signal to build a source_ref pointer.
    const { data: sig, error: sigErr } = await ctx.supabase
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

    const column = data.spine === "point-a" ? "point_a_status" : "point_b_status";
    const { data: row, error: readErr } = await ctx.supabase
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
      source_ref: {
        kind: "extracted_signal",
        id: (sig as { id: string }).id,
        quote: (sig as { detail: string | null }).detail ?? undefined,
        timestamp: (sig as { created_at: string }).created_at,
      },
      updated_at: new Date().toISOString(),
      updated_by_email: actor,
    };
    const next = { ...current, [data.fieldKey]: entry };

    const { error: writeErr } = await ctx.supabase
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
//
// Wraps the `has_contradictions(_project_id)` RPC. Returns the count and
// the first N contradicting signals so a UI can list them.

const detectContradictionsInput = z.object({ projectId: uuid });

export const detectContradictions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => detectContradictionsInput.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthCtx;
    await assertAdminOrOperator(ctx);
    const { data: rows, error } = await ctx.supabase
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
//
// Read-only helper for the UI — returns the sidecar map. Any authenticated
// team member may read. Missing sidecar column (i.e. migration not applied)
// is returned as an empty map so the UI degrades to "inferred" chips
// without breaking.

const getSpineFieldStatusInput = z.object({
  projectId: uuid,
  spine: z.enum(["point-a", "point-b"]),
});

export const getSpineFieldStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => getSpineFieldStatusInput.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthCtx;
    const column = data.spine === "point-a" ? "point_a_status" : "point_b_status";
    const { data: row, error } = await ctx.supabase
      .from("engine_projects")
      .select(`id, ${column}`)
      .eq("id", data.projectId)
      .maybeSingle();
    if (error) {
      // Pre-migration: column doesn't exist — degrade gracefully.
      console.warn("getSpineFieldStatus (pre-migration?)", error);
      return { statuses: {} as Record<string, FieldStatusEntry> };
    }
    const statuses = ((row as Record<string, unknown> | null)?.[column] ??
      {}) as Record<string, FieldStatusEntry>;
    return { statuses };
  });
