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

describe("spine-readiness-evaluator", () => {
  it("returns ready=true only when all 14 checks pass", () => {
    const r = evaluateSpineReadiness(allTrueInput());
    expect(r.total).toBe(14);
    expect(r.passed).toBe(14);
    expect(r.failed).toBe(0);
    expect(r.unknown).toBe(0);
    expect(r.ready).toBe(true);
  });

  it("counts a single failure as not ready", () => {
    const input = allTrueInput();
    input.point_a_approved = false;
    const r = evaluateSpineReadiness(input);
    expect(r.ready).toBe(false);
    expect(r.failed).toBe(1);
    expect(r.checks.find((c) => c.id === "point_a_approved")?.state).toBe("fail");
  });

  it("treats null (unknown) as not ready", () => {
    const input = allTrueInput();
    input.client_acknowledged_destination = null;
    const r = evaluateSpineReadiness(input);
    expect(r.ready).toBe(false);
    expect(r.unknown).toBe(1);
    expect(r.checks.find((c) => c.id === "client_acknowledged_destination")?.state).toBe("unknown");
  });

  it("attaches per-check notes when provided", () => {
    const input = allTrueInput();
    input.assumptions_accepted = false;
    const r = evaluateSpineReadiness(input, { assumptions_accepted: "2 missing reason" });
    expect(r.checks.find((c) => c.id === "assumptions_accepted")?.note).toBe("2 missing reason");
  });

  it("state-machine helpers reflect the contract", () => {
    expect(isApprovedTruth("approved_truth")).toBe(true);
    expect(isApprovedTruth("verified")).toBe(false);
    expect(isSettled("verified")).toBe(true);
    expect(isSettled("accepted_assumption")).toBe(true);
    expect(isSettled("approved_truth")).toBe(true);
    expect(isSettled("draft")).toBe(false);
    expect(isSettled(null)).toBe(false);
  });
});
