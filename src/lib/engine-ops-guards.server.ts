// Server-only role guards extracted from engine-ops.functions.ts so
// createServerFn handlers can safely reference them across the
// tss-serverfn-split boundary (sibling declarations inside a
// .functions.ts module get dropped from split handler chunks and
// throw ReferenceError at runtime).
import { hasRoleForEmail } from "@/lib/ops/access";

type GuardContext = {
  claims?: Record<string, unknown>;
  supabase: {
    rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
};

export async function assertAdminEmail(context: GuardContext) {
  const email = (context.claims?.email as string | undefined) ?? undefined;
  const admin = await hasRoleForEmail(
    context.supabase as unknown as Parameters<typeof hasRoleForEmail>[0],
    email,
    "admin",
  );
  if (!admin) throw new Error("Forbidden: admin role required");
  return email ?? "unknown";
}

export async function assertOps(context: GuardContext) {
  const email = (context.claims?.email as string | undefined) ?? undefined;
  const admin = await hasRoleForEmail(
    context.supabase as unknown as Parameters<typeof hasRoleForEmail>[0],
    email,
    "admin",
  );
  if (admin) return email ?? "unknown";
  const op = await hasRoleForEmail(
    context.supabase as unknown as Parameters<typeof hasRoleForEmail>[0],
    email,
    "operator",
  );
  if (!op) throw new Error("Forbidden: admin or operator role required");
  return email ?? "unknown";
}
