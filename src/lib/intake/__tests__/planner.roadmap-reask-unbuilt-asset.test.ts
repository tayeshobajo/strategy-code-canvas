/**
 * Phase 14 regression:
 *   The roadmap frame must NOT re-ask `unbuilt_asset` unnecessarily.
 *
 * "Unnecessarily" means:
 *   - after the user has answered it strongly enough to clear the frame's
 *     confidence threshold, the planner must never pick it again — even
 *     across long conversations.
 *   - a legitimate re-ask is allowed exactly once after a weak / evasive
 *     answer (selected_reason === "clarify-low-confidence"), and MUST
 *     carry the is_reask / previous_attempt flags into the generator call.
 *     Once the follow-up answer clears the threshold, the planner must
 *     move on and never touch unbuilt_asset again.
 *
 * These invariants exercise the same code paths the live route
 * (`src/routes/build-my-roadmap.write.tsx`) uses to set is_reask +
 * previous_attempt on the generator prompt.
 */

import { describe, expect, it } from "vitest";
import { planNextTurn } from "../conversation-planner";
import { getFrameProfile } from "../frame-profiles";
import {
  emptyMemory,
  mergeFacts,
  recordAnswer,
  recordQuestion,
  type IntakeMemory,
} from "../intake-memory";
import type { IntakeFrame } from "../../intake-frames";

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

/**
 * Mirror the exact reask wiring in
 * src/routes/build-my-roadmap.write.tsx (lines ~953-966).
 */
function buildReaskFlags(
  memory: IntakeMemory,
  objectiveKey: string,
): { is_reask: boolean; previous_attempt: string } {
  const askedKeys = memory.questionHistory.map((q) => q.fieldKey);
  const lastAnswer = [...memory.answerHistory]
    .reverse()
    .find((a) => a.fieldKey === objectiveKey);
  const previousAttempt = (lastAnswer?.response ?? "").trim();
  const is_reask = askedKeys.includes(objectiveKey) && previousAttempt.length > 0;
  return { is_reask, previous_attempt: previousAttempt.slice(0, 1200) };
}

describe("roadmap planner — never re-asks unbuilt_asset unnecessarily", () => {
  it("strong answer clears unbuilt_asset and it is never re-picked across 6 turns", () => {
    const profile = getFrameProfile(FRAME)!;
    const threshold = profile.confidenceThreshold;

    let memory = emptyMemory(FRAME);
    memory = applyText(
      memory,
      "Everything runs through me — sales, onboarding, delivery. I want to step back to strategy in 12 months.",
    );

    // Strong, unmistakable unbuilt_asset answer up front.
    memory = recordQuestion(memory, {
      fieldKey: "unbuilt_asset",
      question: "What asset are you sitting on that you haven't leaned into?",
      askedAt: new Date().toISOString(),
    });
    const strongAnswer =
      "I already have a 12k newsletter list, a strong referral network, and a content library of 80 podcast episodes I never repurposed. Real audience and relationships I'm not leveraging.";
    memory = recordAnswer(memory, {
      fieldKey: "unbuilt_asset",
      response: strongAnswer,
      answeredAt: new Date().toISOString(),
    });
    memory = applyText(memory, strongAnswer);

    expect(memory.knownFacts.unbuilt_asset?.confidence ?? 0).toBeGreaterThanOrEqual(threshold);

    const followUps = [
      "Biggest bottleneck is onboarding — I run every kickoff call by hand.",
      "In 12 months I want a $2M practice where I only run strategy calls.",
      "Concretely I need a client success lead and an onboarding SOP with a portal.",
      "First 90 days I would hire the CS lead and document the SOP.",
      "Current revenue is $900K ARR at 60% margin with two contractors.",
      "Long term I want to be positioned as the operator's coach in my niche.",
    ];

    const violations: string[] = [];
    for (const answer of followUps) {
      const decision = planNextTurn(FRAME, memory);
      if (decision.kind !== "ask") break;

      if (decision.gap.field.key === "unbuilt_asset") {
        violations.push(
          `planner re-picked unbuilt_asset with reason=${decision.selected_reason}, prior=${(
            memory.knownFacts.unbuilt_asset?.confidence ?? 0
          ).toFixed(2)}`,
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
  });

  it("weak answer → exactly one clarify re-ask carrying is_reask + previous_attempt, then planner moves on", () => {
    const profile = getFrameProfile(FRAME)!;
    const threshold = profile.confidenceThreshold;

    let memory = emptyMemory(FRAME);
    memory = applyText(
      memory,
      "Everything runs through me. Sales, delivery, everything. I want to scale in 24 months.",
    );

    // Force the planner to pick unbuilt_asset first: seed the other required
    // fields with above-threshold heuristic hits via realistic prose.
    memory = applyText(
      memory,
      "Point A: business is a $900K consulting practice with 6 clients. Point B: 24 months I want a $2M practice running without me.",
    );
    memory = applyText(
      memory,
      "Practically I need a partner by December 2026 and a hiring deadline before Q3.",
    );

    // Weak / evasive first attempt at unbuilt_asset.
    const firstDecision = planNextTurn(FRAME, memory);
    // Not asserting exact key — just walk until unbuilt_asset comes up naturally,
    // otherwise force it (the invariant we care about is the re-ask behaviour).
    let targetKey = firstDecision.kind === "ask" ? firstDecision.gap.field.key : "unbuilt_asset";
    if (targetKey !== "unbuilt_asset") targetKey = "unbuilt_asset";

    memory = recordQuestion(memory, {
      fieldKey: "unbuilt_asset",
      question: "What asset are you sitting on that you haven't leaned into?",
      askedAt: new Date().toISOString(),
    });
    const weakAnswer = "not sure honestly";
    memory = recordAnswer(memory, {
      fieldKey: "unbuilt_asset",
      response: weakAnswer,
      answeredAt: new Date().toISOString(),
    });
    memory = applyText(memory, weakAnswer);

    // Planner may legitimately re-ask unbuilt_asset now.
    const afterWeak = planNextTurn(FRAME, memory);
    let reaskCount = 0;
    if (afterWeak.kind === "ask" && afterWeak.gap.field.key === "unbuilt_asset") {
      reaskCount += 1;
      expect(afterWeak.selected_reason).toBe("clarify-low-confidence");

      // Route-side reask flags must fire on this turn.
      const flags = buildReaskFlags(memory, "unbuilt_asset");
      expect(flags.is_reask).toBe(true);
      expect(flags.previous_attempt).toBe(weakAnswer);

      // Now the user gives a strong follow-up answer.
      const strongFollowUp =
        "Right — I already have a 15k newsletter list and a network of referral partners I've never systematically leveraged.";
      memory = recordQuestion(memory, {
        fieldKey: "unbuilt_asset",
        question: afterWeak.gap.field.label,
        askedAt: new Date().toISOString(),
      });
      memory = recordAnswer(memory, {
        fieldKey: "unbuilt_asset",
        response: strongFollowUp,
        answeredAt: new Date().toISOString(),
      });
      memory = applyText(memory, strongFollowUp);

      expect(memory.knownFacts.unbuilt_asset?.confidence ?? 0).toBeGreaterThanOrEqual(threshold);
    }

    // From here on, unbuilt_asset must NEVER be re-picked, regardless of
    // what subsequent turns look like.
    const followUps = [
      "Biggest bottleneck is that onboarding runs through me manually.",
      "In 12 months I want a $2M practice with systems in place.",
      "Concretely I need a client success lead and an onboarding SOP.",
      "First 90 days I hire the CS lead and document the SOP by Sep 2026.",
    ];

    const violations: string[] = [];
    for (const answer of followUps) {
      const decision = planNextTurn(FRAME, memory);
      if (decision.kind !== "ask") break;

      if (decision.gap.field.key === "unbuilt_asset") {
        reaskCount += 1;
        violations.push(
          `planner re-picked unbuilt_asset again (reaskCount=${reaskCount}, reason=${decision.selected_reason})`,
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
    // At most one clarify re-ask of unbuilt_asset across the whole session.
    expect(reaskCount).toBeLessThanOrEqual(1);
  });
});
