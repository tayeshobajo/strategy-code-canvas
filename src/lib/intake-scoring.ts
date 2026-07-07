/**
 * The adaptive intake — hidden objective scoring.
 *
 * Client-safe. No server calls, no secrets. Scores each objective from 0 to
 * 100 based on the person's answer text. The client never sees these scores.
 * The route uses them to pick the weakest required objective still under the
 * bar and to decide when the "enough" set for the frame has been met.
 *
 * Spec: THE_ADAPTIVE_ROADMAP_INTAKE_v2, §5.
 */

import { FRAME_DEFINITIONS, type IntakeFrame, type IntakeObjective } from "./intake-frames";

/** Objectives at or above this score count as covered. */
export const OBJECTIVE_BAR = 60;

/** Objectives at or above this score are considered strong (used by review). */
export const OBJECTIVE_STRONG = 80;

const HEDGE_RE = /\b(maybe|not sure|dunno|idk|i think|kind of|kinda|possibly|perhaps|not really)\b/i;
const DATE_RE =
  /\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(\/\d{2,4})?|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(,?\s+\d{2,4})?|(q[1-4]\s?\d{2,4})|(next|this)\s+(week|month|quarter|year|spring|summer|fall|winter))\b/i;
const NUMBER_RE = /\b\d[\d,]*(\.\d+)?\b/;
const LIST_RE = /(,|;|\n|•|-|\*)/;

function countWords(s: string): number {
  const trimmed = s.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Heuristic 0–100 score for a single objective given its answer text.
 * Deliberately simple: fast, deterministic, works with no API key.
 */
export function scoreAnswer(objectiveKey: string, response: string): number {
  const text = (response ?? "").trim();
  if (!text) return 0;

  const words = countWords(text);
  // Length curve: 0 words = 0, 8 words ~ 40, 20 words ~ 60, 45+ words ~ 80.
  let score = Math.min(80, Math.round(8 * Math.log2(words + 1) * 10) / 10);

  // Structural bonuses.
  if (NUMBER_RE.test(text)) score += 5;
  if (DATE_RE.test(text)) score += 5;
  if (LIST_RE.test(text) && words >= 6) score += 5;

  // Objective-specific tuning.
  switch (objectiveKey) {
    case "deadline":
    case "event_date":
      if (DATE_RE.test(text)) score += 15;
      else if (words < 4) score -= 15;
      break;
    case "guest_count":
    case "volume":
      if (NUMBER_RE.test(text)) score += 15;
      else score -= 10;
      break;
    case "features":
    case "rsvp_fields":
    case "assets":
    case "systems":
      if (LIST_RE.test(text)) score += 10;
      if (words >= 12) score += 5;
      break;
    case "privacy":
      if (/\b(public|private|password|invite|unlisted)\b/i.test(text)) score += 15;
      break;
    case "point_a":
    case "point_b":
    case "point_c":
    case "weight":
    case "unbuilt_asset":
      // Reflective objectives need real prose, not a shrug.
      if (words < 12) score -= 10;
      if (words >= 40) score += 10;
      break;
  }

  // Hedging penalty.
  if (HEDGE_RE.test(text) && words < 30) score -= 10;

  // Very short answers can never be strong.
  if (words < 3) score = Math.min(score, 15);
  if (words < 6) score = Math.min(score, 35);

  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Recompute all objective scores for a frame from the current answers. */
export function computeObjectiveScores(
  frame: IntakeFrame,
  answers: Record<string, { response?: string } | undefined>,
): Record<string, number> {
  const def = FRAME_DEFINITIONS[frame];
  const out: Record<string, number> = {};
  for (const o of def.objectives) {
    out[o.key] = scoreAnswer(o.key, answers[o.key]?.response ?? "");
  }
  return out;
}

/**
 * Pick the next objective to ask.
 *
 * Rule:
 *  1. Weakest required objective still under the bar that has not yet been
 *     asked in this session.
 *  2. If every required objective is at or above the bar → return null
 *     (the "enough" set is satisfied — advance to review).
 *  3. If all required objectives have been asked at least once but some are
 *     still under the bar, we still return null so we do not loop the same
 *     question over and over. The person can strengthen an answer from the
 *     review screen.
 */
export function selectNextObjective(
  frame: IntakeFrame,
  scores: Record<string, number>,
  askedKeys: ReadonlySet<string> | ReadonlyArray<string>,
): IntakeObjective | null {
  const def = FRAME_DEFINITIONS[frame];
  const asked = askedKeys instanceof Set ? askedKeys : new Set(askedKeys);

  const requiredUnderBar = def.objectives
    .filter((o) => o.required)
    .filter((o) => (scores[o.key] ?? 0) < OBJECTIVE_BAR);

  // Every required objective is covered → done.
  if (requiredUnderBar.length === 0) return null;

  // Prefer required objectives we have not yet asked, weakest first.
  const unaskedRequired = requiredUnderBar
    .filter((o) => !asked.has(o.key))
    .sort((a, b) => (scores[a.key] ?? 0) - (scores[b.key] ?? 0));

  if (unaskedRequired.length > 0) return unaskedRequired[0];

  // All required objectives have been asked at least once; do not loop.
  return null;
}

/** True when the frame's "enough" set is satisfied. */
export function isEnough(frame: IntakeFrame, scores: Record<string, number>): boolean {
  const def = FRAME_DEFINITIONS[frame];
  return def.objectives.filter((o) => o.required).every((o) => (scores[o.key] ?? 0) >= OBJECTIVE_BAR);
}
