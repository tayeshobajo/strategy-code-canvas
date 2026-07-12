/**
 * Phase 1 — Server-only helpers + validators for the epistemic-status
 * taxonomy. Kept out of the `.functions.ts` file so that:
 *
 *  1. The TanStack server-fn split transform doesn't strip module-scope
 *     helpers that handlers reference (see `tanstack-serverfn-splitting`).
 *  2. Vitest can import the pure schemas / role helpers directly without
 *     spinning up a Supabase client.
 */
import { z } from "zod";
import { hasRoleForEmail } from "@/lib/ops/access";

// ---------- Public taxonomy ----------

export const EPISTEMIC_STATUSES = [
  "stated",
  "inferred",
  "assumed",
  "contradicted",
  "verified",
] as const;
export type EpistemicStatus = (typeof EPISTEMIC_STATUSES)[number];

/**
 * Statuses an AI caller is allowed to write. Everything else requires an
 * operator or admin — enforced in the server-fn handler via
 * `assertAdminOrOperator`.
 */
export const AI_WRITABLE_STATUSES: readonly EpistemicStatus[] = [
  "inferred",
  "assumed",
] as const;

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

// ---------- Zod schemas (exported for tests) ----------

export const uuidSchema = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "Invalid UUID",
  );

export const sourceRefSchema = z.object({
  kind: z.string().min(1),
  id: z.string().optional(),
  quote: z.string().optional(),
  timestamp: z.string().optional(),
});

export const statusSchema = z.enum(EPISTEMIC_STATUSES);

export const markSpineFieldStatusInput = z.object({
  projectId: uuidSchema,
  spine: z.enum(["point-a", "point-b"]),
  fieldKey: z.string().min(1).max(200),
  status: statusSchema,
  sourceRef: sourceRefSchema,
});

export const promoteSignalToSpineInput = z.object({
  projectId: uuidSchema,
  signalId: uuidSchema,
  spine: z.enum(["point-a", "point-b"]),
  fieldKey: z.string().min(1).max(200),
  status: statusSchema,
});

export const detectContradictionsInput = z.object({ projectId: uuidSchema });

export const getSpineFieldStatusInput = z.object({
  projectId: uuidSchema,
  spine: z.enum(["point-a", "point-b"]),
});

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

/**
 * Guard for AI-driven callers. If the actor kind is `ai`, the status must
 * be within `AI_WRITABLE_STATUSES`. Thrown errors are safe to surface —
 * they name the illegal transition, not internal schema.
 */
export function assertStatusAllowedForActor(
  status: EpistemicStatus,
  actorKind: "human" | "ai",
): void {
  if (actorKind === "ai" && !AI_WRITABLE_STATUSES.includes(status)) {
    throw new Error(
      `Forbidden status for AI actor: "${status}". AI may only write: ${AI_WRITABLE_STATUSES.join(", ")}.`,
    );
  }
}
