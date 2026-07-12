/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 5B — Roadmap Intelligence Layer
//
// Milestones explain themselves.
// Every milestone surfaces its own context, reasoning chain, evidence
// sources, risk signals, and dependencies — inline in the UI.
//
// This module provides:
//   getMilestoneIntelligence(projectId, milestoneId)
//     → Full intelligence card for a single milestone
//
//   getProjectMilestoneIntelligenceSummary(projectId)
//     → Lightweight cards for all milestones in a project
//     → Used by the admin roadmap intelligence view
//
// Product law:
//   A milestone is not "done" when it exists. It is done when the
//   operator can answer these four questions without opening another
//   tab: WHY this milestone? WHERE is the evidence? WHAT are the
//   risks? WHO/WHAT depends on it?
//
// This module NEVER:
//   - modifies any milestone or project state
//   - auto-approves or auto-completes milestones
//   - applies migrations

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail, isOperatorEmail, isAdminEmail } from "@/lib/ops/access";

type Sb = any;
type AuthCtx = { claims?: Record<string, unknown>; userId?: string; supabase: Sb };

async function assertStaff(ctx: AuthCtx) {
  const email = ((ctx.claims?.email as string | undefined) ?? "").toLowerCase();
  if (isOperatorEmail(email) || isAdminEmail(email)) return;
  const ok = await hasRoleForEmail(ctx.supabase, email, "admin");
  if (!ok) throw new Error("Forbidden: operator or admin role required");
}

// -------------------------------------------------------
// Types
// -------------------------------------------------------

export type MilestoneRiskLevel = "critical" | "high" | "medium" | "low" | "none";

export type MilestoneRisk = {
  kind: string;
  description: string;
  level: MilestoneRiskLevel;
};

export type MilestoneEvidenceSource = {
  sourceId: string | null;
  sourceName: string | null;
  snippet: string | null;
  category: string | null;
  confidence: number | null;
};

export type MilestoneDependency = {
  milestoneId: string;
  milestoneName: string;
  phase: string | null;
  status: string | null;
  kind: "blocks" | "blocked_by" | "related";
};

export type MilestoneIntelligenceCard = {
  // Identity
  milestoneId: string;
  milestoneName: string;
  phase: string | null;
  status: string | null;
  approvalStatus: string | null;
  sortIndex: number;
  projectId: string;
  projectName: string;

  // WHY — reasoning chain
  reasoning: string;
  businessJustification: string | null;

  // WHAT — spine connection
  spinePointA: string | null;
  spinePointB: string | null;
  spineAlignment: "direct" | "indirect" | "unclear";
  spineAlignmentNote: string;

  // WHERE — evidence
  evidenceSources: MilestoneEvidenceSource[];
  evidenceCount: number;
  evidenceConfidence: number | null; // 0-100
  hasEvidence: boolean;

  // RISKS
  risks: MilestoneRisk[];
  worstRiskLevel: MilestoneRiskLevel;
  riskSummary: string | null;

  // DEPENDENCIES
  dependencies: MilestoneDependency[];
  blockerCount: number;
  dependentCount: number;

  // Intelligence completeness score (0-100)
  // High score = milestone has enough context to act on confidently
  completenessScore: number;

  generatedAt: string;
};

export type ProjectMilestoneIntelligenceSummary = {
  projectId: string;
  projectName: string;
  milestones: Array<{
    milestoneId: string;
    milestoneName: string;
    phase: string | null;
    status: string | null;
    approvalStatus: string | null;
    sortIndex: number;
    evidenceCount: number;
    hasEvidence: boolean;
    worstRiskLevel: MilestoneRiskLevel;
    completenessScore: number;
    blockerCount: number;
  }>;
  totalMilestones: number;
  withEvidence: number;
  withRisks: number;
  avgCompleteness: number;
  generatedAt: string;
};

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

const RISK_RANK: Record<MilestoneRiskLevel, number> = {
  critical: 5, high: 4, medium: 3, low: 2, none: 1,
};

function worstRisk(risks: MilestoneRisk[]): MilestoneRiskLevel {
  if (risks.length === 0) return "none";
  return risks.reduce((best, r) =>
    RISK_RANK[r.level] > RISK_RANK[best] ? r.level : best,
    "none" as MilestoneRiskLevel,
  );
}

function completenessScore(
  hasEvidence: boolean,
  evidenceConfidence: number | null,
  hasRisks: boolean,
  hasDependencies: boolean,
  hasJustification: boolean,
  spineAlignment: string,
): number {
  let score = 0;
  if (hasEvidence) score += 30;
  if ((evidenceConfidence ?? 0) >= 70) score += 15;
  if (hasRisks) score += 15;
  if (hasDependencies) score += 10;
  if (hasJustification) score += 15;
  if (spineAlignment === "direct") score += 15;
  else if (spineAlignment === "indirect") score += 8;
  return Math.min(100, score);
}

function inferSpineAlignment(
  milestoneName: string,
  pointA: string | null,
  pointB: string | null,
): { alignment: "direct" | "indirect" | "unclear"; note: string } {
  if (!pointA && !pointB) {
    return { alignment: "unclear", note: "No approved spine defined for this project." };
  }
  const lower = milestoneName.toLowerCase();
  const spineText = `${pointA ?? ""} ${pointB ?? ""}`.toLowerCase();
  // Token-level overlap check
  const tokens = lower.split(/\W+/).filter((t) => t.length > 3);
  const hits = tokens.filter((t) => spineText.includes(t));
  const ratio = tokens.length > 0 ? hits.length / tokens.length : 0;
  if (ratio >= 0.4) {
    return {
      alignment: "direct",
      note: `Milestone name shares ${Math.round(ratio * 100)}% token overlap with the approved Spine.`,
    };
  } else if (ratio >= 0.1) {
    return {
      alignment: "indirect",
      note: `Milestone has partial alignment with the Spine (${Math.round(ratio * 100)}% token overlap). May be an implicit sub-task of a spine milestone.`,
    };
  }
  return {
    alignment: "unclear",
    note: "Milestone name has no direct textual link to the approved Spine. Verify it maps to a defined deliverable.",
  };
}

function inferRisks(
  milestone: { name: string; status: string | null; approval_status: string | null },
  blockerCount: number,
  hasEvidence: boolean,
  spineAlignment: string,
  daysSinceActivity: number | null,
): MilestoneRisk[] {
  const risks: MilestoneRisk[] = [];
  const lower = milestone.name.toLowerCase();

  // Risk: no evidence
  if (!hasEvidence) {
    risks.push({
      kind: "no_evidence",
      description: "No processed evidence sources linked to this milestone. Cannot verify scope or completion criteria.",
      level: "high",
    });
  }

  // Risk: spine misalignment
  if (spineAlignment === "unclear") {
    risks.push({
      kind: "spine_misalignment",
      description: "Milestone has no clear link to the approved Spine. Risk of scope creep or untracked work.",
      level: "medium",
    });
  }

  // Risk: has blockers
  if (blockerCount > 0) {
    risks.push({
      kind: "blocked",
      description: `${blockerCount} other milestone${blockerCount > 1 ? "s" : ""} must complete before this one can proceed.`,
      level: blockerCount >= 3 ? "critical" : blockerCount >= 2 ? "high" : "medium",
    });
  }

  // Risk: vague name keywords
  const vagueKeywords = ["misc", "other", "tbd", "todo", "fix", "cleanup", "refactor"];
  if (vagueKeywords.some((k) => lower.includes(k))) {
    risks.push({
      kind: "vague_scope",
      description: `Milestone name contains a vague keyword ("${vagueKeywords.find((k) => lower.includes(k))}"). Scope may be undefined.`,
      level: "low",
    });
  }

  // Risk: stalled
  if (
    daysSinceActivity !== null &&
    daysSinceActivity >= 7 &&
    milestone.status !== "complete" &&
    milestone.status !== "completed"
  ) {
    risks.push({
      kind: "stalled",
      description: `No project activity in ${daysSinceActivity} days. Milestone may be stalled.`,
      level: daysSinceActivity >= 14 ? "high" : "medium",
    });
  }

  return risks;
}

function inferReasoning(milestone: { name: string; phase: string | null }, sourceName: string | null): string {
  const phase = milestone.phase ? `in the ${milestone.phase} phase ` : "";
  const origin = sourceName ? `Generated from "${sourceName}"` : "Extracted by the intelligence pipeline";
  return `${origin}. This milestone represents a discrete deliverable ${phase}that moves the project from Point A to Point B as defined in the approved Spine.`;
}

function inferBusinessJustification(milestoneName: string, pointB: string | null): string | null {
  if (!pointB) return null;
  return `Completing "${milestoneName}" advances the project toward the approved destination (Point B): ${pointB.slice(0, 200)}${pointB.length > 200 ? "..." : ""}`;
}

// -------------------------------------------------------
// getMilestoneIntelligence — full card for one milestone
// -------------------------------------------------------

export const getMilestoneIntelligence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      projectId: z.string().uuid(),
      milestoneId: z.string().uuid(),
    }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<MilestoneIntelligenceCard> => {
    await assertStaff(context as unknown as AuthCtx);
    const sb = (context as unknown as AuthCtx).supabase;
    const now = new Date();

    // ── 1. Load the milestone ────────────────────────────────────
    const { data: ms, error: msErr } = await sb
      .from("engine_milestones")
      .select("id,project_id,name,phase,status,approval_status,sort_index,source_evidence,roadmap_version_id,created_by_kind")
      .eq("id", data.milestoneId)
      .eq("project_id", data.projectId)
      .single();
    if (msErr || !ms) throw new Error("Milestone not found");

    // ── 2. Load project spine + metadata ─────────────────────────
    const { data: proj } = await sb
      .from("engine_projects")
      .select("id,name,point_a,point_b,last_activity_at")
      .eq("id", data.projectId)
      .single();
    const projectName = proj?.name ?? "Untitled project";
    const pointA = proj?.point_a ?? null;
    const pointB = proj?.point_b ?? null;
    const lastActivity = proj?.last_activity_at ?? null;
    const daysSinceActivity = lastActivity
      ? Math.floor((now.getTime() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // ── 3. Resolve evidence sources from source_evidence JSONB ──────
    const rawEvidence = (ms.source_evidence ?? []) as Array<{
      source_id?: string | null;
      signal_id?: string | null;
      snippet?: string | null;
      category?: string | null;
    }>;
    const sourceIds = rawEvidence
      .map((e) => e.source_id)
      .filter((id): id is string => !!id);

    let evidenceSources: MilestoneEvidenceSource[] = [];
    let evidenceConfidence: number | null = null;

    if (sourceIds.length > 0) {
      const { data: srcRows } = await sb
        .from("engine_sources")
        .select("id,name,confidence")
        .in("id", sourceIds);
      const srcMap = new Map(
        ((srcRows ?? []) as Array<{ id: string; name: string | null; confidence: number | null }>)
          .map((s) => [s.id, s]),
      );
      evidenceSources = rawEvidence.map((e) => ({
        sourceId: e.source_id ?? null,
        sourceName: e.source_id ? (srcMap.get(e.source_id)?.name ?? null) : null,
        snippet: e.snippet ?? null,
        category: e.category ?? null,
        confidence: e.source_id ? (srcMap.get(e.source_id)?.confidence ?? null) : null,
      }));
      const confidences = evidenceSources
        .map((e) => e.confidence)
        .filter((c): c is number => c !== null);
      evidenceConfidence = confidences.length > 0
        ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
        : null;
    } else if (rawEvidence.length > 0) {
      // Evidence refs without source IDs (snippet-only)
      evidenceSources = rawEvidence.map((e) => ({
        sourceId: null,
        sourceName: null,
        snippet: e.snippet ?? null,
        category: e.category ?? null,
        confidence: null,
      }));
    }

    const hasEvidence = evidenceSources.length > 0;
    const primarySource = evidenceSources.find((e) => e.sourceName);

    // ── 4. Infer sibling dependencies (order-based heuristic) ──────
    const { data: siblings } = await sb
      .from("engine_milestones")
      .select("id,name,phase,status,sort_index")
      .eq("project_id", data.projectId)
      .not("id", "eq", data.milestoneId)
      .order("sort_index", { ascending: true });

    const sibRows = (siblings ?? []) as Array<{
      id: string; name: string; phase: string | null;
      status: string | null; sort_index: number;
    }>;

    // Milestones with lower sort_index in same phase are implicit predecessors
    const deps: MilestoneDependency[] = [];
    const myIndex = ms.sort_index ?? 0;
    const myPhase = ms.phase;

    for (const sib of sibRows) {
      if (myPhase && sib.phase === myPhase && sib.sort_index < myIndex) {
        const isIncomplete =
          sib.status !== "complete" && sib.status !== "completed" && sib.status !== "approved";
        deps.push({
          milestoneId: sib.id,
          milestoneName: sib.name,
          phase: sib.phase,
          status: sib.status,
          kind: isIncomplete ? "blocked_by" : "related",
        });
      } else if (myPhase && sib.phase === myPhase && sib.sort_index > myIndex) {
        // We block these
        deps.push({
          milestoneId: sib.id,
          milestoneName: sib.name,
          phase: sib.phase,
          status: sib.status,
          kind: "blocks",
        });
      }
    }

    const blockerCount = deps.filter((d) => d.kind === "blocked_by" && d.status !== "complete" && d.status !== "completed").length;
    const dependentCount = deps.filter((d) => d.kind === "blocks").length;

    // ── 5. Spine alignment ─────────────────────────────────────────────
    const { alignment, note: alignmentNote } = inferSpineAlignment(ms.name, pointA, pointB);

    // ── 6. Risks ─────────────────────────────────────────────────────
    const risks = inferRisks(ms, blockerCount, hasEvidence, alignment, daysSinceActivity);
    const worstRiskLevel = worstRisk(risks);
    const riskSummary = risks.length === 0
      ? null
      : risks.map((r) => r.description).slice(0, 2).join(" ");

    // ── 7. Reasoning + justification ──────────────────────────────
    const reasoning = inferReasoning(ms, primarySource?.sourceName ?? null);
    const businessJustification = inferBusinessJustification(ms.name, pointB);

    // ── 8. Completeness score ─────────────────────────────────────
    const score = completenessScore(
      hasEvidence,
      evidenceConfidence,
      risks.length > 0,
      deps.length > 0,
      !!businessJustification,
      alignment,
    );

    return {
      milestoneId: ms.id,
      milestoneName: ms.name,
      phase: ms.phase ?? null,
      status: ms.status ?? null,
      approvalStatus: ms.approval_status ?? null,
      sortIndex: ms.sort_index ?? 0,
      projectId: data.projectId,
      projectName,
      reasoning,
      businessJustification,
      spinePointA: pointA,
      spinePointB: pointB,
      spineAlignment: alignment,
      spineAlignmentNote: alignmentNote,
      evidenceSources,
      evidenceCount: evidenceSources.length,
      evidenceConfidence,
      hasEvidence,
      risks,
      worstRiskLevel,
      riskSummary,
      dependencies: deps,
      blockerCount,
      dependentCount,
      completenessScore: score,
      generatedAt: now.toISOString(),
    };
  });

// -------------------------------------------------------
// getProjectMilestoneIntelligenceSummary — all milestones
// -------------------------------------------------------

export const getProjectMilestoneIntelligenceSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<ProjectMilestoneIntelligenceSummary> => {
    await assertStaff(context as unknown as AuthCtx);
    const sb = (context as unknown as AuthCtx).supabase;
    const now = new Date();

    const [mRes, pRes] = await Promise.all([
      sb
        .from("engine_milestones")
        .select("id,name,phase,status,approval_status,sort_index,source_evidence")
        .eq("project_id", data.projectId)
        .order("sort_index", { ascending: true }),
      sb
        .from("engine_projects")
        .select("id,name,point_a,point_b,last_activity_at")
        .eq("id", data.projectId)
        .single(),
    ]);

    const milestoneRows = (mRes.data ?? []) as Array<{
      id: string; name: string; phase: string | null;
      status: string | null; approval_status: string | null;
      sort_index: number; source_evidence: any;
    }>;
    const proj = pRes.data;
    const projectName = proj?.name ?? "Untitled project";
    const pointA = proj?.point_a ?? null;
    const pointB = proj?.point_b ?? null;
    const lastActivity = proj?.last_activity_at ?? null;
    const daysSinceActivity = lastActivity
      ? Math.floor((now.getTime() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const summaries = milestoneRows.map((ms) => {
      const rawEvidence = (ms.source_evidence ?? []) as any[];
      const hasEvidence = rawEvidence.length > 0;
      const evidenceCount = rawEvidence.length;
      const { alignment } = inferSpineAlignment(ms.name, pointA, pointB);
      const risks = inferRisks(ms, 0, hasEvidence, alignment, daysSinceActivity);
      const score = completenessScore(
        hasEvidence, null, risks.length > 0, false, !!pointB, alignment,
      );
      return {
        milestoneId: ms.id,
        milestoneName: ms.name,
        phase: ms.phase,
        status: ms.status,
        approvalStatus: ms.approval_status,
        sortIndex: ms.sort_index,
        evidenceCount,
        hasEvidence,
        worstRiskLevel: worstRisk(risks),
        completenessScore: score,
        blockerCount: 0, // lightweight: no sibling query
      };
    });

    const withEvidence = summaries.filter((s) => s.hasEvidence).length;
    const withRisks = summaries.filter((s) => s.worstRiskLevel !== "none").length;
    const avgCompleteness = summaries.length > 0
      ? Math.round(summaries.reduce((a, s) => a + s.completenessScore, 0) / summaries.length)
      : 0;

    return {
      projectId: data.projectId,
      projectName,
      milestones: summaries,
      totalMilestones: summaries.length,
      withEvidence,
      withRisks,
      avgCompleteness,
      generatedAt: now.toISOString(),
    };
  });
