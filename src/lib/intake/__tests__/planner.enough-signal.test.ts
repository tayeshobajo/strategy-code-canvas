/**
 * Phase 14 — hasEnoughSignal:
 *   - critical (importance>=4) required fields covered
 *   - blockers covered
 *   - overall confidence >= threshold
 *   - at least one success outcome >= 0.6
 */

import { describe, expect, it } from "vitest";
import { hasEnoughSignal, planNextTurn } from "../conversation-planner";
import { getFrameProfile } from "../frame-profiles";
import { emptyMemory, mergeFacts } from "../intake-memory";

function fill(frame: "project.event_site" | "roadmap", conf: number) {
  const profile = getFrameProfile(frame)!;
  let mem = emptyMemory(frame);
  for (const f of profile.requiredFields) {
    mem = mergeFacts(mem, { [f.key]: { confidence: conf, evidence: "seed" } });
  }
  return { profile, mem };
}

describe("planner — hasEnoughSignal", () => {
  it("returns false when a blocker is missing (event_date not covered)", () => {
    const { profile, mem } = fill("project.event_site", 0.9);
    // Wipe blocker.
    const stripped = {
      ...mem,
      knownFacts: { ...mem.knownFacts, event_date: { confidence: 0, evidence: "", source: "heuristic" as const } },
    };
    expect(hasEnoughSignal(stripped, profile, profile.confidenceThreshold)).toBe(false);
  });

  it("returns true when critical + blockers + outcome + confidence all pass", () => {
    const { profile, mem } = fill("project.event_site", 0.9);
    expect(hasEnoughSignal(mem, profile, profile.confidenceThreshold)).toBe(true);
  });

  it("returns false when success outcome is missing", () => {
    const profile = getFrameProfile("roadmap")!;
    let mem = emptyMemory("roadmap");
    for (const f of profile.requiredFields) {
      // Cover everything except point_b (the outcome).
      if (f.key === "point_b") continue;
      mem = mergeFacts(mem, { [f.key]: { confidence: 0.95, evidence: "seed" } });
    }
    expect(hasEnoughSignal(mem, profile, profile.confidenceThreshold)).toBe(false);
  });

  it("planNextTurn returns done/enough-signal when the check passes", () => {
    const { mem } = fill("project.event_site", 0.9);
    const d = planNextTurn("project.event_site", mem);
    expect(d.kind).toBe("done");
    expect(d.selected_reason).toBe("enough-signal");
  });
});
