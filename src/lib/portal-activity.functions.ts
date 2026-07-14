/**
 * Phase 2 (Top-10 gap sweep) — Portal activity tracking helper.
 *
 * Centralized writer for `client_portal_activity`. Every client-facing
 * surface (viewed, downloaded, replied, follow_up_needed, acknowledged)
 * routes through `logPortalActivity` so we have a single audit path.
 *
 * DB shape: uses the existing 9-column `client_portal_activity` table via
 * the `log_client_portal_activity` SECURITY DEFINER RPC. The audit criteria
 * `kind`, `subject_type`, `subject_id` are mapped onto:
 *   - `event_type` = `kind`
 *   - `metadata`   = { subject_type, subject_id, ...caller_metadata }
 *
 * No schema change required. See
 * `.orchestrator/audit/acceptance-criteria-2026-07-14c.md#gap-1`.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PortalActivityKind =
  | "viewed"
  | "downloaded"
  | "replied"
  | "follow_up_needed"
  | "acknowledged";

export type LogPortalActivityInput = {
  project_id: string;
  kind: PortalActivityKind;
  subject_type: string;
  subject_id: string;
  summary?: string | null;
  client_visible?: boolean;
  metadata?: Record<string, unknown>;
};

const ALLOWED_KINDS: ReadonlySet<PortalActivityKind> = new Set([
  "viewed",
  "downloaded",
  "replied",
  "follow_up_needed",
  "acknowledged",
]);

export const logPortalActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: LogPortalActivityInput) => {
    if (!input?.project_id) throw new Error("project_id is required");
    if (!input?.kind || !ALLOWED_KINDS.has(input.kind)) {
      throw new Error(`kind must be one of: ${[...ALLOWED_KINDS].join(", ")}`);
    }
    if (!input?.subject_type?.trim()) throw new Error("subject_type is required");
    if (!input?.subject_id?.trim()) throw new Error("subject_id is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, claims } = context;
    const actorEmail = (claims as { email?: string | null } | null)?.email ?? null;
    const rpc = (supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ error: { message: string } | null }>;
    }).rpc;

    const metadata = {
      subject_type: data.subject_type,
      subject_id: data.subject_id,
      ...(data.metadata ?? {}),
    };

    const summary =
      data.summary ??
      `${data.kind}: ${data.subject_type}${data.subject_id ? ` (${data.subject_id})` : ""}`;

    const { error } = await rpc("log_client_portal_activity", {
      _project_id: data.project_id,
      _actor_type: "client",
      _actor_email: actorEmail ?? "",
      _event_type: data.kind,
      _summary: summary,
      _client_visible: data.client_visible ?? true,
      _metadata: metadata,
    });

    if (error) {
      return { ok: false as const, error: error.message };
    }
    return { ok: true as const };
  });
