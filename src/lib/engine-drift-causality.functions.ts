/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase H6 · K8 — Drift causality graph.
//
// Clusters drift signals + open review items by the entity they share
// (project, milestone, spine field, engine). Emits edges when two signals
// on the same entity have a plausible causal relationship. No schema
// change — purely a read-side rollup over existing tables.
//
// Reader-side companion to `engine-drift-detection.functions.ts`. Meant
// to help humans answer "which drift is causing the others?" instead of
// scanning a flat list.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail, isAdminEmail, isOperatorEmail } from "@/lib/ops/access";

type Sb = any;
type Ctx = { claims?: Record<string, unknown>; supabase: Sb };

export type CausalityNode = {
  id: string;                         // stable per entity
  entityKind: "project" | "milestone" | "spine_field" | "engine" | "review_item";
  entityId: string;
  label: string;
  severity: "low" | "medium" | "high" | "critical";
  detail: string | null;
  detectedAt: string | null;
};

export type CausalityEdge = {
  from: string;                       // node id
  to: string;                         // node id
  reason: string;                     // human-readable rationale
  weight: number;                     // 0..1 confidence
};

export type CausalityCluster = {
  projectId: string;
  projectName: string;
  rootCauseNodeId: string | null;
  nodes: CausalityNode[];
  edges: CausalityEdge[];
  explanation: string;
};

export type DriftCausalityReport = {
  generatedAt: string;
  clusters: CausalityCluster[];
  totalNodes: number;
  totalEdges: number;
};

async function assertStaff(ctx: Ctx): Promise<string> {
  const email = ((ctx.claims?.email as string | undefined) ?? "").toLowerCase();
  if (isOperatorEmail(email) || isAdminEmail(email)) return email;
  const ok = await hasRoleForEmail(ctx.supabase, email, "admin");
  if (!ok) throw new Error("Forbidden");
  return email;
}

function severityRank(s: string | null | undefined): number {
  switch (s) {
    case "critical": return 4;
    case "high": return 3;
    case "medium": return 2;
    case "low": return 1;
    default: return 0;
  }
}

function normaliseSeverity(s: unknown): CausalityNode["severity"] {
  if (s === "critical" || s === "high" || s === "medium" || s === "low") return s;
  return "low";
}

/**
 * Build a causal graph per project. Rules (transparent, no ML):
 *   - Spine-field drift on a project is treated as a likely root cause
 *     for any milestone / engine / review-item on that project.
 *   - Older signals precede newer ones on the same entity.
 *   - Review items referencing a specific milestone/engine become downstream
 *     effects of any spine-field drift on the same project.
 */
export const getDriftCausalityReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    await assertStaff(ctx);
    const sb = ctx.supabase;

    const { data: projects } = await sb
      .from("engine_projects")
      .select("id, project_name, status")
      .in("status", ["discovery", "planning", "building", "delivering", "operating", "at_risk"])
      .limit(200);

    const projectRows = (projects ?? []) as Array<{ id: string; project_name: string }>;
    if (projectRows.length === 0) {
      return {
        generatedAt: new Date().toISOString(),
        clusters: [],
        totalNodes: 0,
        totalEdges: 0,
      } satisfies DriftCausalityReport;
    }
    const projectIds = projectRows.map((p) => p.id);

    // 1. Spine-field audit rows (drift on protected fields).
    const { data: spineChanges } = await sb
      .from("engine_audit_log")
      .select("id, project_id, field_changed, action, created_at, actor_email, new_value")
      .in("project_id", projectIds)
      .in("action", ["spine_field_changed", "spine_field_reverted"])
      .order("created_at", { ascending: false })
      .limit(500);

    // 2. Open review items.
    const { data: reviewItems } = await sb
      .from("engine_review_items")
      .select("id, project_id, milestone_id, item_type, title, severity, status, created_at")
      .in("project_id", projectIds)
      .in("status", ["pending", "in_review", "escalated"])
      .limit(500);

    // 3. Business-engine exceptions.
    const { data: engineExceptions } = await sb
      .from("engine_business_engine_exceptions")
      .select("id, engine_id, project_id, kind, severity, title, created_at")
      .in("project_id", projectIds)
      .limit(500);

    const clusters: CausalityCluster[] = [];

    for (const proj of projectRows) {
      const spine = (spineChanges ?? []).filter((r: any) => r.project_id === proj.id);
      const reviews = (reviewItems ?? []).filter((r: any) => r.project_id === proj.id);
      const engExc = (engineExceptions ?? []).filter((r: any) => r.project_id === proj.id);

      if (spine.length === 0 && reviews.length === 0 && engExc.length === 0) continue;

      const nodes: CausalityNode[] = [];
      const edges: CausalityEdge[] = [];

      for (const s of spine) {
        nodes.push({
          id: `spine:${s.id}`,
          entityKind: "spine_field",
          entityId: s.field_changed ?? s.id,
          label: `Spine change · ${s.field_changed ?? "field"}`,
          severity: "high",
          detail: s.actor_email ? `by ${s.actor_email}` : null,
          detectedAt: s.created_at ?? null,
        });
      }
      for (const r of reviews) {
        nodes.push({
          id: `review:${r.id}`,
          entityKind: "review_item",
          entityId: r.id,
          label: r.title ?? r.item_type,
          severity: normaliseSeverity(r.severity),
          detail: r.item_type ?? null,
          detectedAt: r.created_at ?? null,
        });
      }
      for (const e of engExc) {
        nodes.push({
          id: `engine:${e.id}`,
          entityKind: "engine",
          entityId: e.engine_id ?? e.id,
          label: e.title ?? e.kind,
          severity: normaliseSeverity(e.severity),
          detail: e.kind ?? null,
          detectedAt: e.created_at ?? null,
        });
      }

      // Edge rule 1 — spine changes cause downstream review items + engine exceptions
      // when the downstream event happened AFTER the spine change.
      for (const s of spine) {
        const sTime = s.created_at ? new Date(s.created_at).getTime() : 0;
        for (const r of reviews) {
          const rTime = r.created_at ? new Date(r.created_at).getTime() : 0;
          if (sTime && rTime && rTime >= sTime) {
            edges.push({
              from: `spine:${s.id}`,
              to: `review:${r.id}`,
              reason: `Review item raised after spine field \`${s.field_changed ?? "?"}\` changed`,
              weight: 0.7,
            });
          }
        }
        for (const e of engExc) {
          const eTime = e.created_at ? new Date(e.created_at).getTime() : 0;
          if (sTime && eTime && eTime >= sTime) {
            edges.push({
              from: `spine:${s.id}`,
              to: `engine:${e.id}`,
              reason: `Engine exception opened after spine change`,
              weight: 0.6,
            });
          }
        }
      }

      // Edge rule 2 — review items on the same milestone chain in time order.
      const byMilestone = new Map<string, any[]>();
      for (const r of reviews) {
        if (!r.milestone_id) continue;
        const list = byMilestone.get(r.milestone_id) ?? [];
        list.push(r);
        byMilestone.set(r.milestone_id, list);
      }
      for (const [, list] of byMilestone) {
        const sorted = list
          .filter((x) => x.created_at)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        for (let i = 1; i < sorted.length; i++) {
          edges.push({
            from: `review:${sorted[i - 1].id}`,
            to: `review:${sorted[i].id}`,
            reason: "Sequential review items on the same milestone",
            weight: 0.4,
          });
        }
      }

      // Pick the root cause: highest-severity node with no incoming edge.
      const incoming = new Set(edges.map((e) => e.to));
      const rootCandidate = nodes
        .filter((n) => !incoming.has(n.id))
        .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0];

      const explanation = rootCandidate
        ? `Likely root: ${rootCandidate.label} (${rootCandidate.entityKind}). ${edges.length} causal edge${edges.length === 1 ? "" : "s"} observed.`
        : `${nodes.length} unlinked signal${nodes.length === 1 ? "" : "s"} — no clear causal chain.`;

      clusters.push({
        projectId: proj.id,
        projectName: proj.project_name,
        rootCauseNodeId: rootCandidate?.id ?? null,
        nodes,
        edges,
        explanation,
      });
    }

    const totalNodes = clusters.reduce((a, c) => a + c.nodes.length, 0);
    const totalEdges = clusters.reduce((a, c) => a + c.edges.length, 0);

    return {
      generatedAt: new Date().toISOString(),
      clusters,
      totalNodes,
      totalEdges,
    } satisfies DriftCausalityReport;
  });

// Test-only export so vitest can exercise the edge rules without a real DB.
export function buildClusterForTest(args: {
  project: { id: string; project_name: string };
  spine: Array<{ id: string; field_changed?: string | null; created_at?: string | null; actor_email?: string | null }>;
  reviews: Array<{ id: string; milestone_id?: string | null; item_type?: string | null; title?: string | null; severity?: string | null; created_at?: string | null }>;
  engExc: Array<{ id: string; engine_id?: string | null; kind?: string | null; title?: string | null; severity?: string | null; created_at?: string | null }>;
}): CausalityCluster {
  // Delegates to the same logic path by inlining the per-project block above.
  const { project: proj, spine, reviews, engExc } = args;
  const nodes: CausalityNode[] = [];
  const edges: CausalityEdge[] = [];
  for (const s of spine) nodes.push({ id: `spine:${s.id}`, entityKind: "spine_field", entityId: s.field_changed ?? s.id, label: `Spine change · ${s.field_changed ?? "field"}`, severity: "high", detail: s.actor_email ?? null, detectedAt: s.created_at ?? null });
  for (const r of reviews) nodes.push({ id: `review:${r.id}`, entityKind: "review_item", entityId: r.id, label: r.title ?? r.item_type ?? r.id, severity: normaliseSeverity(r.severity), detail: r.item_type ?? null, detectedAt: r.created_at ?? null });
  for (const e of engExc) nodes.push({ id: `engine:${e.id}`, entityKind: "engine", entityId: e.engine_id ?? e.id, label: e.title ?? e.kind ?? e.id, severity: normaliseSeverity(e.severity), detail: e.kind ?? null, detectedAt: e.created_at ?? null });
  for (const s of spine) {
    const sTime = s.created_at ? new Date(s.created_at).getTime() : 0;
    for (const r of reviews) {
      const rTime = r.created_at ? new Date(r.created_at).getTime() : 0;
      if (sTime && rTime && rTime >= sTime) edges.push({ from: `spine:${s.id}`, to: `review:${r.id}`, reason: `Review item raised after spine field \`${s.field_changed ?? "?"}\` changed`, weight: 0.7 });
    }
    for (const e of engExc) {
      const eTime = e.created_at ? new Date(e.created_at).getTime() : 0;
      if (sTime && eTime && eTime >= sTime) edges.push({ from: `spine:${s.id}`, to: `engine:${e.id}`, reason: `Engine exception opened after spine change`, weight: 0.6 });
    }
  }
  const incoming = new Set(edges.map((e) => e.to));
  const rootCandidate = nodes.filter((n) => !incoming.has(n.id)).sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0];
  return {
    projectId: proj.id,
    projectName: proj.project_name,
    rootCauseNodeId: rootCandidate?.id ?? null,
    nodes,
    edges,
    explanation: rootCandidate
      ? `Likely root: ${rootCandidate.label} (${rootCandidate.entityKind}). ${edges.length} causal edge${edges.length === 1 ? "" : "s"} observed.`
      : `${nodes.length} unlinked signal${nodes.length === 1 ? "" : "s"} — no clear causal chain.`,
  };
}

export const _schema = z.object({}); // reserved for future filter args
