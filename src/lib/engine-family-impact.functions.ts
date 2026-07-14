/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase H2 — Cross-project impact automation (closes F7)
//
// The DB layer + FamilyDependencyGraph already surface parent/child blockers
// (see engine-project-impact.functions.ts + engine_projects_child_rollup_guard
// trigger). H2 makes those blockers **actionable governance items** by
// emitting engine_review_items when the family graph produces a new blocker,
// so cross-project impact stops being a read-only inspection.
//
// Design:
//   - scanFamilyImpactForReviews(projectId) walks the family via getFamilyImpact's
//     detection logic and, for each blocker not already reflected by a
//     pending review item, inserts one with item_type='family_impact',
//     source='family_impact_auto', deterministic title so re-runs are
//     idempotent.
//   - No infinite loops: emitted items are tagged source='family_impact_auto';
//     re-scans skip pairs that already have a pending item with that title.
//   - Staff-gated. Writes engine_activity for every emission.
//
// No schema changes. Uses existing engine_review_items + engine_activity.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail, isAdminEmail, isOperatorEmail } from "@/lib/ops/access";
import {
  fetchFamilySubtree,
  findFamilyRootId,
  type FamilyNode,
} from "@/lib/engine-project-family.server";

type Sb = any;
type Ctx = { claims?: Record<string, unknown>; supabase: Sb };

async function assertStaff(ctx: Ctx): Promise<string> {
  const email = ((ctx.claims?.email as string | undefined) ?? "").toLowerCase();
  if (isOperatorEmail(email) || isAdminEmail(email)) return email;
  const ok = await hasRoleForEmail(ctx.supabase, email, "admin");
  if (!ok) throw new Error("Forbidden: engine staff role required");
  return email;
}

type BlockerReason =
  | "child_not_approved"
  | "child_not_completed"
  | "stale_rollup_child_added_after_approval"
  | "child_added_after_completion";

type Blocker = {
  parent: FamilyNode;
  child: FamilyNode;
  reason: BlockerReason;
};

function detectBlockers(nodes: FamilyNode[]): Blocker[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: Blocker[] = [];

  for (const node of nodes) {
    if (!node.parent_project_id) continue;
    const parent = byId.get(node.parent_project_id);
    if (!parent) continue;

    if (
      parent.approved_at &&
      node.updated_at &&
      new Date(node.updated_at) > new Date(parent.approved_at) &&
      !node.approved_at
    ) {
      out.push({ parent, child: node, reason: "stale_rollup_child_added_after_approval" });
    }
    if (parent.completed_at && !node.completed_at) {
      out.push({ parent, child: node, reason: "child_added_after_completion" });
    }
  }

  const parentIds = new Set(nodes.map((n) => n.parent_project_id).filter(Boolean) as string[]);
  for (const parentId of parentIds) {
    const parent = byId.get(parentId);
    if (!parent) continue;
    const children = nodes.filter((n) => n.parent_project_id === parentId);
    for (const child of children) {
      if (!child.approved_at) {
        out.push({ parent, child, reason: "child_not_approved" });
      } else if (!child.completed_at) {
        out.push({ parent, child, reason: "child_not_completed" });
      }
    }
  }

  return out;
}

function titleFor(b: Blocker): string {
  const reasonLabel: Record<BlockerReason, string> = {
    child_not_approved: "Child needs approval",
    child_not_completed: "Child not yet completed",
    stale_rollup_child_added_after_approval: "Child added after parent approved (stale roll-up)",
    child_added_after_completion: "Child added after parent completed",
  };
  return `Family impact — ${reasonLabel[b.reason]}: ${b.child.name} → ${b.parent.name}`;
}

function impactFor(reason: BlockerReason): "low" | "medium" | "high" {
  return reason === "stale_rollup_child_added_after_approval" ||
    reason === "child_added_after_completion"
    ? "high"
    : "medium";
}

export type FamilyImpactEmission = {
  title: string;
  reason: BlockerReason;
  parentId: string;
  parentName: string;
  childId: string;
  childName: string;
  reviewItemId: string | null;
  fingerprint: string;
  skipped: "already_pending" | null;
};

export type FamilyImpactScanResult = {
  rootId: string;
  scannedAt: string;
  totalBlockers: number;
  emitted: FamilyImpactEmission[];
  skipped: FamilyImpactEmission[];
};

// Deterministic fingerprint so re-scans dedupe even if the title format changes later.
// Kept synchronous + dependency-free for testability.
export function fingerprintBlocker(input: {
  parentId: string;
  childId: string;
  reason: BlockerReason;
}): string {
  const raw = `${input.parentId}::${input.childId}::${input.reason}`;
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = ((h << 5) + h + raw.charCodeAt(i)) | 0;
  return `fi_${(h >>> 0).toString(16)}_${input.reason}`;
}

const ScanInput = z.object({
  projectId: z.string().uuid(),
  dryRun: z.boolean().optional().default(false),
});

export const scanFamilyImpactForReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ScanInput.parse(raw))
  .handler(async ({ data, context }): Promise<FamilyImpactScanResult> => {
    const staffEmail = await assertStaff(context);
    const sb = (context as unknown as Ctx).supabase;

    const rootId = await findFamilyRootId(sb, data.projectId);
    const nodes = await fetchFamilySubtree(sb, rootId);
    const blockers = detectBlockers(nodes);

    // Fetch pending family_impact items across every project in the family
    // so we can dedupe by title.
    const projectIds = nodes.map((n) => n.id);
    const { data: existing } = await sb
      .from("engine_review_items")
      .select("id, project_id, title, status, source, item_type")
      .in("project_id", projectIds)
      .eq("item_type", "family_impact")
      .eq("status", "pending");
    const pendingTitles = new Set(
      (existing ?? []).map((r: any) => `${r.project_id}::${r.title}`),
    );

    const emitted: FamilyImpactEmission[] = [];
    const skipped: FamilyImpactEmission[] = [];

    for (const b of blockers) {
      const title = titleFor(b);
      const fingerprint = fingerprintBlocker({
        parentId: b.parent.id,
        childId: b.child.id,
        reason: b.reason,
      });
      const key = `${b.parent.id}::${title}`;
      if (pendingTitles.has(key)) {
        skipped.push({
          title,
          reason: b.reason,
          parentId: b.parent.id,
          parentName: b.parent.name,
          childId: b.child.id,
          childName: b.child.name,
          reviewItemId: null,
          fingerprint,
          skipped: "already_pending",
        });
        continue;
      }

      if (data.dryRun) {
        emitted.push({
          title,
          reason: b.reason,
          parentId: b.parent.id,
          parentName: b.parent.name,
          childId: b.child.id,
          childName: b.child.name,
          reviewItemId: null,
          fingerprint,
          skipped: null,
        });
        continue;
      }

      const { data: inserted, error: iErr } = await sb
        .from("engine_review_items")
        .insert({
          project_id: b.parent.id,
          project: b.parent.name,
          item_type: "family_impact",
          title,
          impact: impactFor(b.reason),
          source: "family_impact_auto",
          status: "pending",
          requested_by: staffEmail,
        })
        .select("id")
        .single();
      if (iErr) throw new Error(iErr.message);

      await sb.from("engine_activity").insert({
        project_id: b.parent.id,
        kind: "family.impact.emitted",
        title,
        body: `fingerprint=${fingerprint}`,
        severity: impactFor(b.reason),
      });

      emitted.push({
        title,
        reason: b.reason,
        parentId: b.parent.id,
        parentName: b.parent.name,
        childId: b.child.id,
        childName: b.child.name,
        reviewItemId: inserted.id,
        fingerprint,
        skipped: null,
      });
    }

    return {
      rootId,
      scannedAt: new Date().toISOString(),
      totalBlockers: blockers.length,
      emitted,
      skipped,
    };
  });

// -------------------------------------------------------
// Workspace-wide scan: for every family root, run a scan.
// Cheap enough to run manually / on cron.
// -------------------------------------------------------

export const scanAllFamilyImpact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const staffEmail = await assertStaff(context);
    const sb = (context as unknown as Ctx).supabase;

    const { data: roots, error } = await sb
      .from("engine_projects")
      .select("id, parent_project_id")
      .is("parent_project_id", null);
    if (error) throw new Error(error.message);

    const results: Array<{ rootId: string; emitted: number; skipped: number }> = [];
    for (const r of roots ?? []) {
      const nodes = await fetchFamilySubtree(sb, r.id);
      if (nodes.length <= 1) continue; // skip trivial (no children)
      const blockers = detectBlockers(nodes);
      const projectIds = nodes.map((n) => n.id);
      const { data: existing } = await sb
        .from("engine_review_items")
        .select("project_id, title")
        .in("project_id", projectIds)
        .eq("item_type", "family_impact")
        .eq("status", "pending");
      const pendingTitles = new Set(
        (existing ?? []).map((x: any) => `${x.project_id}::${x.title}`),
      );

      let emitted = 0;
      let skipped = 0;
      for (const b of blockers) {
        const title = titleFor(b);
        const key = `${b.parent.id}::${title}`;
        if (pendingTitles.has(key)) {
          skipped++;
          continue;
        }
        const { error: iErr } = await sb.from("engine_review_items").insert({
          project_id: b.parent.id,
          project: b.parent.name,
          item_type: "family_impact",
          title,
          impact: impactFor(b.reason),
          source: "family_impact_auto",
          status: "pending",
          requested_by: staffEmail,
        });
        if (iErr) throw new Error(iErr.message);
        await sb.from("engine_activity").insert({
          project_id: b.parent.id,
          kind: "family.impact.emitted",
          actor_email: staffEmail,
          summary: title,
        });
        emitted++;
      }
      results.push({ rootId: r.id, emitted, skipped });
    }

    return { ranAt: new Date().toISOString(), families: results };
  });
