/**
 * Conversation planner — the single decision point for "what next".
 *
 * Client-safe, pure. Route code MUST NOT index into an objective array
 * to pick the next question. It calls planNextTurn(memory, profile).
 *
 * Phase 14: per-frame confidence threshold, ranked candidate list attached
 * to `ask` decisions, `selected_reason` on every decision, and a stronger
 * enough_signal check (blockers + critical coverage + success outcome).
 */

import { HARD_CAP_QUESTIONS, type IntakeFrame } from "../intake-frames";
import {
  analyzeGaps,
  nextOptionalGap,
  rankAllCandidates,
  type RankedGap,
} from "./gap-analyzer";
import { getFrameProfile, type FrameProfile } from "./frame-profiles";
import { confidenceScore, type IntakeMemory } from "./intake-memory";

export type SelectedReason =
  | "top-ranked-required"
  | "clarify-low-confidence"
  | "optional-followup"
  | "enough-signal"
  | "hard-cap"
  | "no-gaps"
  | "redirect-not-fit"
  | "clarify-frame";

export type PlanDecision =
  | { kind: "redirect_not_fit"; selected_reason: SelectedReason }
  | { kind: "clarify_frame"; selected_reason: SelectedReason }
  | {
      kind: "ask";
      gap: RankedGap;
      candidates: RankedGap[];
      profile: FrameProfile;
      selected_reason: SelectedReason;
    }
  | {
      kind: "done";
      reason: "confidence" | "hard_cap" | "no_gaps" | "enough_signal";
      selected_reason: SelectedReason;
    };

export type PlanOptions = {
  frameConfidence?: number; // 0..100
  confidenceThreshold?: number; // 0..1 (overrides profile threshold when provided)
  hardCap?: number;
};

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.75;

/**
 * Enough-signal check (Phase 14):
 *   - every requiredField with importance >= 4 has confidence >= threshold
 *   - every blocker field has confidence >= threshold
 *   - overall mean confidence >= threshold
 *   - at least one success-outcome field has confidence >= 0.6
 */
export function hasEnoughSignal(
  memory: IntakeMemory,
  profile: FrameProfile,
  threshold: number,
): boolean {
  const conf = (k: string) => memory.knownFacts[k]?.confidence ?? 0;
  const criticalCovered = profile.requiredFields
    .filter((f) => f.importance >= 4)
    .every((f) => conf(f.key) >= threshold);
  if (!criticalCovered) return false;
  const blockersCovered = profile.blockers.every((k) => conf(k) >= threshold);
  if (!blockersCovered) return false;
  const overall = confidenceScore(memory, profile);
  if (overall < threshold) return false;
  const outcomeKeys = profile.successOutcomeKeys;
  if (outcomeKeys.length > 0 && !outcomeKeys.some((k) => conf(k) >= 0.6)) {
    return false;
  }
  return true;
}

export function planNextTurn(
  frame: IntakeFrame | null,
  memory: IntakeMemory,
  opts: PlanOptions = {},
): PlanDecision {
  if (frame === "not_a_fit")
    return { kind: "redirect_not_fit", selected_reason: "redirect-not-fit" };
  if (!frame) return { kind: "clarify_frame", selected_reason: "clarify-frame" };

  const profile = getFrameProfile(frame);
  if (!profile) return { kind: "clarify_frame", selected_reason: "clarify-frame" };

  const askedCount = memory.questionHistory.length;
  const hardCap = opts.hardCap ?? HARD_CAP_QUESTIONS;
  if (askedCount >= hardCap)
    return { kind: "done", reason: "hard_cap", selected_reason: "hard-cap" };

  const threshold =
    opts.confidenceThreshold ??
    profile.confidenceThreshold ??
    DEFAULT_CONFIDENCE_THRESHOLD;

  if (hasEnoughSignal(memory, profile, threshold)) {
    return { kind: "done", reason: "enough_signal", selected_reason: "enough-signal" };
  }

  const conf = confidenceScore(memory, profile);
  if (conf >= threshold) {
    return { kind: "done", reason: "confidence", selected_reason: "enough-signal" };
  }

  const gaps = analyzeGaps(memory, profile);
  const candidates = rankAllCandidates(memory, profile);
  if (gaps.length > 0) {
    // Clarification loop: if the top gap was already asked once and the
    // captured answer is low confidence, mark the reason accordingly.
    const top = gaps[0];
    const reason: SelectedReason = top.askedBefore
      ? "clarify-low-confidence"
      : "top-ranked-required";
    return { kind: "ask", gap: top, candidates, profile, selected_reason: reason };
  }

  const optional = nextOptionalGap(memory, profile);
  if (optional) {
    return {
      kind: "ask",
      gap: optional,
      candidates,
      profile,
      selected_reason: "optional-followup",
    };
  }

  return { kind: "done", reason: "no_gaps", selected_reason: "no-gaps" };
}
