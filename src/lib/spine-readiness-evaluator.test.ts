import { describe, it, expect } from "vitest";
import {
  evaluateSpineReadiness,
  isApprovedTruth,
  isSettled,
  type SpineReadinessInput,
} from "@/lib/spine-readiness-evaluator";
import { SPINE_READINESS_CHECKS } from "@/lib/spine-contract";

function allTrueInput(): SpineReadinessInput {
  const out = {} as SpineReadinessInput;
  for (const c of SPINE_READINESS_CHECKS) (out as Record<string, boolean | null>)[c.id] = true;
  return out;
}

const FIXED_NOW = "2026-07-16T00:00:00.000Z";

describe("spine-readiness-evaluator", () => {
  it("returns ready=true with 14 passes and no blockers when everything passes", () => {
    const r = evaluateSpineReadiness(allTrueInput(), { now: FIXED_NOW });
    expect(r.total).toBe(14);
    expect(r.passed).toBe(14);
    expect(r.blockers).toEqual([]);
    expect(r.ready).toBe(true);
    expect(r.evaluated_at).toBe(FIXED_NOW);
    expect(r.checks).toHaveLength(14);
  });

  it("counts a single failure as not ready and lists it as a failing blocker", () => {
    const input = allTrueInput();
    input.point_a_approved = false;
    const r = evaluateSpineReadiness(input, { now: FIXED_NOW });
    expect(r.ready).toBe(false);
    expect(r.passed).toBe(13);
    expect(r.blockers).toHaveLength(1);
    expect(r.blockers[0]).toMatchObject({ id: "point_a_approved", reason: "failing" });
    expect(r.checks.find((c) => c.id === "point_a_approved")?.state).toBe("fail");
  });

  it("treats null (unknown) as an unknown blocker and blocks readiness", () => {
    const input = allTrueInput();
    input.client_acknowledged_destination = null;
    const r = evaluateSpineReadiness(input, { now: FIXED_NOW });
    expect(r.ready).toBe(false);
    expect(r.passed).toBe(13);
    expect(r.blockers).toHaveLength(1);
    expect(r.blockers[0]).toMatchObject({
      id: "client_acknowledged_destination",
      reason: "unknown",
    });
  });

  it("attaches per-check notes when provided and forwards them onto blockers", () => {
    const input = allTrueInput();
    input.assumptions_accepted = false;
    const r = evaluateSpineReadiness(input, {
      now: FIXED_NOW,
      notes: { assumptions_accepted: "2 missing reason" },
    });
    expect(r.checks.find((c) => c.id === "assumptions_accepted")?.note).toBe("2 missing reason");
    expect(r.blockers[0]?.note).toBe("2 missing reason");
  });

  it("defaults evaluated_at to the current time when now is not injected", () => {
    const before = Date.now();
    const r = evaluateSpineReadiness(allTrueInput());
    const ts = Date.parse(r.evaluated_at);
    expect(Number.isFinite(ts)).toBe(true);
    expect(ts).toBeGreaterThanOrEqual(before);
  });

  it("state-machine helpers reflect the contract vocabulary", () => {
    expect(isApprovedTruth("approved_truth")).toBe(true);
    expect(isApprovedTruth("verified")).toBe(false);
    expect(isSettled("verified")).toBe(true);
    expect(isSettled("accepted_assumption")).toBe(true);
    expect(isSettled("approved_truth")).toBe(true);
    expect(isSettled("draft")).toBe(false);
    expect(isSettled(null)).toBe(false);
  });
});
