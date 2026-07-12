/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 11C — Drift Detection
//
// Compares the current state of each active project against its approved
// Spine (point_a / point_b / key_milestones) and surfaces divergences
// that require human review.
//
// Drift categories (in priority order):
//   CRITICAL  — project steps completed that conflict with spine definition
//   CRITICAL  — deliverables marked done that have no corresponding spine milestone
//   HIGH      — spine fields changed after project moved past proposal stage
//   HIGH      — milestone count in active project exceeds spine-defined milestones
//   MEDIUM    — project status is ahead of approved spine scope (scope creep proxy)
//   MEDIUM    — open_decisions > 0 with no spine acknowledgment (undecided spine)
//   LOW       — last spine update older than last project activity (stale spine)
//
// Product law:
//   Drift is not failure — it is signal. The system surfaces it; humans decide
//   whether to absorb the drift into the spine or revert the project state.
//   This module NEVER auto-corrects, auto-approves, or modifies any project.
//   It is a read-only diagnostic surface.
//
// This module NEVER:
//   - auto-resolves drift
//   - sends notifications
//   - marks anything approved, complete, or delivered
//   - applies migrations
//   - modifies any project state

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import { isOperatorEmail, isAdminEmail } from "@/lib/ops/access";

type Sb = any;
type StaffCtx = { claims?: Record<string, unknown>; userId?: string; supabase: Sb };

async function assertOperatorOrAdmin(ctx: StaffCtx) {
  const email = ((ctx.claims?.email as string | undefined) ?? "").toLowerCase();
  if (isOperatorEmail(email) || isAdminEmail(email)) return;
  const ok = await hasRoleForEmail(ctx.supabase, email, "admin");
  if (!ok) throw new Error("Forbidden: operator or admin role required");
}

// -------------------------------------------------------
// Types
// -------------------------------------------------------

export type DriftSeverity = "critical" | "high" | "medium" | "low";

export type DriftKind =
  | "step_conflicts_spine"
  | "deliverable_orphaned"
  | "spine_changed_post_proposal"
  | "milestone_count_exceeded"
  | "scope_ahead_of_spine"
  | "undecided_spine"
  | "spine_stale";

export type DriftSignal = {
  id: string; // stable key: `${projectId}:${kind}`
  projectId: string;
  projectName: string;
  projectStatus: string | null;
  kind: DriftKind;
  severity: DriftSeverity;
  title: string;
  detail: string;
  /** Recommended resolution action */
  resolution: string;
  /** ISO timestamp of the triggering event */
  detectedAt: string;
  /** Link target in the engine UI */
  actionPath: string;
  actionLabel: string;
  /** Spine snapshot at detection */
  spineSnapshot: {
    pointA: string | null;
    pointB: string | null;
    milestonesCount: number;
  };
};

export type DriftReport = {
  signals: DriftSignal[];
  /** Projects with at least one drift signal */
  affectedProjectCount: number;
  /** Breakdown by severity */
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  /** Drift by project for the detail pane */
  byProject: Array<{
    projectId: string;
    projectName: string;
    projectStatus: string | null;
    signals: DriftSignal[];
    worstSeverity: DriftSeverity;
    driftScore: number; // 0-100, higher = more drift
  }>;
  /** Total projects scanned */
  totalProjects: number;
  /** Projects with no drift signals */
  alignedProjectCount: number;
  generatedAt: string;
};

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

const SEVERITY_RANK: Record<DriftSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function daysBetween(a: string | null | undefined, b: Date): number | null {
  if (!a) return null;
  try {
    const diff = b.getTime() - new Date(a).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

function worstSeverity(signals: DriftSignal[]): DriftSeverity {
  let best: DriftSeverity = "low";
  for (const s of signals) {
    if (SEVERITY_RANK[s.severity] > SEVERITY_RANK[best]) best = s.severity;
  }
  return best;
}

function driftScore(signals: DriftSignal[]): number {
  if (signals.length === 0) return 0;
  const totalWeight = signals.reduce((sum, s) => sum + SEVERITY_RANK[s.severity], 0);
  // Normalize: 4 critical signals = 100 points
  return Math.min(100, Math.round((totalWeight / (signals.length * 4)) * 100));
}

function extractMilestones(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((m: any) => (typeof m === "string" ? m : m?.title ?? "")).filter(Boolean);
  if (typeof raw === "string") {
    // Try newline-separated list
    return raw.split(/\n/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

// -------------------------------------------------------
// getWorkspaceDriftReport — cross-project drift feed
// -------------------------------------------------------

export const getWorkspaceDriftReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DriftReport> => {
    await assertOperatorOrAdmin(context as unknown as StaffCtx);
    const sb = (context as unknown as StaffCtx).supabase;
    const now = new Date();

    // ── 1. Load all active projects with spine fields ─────────────────────
    const { data: projects, error: pErr } = await sb
      .from("engine_projects")
      .select(
        "id,name,status,current_step,open_decisions,approved_at,last_activity_at," +
        "point_a,point_b,key_milestones,agent_status,health_score,updated_at",
      )
      .not("status", "in", "(\"completed\",\"archived\")")
      .order("last_activity_at", { ascending: true });
    if (pErr) throw new Error(pErr.message ?? "Failed to load projects");

    const projectRows = (projects ?? []) as Array<{
      id: string;
      name: string | null;
      status: string | null;
      current_step: string | null;
      open_decisions: number;
      approved_at: string | null;
      last_activity_at: string | null;
      point_a: string | null;
      point_b: string | null;
      key_milestones: any;
      agent_status: string | null;
      health_score: number;
      updated_at: string | null;
    }>;

    if (projectRows.length === 0) {
      return {
        signals: [], affectedProjectCount: 0, criticalCount: 0, highCount: 0,
        mediumCount: 0, lowCount: 0, byProject: [], totalProjects: 0,
        alignedProjectCount: 0, generatedAt: now.toISOString(),
      };
    }

    const projectIds = projectRows.map((p) => p.id);

    // ── 2. Load review items (milestones) ─────────────────────────────────
    const { data: allReviewItems, error: riErr } = await sb
      .from("engine_review_items")
      .select("id,project_id,title,status,approval_status")
      .in("project_id", projectIds);
    if (riErr) throw new Error(riErr.message ?? "Failed to load review items");

    const reviewItemRows = (allReviewItems ?? []) as Array<{
      id: string;
      project_id: string;
      title: string | null;
      status: string | null;
      approval_status: string | null;
    }>;

    // ── 3. Load build packets ─────────────────────────────────────────────
    const { data: allPackets, error: pkErr } = await sb
      .from("engine_project_build_packets")
      .select("id,project_id,title,status,sequence_number")
      .in("project_id", projectIds)
      .not("status", "eq", "archived");
    if (pkErr) throw new Error(pkErr.message ?? "Failed to load build packets");

    const packetRows = (allPackets ?? []) as Array<{
      id: string;
      project_id: string;
      title: string | null;
      status: string;
      sequence_number: number;
    }>;

    // ── 4. Build lookup maps ──────────────────────────────────────────────
    const reviewsByProject = new Map<string, typeof reviewItemRows>();
    for (const r of reviewItemRows) {
      if (!reviewsByProject.has(r.project_id)) reviewsByProject.set(r.project_id, []);
      reviewsByProject.get(r.project_id)!.push(r);
    }

    const packetsByProject = new Map<string, typeof packetRows>();
    for (const pk of packetRows) {
      if (!packetsByProject.has(pk.project_id)) packetsByProject.set(pk.project_id, []);
      packetsByProject.get(pk.project_id)!.push(pk);
    }

    // ── 5. Evaluate drift per project ─────────────────────────────────────
    const signalsByProject = new Map<string, DriftSignal[]>();

    for (const proj of projectRows) {
      const signals: DriftSignal[] = [];
      const projName = proj.name ?? "Untitled project";
      const reviews = reviewsByProject.get(proj.id) ?? [];
      const packets = packetsByProject.get(proj.id) ?? [];
      const spineMilestones = extractMilestones(proj.key_milestones);
      const hasSpine = !!(proj.point_a && proj.point_b);
      const spineSnapshot = {
        pointA: proj.point_a,
        pointB: proj.point_b,
        milestonesCount: spineMilestones.length,
      };

      // --- SIGNAL 1: Deliverables marked done with no spine milestones ---
      // Critical: work completed that has no spine basis
      const completedReviews = reviews.filter(
        (r) => r.status === "complete" || r.status === "completed" || r.approval_status === "approved",
      );
      if (completedReviews.length > 0 && spineMilestones.length === 0 && hasSpine) {
        signals.push({
          id: `${proj.id}:deliverable_orphaned`,
          projectId: proj.id,
          projectName: projName,
          projectStatus: proj.status,
          kind: "deliverable_orphaned",
          severity: "critical",
          title: `${completedReviews.length} deliverable${completedReviews.length > 1 ? "s" : ""} completed with no spine milestones`,
          detail: `${completedReviews.length} review item${completedReviews.length > 1 ? "s" : ""} marked complete or approved, but the project spine defines no key milestones. Completed work has no authoritative basis.`,
          resolution: "Define key milestones in the project spine to anchor completed deliverables.",
          detectedAt: now.toISOString(),
          actionPath: `/engine/projects/${proj.id}`,
          actionLabel: "Review spine",
          spineSnapshot,
        });
      }

      // --- SIGNAL 2: Milestone count in project exceeds spine-defined count ---
      // Critical when ratio is severe (>2x), High otherwise
      if (spineMilestones.length > 0 && reviews.length > spineMilestones.length * 2) {
        const ratio = Math.round((reviews.length / spineMilestones.length) * 10) / 10;
        signals.push({
          id: `${proj.id}:milestone_count_exceeded`,
          projectId: proj.id,
          projectName: projName,
          projectStatus: proj.status,
          kind: "milestone_count_exceeded",
          severity: ratio >= 3 ? "critical" : "high",
          title: `Project has ${reviews.length} milestones vs ${spineMilestones.length} in spine (${ratio}×)`,
          detail: `The spine defines ${spineMilestones.length} key milestone${spineMilestones.length > 1 ? "s" : ""}, but the project has ${reviews.length} review items — ${ratio}× the spine baseline. This may indicate scope creep or an outdated spine.`,
          resolution: "Update the spine to reflect current scope, or archive excess review items that fall outside original scope.",
          detectedAt: now.toISOString(),
          actionPath: `/engine/projects/${proj.id}`,
          actionLabel: "Compare spine",
          spineSnapshot,
        });
      }

      // --- SIGNAL 3: Spine changed after project moved past proposal stage ---
      // High: spine should be stable once execution begins
      const executionSteps = ["build", "delivery", "qa", "live", "complete", "execution"];
      const isInExecution = executionSteps.some(
        (s) => (proj.current_step ?? "").toLowerCase().includes(s),
      );
      const spineUpdatedAt = proj.updated_at; // engine_projects.updated_at tracks all field updates
      const spineActivityDiff = daysBetween(proj.approved_at, now);
      if (
        isInExecution &&
        proj.approved_at &&
        spineUpdatedAt &&
        spineUpdatedAt > proj.approved_at
      ) {
        const daysSinceApproval = daysBetween(proj.approved_at, now) ?? 0;
        signals.push({
          id: `${proj.id}:spine_changed_post_proposal`,
          projectId: proj.id,
          projectName: projName,
          projectStatus: proj.status,
          kind: "spine_changed_post_proposal",
          severity: "high",
          title: `Spine modified during execution (${daysSinceApproval}d post-approval)`,
          detail: `Project spine (point_a, point_b, or milestones) was updated after roadmap approval and during execution phase "${proj.current_step}". Post-approval spine changes require explicit change control.`,
          resolution: "Document the spine change reason in the decision log and ensure client re-acknowledged the updated scope.",
          detectedAt: now.toISOString(),
          actionPath: `/engine/projects/${proj.id}`,
          actionLabel: "View decision log",
          spineSnapshot,
        });
      }

      // --- SIGNAL 4: Project status ahead of approved spine scope ---
      // Medium: proxy for scope creep
      const deliveredPackets = packets.filter(
        (p) => p.status === "accepted" || p.status === "delivered",
      );
      if (
        deliveredPackets.length > 0 &&
        spineMilestones.length > 0 &&
        deliveredPackets.length > spineMilestones.length
      ) {
        signals.push({
          id: `${proj.id}:scope_ahead_of_spine`,
          projectId: proj.id,
          projectName: projName,
          projectStatus: proj.status,
          kind: "scope_ahead_of_spine",
          severity: "medium",
          title: `${deliveredPackets.length} packets delivered vs ${spineMilestones.length} spine milestones`,
          detail: `More build packets have been accepted/delivered (${deliveredPackets.length}) than there are approved spine milestones (${spineMilestones.length}). The project may have grown beyond its original scope without formal spine updates.`,
          resolution: "Update spine milestones to reflect delivered scope, or document the extra packets as out-of-scope items.",
          detectedAt: now.toISOString(),
          actionPath: `/engine/projects/${proj.id}/delivery`,
          actionLabel: "View delivery",
          spineSnapshot,
        });
      }

      // --- SIGNAL 5: Open decisions with no spine (undecided spine) ---
      // Medium: spine exists but fundamental questions unanswered
      if (proj.open_decisions > 0 && !hasSpine) {
        signals.push({
          id: `${proj.id}:undecided_spine`,
          projectId: proj.id,
          projectName: projName,
          projectStatus: proj.status,
          kind: "undecided_spine",
          severity: "medium",
          title: `${proj.open_decisions} open decisions with no approved spine`,
          detail: `The project has ${proj.open_decisions} unresolved open decision${proj.open_decisions > 1 ? "s" : ""} and no approved spine. Execution cannot begin on a solid foundation until the spine is defined and decisions resolved.`,
          resolution: "Resolve open decisions and define the project spine before moving to execution.",
          detectedAt: now.toISOString(),
          actionPath: `/engine/projects/${proj.id}`,
          actionLabel: "View project",
          spineSnapshot,
        });
      }

      // --- SIGNAL 6: Spine stale vs last project activity ---
      // Low: spine hasn't been touched but work continues
      const activityDays = daysBetween(proj.last_activity_at, now) ?? Infinity;
      const spineAge = daysBetween(proj.updated_at, now) ?? Infinity;
      if (
        hasSpine &&
        proj.last_activity_at &&
        proj.updated_at &&
        proj.last_activity_at > proj.updated_at &&
        spineAge >= 14 &&
        activityDays < spineAge
      ) {
        signals.push({
          id: `${proj.id}:spine_stale`,
          projectId: proj.id,
          projectName: projName,
          projectStatus: proj.status,
          kind: "spine_stale",
          severity: "low",
          title: `Spine not updated in ${spineAge}d while project is active`,
          detail: `Project has been active (last activity: ${proj.last_activity_at ? new Date(proj.last_activity_at).toLocaleDateString() : "unknown"}) but the spine hasn't been updated in ${spineAge} days. A stale spine may not reflect current project reality.`,
          resolution: "Review the spine to confirm it still accurately describes the project's Point A, Point B, and milestones.",
          detectedAt: now.toISOString(),
          actionPath: `/engine/projects/${proj.id}`,
          actionLabel: "Review spine",
          spineSnapshot,
        });
      }

      if (signals.length > 0) {
        signalsByProject.set(proj.id, signals);
      }
    }

    // ── 6. Flatten and sort ───────────────────────────────────────────────
    const allSignals: DriftSignal[] = [];
    for (const list of signalsByProject.values()) allSignals.push(...list);

    allSignals.sort((a, b) => {
      const sevDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
      if (sevDiff !== 0) return sevDiff;
      return a.detectedAt < b.detectedAt ? 1 : -1;
    });

    // ── 7. Build byProject list ────────────────────────────────────────────
    const byProject = Array.from(signalsByProject.entries()).map(([projectId, signals]) => {
      const proj = projectRows.find((p) => p.id === projectId)!;
      return {
        projectId,
        projectName: proj?.name ?? "Untitled project",
        projectStatus: proj?.status ?? null,
        signals: [...signals].sort(
          (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
        ),
        worstSeverity: worstSeverity(signals),
        driftScore: driftScore(signals),
      };
    });

    byProject.sort(
      (a, b) => SEVERITY_RANK[b.worstSeverity] - SEVERITY_RANK[a.worstSeverity],
    );

    const criticalCount = allSignals.filter((s) => s.severity === "critical").length;
    const highCount = allSignals.filter((s) => s.severity === "high").length;
    const mediumCount = allSignals.filter((s) => s.severity === "medium").length;
    const lowCount = allSignals.filter((s) => s.severity === "low").length;

    return {
      signals: allSignals,
      affectedProjectCount: signalsByProject.size,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      byProject,
      totalProjects: projectRows.length,
      alignedProjectCount: projectRows.length - signalsByProject.size,
      generatedAt: now.toISOString(),
    };
  });
