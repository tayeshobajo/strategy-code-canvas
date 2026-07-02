import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail, type AppRole } from "@/lib/ops/access";

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
    await assertAdmin(context as unknown as Parameters<typeof assertAdmin>[0]);
    const { data: id, error } = await context.supabase.rpc("admin_grant_role", {
      _email: data.email,
      _role: data.role,
    });
    if (error) throw new Error(error.message);
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
