import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";

/**
 * Admin-only workflow to change engine_sources.visibility away from the
 * default `internal_only`. Every change is written to engine_audit_log
 * with old/new values and the acting admin's email — this is the sole
 * sanctioned path for promoting a source to `operator_only` or
 * `client_safe`. Direct UPDATEs are blocked to non-admins by RLS.
 */

const VisibilityEnum = z.enum(["internal_only", "operator_only", "client_safe"]);
export type SourceVisibility = z.infer<typeof VisibilityEnum>;

const ChangeInput = z.object({
  sourceId: z.string().uuid(),
  visibility: VisibilityEnum,
  reason: z.string().trim().min(3).max(500),
});

async function assertAdmin(context: {
  claims?: Record<string, unknown>;
  supabase: { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> };
}) {
  const email = (context.claims?.email as string | undefined) ?? undefined;
  const ok = await hasRoleForEmail(
    context.supabase as unknown as Parameters<typeof hasRoleForEmail>[0],
    email,
    "admin",
  );
  if (!ok) throw new Error("Forbidden: admin role required");
  return email!.toLowerCase();
}

export const changeSourceVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ChangeInput.parse(raw))
  .handler(async ({ data, context }) => {
    const callerEmail = await assertAdmin(
      context as unknown as Parameters<typeof assertAdmin>[0],
    );

    // Load current row (needed for project_id + old visibility snapshot).
    const { data: existing, error: readErr } = await context.supabase
      .from("engine_sources")
      .select("id, project_id, visibility, name")
      .eq("id", data.sourceId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!existing) throw new Error("Source not found");

    const oldVisibility = existing.visibility as SourceVisibility;
    if (oldVisibility === data.visibility) {
      return { ok: true, unchanged: true, sourceId: data.sourceId };
    }

    const { error: updateErr } = await context.supabase
      .from("engine_sources")
      .update({ visibility: data.visibility, updated_at: new Date().toISOString() })
      .eq("id", data.sourceId);
    if (updateErr) throw new Error(`Failed to update visibility: ${updateErr.message}`);

    const { error: auditErr } = await context.supabase.from("engine_audit_log").insert({
      project_id: existing.project_id,
      actor_email: callerEmail,
      action: "source_visibility_changed",
      summary: `Source "${existing.name}" visibility ${oldVisibility} → ${data.visibility}`,
      affected_modules: ["engine_sources"],
      target_id: data.sourceId,
      field_changed: "visibility",
      old_value: oldVisibility,
      new_value: data.visibility,
      reason: data.reason,
      metadata: { source_name: existing.name },
    });
    if (auditErr) {
      // Best-effort rollback so we never have an unaudited visibility change.
      await context.supabase
        .from("engine_sources")
        .update({ visibility: oldVisibility })
        .eq("id", data.sourceId);
      throw new Error(`Failed to write audit log; visibility rolled back: ${auditErr.message}`);
    }

    return {
      ok: true,
      unchanged: false,
      sourceId: data.sourceId,
      oldVisibility,
      newVisibility: data.visibility,
    };
  });
