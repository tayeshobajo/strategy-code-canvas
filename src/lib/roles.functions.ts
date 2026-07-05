import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail, type AppRole } from "@/lib/ops/access";
import { absoluteUrl } from "@/lib/site-url";

const RoleEnum = z.enum(["admin", "operator", "user"]);

const MutateInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: RoleEnum,
});

export type UserRoleRow = {
  id: string;
  email: string;
  role: AppRole;
  user_id: string | null;
  granted_by: string | null;
  granted_at: string;
};

async function assertAdmin(context: {
  claims?: Record<string, unknown>;
  // Loosely typed so this helper works against the middleware's typed client.
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

export const listUserRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ rows: UserRoleRow[] }> => {
    await assertAdmin(context as unknown as Parameters<typeof assertAdmin>[0]);
    const { data, error } = await context.supabase.rpc("admin_list_user_roles");
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as UserRoleRow[] };
  });

export const grantUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => MutateInput.parse(raw))
  .handler(async ({ data, context }) => {
    const callerEmail = await assertAdmin(context as unknown as Parameters<typeof assertAdmin>[0]);
    const { data: id, error } = await context.supabase.rpc("admin_grant_role", {
      _email: data.email,
      _role: data.role,
    });
    if (error) throw new Error(error.message);

    // Fire-and-forget confirmation email for admin grants. Failure must not
    // block the grant itself — we surface it only in server logs.
    if (data.role === "admin") {
      try {
        const { enqueueTransactionalEmail } = await import(
          "@/lib/email/enqueue-transactional.server"
        );
        await enqueueTransactionalEmail({
          templateName: "admin-access-granted",
          recipientEmail: data.email,
          idempotencyKey: `admin-access-${data.email}-${id}`,
          templateData: {
            grantedByName: callerEmail,
            adminDashboardUrl: "https://www.trust-tai.com/admin",
          },
        });
      } catch (err) {
        console.error("admin-access-granted email failed", err);
      }
    }

    return { id: id as string };
  });

export const revokeUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => MutateInput.parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as Parameters<typeof assertAdmin>[0]);
    const { data: affected, error } = await context.supabase.rpc("admin_revoke_role", {
      _email: data.email,
      _role: data.role,
    });
    if (error) throw new Error(error.message);
    return { removed: Number(affected ?? 0) };
  });
