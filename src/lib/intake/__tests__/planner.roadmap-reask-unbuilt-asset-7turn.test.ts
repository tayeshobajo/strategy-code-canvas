/**
 * Phase 14 regression (7+ turns):
 *   Even across a long roadmap conversation — and even if we simulate a
 *   confidence drop on unbuilt_asset after it was satisfied — the planner
 *   must not treat unbuilt_asset as a legitimate re-ask target once the
 *   user has answered it strongly and it has been captured in
 *   answerHistory as an "answered" fact.
 *
 * Two invariants:
 *
 * 1. In an organic 7-turn walk where the opener + first turn establish
 *    unbuilt_asset above threshold, the planner NEVER picks unbuilt_asset
 *    again — even as later answers touch adjacent fields and the
 *    conversation lengthens.
 *
 * 2. If we FORCE the stored confidence for unbuilt_asset to drop below
 *    threshold after it was strongly answered (a defensive simulation of
 *    a bad model re-score), the planner may in principle re-select it —
 *    but at most ONCE, as a clarify-low-confidence pass. It must never
 *    loop on it, and the same answerHistory response is preserved so the
 *    route-side re-ask flags (is_reask + previous_attempt) remain wired.
 */

import { describe, expect, it } from "vitest";
import { planNextTurn } from "../conversation-planner";
import { getFrameProfile } from "../frame-profiles";
import type { IntakeFrame } from "../../intake-frames";
import {
  emptyMemory,
  mergeFacts,
  recordAnswer,
  recordQuestion,
  type IntakeMemory,
} from "../intake-memory";

const FRAME: IntakeFrame = "roadmap";

function applyText(memory: IntakeMemory, text: string): IntakeMemory {
  const profile = getFrameProfile(FRAME)!;
  const patch: Record<string, { confidence: number; evidence: string }> = {};
  for (const f of [...profile.requiredFields, ...profile.optionalFields]) {
    const ex = f.heuristicExtract(text);
    if (ex.confidence > 0) patch[f.key] = ex;
  }
  return mergeFacts(memory, patch);
}

describe("roadmap planner — unbuilt_asset not re-selected across 7+ turns", () => {
  it("7-turn organic walk: unbuilt_asset is asked once, then never again", () => {
    const profile = getFrameProfile(FRAME)!;
    const threshold = profile.confidenceThreshold;

    let memory = emptyMemory(FRAME);
    memory = applyText(
      memory,
      "Everything runs through me — sales, onboarding, delivery. I want to step back to strategy in 12 months.",
    );

    // Seed unbuilt_asset strongly up front.
    memory = recordQuestion(memory, {
      fieldKey: "unbuilt_asset",
      question: "What asset are you sitting on that you haven't leaned into?",
      askedAt: new Date().toISOString(),
    });
    const strong =
      "I already have a 12k newsletter list, a strong referral network, and a content library of 80 podcast episodes I never repurposed.";
    memory = recordAnswer(memory, {
      fieldKey: "unbuilt_asset",
      response: strong,
      answeredAt: new Date().toISOString(),
    });
    memory = applyText(memory, strong);
    expect(memory.knownFacts.unbuilt_asset?.confidence ?? 0).toBeGreaterThanOrEqual(threshold);

    const followUps = [
      "Biggest bottleneck is onboarding — I run every kickoff by hand.",
      "In 12 months I want a $2M practice where I only run strategy calls.",
      "Concretely I need a client success lead and an onboarding SOP with a portal.",
      "First 90 days I would hire the CS lead and document the SOP by Sep 2026.",
      "Current revenue is $900K ARR at 60% margin, two contractors on the team.",
      "Long term over ten years I want to be positioned as the operator's coach.",
      "Deadline for the CS lead hire is December 2026 with a partner search in parallel.",
    ];

    const violations: string[] = [];
    let turns = 0;
    for (const answer of followUps) {
      const decision = planNextTurn(FRAME, memory);
      if (decision.kind !== "ask") break;
      turns += 1;

      if (decision.gap.field.key === "unbuilt_asset") {
        violations.push(
          `turn ${turns}: planner re-picked unbuilt_asset (reason=${decision.selected_reason}, prior=${(
            memory.knownFacts.unbuilt_asset?.confidence ?? 0
          ).toFixed(2)})`,
        );
      }

      memory = recordQuestion(memory, {
        fieldKey: decision.gap.field.key,
        question: decision.gap.field.label,
        askedAt: new Date().toISOString(),
      });
      memory = recordAnswer(memory, {
        fieldKey: decision.gap.field.key,
        response: answer,
        answeredAt: new Date().toISOString(),
      });
      memory = applyText(memory, answer);
    }

    expect(violations, violations.join("\n")).toEqual([]);
    // Full 7+ turn walk (1 seeded + 7 follow-ups): must go ≥5 productive turns
    // OR hit enough_signal, both are acceptable.
    const final = planNextTurn(FRAME, memory);
    expect(turns >= 5 || final.kind === "done").toBe(true);
  });

  it("even when unbuilt_asset confidence is forced to drop, planner re-asks at most once", () => {
    const profile = getFrameProfile(FRAME)!;
    const threshold = profile.confidenceThreshold;

    let memory = emptyMemory(FRAME);
    memory = applyText(
      memory,
      "Everything runs through me. Business is a $900K consulting practice, and in 24 months I want a $2M practice running without me.",
    );
    // Record a strong unbuilt_asset answer.
    memory = recordQuestion(memory, {
      fieldKey: "unbuilt_asset",
      question: "What asset are you sitting on that you haven't leaned into?",
      askedAt: new Date().toISOString(),
    });
    const strong =
      "I already have a 15k newsletter list, a network of referral partners, and a content library of past client case studies.";
    memory = recordAnswer(memory, {
      fieldKey: "unbuilt_asset",
      response: strong,
      answeredAt: new Date().toISOString(),
    });
    memory = applyText(memory, strong);
    const satisfied = memory.knownFacts.unbuilt_asset?.confidence ?? 0;
    expect(satisfied).toBeGreaterThanOrEqual(threshold);

    // Force a defensive drop: simulate a bad re-score that puts the stored
    // fact just below threshold. We bypass mergeFacts (which is
    // higher-wins) because we're intentionally engineering the pathological
    // case the regression is guarding.
    const dropped = Math.max(0, threshold - 0.05);
    memory = {
      ...memory,
      knownFacts: {
        ...memory.knownFacts,
        unbuilt_asset: {
          ...memory.knownFacts.unbuilt_asset!,
          confidence: dropped,
        },
      },
    };

    // Walk 7 subsequent turns and count how often unbuilt_asset gets picked.
    const followUps = [
      "Biggest bottleneck is onboarding — I run every kickoff manually.",
      "Practically I need a client success lead and an onboarding SOP.",
      "First 90 days I hire the CS lead and document the SOP by Sep 2026.",
      "Long term over ten years I want to be positioned as the operator's coach.",
      "Deadline for the CS lead hire is December 2026 with a partner search in parallel.",
      "Current team is two contractors and me, revenue is $900K ARR at 60% margin.",
      "In 24 months I want to only run strategy calls with systems in place.",
    ];

    let reaskCount = 0;
    let firstReaskReason: string | null = null;
    let firstReaskPreservedPriorAnswer = false;

    for (const answer of followUps) {
      const decision = planNextTurn(FRAME, memory);
      if (decision.kind !== "ask") break;

      const fk = decision.gap.field.key;
      if (fk === "unbuilt_asset") {
        reaskCount += 1;
        if (reaskCount === 1) {
          firstReaskReason = decision.selected_reason;
          // The route builds is_reask + previous_attempt from answerHistory —
          // confirm the prior strong answer is still available.
          const lastAns = [...memory.answerHistory]
            .reverse()
            .find((a) => a.fieldKey === "unbuilt_asset");
          firstReaskPreservedPriorAnswer =
            !!lastAns && lastAns.response.trim() === strong;
        }
      }

      memory = recordQuestion(memory, {
        fieldKey: fk,
        question: decision.gap.field.label,
        askedAt: new Date().toISOString(),
      });
      memory = recordAnswer(memory, {
        fieldKey: fk,
        response: answer,
        answeredAt: new Date().toISOString(),
      });
      memory = applyText(memory, answer);
    }

    // At most one clarify re-ask, and if it fired it must be for the right
    // reason and carry the prior answer forward.
    expect(reaskCount).toBeLessThanOrEqual(1);
    if (reaskCount === 1) {
      expect(firstReaskReason).toBe("clarify-low-confidence");
      expect(firstReaskPreservedPriorAnswer).toBe(true);
    }
  });
});
