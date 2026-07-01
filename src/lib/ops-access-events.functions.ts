import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isOperatorEmail } from "@/lib/ops/access";

const ListInput = z.object({
  email: z.string().trim().max(200).optional(),
  event_type: z.string().trim().max(80).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

export type PortalAccessEventRow = {
  id: string;
  created_at: string;
  event_type: string;
  email: string | null;
  user_id: string | null;
  has_client_access: boolean | null;
  has_permission: boolean | null;
  has_project: boolean | null;
  project_id: string | null;
  route: string | null;
  user_agent: string | null;
  correlation_id: string | null;
  metadata: Record<string, unknown> | null;
};

export const adminListAccessEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ListInput.parse(raw ?? {}))
  .handler(async ({ context, data }) => {
    const email = context.claims?.email as string | undefined;
    if (!isOperatorEmail(email)) throw new Error("Forbidden");

    // RLS on portal_access_events already restricts SELECT to operators; this
    // uses the caller's Supabase client so RLS applies as a second safety net.
    let q = context.supabase
      .from("portal_access_events")
      .select(
        "id, created_at, event_type, email, user_id, has_client_access, has_permission, has_project, project_id, route, user_agent, correlation_id, metadata",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);

    if (data.email) q = q.ilike("email", `%${data.email.trim()}%`);
    if (data.event_type) q = q.eq("event_type", data.event_type.trim());
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);

    const { data: rows, error } = await q;
    if (error) throw error;
    return { rows: (rows ?? []) as PortalAccessEventRow[] };
  });
