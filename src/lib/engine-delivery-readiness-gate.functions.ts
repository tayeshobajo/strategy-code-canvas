/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 10B — Delivery Readiness Gate
//
// Cross-project admin gate that surfaces whether every build packet
// for a project has been accepted. A project is NOT delivery-ready until
// all of its non-archived packets are in status 'accepted'.
//
// Product law:
//   Delivery is not the default. The gate must open deliberately.
//   A project is ready for delivery only when every packet is accepted
//   and no open blockers remain.
//
// This module NEVER:
//   - marks a project delivered
//   - publishes to the client portal
//   - notifies clients
//   - applies migrations
//   - marks QA tests passed
//   - approves any readiness review

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

async function assertOperatorOrAdmin(ctx: StaffCtx) {
  const email = ((ctx.claims?.email as string | undefined) ?? "").toLowerCase();
  if (isOperatorEmail(email) || isAdminEmail(email)) return;
  const ok = await hasRoleForEmail(ctx.supabase, email, "admin");
  if (!ok) throw new Error("Forbidden: operator or admin role required");
}

// -------------------------------------------------------
// Types
// -------------------------------------------------------

export type PacketReadinessStatus =
  | "accepted"
  | "in_progress"
  | "rejected"
  | "qa_required"
  | "archived"
  | string;

export type ProjectDeliveryReadinessRow = {
  projectId: string;
  projectName: string;
  projectStatus: string | null;
  /** Is this project approved/has approved snapshot? */
  approvedAt: string | null;
  /** Total non-archived packets */
  totalPackets: number;
  /** Packets in status='accepted' */
  acceptedPackets: number;
  /** Packets still in progress (draft | ready | handed_off | in_progress | returned) */
  inProgressPackets: number;
  /** Packets that were rejected */
  rejectedPackets: number;
  /** Packets in qa_required state */
  qaRequiredPackets: number;
  /** true when all non-archived packets are accepted */
  gateOpen: boolean;
  /** High-level blocker reason if not ready */
  blockers: string[];
  /** Has at least one approved delivery readiness review */
  hasApprovedReadinessReview: boolean;
  /** Timestamp of most recently approved review */
  latestApprovedReviewAt: string | null;
  /** Packets not yet accepted (for display) */
  pendingPackets: Array<{ id: string; title: string; status: string; sequence_number: number }>;
};

export type WorkspaceDeliveryReadinessReport = {
  /** Projects where gate is open (all packets accepted) */
  projectsReady: ProjectDeliveryReadinessRow[];
  /** Projects blocked — have packets but not all accepted */
  projectsBlocked: ProjectDeliveryReadinessRow[];
  /** Projects with no packets yet */
  projectsEmpty: ProjectDeliveryReadinessRow[];
  totalProjects: number;
  totalPackets: number;
  totalAcceptedPackets: number;
  totalBlockedProjects: number;
  totalReadyProjects: number;
  generatedAt: string;
};

// -------------------------------------------------------
// getWorkspaceDeliveryReadinessReport — cross-project gate
// -------------------------------------------------------

export const getWorkspaceDeliveryReadinessReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WorkspaceDeliveryReadinessReport> => {
    await assertOperatorOrAdmin(context as unknown as StaffCtx);
    const sb = (context as unknown as StaffCtx).supabase;

    // 1. Load all projects
    const { data: projects, error: pErr } = await sb
      .from("engine_projects")
      .select("id,name,status,approved_at")
      .order("created_at", { ascending: false });
    if (pErr) throw new Error(pErr.message ?? "Failed to load projects");

    const projectRows = (projects ?? []) as Array<{
      id: string;
      name: string | null;
      status: string | null;
      approved_at: string | null;
    }>;

    if (projectRows.length === 0) {
      return {
        projectsReady: [],
        projectsBlocked: [],
        projectsEmpty: [],
        totalProjects: 0,
        totalPackets: 0,
        totalAcceptedPackets: 0,
        totalBlockedProjects: 0,
        totalReadyProjects: 0,
        generatedAt: new Date().toISOString(),
      };
    }

    const projectIds = projectRows.map((p) => p.id);

    // 2. Load all build packets across projects in one query
    const { data: allPackets, error: pkErr } = await sb
      .from("engine_project_build_packets")
      .select("id,project_id,title,status,sequence_number")
      .in("project_id", projectIds)
      .order("sequence_number", { ascending: true });
    if (pkErr) throw new Error(pkErr.message ?? "Failed to load build packets");

    const packetRows = (allPackets ?? []) as Array<{
      id: string;
      project_id: string;
      title: string;
      status: string;
      sequence_number: number;
    }>;

    // 3. Load latest approved delivery readiness review per project
    const { data: allReviews, error: rvErr } = await sb
      .from("engine_project_delivery_readiness_reviews")
      .select("id,project_id,status,approved_at")
      .in("project_id", projectIds)
      .eq("status", "approved")
      .order("approved_at", { ascending: false });
    if (rvErr) throw new Error(rvErr.message ?? "Failed to load delivery readiness reviews");

    const reviewRows = (allReviews ?? []) as Array<{
      id: string;
      project_id: string;
      status: string;
      approved_at: string | null;
    }>;

    // 4. Build per-project maps
    const packetsByProject = new Map<string, typeof packetRows>();
    for (const pk of packetRows) {
      if (!packetsByProject.has(pk.project_id)) {
        packetsByProject.set(pk.project_id, []);
      }
      packetsByProject.get(pk.project_id)!.push(pk);
    }

    const latestReviewByProject = new Map<string, (typeof reviewRows)[0]>();
    for (const rv of reviewRows) {
      // reviewRows is ordered desc by approved_at — first hit per project is latest
      if (!latestReviewByProject.has(rv.project_id)) {
        latestReviewByProject.set(rv.project_id, rv);
      }
    }

    // 5. Evaluate each project
    const IN_PROGRESS_STATUSES = new Set([
      "draft",
      "ready",
      "handed_off",
      "in_progress",
      "returned",
    ]);

    const evaluated: ProjectDeliveryReadinessRow[] = projectRows.map((proj) => {
      const allPkts = packetsByProject.get(proj.id) ?? [];
      // Non-archived packets are the meaningful ones
      const packets = allPkts.filter((p) => p.status !== "archived");

      const accepted = packets.filter((p) => p.status === "accepted");
      const inProgress = packets.filter((p) => IN_PROGRESS_STATUSES.has(p.status));
      const rejected = packets.filter((p) => p.status === "rejected");
      const qaRequired = packets.filter((p) => p.status === "qa_required");

      const gateOpen = packets.length > 0 && packets.length === accepted.length;

      const blockers: string[] = [];
      if (packets.length === 0) {
        blockers.push("No build packets created yet");
      }
      if (rejected.length > 0) {
        blockers.push(`${rejected.length} packet${rejected.length > 1 ? "s" : ""} rejected — need rework`);
      }
      if (qaRequired.length > 0) {
        blockers.push(`${qaRequired.length} packet${qaRequired.length > 1 ? "s" : ""} in QA review`);
      }
      if (inProgress.length > 0) {
        blockers.push(`${inProgress.length} packet${inProgress.length > 1 ? "s" : ""} still in progress`);
      }

      const latestReview = latestReviewByProject.get(proj.id) ?? null;

      const pendingPackets = [...inProgress, ...rejected, ...qaRequired]
        .slice(0, 10)
        .map((p) => ({
          id: p.id,
          title: p.title,
          status: p.status,
          sequence_number: p.sequence_number,
        }));

      return {
        projectId: proj.id,
        projectName: proj.name ?? "Untitled project",
        projectStatus: proj.status,
        approvedAt: proj.approved_at,
        totalPackets: packets.length,
        acceptedPackets: accepted.length,
        inProgressPackets: inProgress.length,
        rejectedPackets: rejected.length,
        qaRequiredPackets: qaRequired.length,
        gateOpen,
        blockers,
        hasApprovedReadinessReview: latestReview !== null,
        latestApprovedReviewAt: latestReview?.approved_at ?? null,
        pendingPackets,
      };
    });

    const projectsReady = evaluated.filter((p) => p.gateOpen);
    const projectsBlocked = evaluated.filter((p) => !p.gateOpen && p.totalPackets > 0);
    const projectsEmpty = evaluated.filter((p) => p.totalPackets === 0);

    return {
      projectsReady,
      projectsBlocked,
      projectsEmpty,
      totalProjects: projectRows.length,
      totalPackets: packetRows.filter((p) => p.status !== "archived").length,
      totalAcceptedPackets: packetRows.filter((p) => p.status === "accepted").length,
      totalBlockedProjects: projectsBlocked.length,
      totalReadyProjects: projectsReady.length,
      generatedAt: new Date().toISOString(),
    };
  });

// -------------------------------------------------------
// getProjectDeliveryReadinessGate — single-project gate status
// -------------------------------------------------------

export type ProjectDeliveryGateState = {
  project: { id: string; name: string; status: string | null };
  gateOpen: boolean;
  blockers: string[];
  totalPackets: number;
  acceptedPackets: number;
  inProgressPackets: number;
  rejectedPackets: number;
  qaRequiredPackets: number;
  pendingPackets: Array<{ id: string; title: string; status: string; sequence_number: number }>;
  hasApprovedReadinessReview: boolean;
  latestApprovedReviewAt: string | null;
};

export const getProjectDeliveryReadinessGate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<ProjectDeliveryGateState> => {
    await assertOperatorOrAdmin(context as unknown as StaffCtx);
    const sb = (context as unknown as StaffCtx).supabase;

    const { data: proj, error: pErr } = await sb
      .from("engine_projects")
      .select("id,name,status")
      .eq("id", data.projectId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message ?? "Failed to load project");
    if (!proj) throw new Error("Project not found");

    const { data: packets, error: pkErr } = await sb
      .from("engine_project_build_packets")
      .select("id,title,status,sequence_number")
      .eq("project_id", data.projectId)
      .order("sequence_number", { ascending: true });
    if (pkErr) throw new Error(pkErr.message ?? "Failed to load packets");

    const allPkts = (packets ?? []) as Array<{
      id: string;
      title: string;
      status: string;
      sequence_number: number;
    }>;
    const nonArchived = allPkts.filter((p) => p.status !== "archived");

    const IN_PROGRESS_STATUSES = new Set([
      "draft", "ready", "handed_off", "in_progress", "returned",
    ]);

    const accepted = nonArchived.filter((p) => p.status === "accepted");
    const inProgress = nonArchived.filter((p) => IN_PROGRESS_STATUSES.has(p.status));
    const rejected = nonArchived.filter((p) => p.status === "rejected");
    const qaRequired = nonArchived.filter((p) => p.status === "qa_required");

    const gateOpen = nonArchived.length > 0 && nonArchived.length === accepted.length;

    const blockers: string[] = [];
    if (nonArchived.length === 0) blockers.push("No build packets created yet");
    if (rejected.length > 0) blockers.push(`${rejected.length} packet${rejected.length > 1 ? "s" : ""} rejected`);
    if (qaRequired.length > 0) blockers.push(`${qaRequired.length} in QA review`);
    if (inProgress.length > 0) blockers.push(`${inProgress.length} still in progress`);

    const { data: reviews, error: rvErr } = await sb
      .from("engine_project_delivery_readiness_reviews")
      .select("id,status,approved_at")
      .eq("project_id", data.projectId)
      .eq("status", "approved")
      .order("approved_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (rvErr) throw new Error(rvErr.message ?? "Failed to load readiness reviews");

    const latestReview = reviews as { id: string; status: string; approved_at: string | null } | null;

    return {
      project: { id: proj.id, name: proj.name ?? "", status: proj.status },
      gateOpen,
      blockers,
      totalPackets: nonArchived.length,
      acceptedPackets: accepted.length,
      inProgressPackets: inProgress.length,
      rejectedPackets: rejected.length,
      qaRequiredPackets: qaRequired.length,
      pendingPackets: [...inProgress, ...rejected, ...qaRequired].slice(0, 10).map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        sequence_number: p.sequence_number,
      })),
      hasApprovedReadinessReview: latestReview !== null,
      latestApprovedReviewAt: latestReview?.approved_at ?? null,
    };
  });
