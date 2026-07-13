// Phase 5D — app-layer server functions for the project-family surface.
// DB layer (parent_project_id, cycle/frozen guards, engine_project_family_summary
// view) is applied. These functions expose safe staff-side reads and mutations.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import {
  fetchAncestryChain,
  fetchFamilySubtree,
  findFamilyRootId,
  isFrozenStatus,
  wouldCreateCycle,
  type FamilyNode,
} from "@/lib/engine-project-family.server";

async function assertStaff(context: any): Promise<string> {
  const email = (context.claims?.email as string | undefined) ?? undefined;
  const sb = context.supabase;
  const isAdmin = await hasRoleForEmail(sb, email, "admin");
  if (isAdmin) return email ?? "";
  const isOp = await hasRoleForEmail(sb, email, "operator");
  if (!isOp) throw new Error("Forbidden: admin or operator role required");
  return email ?? "";
}

// ---------- createChildProject ----------
const CreateChildInput = z.object({
  parentProjectId: z.string().uuid(),
  name: z.string().min(1).max(200),
  clientId: z.string().uuid().optional(),
  projectKind: z.string().max(60).optional(),
  deliveryMode: z.enum(["internal_only", "client_portal_required"]).optional(),
});

export const createChildProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => CreateChildInput.parse(raw))
  .handler(async ({ data, context }) => {
    const actor = await assertStaff(context);
    const sb = context.supabase;

    const { data: parent, error: parentErr } = await sb
      .from("engine_projects")
      .select("id,name,status,client_id,delivery_mode")
      .eq("id", data.parentProjectId)
      .maybeSingle();
    if (parentErr) throw new Error(`parent lookup failed: ${parentErr.message}`);
    if (!parent) throw new Error("Parent project not found");
    if (isFrozenStatus(parent.status)) {
      throw new Error(
        `Cannot add child under ${parent.status} parent (child set is frozen once parent is approved).`,
      );
    }

    const clientId = data.clientId ?? (parent.client_id as string);
    if (clientId !== parent.client_id) {
      throw new Error("Child project must share the parent's client_id");
    }

    const insertPayload: any = {
      name: data.name,
      client_id: clientId,
      parent_project_id: data.parentProjectId,
      status: "planning",
    };
    if (data.projectKind) insertPayload.project_kind = data.projectKind;
    if (data.deliveryMode) insertPayload.delivery_mode = data.deliveryMode;

    const { data: child, error: insErr } = await sb
      .from("engine_projects")
      .insert(insertPayload)
      .select("id")
      .single();
    if (insErr) throw new Error(`child project insert failed: ${insErr.message}`);

    const childId = child.id as string;
    const title = `Child project created${actor ? ` by ${actor}` : ""}`;
    await sb.from("engine_activity").insert([
      {
        project_id: data.parentProjectId,
        kind: "child_project_created",
        title,
        body: `New child: ${data.name} (${childId})`,
        severity: "info",
      },
      {
        project_id: childId,
        kind: "child_project_created",
        title: `Created under parent ${parent.name}`,
        body: `Parent: ${parent.name} (${data.parentProjectId})`,
        severity: "info",
      },
    ]);

    return { childId };
  });

// ---------- reparentProject ----------
const ReparentInput = z.object({
  projectId: z.string().uuid(),
  newParentId: z.string().uuid().nullable(),
});

export const reparentProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ReparentInput.parse(raw))
  .handler(async ({ data, context }) => {
    const actor = await assertStaff(context);
    const sb = context.supabase;

    const { data: proj, error: projErr } = await sb
      .from("engine_projects")
      .select("id,name,status,client_id,parent_project_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (projErr) throw new Error(`project lookup failed: ${projErr.message}`);
    if (!proj) throw new Error("Project not found");

    if (isFrozenStatus(proj.status)) {
      throw new Error(
        `Cannot reparent ${proj.status} project (frozen once approved/completed).`,
      );
    }

    const oldParentId = (proj.parent_project_id as string | null) ?? null;
    if (oldParentId === data.newParentId) {
      return { ok: true, changed: false as const };
    }

    // If old parent exists, it must not be frozen (child-set frozen).
    if (oldParentId) {
      const { data: oldParent } = await sb
        .from("engine_projects")
        .select("status")
        .eq("id", oldParentId)
        .maybeSingle();
      if (oldParent && isFrozenStatus(oldParent.status)) {
        throw new Error(
          `Cannot detach from ${oldParent.status} parent (child set is frozen).`,
        );
      }
    }

    if (data.newParentId) {
      const { data: newParent, error: npErr } = await sb
        .from("engine_projects")
        .select("id,status,client_id")
        .eq("id", data.newParentId)
        .maybeSingle();
      if (npErr) throw new Error(`new parent lookup failed: ${npErr.message}`);
      if (!newParent) throw new Error("New parent project not found");
      if (isFrozenStatus(newParent.status)) {
        throw new Error(
          `Cannot attach under ${newParent.status} parent (child set is frozen).`,
        );
      }
      if (newParent.client_id !== proj.client_id) {
        throw new Error("Cross-client reparenting is not allowed");
      }
      if (await wouldCreateCycle(sb, data.projectId, data.newParentId)) {
        throw new Error("Reparent would create a cycle");
      }
    }

    const { error: updErr } = await sb
      .from("engine_projects")
      .update({ parent_project_id: data.newParentId })
      .eq("id", data.projectId);
    if (updErr) throw new Error(`reparent failed: ${updErr.message}`);

    const activityRows: any[] = [
      {
        project_id: data.projectId,
        kind: "child_project_reparented",
        title: `Reparented${actor ? ` by ${actor}` : ""}`,
        body: `from=${oldParentId ?? "root"} to=${data.newParentId ?? "root"}`,
        severity: "info",
      },
    ];
    if (oldParentId) {
      activityRows.push({
        project_id: oldParentId,
        kind: "child_project_detached",
        title: `Child detached${actor ? ` by ${actor}` : ""}`,
        body: `Child: ${proj.name} (${data.projectId})`,
        severity: "info",
      });
    }
    if (data.newParentId) {
      activityRows.push({
        project_id: data.newParentId,
        kind: "child_project_attached",
        title: `Child attached${actor ? ` by ${actor}` : ""}`,
        body: `Child: ${proj.name} (${data.projectId})`,
        severity: "info",
      });
    }
    await sb.from("engine_activity").insert(activityRows);

    return { ok: true as const, changed: true as const };
  });

// ---------- getProjectFamily ----------
const FamilyInput = z.object({ projectId: z.string().uuid() });

export type ProjectFamilyPayload = {
  rootId: string;
  nodes: FamilyNode[];
  ancestry: Array<{ id: string; name: string; status: string }>;
};

export const getProjectFamily = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => FamilyInput.parse(raw))
  .handler(async ({ data, context }): Promise<ProjectFamilyPayload> => {
    await assertStaff(context);
    const sb = context.supabase;
    const rootId = await findFamilyRootId(sb, data.projectId);
    const [nodes, ancestry] = await Promise.all([
      fetchFamilySubtree(sb, rootId),
      fetchAncestryChain(sb, data.projectId),
    ]);
    return { rootId, nodes, ancestry };
  });

// ---------- listStaffFamilyRoots ----------
// Small helper for the workspace grouping: returns all root projects the
// staff caller can see (RLS applies), plus their immediate child counts.
export const listStaffFamilyRoots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context);
    const sb = context.supabase;
    const { data: roots, error } = await sb
      .from("engine_projects")
      .select("id,name,status,client_id,updated_at")
      .is("parent_project_id", null)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(`root list failed: ${error.message}`);

    const ids = (roots ?? []).map((r: any) => r.id as string);
    const childrenByParent = new Map<string, number>();
    if (ids.length) {
      const { data: children } = await sb
        .from("engine_projects")
        .select("id,parent_project_id")
        .in("parent_project_id", ids);
      for (const c of children ?? []) {
        const p = c.parent_project_id as string;
        childrenByParent.set(p, (childrenByParent.get(p) ?? 0) + 1);
      }
    }
    return {
      roots: (roots ?? []).map((r: any) => ({
        id: r.id as string,
        name: r.name as string,
        status: r.status as string,
        client_id: r.client_id as string,
        updated_at: r.updated_at as string,
        child_count: childrenByParent.get(r.id as string) ?? 0,
      })),
    };
  });
