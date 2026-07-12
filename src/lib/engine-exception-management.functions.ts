/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 11B — Exception-Based Management
//
// Surfaces only what needs human attention across all projects.
// At scale, operators cannot watch every project — this module
// produces a ranked exception feed so the right signal rises to the top.
//
// Exception categories (in priority order):
//   1. CRITICAL  — project stalled >7d with no activity
//   2. CRITICAL  — rejected build packets (client rejected work)
//   3. HIGH      — open_decisions > 0 on any project
//   4. HIGH      — evidence gaps blocking milestone completion
//   5. HIGH      — packets in QA review >3d (likely stuck)
//   6. MEDIUM    — project health_score <= 40
//   7. MEDIUM    — no client acknowledgment on roadmap approved >2d ago
//   8. LOW       — packets in draft/handed_off with no activity >5d
//
// Product law:
//   Operators should only see what requires their decision or action.
//   A green board means the system is working — not that the operator
//   is missing context. Silence is signal.
//
// This module NEVER:
//   - auto-resolves exceptions
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

export type ExceptionSeverity = "critical" | "high" | "medium" | "low";

export type ExceptionKind =
  | "project_stalled"
  | "packets_rejected"
  | "open_decisions"
  | "evidence_gap"
  | "qa_stuck"
  | "low_health_score"
  | "ack_overdue"
  | "packets_idle";

export type ProjectException = {
  id: string; // stable key: `${projectId}:${kind}`
  projectId: string;
  projectName: string;
  projectStatus: string | null;
  kind: ExceptionKind;
  severity: ExceptionSeverity;
  title: string;
  detail: string;
  /** ISO timestamp of the triggering event or staleness anchor */
  triggeredAt: string | null;
  /** Link target in the engine UI */
  actionPath: string;
  actionLabel: string;
  /** Days since the triggering condition became true */
  daysSince: number | null;
};

export type ExceptionBoard = {
  exceptions: ProjectException[];
  /** Projects with at least one exception */
  affectedProjectCount: number;
  /** Breakdown by severity */
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  /** Exceptions by project for the detail pane */
  byProject: Array<{
    projectId: string;
    projectName: string;
    projectStatus: string | null;
    exceptions: ProjectException[];
    worstSeverity: ExceptionSeverity;
  }>;
  /** Total projects scanned */
  totalProjects: number;
  /** Projects that are fully clear (no exceptions) */
  clearProjectCount: number;
  generatedAt: string;
};

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

const SEVERITY_RANK: Record<ExceptionSeverity, number> = {
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

function worstSeverity(exceptions: ProjectException[]): ExceptionSeverity {
  let best: ExceptionSeverity = "low";
  for (const ex of exceptions) {
    if (SEVERITY_RANK[ex.severity] > SEVERITY_RANK[best]) {
      best = ex.severity;
    }
  }
  return best;
}

// -------------------------------------------------------
// getExceptionBoard — cross-project exception feed
// -------------------------------------------------------

export const getExceptionBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ExceptionBoard> => {
    await assertOperatorOrAdmin(context as unknown as StaffCtx);
    const sb = (context as unknown as StaffCtx).supabase;
    const now = new Date();

    // ── 1. Load all projects ──────────────────────────────────────────────
    const { data: projects, error: pErr } = await sb
      .from("engine_projects")
      .select(
        "id,name,status,open_decisions,health_score,last_activity_at,approved_at,current_step,agent_status",
      )
      .order("last_activity_at", { ascending: true });
    if (pErr) throw new Error(pErr.message ?? "Failed to load projects");

    const projectRows = (projects ?? []) as Array<{
      id: string;
      name: string | null;
      status: string | null;
      open_decisions: number;
      health_score: number;
      last_activity_at: string | null;
      approved_at: string | null;
      current_step: string | null;
      agent_status: string | null;
    }>;

    if (projectRows.length === 0) {
      return {
        exceptions: [],
        affectedProjectCount: 0,
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        byProject: [],
        totalProjects: 0,
        clearProjectCount: 0,
        generatedAt: now.toISOString(),
      };
    }

    const projectIds = projectRows.map((p) => p.id);
    // Exclude completed/archived projects from exception tracking
    const activeProjects = projectRows.filter(
      (p) => p.status !== "completed" && p.status !== "archived",
    );
    const activeIds = activeProjects.map((p) => p.id);

    // ── 2. Load build packets for active projects ─────────────────────────
    const { data: allPackets, error: pkErr } = await sb
      .from("engine_project_build_packets")
      .select("id,project_id,title,status,sequence_number,updated_at")
      .in("project_id", activeIds.length > 0 ? activeIds : projectIds)
      .order("sequence_number", { ascending: true });
    if (pkErr) throw new Error(pkErr.message ?? "Failed to load build packets");

    const packetRows = (allPackets ?? []) as Array<{
      id: string;
      project_id: string;
      title: string;
      status: string;
      sequence_number: number;
      updated_at: string | null;
    }>;

    // ── 3. Load milestones and sources for evidence gap detection ─────────
    const { data: allMilestones, error: mErr } = await sb
      .from("engine_review_items")
      .select("id,project_id,title,status,approval_status,metadata")
      .in("project_id", activeIds.length > 0 ? activeIds : projectIds);
    if (mErr) throw new Error(mErr.message ?? "Failed to load milestones");

    const milestoneRows = (allMilestones ?? []) as Array<{
      id: string;
      project_id: string;
      title: string | null;
      status: string | null;
      approval_status: string | null;
      metadata: Record<string, any> | null;
    }>;

    const { data: allSources, error: sErr } = await sb
      .from("engine_sources")
      .select("id,project_id,status,metadata")
      .in("project_id", activeIds.length > 0 ? activeIds : projectIds);
    if (sErr) throw new Error(sErr.message ?? "Failed to load sources");

    const sourceRows = (allSources ?? []) as Array<{
      id: string;
      project_id: string;
      status: string | null;
      metadata: Record<string, any> | null;
    }>;

    // ── 4. Build lookup maps ──────────────────────────────────────────────
    const packetsByProject = new Map<string, typeof packetRows>();
    for (const pk of packetRows) {
      if (!packetsByProject.has(pk.project_id)) packetsByProject.set(pk.project_id, []);
      packetsByProject.get(pk.project_id)!.push(pk);
    }

    const milestonesByProject = new Map<string, typeof milestoneRows>();
    for (const m of milestoneRows) {
      if (!milestonesByProject.has(m.project_id)) milestonesByProject.set(m.project_id, []);
      milestonesByProject.get(m.project_id)!.push(m);
    }

    const sourcesByProject = new Map<string, typeof sourceRows>();
    for (const s of sourceRows) {
      if (!sourcesByProject.has(s.project_id)) sourcesByProject.set(s.project_id, []);
      sourcesByProject.get(s.project_id)!.push(s);
    }

    // ── 5. Evaluate exceptions per project ───────────────────────────────
    const exceptionsByProject = new Map<string, ProjectException[]>();

    for (const proj of activeProjects) {
      const exceptions: ProjectException[] = [];
      const packets = packetsByProject.get(proj.id) ?? [];
      const nonArchivedPackets = packets.filter((p) => p.status !== "archived");
      const milestones = milestonesByProject.get(proj.id) ?? [];
      const sources = sourcesByProject.get(proj.id) ?? [];
      const projName = proj.name ?? "Untitled project";

      // --- EXCEPTION 1: Project stalled (no activity >7d) ---
      const stalledDays = daysBetween(proj.last_activity_at, now);
      if (stalledDays !== null && stalledDays >= 7) {
        exceptions.push({
          id: `${proj.id}:project_stalled`,
          projectId: proj.id,
          projectName: projName,
          projectStatus: proj.status,
          kind: "project_stalled",
          severity: "critical",
          title: `Project stalled — ${stalledDays}d with no activity`,
          detail: `"${projName}" has had no recorded activity in ${stalledDays} days. Last activity: ${proj.last_activity_at ? new Date(proj.last_activity_at).toLocaleDateString() : "unknown"}. Current step: ${proj.current_step ?? "unknown"}.`,
          triggeredAt: proj.last_activity_at,
          actionPath: `/engine/projects/${proj.id}`,
          actionLabel: "View project",
          daysSince: stalledDays,
        });
      }

      // --- EXCEPTION 2: Rejected build packets ---
      const rejectedPackets = nonArchivedPackets.filter((p) => p.status === "rejected");
      if (rejectedPackets.length > 0) {
        exceptions.push({
          id: `${proj.id}:packets_rejected`,
          projectId: proj.id,
          projectName: projName,
          projectStatus: proj.status,
          kind: "packets_rejected",
          severity: "critical",
          title: `${rejectedPackets.length} build packet${rejectedPackets.length > 1 ? "s" : ""} rejected`,
          detail: `Client rejected ${rejectedPackets.length} packet${rejectedPackets.length > 1 ? "s" : ""}: ${rejectedPackets.slice(0, 3).map((p) => `#${p.sequence_number} ${p.title}`).join(", ")}${rejectedPackets.length > 3 ? " and more" : ""}. Rework required before delivery can proceed.`,
          triggeredAt: rejectedPackets[0]?.updated_at ?? null,
          actionPath: `/engine/projects/${proj.id}/delivery`,
          actionLabel: "View delivery",
          daysSince: daysBetween(rejectedPackets[0]?.updated_at ?? null, now),
        });
      }

      // --- EXCEPTION 3: Open decisions ---
      if (proj.open_decisions > 0) {
        exceptions.push({
          id: `${proj.id}:open_decisions`,
          projectId: proj.id,
          projectName: projName,
          projectStatus: proj.status,
          kind: "open_decisions",
          severity: "high",
          title: `${proj.open_decisions} open decision${proj.open_decisions > 1 ? "s" : ""} awaiting resolution`,
          detail: `"${projName}" has ${proj.open_decisions} unresolved decision${proj.open_decisions > 1 ? "s" : ""} that may be blocking progress. Open decisions stall scope definition and approvals.`,
          triggeredAt: null,
          actionPath: `/engine/projects/${proj.id}`,
          actionLabel: "View decisions",
          daysSince: null,
        });
      }

      // --- EXCEPTION 4: Evidence gaps blocking milestones ---
      const pendingMilestones = milestones.filter(
        (m) => m.status !== "complete" && m.status !== "completed",
      );
      const processedSources = sources.filter((s) => s.status === "processed");
      const milestonesMissingEvidence = pendingMilestones.filter((m) => {
        const scoped = sources.filter(
          (s) => s.metadata?.milestone_id === m.id,
        );
        const effective = scoped.length > 0 ? scoped : sources;
        const processed = effective.filter((s) => s.status === "processed");
        return effective.length === 0 || processed.length === 0;
      });

      if (milestonesMissingEvidence.length > 0) {
        exceptions.push({
          id: `${proj.id}:evidence_gap`,
          projectId: proj.id,
          projectName: projName,
          projectStatus: proj.status,
          kind: "evidence_gap",
          severity: "high",
          title: `${milestonesMissingEvidence.length} milestone${milestonesMissingEvidence.length > 1 ? "s" : ""} missing evidence`,
          detail: `${milestonesMissingEvidence.length} pending milestone${milestonesMissingEvidence.length > 1 ? "s" : ""} cannot be marked complete — no processed evidence sources. Total sources: ${sources.length}, processed: ${processedSources.length}.`,
          triggeredAt: null,
          actionPath: `/engine/projects/${proj.id}/evidence`,
          actionLabel: "View evidence",
          daysSince: null,
        });
      }

      // --- EXCEPTION 5: Packets stuck in QA >3d ---
      const qaPackets = nonArchivedPackets.filter((p) => p.status === "qa_required");
      const qaStuck = qaPackets.filter((p) => {
        const d = daysBetween(p.updated_at, now);
        return d !== null && d >= 3;
      });
      if (qaStuck.length > 0) {
        const oldestDays = Math.max(
          ...qaStuck.map((p) => daysBetween(p.updated_at, now) ?? 0),
        );
        exceptions.push({
          id: `${proj.id}:qa_stuck`,
          projectId: proj.id,
          projectName: projName,
          projectStatus: proj.status,
          kind: "qa_stuck",
          severity: "high",
          title: `${qaStuck.length} packet${qaStuck.length > 1 ? "s" : ""} stuck in QA (${oldestDays}d+)`,
          detail: `${qaStuck.length} packet${qaStuck.length > 1 ? "s" : ""} have been in QA review for ${oldestDays}+ days with no resolution: ${qaStuck.slice(0, 3).map((p) => `#${p.sequence_number} ${p.title}`).join(", ")}.`,
          triggeredAt: qaStuck[0]?.updated_at ?? null,
          actionPath: `/engine/projects/${proj.id}/delivery`,
          actionLabel: "Review QA",
          daysSince: oldestDays,
        });
      }

      // --- EXCEPTION 6: Low health score ---
      if (proj.health_score <= 40 && proj.health_score > 0) {
        exceptions.push({
          id: `${proj.id}:low_health_score`,
          projectId: proj.id,
          projectName: projName,
          projectStatus: proj.status,
          kind: "low_health_score",
          severity: "medium",
          title: `Health score ${proj.health_score}/100 — project at risk`,
          detail: `"${projName}" health score is ${proj.health_score}/100. A score ≤40 indicates significant risk. Review project steps, open decisions, and agent status to identify the root cause.`,
          triggeredAt: null,
          actionPath: `/engine/projects/${proj.id}`,
          actionLabel: "Review health",
          daysSince: null,
        });
      }

      // --- EXCEPTION 7: Roadmap approved but no client ack >2d ---
      const approvedDays = daysBetween(proj.approved_at, now);
      if (
        proj.approved_at &&
        approvedDays !== null &&
        approvedDays >= 2 &&
        proj.status !== "delivered" &&
        proj.status !== "completed"
      ) {
        // Only flag if not yet published (no delivery portal step)
        // Use current_step as a proxy — if past approval step, skip
        const postAckSteps = ["delivery", "build", "live", "complete"];
        const isPostAck = postAckSteps.some(
          (s) => (proj.current_step ?? "").toLowerCase().includes(s),
        );
        if (!isPostAck) {
          exceptions.push({
            id: `${proj.id}:ack_overdue`,
            projectId: proj.id,
            projectName: projName,
            projectStatus: proj.status,
            kind: "ack_overdue",
            severity: "medium",
            title: `Roadmap approved ${approvedDays}d ago — client ack overdue`,
            detail: `Roadmap was approved ${approvedDays} days ago but the project has not advanced to a post-acknowledgment step. The client may not have seen or acknowledged the roadmap.`,
            triggeredAt: proj.approved_at,
            actionPath: `/engine/projects/${proj.id}`,
            actionLabel: "Check status",
            daysSince: approvedDays,
          });
        }
      }

      // --- EXCEPTION 8: Idle packets (draft/handed_off >5d) ---
      const idleStatuses = new Set(["draft", "handed_off", "in_progress"]);
      const idlePackets = nonArchivedPackets.filter((p) => {
        if (!idleStatuses.has(p.status)) return false;
        const d = daysBetween(p.updated_at, now);
        return d !== null && d >= 5;
      });
      if (idlePackets.length > 0) {
        const oldestDays = Math.max(
          ...idlePackets.map((p) => daysBetween(p.updated_at, now) ?? 0),
        );
        exceptions.push({
          id: `${proj.id}:packets_idle`,
          projectId: proj.id,
          projectName: projName,
          projectStatus: proj.status,
          kind: "packets_idle",
          severity: "low",
          title: `${idlePackets.length} packet${idlePackets.length > 1 ? "s" : ""} idle ${oldestDays}d+ with no progress`,
          detail: `${idlePackets.length} packet${idlePackets.length > 1 ? "s" : ""} in draft/in-progress state with no updates in ${oldestDays}+ days. These may be forgotten or blocked externally.`,
          triggeredAt: idlePackets[0]?.updated_at ?? null,
          actionPath: `/engine/projects/${proj.id}/delivery`,
          actionLabel: "View packets",
          daysSince: oldestDays,
        });
      }

      if (exceptions.length > 0) {
        exceptionsByProject.set(proj.id, exceptions);
      }
    }

    // ── 6. Flatten and sort: critical first, then by daysSince desc ────────
    const allExceptions: ProjectException[] = [];
    for (const exList of exceptionsByProject.values()) {
      allExceptions.push(...exList);
    }

    allExceptions.sort((a, b) => {
      const sevDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
      if (sevDiff !== 0) return sevDiff;
      return (b.daysSince ?? 0) - (a.daysSince ?? 0);
    });

    // ── 7. Build byProject list ────────────────────────────────────────────
    const byProject = Array.from(exceptionsByProject.entries()).map(
      ([projectId, exceptions]) => {
        const proj = activeProjects.find((p) => p.id === projectId)!;
        return {
          projectId,
          projectName: proj?.name ?? "Untitled project",
          projectStatus: proj?.status ?? null,
          exceptions: [...exceptions].sort(
            (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
          ),
          worstSeverity: worstSeverity(exceptions),
        };
      },
    );

    byProject.sort(
      (a, b) => SEVERITY_RANK[b.worstSeverity] - SEVERITY_RANK[a.worstSeverity],
    );

    const criticalCount = allExceptions.filter((e) => e.severity === "critical").length;
    const highCount = allExceptions.filter((e) => e.severity === "high").length;
    const mediumCount = allExceptions.filter((e) => e.severity === "medium").length;
    const lowCount = allExceptions.filter((e) => e.severity === "low").length;

    return {
      exceptions: allExceptions,
      affectedProjectCount: exceptionsByProject.size,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      byProject,
      totalProjects: activeProjects.length,
      clearProjectCount: activeProjects.length - exceptionsByProject.size,
      generatedAt: now.toISOString(),
    };
  });
