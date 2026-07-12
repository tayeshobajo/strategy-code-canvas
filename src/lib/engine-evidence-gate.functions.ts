/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 9B — Evidence Requirements Enforcement
//
// Enforces that milestones cannot be marked complete without evidence.
// This is a hard gate: no sources attached to the milestone = blocked.
//
// Product law:
//   Evidence is not optional. Completion without proof is a lie.
//   A milestone is done when there is evidence it is done — not when
//   the operator says it is done.
//
// Gate logic:
//   - Milestone must have at least 1 source attached
//     (in engine_sources with project_id or milestone_id reference)
//   - At least 1 source must be status='processed'
//   - Milestone must have approval_status='approved' (or the gate
//     still reports what is missing so the operator can act)
//
// This module NEVER:
//   - auto-approves milestones
//   - bypasses evidence requirements for any reason
//   - marks milestones complete without human confirmation
//   - modifies the QA pipeline or delivery gate

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import { isOperatorEmail, isAdminEmail } from "@/lib/ops/access";

const uuid = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "Invalid UUID",
  );

type Sb = any;
type StaffCtx = { claims?: Record<string, unknown>; userId?: string; supabase: Sb };

async function assertStaff(ctx: StaffCtx) {
  const email = ((ctx.claims?.email as string | undefined) ?? "").toLowerCase();
  const [isOp, isAdmin] = await Promise.all([
    hasRoleForEmail(ctx.supabase, email, "operator"),
    hasRoleForEmail(ctx.supabase, email, "admin"),
  ]);
  if (!isOp && !isAdmin) throw new Error("Forbidden: operator or admin role required");
  return { email, isAdmin };
}

async function assertAdmin(ctx: StaffCtx) {
  const staff = await assertStaff(ctx);
  if (!staff.isAdmin) throw new Error("Forbidden: admin role required");
  return staff;
}

async function assertOperatorOrAdmin(ctx: StaffCtx) {
  const email = ((ctx.claims?.email as string | undefined) ?? "").toLowerCase();
  if (isOperatorEmail(email) || isAdminEmail(email)) return;
  const ok = await hasRoleForEmail(ctx.supabase, email, "admin");
  if (!ok) throw new Error("Forbidden: operator or admin role required");
}

async function logActivity(
  sb: Sb,
  projectId: string,
  kind: string,
  title: string,
  body: string,
  severity: "info" | "warn" | "error" = "info",
) {
  try {
    await sb.from("engine_activity").insert({
      project_id: projectId,
      kind,
      title,
      body,
      severity,
    });
  } catch {
    /* best-effort */
  }
}

async function logAudit(
  sb: Sb,
  args: {
    project_id: string;
    actor_email: string;
    action: string;
    summary: string;
    target_id?: string | null;
    metadata?: Record<string, any>;
  },
) {
  try {
    await sb.from("engine_audit_log").insert({
      project_id: args.project_id,
      actor_email: args.actor_email,
      action: args.action,
      summary: args.summary.slice(0, 500),
      target_id: args.target_id ?? null,
      affected_modules: ["evidence", "milestones"],
      metadata: args.metadata ?? {},
    });
  } catch {
    /* best-effort */
  }
}

// -------------------------------------------------------
// Types
// -------------------------------------------------------

export type EvidenceGateBlocker =
  | "no_sources_attached"
  | "no_processed_sources"
  | "milestone_not_found"
  | "milestone_already_complete";

export type EvidenceGateStatus = {
  milestoneId: string;
  milestoneName: string;
  milestoneStatus: string;
  approvalStatus: string | null;
  sourceCount: number;
  processedSourceCount: number;
  pendingSourceCount: number;
  failedSourceCount: number;
  sources: Array<{
    id: string;
    name: string;
    source_type: string;
    status: string;
    created_at: string;
  }>;
  /** Whether the evidence gate is satisfied */
  gateOpen: boolean;
  blockers: EvidenceGateBlocker[];
  /** Human-readable summary of what is blocking */
  blockingMessage: string | null;
  /** When the gate opened (milestone had sufficient evidence) */
  gateOpenedAt: string | null;
};

// -------------------------------------------------------
// getMilestoneEvidenceGate — read-only gate status
// -------------------------------------------------------

export const getMilestoneEvidenceGate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: uuid, milestoneId: uuid }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<EvidenceGateStatus> => {
    await assertStaff(context as unknown as StaffCtx);
    const sb = (context as unknown as StaffCtx).supabase;

    // Load milestone from engine_review_items (milestones live here)
    const { data: milestone, error: mErr } = await sb
      .from("engine_review_items")
      .select("id,title,status,approval_status,metadata,created_at,updated_at")
      .eq("id", data.milestoneId)
      .eq("project_id", data.projectId)
      .maybeSingle();

    if (mErr) throw new Error(mErr.message ?? "Failed to load milestone");
    if (!milestone) {
      return {
        milestoneId: data.milestoneId,
        milestoneName: "Unknown",
        milestoneStatus: "unknown",
        approvalStatus: null,
        sourceCount: 0,
        processedSourceCount: 0,
        pendingSourceCount: 0,
        failedSourceCount: 0,
        sources: [],
        gateOpen: false,
        blockers: ["milestone_not_found"],
        blockingMessage: "Milestone not found in this project.",
        gateOpenedAt: null,
      };
    }

    // Load sources attached to this project
    // Sources may reference milestone via metadata.milestone_id or be
    // project-scoped. We surface all project sources and filter by
    // milestone reference if available.
    const { data: allSources, error: sErr } = await sb
      .from("engine_sources")
      .select("id,name,source_type,status,notes,created_at,metadata")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });

    if (sErr) throw new Error(sErr.message ?? "Failed to load sources");

    const rawSources = (allSources ?? []) as Array<{
      id: string;
      name: string;
      source_type: string;
      status: string;
      notes: string | null;
      created_at: string;
      metadata: Record<string, any> | null;
    }>;

    // Filter: prefer sources explicitly linked to this milestone;
    // fall back to all project sources if none are milestone-scoped.
    const milestoneScopedSources = rawSources.filter(
      (s) => s.metadata?.milestone_id === data.milestoneId,
    );
    const sources =
      milestoneScopedSources.length > 0 ? milestoneScopedSources : rawSources;

    const processedSources = sources.filter((s) => s.status === "processed");
    const pendingSources = sources.filter((s) => s.status === "pending");
    const failedSources = sources.filter((s) => s.status === "failed");

    const blockers: EvidenceGateBlocker[] = [];

    if (milestone.status === "complete" || milestone.status === "completed") {
      blockers.push("milestone_already_complete");
    }

    if (sources.length === 0) {
      blockers.push("no_sources_attached");
    } else if (processedSources.length === 0) {
      blockers.push("no_processed_sources");
    }

    // Gate is open if no blocking evidence issues
    // (already_complete is informational, not a block)
    const evidenceBlockers = blockers.filter(
      (b) => b !== "milestone_already_complete",
    );
    const gateOpen = evidenceBlockers.length === 0;

    let blockingMessage: string | null = null;
    if (blockers.includes("no_sources_attached")) {
      blockingMessage =
        "No evidence sources attached to this project. Upload or link at least one source before marking this milestone complete.";
    } else if (blockers.includes("no_processed_sources")) {
      blockingMessage = `${sources.length} source${sources.length > 1 ? "s" : ""} attached but none have been processed yet. Wait for processing to complete before marking this milestone complete.`;
    }

    // Record gate check in metadata for reporting
    const gateOpenedAt: string | null =
      gateOpen && (milestone.metadata?.evidence_gate_opened_at as string | null)
        ? (milestone.metadata.evidence_gate_opened_at as string)
        : null;

    return {
      milestoneId: data.milestoneId,
      milestoneName:
        (milestone.title as string | null) ??
        (milestone.metadata?.name as string | null) ??
        "Unnamed milestone",
      milestoneStatus: (milestone.status as string | null) ?? "unknown",
      approvalStatus: (milestone.approval_status as string | null) ?? null,
      sourceCount: sources.length,
      processedSourceCount: processedSources.length,
      pendingSourceCount: pendingSources.length,
      failedSourceCount: failedSources.length,
      sources: sources.slice(0, 20).map((s) => ({
        id: s.id,
        name: s.name ?? "Untitled source",
        source_type: s.source_type ?? "document",
        status: s.status ?? "pending",
        created_at: s.created_at,
      })),
      gateOpen,
      blockers,
      blockingMessage,
      gateOpenedAt,
    };
  });

// -------------------------------------------------------
// getProjectEvidenceGateSummary — cross-milestone overview
// for the Evidence & QA page
// -------------------------------------------------------

export type ProjectEvidenceGateSummary = {
  projectId: string;
  projectName: string;
  totalMilestones: number;
  milestonesPendingEvidence: number;
  milestonesGateOpen: number;
  milestonesAlreadyComplete: number;
  overallGateOpen: boolean;
  milestones: Array<{
    id: string;
    title: string;
    status: string;
    approvalStatus: string | null;
    gateOpen: boolean;
    sourceCount: number;
    processedSourceCount: number;
    blockers: EvidenceGateBlocker[];
  }>;
  globalSourceCount: number;
  globalProcessedSourceCount: number;
};

export const getProjectEvidenceGateSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: uuid }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<ProjectEvidenceGateSummary> => {
    await assertStaff(context as unknown as StaffCtx);
    const sb = (context as unknown as StaffCtx).supabase;

    // Load project name
    const { data: proj, error: pErr } = await sb
      .from("engine_projects")
      .select("id,name")
      .eq("id", data.projectId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message ?? "Failed to load project");
    if (!proj) throw new Error("Project not found");

    // Load all milestones (engine_review_items where type = milestone or all)
    const { data: milestoneRows, error: mErr } = await sb
      .from("engine_review_items")
      .select("id,title,status,approval_status,metadata")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: true });
    if (mErr) throw new Error(mErr.message ?? "Failed to load milestones");
    const milestones = (milestoneRows ?? []) as Array<{
      id: string;
      title: string;
      status: string;
      approval_status: string | null;
      metadata: Record<string, any> | null;
    }>;

    // Load all project sources
    const { data: sourceRows, error: sErr } = await sb
      .from("engine_sources")
      .select("id,status,metadata")
      .eq("project_id", data.projectId);
    if (sErr) throw new Error(sErr.message ?? "Failed to load sources");
    const allSources = (sourceRows ?? []) as Array<{
      id: string;
      status: string;
      metadata: Record<string, any> | null;
    }>;
    const processedGlobal = allSources.filter((s) => s.status === "processed");

    // Evaluate gate for each milestone
    const milestoneGates = milestones.map((m) => {
      const scoped = allSources.filter(
        (s) => s.metadata?.milestone_id === m.id,
      );
      const sources = scoped.length > 0 ? scoped : allSources;
      const processed = sources.filter((s) => s.status === "processed");

      const blockers: EvidenceGateBlocker[] = [];
      if (m.status === "complete" || m.status === "completed") {
        blockers.push("milestone_already_complete");
      }
      if (sources.length === 0) blockers.push("no_sources_attached");
      else if (processed.length === 0) blockers.push("no_processed_sources");

      const evidenceBlockers = blockers.filter(
        (b) => b !== "milestone_already_complete",
      );

      return {
        id: m.id,
        title: m.title ?? m.metadata?.name ?? "Unnamed milestone",
        status: m.status ?? "unknown",
        approvalStatus: m.approval_status ?? null,
        gateOpen: evidenceBlockers.length === 0,
        sourceCount: sources.length,
        processedSourceCount: processed.length,
        blockers,
      };
    });

    const gateOpenCount = milestoneGates.filter((m) => m.gateOpen).length;
    const pendingEvidenceCount = milestoneGates.filter(
      (m) => !m.gateOpen && !m.blockers.includes("milestone_already_complete"),
    ).length;
    const completeCount = milestoneGates.filter((m) =>
      m.blockers.includes("milestone_already_complete"),
    ).length;

    return {
      projectId: data.projectId,
      projectName: (proj.name as string | null) ?? "Untitled project",
      totalMilestones: milestones.length,
      milestonesPendingEvidence: pendingEvidenceCount,
      milestonesGateOpen: gateOpenCount,
      milestonesAlreadyComplete: completeCount,
      overallGateOpen: pendingEvidenceCount === 0,
      milestones: milestoneGates,
      globalSourceCount: allSources.length,
      globalProcessedSourceCount: processedGlobal.length,
    };
  });

// -------------------------------------------------------
// getWorkspaceEvidenceReport — cross-project admin report
// Phase 9B: surfaces every project with evidence gaps
// -------------------------------------------------------

export type ProjectEvidenceRow = {
  projectId: string;
  projectName: string;
  projectStatus: string | null;
  totalMilestones: number;
  completedMilestones: number;
  milestonesPendingEvidence: number;
  milestonesGateOpen: number;
  globalSourceCount: number;
  globalProcessedSourceCount: number;
  overallGateOpen: boolean;
  /** Whether any milestone is incomplete due to missing evidence */
  hasGaps: boolean;
};

export type WorkspaceEvidenceReport = {
  /** Projects that have at least one milestone needing evidence */
  projectsWithGaps: ProjectEvidenceRow[];
  /** Projects where all milestones are either complete or evidence-ready */
  projectsClear: ProjectEvidenceRow[];
  /** Projects with no milestones at all */
  projectsEmpty: ProjectEvidenceRow[];
  totalProjects: number;
  totalMilestones: number;
  totalMilestonesWithGaps: number;
  totalSources: number;
  totalProcessedSources: number;
  generatedAt: string;
};

export const getWorkspaceEvidenceReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WorkspaceEvidenceReport> => {
    await assertOperatorOrAdmin(context as unknown as StaffCtx);
    const sb = (context as unknown as StaffCtx).supabase;

    // 1. Load all projects
    const { data: projects, error: pErr } = await sb
      .from("engine_projects")
      .select("id,name,status")
      .order("created_at", { ascending: false });
    if (pErr) throw new Error(pErr.message ?? "Failed to load projects");

    const projectRows = (projects ?? []) as Array<{
      id: string;
      name: string | null;
      status: string | null;
    }>;

    if (projectRows.length === 0) {
      return {
        projectsWithGaps: [],
        projectsClear: [],
        projectsEmpty: [],
        totalProjects: 0,
        totalMilestones: 0,
        totalMilestonesWithGaps: 0,
        totalSources: 0,
        totalProcessedSources: 0,
        generatedAt: new Date().toISOString(),
      };
    }

    const projectIds = projectRows.map((p) => p.id);

    // 2. Load all milestones across projects in one query
    const { data: allMilestones, error: mErr } = await sb
      .from("engine_review_items")
      .select("id,project_id,title,status,approval_status,metadata")
      .in("project_id", projectIds);
    if (mErr) throw new Error(mErr.message ?? "Failed to load milestones");

    const milestoneRows = (allMilestones ?? []) as Array<{
      id: string;
      project_id: string;
      title: string | null;
      status: string | null;
      approval_status: string | null;
      metadata: Record<string, any> | null;
    }>;

    // 3. Load all sources across projects in one query
    const { data: allSources, error: sErr } = await sb
      .from("engine_sources")
      .select("id,project_id,status,metadata")
      .in("project_id", projectIds);
    if (sErr) throw new Error(sErr.message ?? "Failed to load sources");

    const sourceRows = (allSources ?? []) as Array<{
      id: string;
      project_id: string;
      status: string | null;
      metadata: Record<string, any> | null;
    }>;

    // 4. Build per-project maps
    const milestonesByProject = new Map<string, typeof milestoneRows>();
    for (const m of milestoneRows) {
      if (!milestonesByProject.has(m.project_id)) {
        milestonesByProject.set(m.project_id, []);
      }
      milestonesByProject.get(m.project_id)!.push(m);
    }

    const sourcesByProject = new Map<string, typeof sourceRows>();
    for (const s of sourceRows) {
      if (!sourcesByProject.has(s.project_id)) {
        sourcesByProject.set(s.project_id, []);
      }
      sourcesByProject.get(s.project_id)!.push(s);
    }

    // 5. Evaluate each project
    const evaluated: ProjectEvidenceRow[] = projectRows.map((proj) => {
      const milestones = milestonesByProject.get(proj.id) ?? [];
      const sources = sourcesByProject.get(proj.id) ?? [];
      const processedSources = sources.filter((s) => s.status === "processed");

      let pendingEvidenceCount = 0;
      let gateOpenCount = 0;
      let completedCount = 0;

      for (const m of milestones) {
        const isComplete = m.status === "complete" || m.status === "completed";
        if (isComplete) {
          completedCount++;
          continue;
        }

        // Check milestone-scoped sources first
        const scoped = sources.filter((s) => s.metadata?.milestone_id === m.id);
        const effectiveSources = scoped.length > 0 ? scoped : sources;
        const effectiveProcessed = effectiveSources.filter((s) => s.status === "processed");

        const gateOpen =
          effectiveSources.length > 0 && effectiveProcessed.length > 0;

        if (gateOpen) {
          gateOpenCount++;
        } else {
          pendingEvidenceCount++;
        }
      }

      return {
        projectId: proj.id,
        projectName: proj.name ?? "Untitled project",
        projectStatus: proj.status,
        totalMilestones: milestones.length,
        completedMilestones: completedCount,
        milestonesPendingEvidence: pendingEvidenceCount,
        milestonesGateOpen: gateOpenCount,
        globalSourceCount: sources.length,
        globalProcessedSourceCount: processedSources.length,
        overallGateOpen: pendingEvidenceCount === 0,
        hasGaps: pendingEvidenceCount > 0,
      };
    });

    const projectsWithGaps = evaluated.filter((p) => p.hasGaps);
    const projectsClear = evaluated.filter(
      (p) => !p.hasGaps && p.totalMilestones > 0,
    );
    const projectsEmpty = evaluated.filter((p) => p.totalMilestones === 0);

    return {
      projectsWithGaps,
      projectsClear,
      projectsEmpty,
      totalProjects: projectRows.length,
      totalMilestones: milestoneRows.length,
      totalMilestonesWithGaps: evaluated.reduce(
        (sum, p) => sum + p.milestonesPendingEvidence,
        0,
      ),
      totalSources: sourceRows.length,
      totalProcessedSources: sourceRows.filter((s) => s.status === "processed")
        .length,
      generatedAt: new Date().toISOString(),
    };
  });

// -------------------------------------------------------
// markMilestoneComplete — enforces evidence gate
// -------------------------------------------------------

export const markMilestoneComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: uuid,
        milestoneId: uuid,
        completionNote: z.string().max(2000).default(""),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const actor = await assertAdmin(context as unknown as StaffCtx);
    const sb = (context as unknown as StaffCtx).supabase;

    // Load milestone
    const { data: milestone, error: mErr } = await sb
      .from("engine_review_items")
      .select("id,title,status,approval_status,metadata")
      .eq("id", data.milestoneId)
      .eq("project_id", data.projectId)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message ?? "Failed to load milestone");
    if (!milestone) throw new Error("Milestone not found in this project.");

    if (milestone.status === "complete" || milestone.status === "completed") {
      throw new Error("Milestone is already marked complete.");
    }

    // === EVIDENCE GATE ===
    // Load sources; prefer milestone-scoped, fall back to project-scoped
    const { data: allSources, error: sErr } = await sb
      .from("engine_sources")
      .select("id,name,source_type,status,metadata")
      .eq("project_id", data.projectId);
    if (sErr) throw new Error(sErr.message ?? "Failed to load sources");
    const sources = (allSources ?? []) as Array<{
      id: string;
      name: string;
      source_type: string;
      status: string;
      metadata: Record<string, any> | null;
    }>;

    const scopedSources = sources.filter(
      (s) => s.metadata?.milestone_id === data.milestoneId,
    );
    const effectiveSources = scopedSources.length > 0 ? scopedSources : sources;
    const processedSources = effectiveSources.filter(
      (s) => s.status === "processed",
    );

    if (effectiveSources.length === 0) {
      throw new Error(
        "Evidence gate blocked: No evidence sources are attached to this project. " +
          "Upload and process at least one source document before marking a milestone complete.",
      );
    }

    if (processedSources.length === 0) {
      throw new Error(
        `Evidence gate blocked: ${effectiveSources.length} source${
          effectiveSources.length > 1 ? "s" : ""
        } attached but none have been processed. ` +
          "Wait for source processing to complete before marking this milestone complete.",
      );
    }
    // === END EVIDENCE GATE ===

    const nowIso = new Date().toISOString();
    const currentMeta =
      (milestone.metadata as Record<string, any> | null) ?? {};

    // Mark the milestone complete
    const { error: upErr } = await sb
      .from("engine_review_items")
      .update({
        status: "complete",
        metadata: {
          ...currentMeta,
          completed_at: nowIso,
          completed_by_email: actor.email,
          completion_note:
            data.completionNote || null,
          evidence_gate_passed: true,
          evidence_source_count: effectiveSources.length,
          evidence_processed_count: processedSources.length,
          evidence_gate_opened_at: nowIso,
        },
      })
      .eq("id", data.milestoneId);
    if (upErr) throw new Error(upErr.message ?? "Failed to update milestone");

    const milestoneName =
      (milestone.title as string | null) ??
      (milestone.metadata?.name as string | null) ??
      "Unnamed milestone";

    await logAudit(sb, {
      project_id: data.projectId,
      actor_email: actor.email,
      action: "milestone_completed",
      summary: `Milestone "${milestoneName.slice(0, 80)}" marked complete by ${actor.email}. Evidence gate passed (${processedSources.length} processed source${processedSources.length > 1 ? "s" : ""}).`,
      target_id: data.milestoneId,
      metadata: {
        milestone_id: data.milestoneId,
        milestone_name: milestoneName,
        evidence_source_count: effectiveSources.length,
        evidence_processed_count: processedSources.length,
        completion_note: data.completionNote || null,
        gate_passed: true,
      },
    });

    await logActivity(
      sb,
      data.projectId,
      "milestone_completed",
      `Milestone complete: ${milestoneName.slice(0, 80)}`,
      `${actor.email} marked the milestone "${milestoneName.slice(0, 80)}" complete. ` +
        `Evidence gate passed: ${processedSources.length} processed source${processedSources.length > 1 ? "s" : ""}.`,
      "info",
    );

    return {
      success: true as const,
      milestoneId: data.milestoneId,
      completedAt: nowIso,
      evidenceSourceCount: effectiveSources.length,
      evidenceProcessedCount: processedSources.length,
    };
  });
