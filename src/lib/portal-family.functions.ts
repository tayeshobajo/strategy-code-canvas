// Phase 5D — portal-safe family surface.
// Never returns unpublished/in-progress child names or internal fields.
// Anything not `approved` / `completed` AND without an active
// `client_portal_projects` publication is aggregated into a count only.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchFamilySubtree, findFamilyRootId } from "@/lib/engine-project-family.server";

const PUBLISHED_STATUSES = new Set(["approved", "completed"]);

const Input = z.object({ portalProjectId: z.string().uuid() });

export type PortalFamilyPayload = {
  rootId: string | null;
  visible: Array<{
    id: string;
    name: string;
    status: "approved" | "completed";
    completed_at: string | null;
    child_progress: { total: number; completed: number };
  }>;
  hiddenInProgressCount: number;
};

export const getPortalProjectFamily = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data, context }): Promise<PortalFamilyPayload> => {
    const email = (context.claims?.email as string | undefined) ?? null;
    if (!email) throw new Error("Unauthorized");
    const sb = context.supabase;

    // Confirm caller has access to this portal project via the portal
    // permissions view (RLS-scoped read). If they don't, return empty.
    const { data: proj } = await sb
      .from("client_portal_projects")
      .select("id, primary_email")
      .eq("id", data.portalProjectId)
      .maybeSingle();
    if (!proj) return { rootId: null, visible: [], hiddenInProgressCount: 0 };

    // Find engine project(s) linked to this portal project id, then walk
    // family from there. We use the admin client because the portal user
    // typically doesn't have direct read access to engine_projects; the
    // filtering below strips anything not client-safe.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: engineRow } = await supabaseAdmin
      .from("engine_projects")
      .select("id")
      .eq("client_portal_project_id", data.portalProjectId)
      .maybeSingle();
    if (!engineRow) return { rootId: null, visible: [], hiddenInProgressCount: 0 };

    const rootId = await findFamilyRootId(supabaseAdmin, engineRow.id as string);
    const nodes = await fetchFamilySubtree(supabaseAdmin, rootId);

    // Only nodes that are approved/completed AND linked to a client portal
    // project (published surface) are eligible to be named to the client.
    // Others are counted as "in-progress workstreams".
    const visible = nodes
      .filter(
        (n) =>
          PUBLISHED_STATUSES.has(n.status) && !!n.client_portal_project_id,
      )
      .map((n) => ({
        id: n.id,
        name: n.name,
        status: n.status as "approved" | "completed",
        completed_at: n.completed_at,
        child_progress: {
          total: n.child_count,
          completed: n.completed_child_count,
        },
      }));
    const hiddenInProgressCount = nodes.length - visible.length;

    return { rootId, visible, hiddenInProgressCount };
  });
