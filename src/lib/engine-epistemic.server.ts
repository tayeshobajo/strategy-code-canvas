/**
 * Phase 1 (Revision R2) — Server-only helpers + validators for the
 * epistemic truth model.
 *
 * Split out of `.functions.ts` so:
 *   1. The TanStack server-fn split transform doesn't strip helpers.
 *   2. Vitest can import the pure schemas / assertions directly.
 *
 * Truth model has 8 DB-persisted statuses. `unclassified` is a UI-only
 * sentinel and is NEVER written to the database.
 */
import { z } from "zod";
import { hasRoleForEmail } from "@/lib/ops/access";
import {
  isKnownSpineFieldKey,
  type Spine,
} from "@/lib/engine-spine-fields";

// ---------- Public taxonomy ----------

export const EPISTEMIC_STATUSES = [
  "stated",
  "inferred",
  "assumed",
  "missing",
  "contradicted",
  "needs_confirmation",
  "verified",
  "approved_truth",
] as const;
export type EpistemicStatus = (typeof EPISTEMIC_STATUSES)[number];

/**
 * Statuses an AI caller may write. Anything requiring human judgement
 * (stated, verified, contradicted, approved_truth) is human-only.
 */
export const AI_WRITABLE_STATUSES: readonly EpistemicStatus[] = [
  "inferred",
  "assumed",
  "missing",
  "needs_confirmation",
] as const;

// ---------- Source refs — discriminated on `kind` ----------

/**
 * A SourceRef is a tagged record. Each status has minimum-shape rules
 * enforced by `assertEvidenceForStatus`. Human operator writes may
 * additionally carry `operator_confirmed_by` (auto-injected server-side)
 * to satisfy the human-authorized branch of the evidence rule.
 */
export type SourceRef = {
  kind: string;
  id?: string;
  quote?: string;
  timestamp?: string;
  model?: string;
  prompt_ref?: string;
  rationale?: string;
  reason?: string;
  evidence_id?: string;
  conflicting_source_ids?: string[];
  operator_confirmed_by?: string;
  approval_kind?: "ceremony" | "operator_override";
  ceremony_id?: string;
};

export const sourceRefSchema: z.ZodType<SourceRef> = z.object({
  kind: z.string().min(1),
  id: z.string().optional(),
  quote: z.string().optional(),
  timestamp: z.string().optional(),
  model: z.string().optional(),
  prompt_ref: z.string().optional(),
  rationale: z.string().optional(),
  reason: z.string().optional(),
  evidence_id: z.string().optional(),
  conflicting_source_ids: z.array(z.string()).optional(),
  operator_confirmed_by: z.string().optional(),
  approval_kind: z.enum(["ceremony", "operator_override"]).optional(),
  ceremony_id: z.string().optional(),
});

export type FieldStatusEntry = {
  status: EpistemicStatus;
  source_ref: SourceRef;
  updated_at: string;
  updated_by_email: string | null;
};

// ---------- Zod schemas (exported for tests) ----------

export const uuidSchema = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "Invalid UUID",
  );

export const statusSchema = z.enum(EPISTEMIC_STATUSES);

export const spineSchema = z.enum(["point-a", "point-b"]);

export const markSpineFieldStatusInput = z.object({
  projectId: uuidSchema,
  spine: spineSchema,
  fieldKey: z.string().min(1).max(200),
  status: statusSchema,
  sourceRef: sourceRefSchema,
});

export const promoteSignalToSpineInput = z.object({
  projectId: uuidSchema,
  signalId: uuidSchema,
  spine: spineSchema,
  fieldKey: z.string().min(1).max(200),
  status: statusSchema,
});

export const detectContradictionsInput = z.object({ projectId: uuidSchema });

export const getSpineFieldStatusInput = z.object({
  projectId: uuidSchema,
  spine: spineSchema,
});

// ---------- Field-key allowlist enforcement ----------

export function assertKnownFieldKey(spine: Spine, fieldKey: string): void {
  if (!isKnownSpineFieldKey(spine, fieldKey)) {
    throw new Error(
      `Unknown ${spine} field key: "${fieldKey}". Reject at write to prevent sidecar drift.`,
    );
  }
}

// ---------- Actor kind ----------

export type ActorKind = "human" | "ai";

/**
 * AI actors are only permitted to write statuses in AI_WRITABLE_STATUSES.
 */
export function assertStatusAllowedForActor(
  status: EpistemicStatus,
  actorKind: ActorKind,
): void {
  if (actorKind === "ai" && !AI_WRITABLE_STATUSES.includes(status)) {
    throw new Error(
      `Forbidden status for AI actor: "${status}". AI may only write: ${AI_WRITABLE_STATUSES.join(", ")}.`,
    );
  }
}

// ---------- Evidence rules ----------

/**
 * Enforce per-status evidence requirements. Rules relax for `human`
 * actors when they include `operator_confirmed_by` — the operator's
 * server-authenticated action IS the confirmation.
 *
 * For `ai` actors, the strict-shape branch is the only acceptable path.
 */
export function assertEvidenceForStatus(
  status: EpistemicStatus,
  ref: SourceRef,
  actorKind: ActorKind = "human",
): void {
  const humanOverride =
    actorKind === "human" && typeof ref.operator_confirmed_by === "string" && ref.operator_confirmed_by.length > 0;

  switch (status) {
    case "stated": {
      const strict =
        ["intake_answer", "transcript", "operator_note"].includes(ref.kind) &&
        (typeof ref.id === "string" || humanOverride);
      if (!strict) throw evidenceError("stated", "kind ∈ {intake_answer,transcript,operator_note} + (id | operator_confirmed_by)");
      return;
    }
    case "inferred": {
      const strict =
        ref.kind === "ai_inference" &&
        typeof ref.model === "string" &&
        typeof ref.prompt_ref === "string";
      if (!strict && !humanOverride) throw evidenceError("inferred", "kind=ai_inference + model + prompt_ref (or human operator override)");
      return;
    }
    case "assumed": {
      const strict =
        ref.kind === "working_assumption" && typeof ref.rationale === "string" && ref.rationale.length > 0;
      if (!strict && !humanOverride) throw evidenceError("assumed", "kind=working_assumption + rationale (or human operator override)");
      return;
    }
    case "missing": {
      const strict = ref.kind === "gap_note";
      if (!strict && !humanOverride) throw evidenceError("missing", "kind=gap_note (or human operator override)");
      return;
    }
    case "contradicted": {
      const strict =
        ref.kind === "conflict" &&
        Array.isArray(ref.conflicting_source_ids) &&
        ref.conflicting_source_ids.length >= 2;
      const humanBranch = humanOverride && typeof ref.reason === "string" && ref.reason.length > 0;
      if (!strict && !humanBranch) {
        throw evidenceError(
          "contradicted",
          "kind=conflict + conflicting_source_ids[≥2], or human operator override + reason",
        );
      }
      return;
    }
    case "needs_confirmation": {
      const hasReason = typeof ref.reason === "string" && ref.reason.length > 0;
      if (!hasReason && !humanOverride) throw evidenceError("needs_confirmation", "reason string required");
      return;
    }
    case "verified": {
      const strict =
        typeof ref.evidence_id === "string" ||
        (typeof ref.id === "string" && typeof ref.quote === "string" && typeof ref.timestamp === "string");
      if (!strict && !humanOverride) {
        throw evidenceError("verified", "evidence_id, or (source id + quote + timestamp), or human operator override");
      }
      return;
    }
    case "approved_truth": {
      // Human authorization is required by definition. AI is already
      // blocked by assertStatusAllowedForActor.
      const okCeremony = ref.approval_kind === "ceremony" && typeof ref.ceremony_id === "string";
      const okOverride = ref.approval_kind === "operator_override" && humanOverride;
      if (!(okCeremony || okOverride)) {
        throw evidenceError("approved_truth", "approval_kind=ceremony + ceremony_id, or approval_kind=operator_override + operator_confirmed_by");
      }
      return;
    }
  }
}

function evidenceError(status: EpistemicStatus, requirement: string): Error {
  return new Error(`Insufficient evidence for status "${status}": requires ${requirement}.`);
}

/**
 * Server-side enrichment applied to every operator-driven write. Adds the
 * actor email as `operator_confirmed_by` and a fresh timestamp when the
 * client did not supply one. Never removes fields.
 */
export function enrichSourceRefForHuman(ref: SourceRef, actorEmail: string): SourceRef {
  return {
    ...ref,
    operator_confirmed_by: ref.operator_confirmed_by ?? actorEmail,
    timestamp: ref.timestamp ?? new Date().toISOString(),
  };
}

// ---------- Auth helpers ----------

export type AuthCtx = {
  claims?: Record<string, unknown>;
  supabase: {
    from: (table: string) => unknown;
    rpc: (
      fn: string,
      args?: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>;
  };
};

export function actorEmail(context: AuthCtx): string | null {
  return (context.claims?.email as string | undefined) ?? null;
}

export async function assertAdminOrOperator(context: AuthCtx): Promise<string> {
  const email = actorEmail(context);
  if (!email) throw new Error("Forbidden: authentication required");
  const asRoleClient = context.supabase as unknown as Parameters<
    typeof hasRoleForEmail
  >[0];
  const isAdmin = await hasRoleForEmail(asRoleClient, email, "admin");
  if (isAdmin) return email;
  const isOperator = await hasRoleForEmail(asRoleClient, email, "operator");
  if (isOperator) return email;
  throw new Error("Forbidden: admin or operator role required");
}
