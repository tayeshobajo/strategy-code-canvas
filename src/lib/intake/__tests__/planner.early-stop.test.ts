/**
 * Phase 14 — per-frame confidence threshold + early stopping.
 */

import { describe, expect, it } from "vitest";
import { planNextTurn } from "../conversation-planner";
import { getFrameProfile } from "../frame-profiles";
import { emptyMemory, mergeFacts } from "../intake-memory";

describe("planner — per-frame thresholds", () => {
  it("event_site stops earlier than roadmap at the same confidence", () => {
    const eventProfile = getFrameProfile("project.event_site")!;
    const roadmapProfile = getFrameProfile("roadmap")!;
    expect(eventProfile.confidenceThreshold).toBeLessThan(
      roadmapProfile.confidenceThreshold,
    );
  });

  it("done fires as soon as mean confidence crosses the frame threshold", () => {
    const profile = getFrameProfile("project.event_site")!;
    let memory = emptyMemory("project.event_site");
    // Give every required field just above the threshold.
    for (const f of profile.requiredFields) {
      memory = mergeFacts(memory, {
        [f.key]: { confidence: profile.confidenceThreshold + 0.05, evidence: "seed" },
      });
    }
    const decision = planNextTurn("project.event_site", memory);
    expect(decision.kind).toBe("done");
  });

  it("keeps asking while confidence is below the frame threshold", () => {
    const profile = getFrameProfile("roadmap")!;
    let memory = emptyMemory("roadmap");
    // Just under the threshold across required fields.
    for (const f of profile.requiredFields) {
      memory = mergeFacts(memory, {
        [f.key]: { confidence: 0.5, evidence: "seed" },
      });
    }
    const decision = planNextTurn("roadmap", memory);
    expect(decision.kind).toBe("ask");
  });
});
