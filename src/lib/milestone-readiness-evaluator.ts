/**
 * Phase 1A follow-up — Milestone Readiness evaluator.
 *
 * Pure, dependency-light. Given a milestone plus the durable records that
 * belong to it (frames, mockups, build packets + evidence, QA plans + QA
 * evidence reviews), returns the four gate states used by the Project
 * Spine's Milestone Readiness matrix.
 *
 * Previously the matrix inferred design/build/qa states from the parent
 * milestone's `phase` + `status` columns — a heuristic. This evaluator
 * instead reads the durable records that actually record the work.
 *
 * Rules (per gate):
 *
 *   criteria — mirrors `engine_milestones.approval_status`.
 *              approved → done, rejected → blocked,
 *              pending / needs_review → review, else not_started.
 *
 *   design   — approved frame OR approved mockup → done
 *              any frame / mockup exists → review
 *              nothing → not_started
 *              milestone.status = blocked → blocked
 *
 *   build    — a scoped build packet accepted (status/accepted_at) → done
 *              any packet or evidence row exists → in_progress
 *              nothing → not_started
 *              milestone.status = blocked → blocked
 *
 *   qa       — any QA evidence review with verdict "pass"/"approved" → done
 *              any QA plan approved AND any review exists → review
 *              any plan or review exists → review
 *              nothing → not_started
 *              milestone.status = blocked → blocked
 *
 * NO DB calls. NO React. Safe to import from server functions, route
 * components, and unit tests.
 */

export type MilestoneGateState =
  | "done"
  | "review"
  | "in_progress"
  | "blocked"
  | "not_started";

export type MilestoneGates = {
  criteria: MilestoneGateState;
  design: MilestoneGateState;
  build: MilestoneGateState;
  qa: MilestoneGateState;
};

export type MilestoneInput = {
  status?: string | null;
  approval_status?: string | null;
};

export type FrameLike = { status?: string | null; approved_at?: string | null };
export type MockupLike = { status?: string | null; approved_at?: string | null };
export type PacketLike = {
  status?: string | null;
  accepted_at?: string | null;
  handed_off_at?: string | null;
};
export type EvidenceLike = { evidence_type?: string | null };
export type QaPlanLike = { status?: string | null; approved_at?: string | null };
export type QaReviewLike = {
  status?: string | null;
  verdict?: string | null;
  approved_at?: string | null;
};

export type MilestoneDurableRecords = {
  frames: readonly FrameLike[];
  mockups: readonly MockupLike[];
  packets: readonly PacketLike[];
  evidence: readonly EvidenceLike[];
  qa_plans: readonly QaPlanLike[];
  qa_reviews: readonly QaReviewLike[];
};

const APPROVED_STATUSES = new Set(["approved", "accepted", "done", "completed"]);
const PASS_VERDICTS = new Set(["pass", "passed", "approved", "accepted", "ok"]);

function isApprovedFrame(f: FrameLike): boolean {
  return APPROVED_STATUSES.has(String(f.status ?? "").toLowerCase()) || Boolean(f.approved_at);
}
function isAcceptedPacket(p: PacketLike): boolean {
  const s = String(p.status ?? "").toLowerCase();
  return APPROVED_STATUSES.has(s) || Boolean(p.accepted_at);
}
function isPassedReview(r: QaReviewLike): boolean {
  const s = String(r.status ?? "").toLowerCase();
  const v = String(r.verdict ?? "").toLowerCase();
  return PASS_VERDICTS.has(v) || APPROVED_STATUSES.has(s) || Boolean(r.approved_at);
}

export function deriveMilestoneGatesFromRecords(
  milestone: MilestoneInput,
  records: MilestoneDurableRecords,
): MilestoneGates {
  const criteria: MilestoneGateState =
    milestone.approval_status === "approved"
      ? "done"
      : milestone.approval_status === "rejected"
        ? "blocked"
        : milestone.approval_status === "pending" || milestone.approval_status === "needs_review"
          ? "review"
          : "not_started";

  const isBlocked = String(milestone.status ?? "").toLowerCase() === "blocked";

  // Design
  let design: MilestoneGateState;
  const anyDesign =
    records.frames.length > 0 || records.mockups.length > 0;
  const designDone =
    records.frames.some(isApprovedFrame) || records.mockups.some(isApprovedFrame);
  if (isBlocked && !designDone) design = "blocked";
  else if (designDone) design = "done";
  else if (anyDesign) design = "review";
  else design = "not_started";

  // Build
  let build: MilestoneGateState;
  const anyBuild = records.packets.length > 0 || records.evidence.length > 0;
  const buildDone =
    records.packets.length > 0 && records.packets.every(isAcceptedPacket);
  if (isBlocked && !buildDone) build = "blocked";
  else if (buildDone) build = "done";
  else if (anyBuild) build = "in_progress";
  else build = "not_started";

  // QA
  let qa: MilestoneGateState;
  const anyQa = records.qa_plans.length > 0 || records.qa_reviews.length > 0;
  const qaDone =
    records.qa_reviews.length > 0 && records.qa_reviews.some(isPassedReview);
  if (isBlocked && !qaDone) qa = "blocked";
  else if (qaDone) qa = "done";
  else if (anyQa) qa = "review";
  else qa = "not_started";

  return { criteria, design, build, qa };
}

/**
 * Payload-shape helper used by the server to scope project-scoped rows to
 * a single milestone. Kept alongside the evaluator so tests can lock the
 * shape down.
 */
export function payloadMatchesMilestone(
  payload: unknown,
  milestoneId: string,
): boolean {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  if (p.milestone_id === milestoneId) return true;
  if (p.milestoneId === milestoneId) return true;
  const arr = p.milestone_ids;
  if (Array.isArray(arr) && (arr as unknown[]).includes(milestoneId)) return true;
  return false;
}
