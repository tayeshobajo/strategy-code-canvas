import { describe, it, expect } from "vitest";
import {
  aggregateSpineStatus,
  isApprovedTruth,
  mapDbStatusToContract,
  presentationFor,
  SPINE_STATUS_LABELS,
  SPINE_STATUS_NONE,
} from "@/lib/spine-truth-status";
import type { SpineFieldStatus } from "@/lib/spine-contract";

describe("spine-truth-status · mapDbStatusToContract", () => {
  it("maps every known DB status onto a contract status", () => {
    expect(mapDbStatusToContract("approved_truth")).toBe("approved_truth");
    expect(mapDbStatusToContract("verified")).toBe("verified");
    expect(mapDbStatusToContract("assumed")).toBe("accepted_assumption");
    expect(mapDbStatusToContract("contradicted")).toBe("contradictory");
    expect(mapDbStatusToContract("needs_confirmation")).toBe("needs_confirmation");
    expect(mapDbStatusToContract("stated")).toBe("needs_confirmation");
    expect(mapDbStatusToContract("inferred")).toBe("inferred");
    expect(mapDbStatusToContract("missing")).toBe("draft");
  });

  it("returns null for unknown / nullish inputs (degrades quietly)", () => {
    expect(mapDbStatusToContract(null)).toBeNull();
    expect(mapDbStatusToContract(undefined)).toBeNull();
    expect(mapDbStatusToContract("something-new")).toBeNull();
  });
});

describe("spine-truth-status · aggregateSpineStatus", () => {
  it("returns null when there are no rows", () => {
    expect(aggregateSpineStatus([])).toBeNull();
  });

  it("returns approved_truth only when every row is approved_truth", () => {
    expect(
      aggregateSpineStatus([
        { status: "approved_truth" },
        { status: "approved_truth" },
      ]),
    ).toBe("approved_truth");
  });

  it("does NOT return approved_truth when any row is weaker", () => {
    const s = aggregateSpineStatus([
      { status: "approved_truth" },
      { status: "needs_confirmation" },
    ]);
    expect(s).toBe("needs_confirmation");
    expect(isApprovedTruth(s)).toBe(false);
  });

  it("always surfaces contradictions first — even against approved rows", () => {
    expect(
      aggregateSpineStatus([
        { status: "approved_truth" },
        { status: "contradicted" },
        { status: "verified" },
      ]),
    ).toBe("contradictory");
  });

  it("returns the weakest mapped status when mixed and non-contradictory", () => {
    expect(
      aggregateSpineStatus([
        { status: "verified" },
        { status: "assumed" },
        { status: "inferred" },
      ]),
    ).toBe("inferred");
  });

  it("ignores unrecognised DB statuses", () => {
    expect(
      aggregateSpineStatus([
        { status: "approved_truth" },
        { status: "totally-new-status" },
      ]),
    ).toBe("approved_truth");
  });
});

describe("spine-truth-status · isApprovedTruth", () => {
  it("only approved_truth counts as approved", () => {
    expect(isApprovedTruth("approved_truth")).toBe(true);
    const nonApproved: SpineFieldStatus[] = [
      "draft",
      "inferred",
      "needs_confirmation",
      "contradictory",
      "accepted_assumption",
      "verified",
      "superseded",
    ];
    for (const s of nonApproved) expect(isApprovedTruth(s)).toBe(false);
    expect(isApprovedTruth(null)).toBe(false);
    expect(isApprovedTruth(undefined)).toBe(false);
  });
});

describe("spine-truth-status · presentation labels", () => {
  it("covers all eight canonical contract statuses", () => {
    const allStatuses: SpineFieldStatus[] = [
      "draft",
      "inferred",
      "needs_confirmation",
      "contradictory",
      "accepted_assumption",
      "verified",
      "approved_truth",
      "superseded",
    ];
    for (const s of allStatuses) {
      const p = SPINE_STATUS_LABELS[s];
      expect(p).toBeDefined();
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.fullLabel.length).toBeGreaterThan(0);
    }
  });

  it("only approved_truth carries the APPROVED label + approved tone", () => {
    expect(SPINE_STATUS_LABELS.approved_truth.label).toBe("APPROVED");
    expect(SPINE_STATUS_LABELS.approved_truth.tone).toBe("approved");
    for (const [key, p] of Object.entries(SPINE_STATUS_LABELS)) {
      if (key === "approved_truth") continue;
      expect(p.label).not.toBe("APPROVED");
      expect(p.tone).not.toBe("approved");
    }
  });

  it("null status renders the 'not started' presentation, not APPROVED", () => {
    const p = presentationFor(null);
    expect(p).toBe(SPINE_STATUS_NONE);
    expect(p.label).not.toBe("APPROVED");
  });
});
