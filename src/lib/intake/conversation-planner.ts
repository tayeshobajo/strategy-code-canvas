/**
 * Conversation planner — the single decision point for "what next".
 *
 * Client-safe, pure. Route code MUST NOT index into an objective array
 * to pick the next question. It calls planNextTurn(memory, profile).
 */

import { HARD_CAP_QUESTIONS, type IntakeFrame } from "../intake-frames";
import { analyzeGaps, nextOptionalGap, type RankedGap } from "./gap-analyzer";
import { getFrameProfile, type FrameProfile } from "./frame-profiles";
import { confidenceScore, type IntakeMemory } from "./intake-memory";

export type PlanDecision =
  | { kind: "redirect_not_fit" }
  | { kind: "clarify_frame" }
  | { kind: "ask"; gap: RankedGap; profile: FrameProfile }
  | { kind: "done"; reason: "confidence" | "hard_cap" | "no_gaps" };

export type PlanOptions = {
  frameConfidence?: number; // 0..100
  confidenceThreshold?: number; // 0..1 (default 0.75)
  hardCap?: number;
};

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.75;

export function planNextTurn(
  frame: IntakeFrame | null,
  memory: IntakeMemory,
  opts: PlanOptions = {},
): PlanDecision {
  if (frame === "not_a_fit") return { kind: "redirect_not_fit" };
  if (!frame) return { kind: "clarify_frame" };

  const profile = getFrameProfile(frame);
  if (!profile) return { kind: "clarify_frame" };

  const askedCount = memory.questionHistory.length;
  const hardCap = opts.hardCap ?? HARD_CAP_QUESTIONS;
  if (askedCount >= hardCap) return { kind: "done", reason: "hard_cap" };

  const threshold = opts.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  const conf = confidenceScore(memory, profile);
  if (conf >= threshold) return { kind: "done", reason: "confidence" };

  const gaps = analyzeGaps(memory, profile);
  if (gaps.length > 0) return { kind: "ask", gap: gaps[0], profile };

  // All required covered but confidence still below threshold — try an optional
  // high-value gap before stopping.
  const optional = nextOptionalGap(memory, profile);
  if (optional) return { kind: "ask", gap: optional, profile };

  return { kind: "done", reason: "no_gaps" };
}
