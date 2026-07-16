import { describe, expect, it } from "vitest";
import {
  deriveMilestoneGatesFromRecords,
  payloadMatchesMilestone,
  type MilestoneDurableRecords,
} from "./milestone-readiness-evaluator";

const empty: MilestoneDurableRecords = {
  frames: [],
  mockups: [],
  packets: [],
  evidence: [],
  qa_plans: [],
  qa_reviews: [],
};

describe("deriveMilestoneGatesFromRecords", () => {
  it("returns all not_started + criteria not_started for a bare milestone", () => {
    const g = deriveMilestoneGatesFromRecords({}, empty);
    expect(g).toEqual({
      criteria: "not_started",
      design: "not_started",
      build: "not_started",
      qa: "not_started",
    });
  });

  it("maps milestone.approval_status onto criteria", () => {
    expect(
      deriveMilestoneGatesFromRecords({ approval_status: "approved" }, empty).criteria,
    ).toBe("done");
    expect(
      deriveMilestoneGatesFromRecords({ approval_status: "pending" }, empty).criteria,
    ).toBe("review");
    expect(
      deriveMilestoneGatesFromRecords({ approval_status: "needs_review" }, empty).criteria,
    ).toBe("review");
    expect(
      deriveMilestoneGatesFromRecords({ approval_status: "rejected" }, empty).criteria,
    ).toBe("blocked");
  });

  it("design: any frame → review; approved frame → done", () => {
    const withDraftFrame = { ...empty, frames: [{ status: "draft" }] };
    expect(deriveMilestoneGatesFromRecords({}, withDraftFrame).design).toBe("review");

    const withApprovedFrame = { ...empty, frames: [{ status: "approved" }] };
    expect(deriveMilestoneGatesFromRecords({}, withApprovedFrame).design).toBe("done");

    const withApprovedAt = { ...empty, mockups: [{ approved_at: "2026-07-16T00:00:00Z" }] };
    expect(deriveMilestoneGatesFromRecords({}, withApprovedAt).design).toBe("done");
  });

  it("build: any packet/evidence → in_progress; all accepted → done", () => {
    const anyPacket: MilestoneDurableRecords = {
      ...empty,
      packets: [{ status: "in_review" }],
    };
    expect(deriveMilestoneGatesFromRecords({}, anyPacket).build).toBe("in_progress");

    const allAccepted: MilestoneDurableRecords = {
      ...empty,
      packets: [{ status: "accepted" }, { accepted_at: "2026-07-16T00:00:00Z" }],
    };
    expect(deriveMilestoneGatesFromRecords({}, allAccepted).build).toBe("done");

    const mixed: MilestoneDurableRecords = {
      ...empty,
      packets: [{ status: "accepted" }, { status: "in_review" }],
    };
    expect(deriveMilestoneGatesFromRecords({}, mixed).build).toBe("in_progress");

    const evidenceOnly: MilestoneDurableRecords = {
      ...empty,
      evidence: [{ evidence_type: "screenshot" }],
    };
    expect(deriveMilestoneGatesFromRecords({}, evidenceOnly).build).toBe("in_progress");
  });

  it("qa: passing review → done; any plan/review → review", () => {
    const passing: MilestoneDurableRecords = {
      ...empty,
      qa_reviews: [{ verdict: "pass" }],
    };
    expect(deriveMilestoneGatesFromRecords({}, passing).qa).toBe("done");

    const planOnly: MilestoneDurableRecords = {
      ...empty,
      qa_plans: [{ status: "draft" }],
    };
    expect(deriveMilestoneGatesFromRecords({}, planOnly).qa).toBe("review");

    const reviewNoVerdict: MilestoneDurableRecords = {
      ...empty,
      qa_reviews: [{ verdict: "fail" }],
    };
    expect(deriveMilestoneGatesFromRecords({}, reviewNoVerdict).qa).toBe("review");
  });

  it("blocked milestone forces gates to blocked when work is not done", () => {
    const rec: MilestoneDurableRecords = {
      ...empty,
      frames: [{ status: "draft" }],
      packets: [{ status: "in_review" }],
      qa_plans: [{ status: "draft" }],
    };
    const g = deriveMilestoneGatesFromRecords({ status: "blocked" }, rec);
    expect(g.design).toBe("blocked");
    expect(g.build).toBe("blocked");
    expect(g.qa).toBe("blocked");
  });

  it("blocked milestone keeps 'done' when durable evidence proves the gate is complete", () => {
    const rec: MilestoneDurableRecords = {
      ...empty,
      frames: [{ status: "approved" }],
      packets: [{ status: "accepted" }],
      qa_reviews: [{ verdict: "pass" }],
    };
    const g = deriveMilestoneGatesFromRecords(
      { status: "blocked", approval_status: "rejected" },
      rec,
    );
    expect(g.criteria).toBe("blocked");
    expect(g.design).toBe("done");
    expect(g.build).toBe("done");
    expect(g.qa).toBe("done");
  });
});

describe("payloadMatchesMilestone", () => {
  const id = "11111111-1111-1111-1111-111111111111";
  it("matches milestone_id", () => {
    expect(payloadMatchesMilestone({ milestone_id: id }, id)).toBe(true);
  });
  it("matches camelCase milestoneId", () => {
    expect(payloadMatchesMilestone({ milestoneId: id }, id)).toBe(true);
  });
  it("matches milestone_ids array", () => {
    expect(payloadMatchesMilestone({ milestone_ids: ["other", id] }, id)).toBe(true);
  });
  it("rejects unrelated payloads", () => {
    expect(payloadMatchesMilestone(null, id)).toBe(false);
    expect(payloadMatchesMilestone({}, id)).toBe(false);
    expect(payloadMatchesMilestone({ milestone_id: "other" }, id)).toBe(false);
  });
});
