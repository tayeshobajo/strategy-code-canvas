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

describe("deriveMilestoneGatesFromRecords — defaults", () => {
  it("renders not_configured for every backing-record gate on a bare milestone", () => {
    const g = deriveMilestoneGatesFromRecords({}, empty);
    expect(g).toEqual({
      criteria: "not_configured",
      design: "not_configured",
      mockups: "not_configured",
      build: "not_configured",
      evidence: "not_configured",
      qa_auto: "not_configured",
      qa_human: "not_configured",
      due_date: "not_configured",
      dependencies: "not_configured",
      blockers: "done",
    });
  });
});

describe("criteria gate", () => {
  it("stays not_configured until acceptance_criteria has content", () => {
    expect(
      deriveMilestoneGatesFromRecords({ approval_status: "approved" }, empty).criteria,
    ).toBe("not_configured");
  });
  it("done only when approved with content", () => {
    expect(
      deriveMilestoneGatesFromRecords(
        { acceptance_criteria: ["a"], approval_status: "approved" },
        empty,
      ).criteria,
    ).toBe("done");
  });
  it("maps pending/needs_review/rejected", () => {
    const ac = { acceptance_criteria: ["a"] };
    expect(deriveMilestoneGatesFromRecords({ ...ac, approval_status: "pending" }, empty).criteria).toBe("review");
    expect(deriveMilestoneGatesFromRecords({ ...ac, approval_status: "needs_review" }, empty).criteria).toBe("review");
    expect(deriveMilestoneGatesFromRecords({ ...ac, approval_status: "rejected" }, empty).criteria).toBe("blocked");
    expect(deriveMilestoneGatesFromRecords({ ...ac }, empty).criteria).toBe("not_started");
  });
});

describe("design & mockups gates", () => {
  it("design: not_configured → review → done", () => {
    expect(deriveMilestoneGatesFromRecords({}, { ...empty, frames: [{ status: "draft" }] }).design).toBe("review");
    expect(deriveMilestoneGatesFromRecords({}, { ...empty, frames: [{ status: "approved" }] }).design).toBe("done");
  });
  it("mockups tracked separately from frames", () => {
    const withMock = { ...empty, mockups: [{ approved_at: "2026-01-01" }] };
    const g = deriveMilestoneGatesFromRecords({}, withMock);
    expect(g.mockups).toBe("done");
    expect(g.design).toBe("not_configured");
  });
});

describe("build & evidence gates", () => {
  it("build not_configured when no packets", () => {
    expect(deriveMilestoneGatesFromRecords({}, empty).build).toBe("not_configured");
  });
  it("build in_progress with any packet, done when all accepted", () => {
    expect(
      deriveMilestoneGatesFromRecords({}, { ...empty, packets: [{ status: "in_review" }] }).build,
    ).toBe("in_progress");
    expect(
      deriveMilestoneGatesFromRecords({}, { ...empty, packets: [{ status: "accepted" }] }).build,
    ).toBe("done");
  });
  it("evidence: not_started when packets exist but no evidence; done with any evidence", () => {
    const packetsOnly: MilestoneDurableRecords = { ...empty, packets: [{ status: "in_review" }] };
    expect(deriveMilestoneGatesFromRecords({}, packetsOnly).evidence).toBe("not_started");
    const withEv: MilestoneDurableRecords = {
      ...packetsOnly,
      evidence: [{ evidence_type: "screenshot" }],
    };
    expect(deriveMilestoneGatesFromRecords({}, withEv).evidence).toBe("done");
  });
});

describe("automated vs human QA gates", () => {
  it("splits reviews by generator", () => {
    const rec: MilestoneDurableRecords = {
      ...empty,
      qa_reviews: [
        { verdict: "pass", generated_by: "ai" },
        { verdict: "fail", generated_by: "human" },
      ],
    };
    const g = deriveMilestoneGatesFromRecords({}, rec);
    expect(g.qa_auto).toBe("done");
    expect(g.qa_human).toBe("review");
  });
  it("openclaw_run_id classifies as automated", () => {
    const rec: MilestoneDurableRecords = {
      ...empty,
      qa_reviews: [{ verdict: "pass", openclaw_run_id: "r_1" }],
    };
    expect(deriveMilestoneGatesFromRecords({}, rec).qa_auto).toBe("done");
  });
  it("qa_human review when only a plan exists", () => {
    const rec: MilestoneDurableRecords = { ...empty, qa_plans: [{ status: "draft" }] };
    expect(deriveMilestoneGatesFromRecords({}, rec).qa_human).toBe("review");
  });
});

describe("due_date, dependencies, blockers", () => {
  it("due_date done when set, else not_configured", () => {
    expect(deriveMilestoneGatesFromRecords({ due_date: "2026-08-01" }, empty).due_date).toBe("done");
    expect(deriveMilestoneGatesFromRecords({ due_date: null }, empty).due_date).toBe("not_configured");
  });
  it("dependencies: empty→not_configured, all satisfied→done, else review", () => {
    expect(deriveMilestoneGatesFromRecords({ dependencies: [] }, empty).dependencies).toBe("not_configured");
    expect(
      deriveMilestoneGatesFromRecords({ dependencies: [{ status: "done" }, { satisfied: true }] }, empty).dependencies,
    ).toBe("done");
    expect(
      deriveMilestoneGatesFromRecords({ dependencies: [{ status: "waiting" }] }, empty).dependencies,
    ).toBe("review");
  });
  it("blockers reflects milestone.status=blocked", () => {
    expect(deriveMilestoneGatesFromRecords({}, empty).blockers).toBe("done");
    expect(deriveMilestoneGatesFromRecords({ status: "blocked" }, empty).blockers).toBe("blocked");
  });
  it("blocked milestone flips in-flight artifact gates to blocked but leaves done gates alone", () => {
    const rec: MilestoneDurableRecords = {
      ...empty,
      frames: [{ status: "draft" }],
      mockups: [{ status: "approved" }],
      packets: [{ status: "in_review" }],
    };
    const g = deriveMilestoneGatesFromRecords({ status: "blocked" }, rec);
    expect(g.design).toBe("blocked");
    expect(g.mockups).toBe("done");
    expect(g.build).toBe("blocked");
  });
});

describe("mockups N/A when not required", () => {
  it("renders not_applicable when mockups_required=false and no mockup records", () => {
    const g = deriveMilestoneGatesFromRecords({ mockups_required: false }, empty);
    expect(g.mockups).toBe("not_applicable");
  });
  it("still evaluates records when mockups_required=false but records exist", () => {
    const g = deriveMilestoneGatesFromRecords(
      { mockups_required: false },
      { ...empty, mockups: [{ status: "approved" }] },
    );
    expect(g.mockups).toBe("done");
  });
  it("not_applicable satisfies predecessor ordering for downstream build", () => {
    const g = deriveMilestoneGatesFromRecords(
      {
        acceptance_criteria: ["a"],
        approval_status: "approved",
        mockups_required: false,
      },
      { ...empty, packets: [{ status: "accepted" }] },
    );
    expect(g.mockups).toBe("not_applicable");
    expect(g.build).toBe("done");
  });
});

describe("predecessor ordering — downstream cannot complete before prerequisites", () => {
  const approvedCriteria = {
    acceptance_criteria: ["a"],
    approval_status: "approved",
  };

  it("caps mockups/build/QA when criteria is not done", () => {
    const rec: MilestoneDurableRecords = {
      ...empty,
      mockups: [{ status: "approved" }],
      packets: [{ status: "accepted" }],
      evidence: [{ evidence_type: "screenshot" }],
      qa_reviews: [
        { verdict: "pass", generated_by: "ai" },
        { verdict: "pass", generated_by: "human" },
      ],
    };
    // criteria missing → not_configured
    const g = deriveMilestoneGatesFromRecords({}, rec);
    expect(g.criteria).toBe("not_configured");
    expect(g.mockups).not.toBe("done");
    expect(g.build).not.toBe("done");
    expect(g.evidence).not.toBe("done");
    expect(g.qa_auto).not.toBe("done");
    expect(g.qa_human).not.toBe("done");
  });

  it("caps build/evidence/QA when required mockups are not done", () => {
    const rec: MilestoneDurableRecords = {
      ...empty,
      mockups: [{ status: "draft" }], // review, not done
      packets: [{ status: "accepted" }],
      evidence: [{ evidence_type: "screenshot" }],
      qa_reviews: [{ verdict: "pass", generated_by: "ai" }],
    };
    const g = deriveMilestoneGatesFromRecords(approvedCriteria, rec);
    expect(g.mockups).toBe("review");
    expect(g.build).not.toBe("done");
    expect(g.evidence).not.toBe("done");
    expect(g.qa_auto).not.toBe("done");
  });

  it("caps QA when build is incomplete", () => {
    const rec: MilestoneDurableRecords = {
      ...empty,
      packets: [{ status: "in_review" }],
      evidence: [{ evidence_type: "screenshot" }],
      qa_reviews: [
        { verdict: "pass", generated_by: "ai" },
        { verdict: "pass", generated_by: "human" },
      ],
    };
    const g = deriveMilestoneGatesFromRecords(
      { ...approvedCriteria, mockups_required: false },
      rec,
    );
    expect(g.build).toBe("in_progress");
    expect(g.qa_auto).not.toBe("done");
    expect(g.qa_human).not.toBe("done");
  });

  it("caps QA when evidence is missing even though build is done", () => {
    const rec: MilestoneDurableRecords = {
      ...empty,
      packets: [{ status: "accepted" }],
      qa_reviews: [{ verdict: "pass", generated_by: "ai" }],
    };
    const g = deriveMilestoneGatesFromRecords(
      { ...approvedCriteria, mockups_required: false },
      rec,
    );
    expect(g.build).toBe("done");
    expect(g.evidence).toBe("not_started");
    expect(g.qa_auto).not.toBe("done");
  });

  it("allows the full chain to be done when every predecessor is satisfied", () => {
    const rec: MilestoneDurableRecords = {
      ...empty,
      mockups: [{ status: "approved" }],
      packets: [{ status: "accepted" }],
      evidence: [{ evidence_type: "screenshot" }],
      qa_reviews: [
        { verdict: "pass", generated_by: "ai" },
        { verdict: "pass", generated_by: "human" },
      ],
    };
    const g = deriveMilestoneGatesFromRecords(approvedCriteria, rec);
    expect(g.criteria).toBe("done");
    expect(g.mockups).toBe("done");
    expect(g.build).toBe("done");
    expect(g.evidence).toBe("done");
    expect(g.qa_auto).toBe("done");
    expect(g.qa_human).toBe("done");
  });
});

describe("payloadMatchesMilestone", () => {
  const id = "11111111-1111-1111-1111-111111111111";
  it("matches milestone_id / milestoneId / milestone_ids", () => {
    expect(payloadMatchesMilestone({ milestone_id: id }, id)).toBe(true);
    expect(payloadMatchesMilestone({ milestoneId: id }, id)).toBe(true);
    expect(payloadMatchesMilestone({ milestone_ids: ["x", id] }, id)).toBe(true);
  });
  it("rejects unrelated payloads", () => {
    expect(payloadMatchesMilestone(null, id)).toBe(false);
    expect(payloadMatchesMilestone({}, id)).toBe(false);
    expect(payloadMatchesMilestone({ milestone_id: "other" }, id)).toBe(false);
  });
});
