/**
 * Gap analyzer — ranks required fields still missing from the frame profile.
 *
 * Client-safe, pure. The planner consumes RankedGap[] to decide the next
 * question. Ranking:
 *   score = importance * (1 - confidence)
 *
 * Ties broken by dependency topology: if A dependsOn B and both are open,
 * B comes first.
 *
 * Fields already surfaced in the question history are pushed to the back so
 * we never re-ask the same objective twice.
 */

import type { FieldProfile, FrameProfile } from "./frame-profiles";
import type { IntakeMemory } from "./intake-memory";

export type RankedGap = {
  field: FieldProfile;
  confidence: number;
  score: number;
  askedBefore: boolean;
};

export function analyzeGaps(
  memory: IntakeMemory,
  profile: FrameProfile,
  opts: { threshold?: number } = {},
): RankedGap[] {
  const threshold = opts.threshold ?? 0.6;
  const asked = new Set(memory.questionHistory.map((h) => h.fieldKey));

  const gaps: RankedGap[] = profile.requiredFields
    .map((field) => {
      const confidence = memory.knownFacts[field.key]?.confidence ?? 0;
      return {
        field,
        confidence,
        score: field.importance * (1 - confidence),
        askedBefore: asked.has(field.key),
      };
    })
    .filter((g) => g.confidence < threshold);

  // Dependency ordering: if A dependsOn B and both open, B wins on tie.
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
    // Stable: original order in profile.
    return (
      profile.requiredFields.findIndex((f) => f.key === a.field.key) -
      profile.requiredFields.findIndex((f) => f.key === b.field.key)
    );
  });

  return gaps;
}

export function nextOptionalGap(
  memory: IntakeMemory,
  profile: FrameProfile,
  threshold = 0.5,
): RankedGap | null {
  const asked = new Set(memory.questionHistory.map((h) => h.fieldKey));
  const candidates = profile.optionalFields
    .filter((f) => !asked.has(f.key))
    .map((field) => {
      const confidence = memory.knownFacts[field.key]?.confidence ?? 0;
      return {
        field,
        confidence,
        score: field.importance * (1 - confidence),
        askedBefore: false,
      };
    })
    .filter((g) => g.confidence < threshold)
    .sort((a, b) => b.score - a.score);
  return candidates[0] ?? null;
}
