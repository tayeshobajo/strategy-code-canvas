// Phase 5D — family impact + cross-project dependencies.
// v1 uses only existing tables (engine_projects + engine_activity). Any new
// link table would be a schema change (goes to PENDING_MIGRATIONS.md), not
// applied here.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import {
  fetchFamilySubtree,
  findFamilyRootId,
  isFrozenStatus,
  type FamilyNode,
} from "@/lib/engine-project-family.server";

async function assertStaff(context: any): Promise<void> {
  const email = (context.claims?.email as string | undefined) ?? undefined;
  const sb = context.supabase;
  const isAdmin = await hasRoleForEmail(sb, email, "admin");
  if (isAdmin) return;
  const isOp = await hasRoleForEmail(sb, email, "operator");
  if (!isOp) throw new Error("Forbidden: admin or operator role required");
}

export type FamilyBlocker = {
  parentId: string;
  parentName: string;
  parentStatus: string;
  childId: string;
  childName: string;
  childStatus: string;
  reason:
    | "child_not_approved"
    | "child_not_completed"
    | "stale_rollup_child_added_after_approval"
    | "child_added_after_completion";
};

export type FamilyImpactPayload = {
  rootId: string;
  nodes: FamilyNode[];
  blockers: FamilyBlocker[];
  summary: {
    total: number;
    approved: number;
    completed: number;
    frozen_parents: number;
  };
};

const Input = z.object({ projectId: z.string().uuid() });

export const getFamilyImpact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data, context }): Promise<FamilyImpactPayload> => {
    await assertStaff(context);
    const sb = context.supabase;
    const rootId = await findFamilyRootId(sb, data.projectId);
    const nodes = await fetchFamilySubtree(sb, rootId);

    const byId = new Map(nodes.map((n) => [n.id, n]));
    const blockers: FamilyBlocker[] = [];

    for (const node of nodes) {
      if (!node.parent_project_id) continue;
      const parent = byId.get(node.parent_project_id);
      if (!parent) continue;

      // Parent is approved but this child was created afterward — that's
      // the exact "stale rollup" the DB guard blocks; surface it in the UI.
      if (parent.approved_at && node.updated_at && new Date(node.updated_at) > new Date(parent.approved_at) && !node.approved_at) {
        blockers.push({
          parentId: parent.id,
          parentName: parent.name,
          parentStatus: parent.status,
          childId: node.id,
          childName: node.name,
          childStatus: node.status,
          reason: "stale_rollup_child_added_after_approval",
        });
      }
      if (parent.completed_at && (!node.completed_at || (node.updated_at && new Date(node.updated_at) > new Date(parent.completed_at) && !node.completed_at))) {
        blockers.push({
          parentId: parent.id,
          parentName: parent.name,
          parentStatus: parent.status,
          childId: node.id,
          childName: node.name,
          childStatus: node.status,
          reason: "child_added_after_completion",
        });
      }
    }

    // For every parent that is *not yet* approved/completed but has
    // children, list the ones that would block approval/completion.
    const parentIds = new Set(nodes.map((n) => n.parent_project_id).filter(Boolean) as string[]);
    for (const parentId of parentIds) {
      const parent = byId.get(parentId);
      if (!parent) continue;
      const children = nodes.filter((n) => n.parent_project_id === parentId);
      for (const child of children) {
        if (!child.approved_at) {
          blockers.push({
            parentId: parent.id,
            parentName: parent.name,
            parentStatus: parent.status,
            childId: child.id,
            childName: child.name,
            childStatus: child.status,
            reason: "child_not_approved",
          });
        } else if (!child.completed_at) {
          blockers.push({
            parentId: parent.id,
            parentName: parent.name,
            parentStatus: parent.status,
            childId: child.id,
            childName: child.name,
            childStatus: child.status,
            reason: "child_not_completed",
          });
        }
      }
    }

    return {
      rootId,
      nodes,
      blockers,
      summary: {
        total: nodes.length,
        approved: nodes.filter((n) => !!n.approved_at).length,
        completed: nodes.filter((n) => !!n.completed_at).length,
        frozen_parents: nodes.filter((n) => isFrozenStatus(n.status)).length,
      },
    };
  });
