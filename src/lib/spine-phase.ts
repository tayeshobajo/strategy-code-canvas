/**
 * Project phase machine — single source of truth for "what phase is this project in?"
 *
 * The engine has several overlapping status signals (project.status,
 * project.current_step, version.status, portal_publish.status,
 * milestone approvals) that historically produced contradictory
 * displays — e.g. "Current phase: Client Preview" while the roadmap
 * is still an AI draft with 0 milestones approved.
 *
 * `derivePhase` collapses them into a single ordered phase enum with
 * strict monotonicity rules: a project cannot advance to a downstream
 * phase until every gate on the way is satisfied.
 */

export const PHASES = [
  "Understanding",
  "Spine Review",
  "Roadmap Draft",
  "Roadmap Approval",
  "Planning",
  "Execution",
  "QA",
  "Client Preview",
  "Delivery",
] as const;

export type ProjectPhase = (typeof PHASES)[number];

export type DerivePhaseInputs = {
  pointAApproved: boolean;
  pointBApproved: boolean;
  strategicThesisApproved: boolean;
  roadmapVersionStatus: string | null; // 'draft' | 'proposed' | 'approved' | null
  approvedMilestoneCount: number;
  totalMilestoneCount: number;
  milestonesInProgress: number;
  portalPublishStatus: string | null; // 'not_published' | 'draft' | 'published' | 'acknowledged' | 'archived' | null
  projectStatus: string; // engine_projects.status
};

export function derivePhase(input: DerivePhaseInputs): {
  phase: ProjectPhase;
  reason: string;
} {
  // 0. Delivered
  if (input.projectStatus === "delivered") {
    return { phase: "Delivery", reason: "Project marked delivered." };
  }

  // 1. Understanding — Point A/B not yet approved
  if (!input.pointAApproved || !input.pointBApproved) {
    return {
      phase: "Understanding",
      reason: "Point A and Point B must both be approved before the Spine is reviewable.",
    };
  }

  // 2. Spine Review — points approved, but Strategic Thesis missing
  if (!input.strategicThesisApproved) {
    return {
      phase: "Spine Review",
      reason: "Strategic Thesis has not been approved — the roadmap cannot become operational without it.",
    };
  }

  // 3. Roadmap Draft — thesis in, but no roadmap version yet
  if (!input.roadmapVersionStatus) {
    return { phase: "Roadmap Draft", reason: "No roadmap version has been created yet." };
  }

  // 4. Roadmap Approval — draft exists but not approved
  if (input.roadmapVersionStatus !== "approved") {
    return {
      phase: "Roadmap Approval",
      reason: `Roadmap is ${input.roadmapVersionStatus} — approve the baseline to unlock planning.`,
    };
  }

  // 5. Planning — approved roadmap, but zero milestones approved
  if (input.totalMilestoneCount === 0 || input.approvedMilestoneCount === 0) {
    return {
      phase: "Planning",
      reason: "Roadmap approved, but no milestones have been approved with acceptance criteria yet.",
    };
  }

  // 6. Client Preview — portal published and everything approved
  const portalVisible =
    input.portalPublishStatus === "published" ||
    input.portalPublishStatus === "acknowledged";
  const allApproved =
    input.totalMilestoneCount > 0 &&
    input.approvedMilestoneCount === input.totalMilestoneCount;
  if (portalVisible && allApproved && input.milestonesInProgress === 0) {
    return { phase: "Client Preview", reason: "Roadmap published and all milestones approved." };
  }

  // 7. QA — anything actively in QA state
  if (input.projectStatus === "qa" || input.milestonesInProgress === 0 && input.approvedMilestoneCount > 0 && !portalVisible) {
    // fall through — not enough signal, prefer Execution
  }

  // 8. Execution — default when planning + at least one milestone approved
  return {
    phase: "Execution",
    reason: `${input.approvedMilestoneCount} of ${input.totalMilestoneCount} milestones approved; execution in progress.`,
  };
}
