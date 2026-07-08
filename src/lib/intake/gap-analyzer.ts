/**
 * Gap analyzer — ranks required fields still missing from the frame profile.
 *
 * Client-safe, pure. The planner consumes RankedGap[] to decide the next
 * question.
 *
 * Score composition (Phase 14):
 *   information_gain  = 1 - confidence          // how much a fresh answer moves the needle
 *   confidence_impact = importance              // how much we care about the field
 *   flow_bonus        = 0..0.2                  // deps-satisfied / recently-mentioned nudge
 *   score             = information_gain * confidence_impact + flow_bonus
 *
 * Ties broken by dependency topology and then by profile order. Fields
 * already surfaced in the question history are pushed to the back so we
 * never re-ask the same objective twice.
 */

import type { FieldProfile, FrameProfile } from "./frame-profiles";
import type { IntakeMemory } from "./intake-memory";

export type RankedGap = {
  field: FieldProfile;
  confidence: number;
  information_gain: number;
  confidence_impact: number;
  flow_bonus: number;
  score: number;
  askedBefore: boolean;
};

function rankField(
  field: FieldProfile,
  memory: IntakeMemory,
  asked: Set<string>,
  threshold: number,
): RankedGap {
  const confidence = memory.knownFacts[field.key]?.confidence ?? 0;
  const information_gain = 1 - confidence;
  const confidence_impact = field.importance;
  const deps = field.dependsOn ?? [];
  const depsSatisfied =
    deps.length === 0 ||
    deps.every((d) => (memory.knownFacts[d]?.confidence ?? 0) >= threshold);
  // Recently-mentioned nudge: last answer's evidence text mentions this field's key.
  const lastAnswer = memory.answerHistory[memory.answerHistory.length - 1]?.response ?? "";
  const recentlyMentioned =
    lastAnswer.length > 0 && new RegExp(`\\b${field.key.replace(/_/g, "[ _]")}\\b`, "i").test(lastAnswer);
  const flow_bonus = (depsSatisfied ? 0.1 : 0) + (recentlyMentioned ? 0.1 : 0);
  const score = information_gain * confidence_impact + flow_bonus;
  return {
    field,
    confidence,
    information_gain,
    confidence_impact,
    flow_bonus,
    score,
    askedBefore: asked.has(field.key),
  };
}

export function analyzeGaps(
  memory: IntakeMemory,
  profile: FrameProfile,
  opts: { threshold?: number } = {},
): RankedGap[] {
  const threshold = opts.threshold ?? 0.6;
  const asked = new Set(memory.questionHistory.map((h) => h.fieldKey));

  const gaps: RankedGap[] = profile.requiredFields
    .map((field) => rankField(field, memory, asked, threshold))
    .filter((g) => g.confidence < threshold);

  const orderKey = (g: RankedGap): number => {
    const deps = g.field.dependsOn ?? [];
    const unmetDeps = deps.filter((d) => (memory.knownFacts[d]?.confidence ?? 0) < threshold);
    return unmetDeps.length;
  };

  gaps.sort((a, b) => {
    if (a.askedBefore !== b.askedBefore) return a.askedBefore ? 1 : -1;
    const depDiff = orderKey(a) - orderKey(b);
    if (depDiff !== 0) return depDiff;
    if (b.score !== a.score) return b.score - a.score;
    return (
      profile.requiredFields.findIndex((f) => f.key === a.field.key) -
      profile.requiredFields.findIndex((f) => f.key === b.field.key)
    );
  });

  return gaps;
}

/**
 * Full ranked candidate list across required + optional fields, unfiltered
 * by threshold. Useful for debug panels and tuning: `candidates[0]` is the
 * planner's current top pick (subject to askedBefore push-back).
 */
export function rankAllCandidates(
  memory: IntakeMemory,
  profile: FrameProfile,
): RankedGap[] {
  const asked = new Set(memory.questionHistory.map((h) => h.fieldKey));
  const all = [...profile.requiredFields, ...profile.optionalFields].map((f) =>
    rankField(f, memory, asked, 0.6),
  );
  all.sort((a, b) => {
    if (a.askedBefore !== b.askedBefore) return a.askedBefore ? 1 : -1;
    return b.score - a.score;
  });
  return all;
}

export function nextOptionalGap(
  memory: IntakeMemory,
  profile: FrameProfile,
  threshold = 0.5,
): RankedGap | null {
  const asked = new Set(memory.questionHistory.map((h) => h.fieldKey));
  const candidates = profile.optionalFields
    .filter((f) => !asked.has(f.key))
    .map((f) => rankField(f, memory, asked, threshold))
    .filter((g) => g.confidence < threshold)
    .sort((a, b) => b.score - a.score);
  return candidates[0] ?? null;
}
