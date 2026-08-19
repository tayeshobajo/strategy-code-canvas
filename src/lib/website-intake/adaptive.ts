/**
 * Adaptive conversation logic. Pure functions, fully testable, client-safe.
 *
 * Laws encoded here:
 * - one question at a time
 * - skip anything already covered in the person's own words
 * - at most one warm follow-up per trigger
 * - skipping is never punished
 * - offer an early exit once there is a strong picture
 */

import {
  FOLLOW_UPS,
  INTAKE_QUESTIONS,
  QUESTION_BY_KEY,
  type FollowUpKey,
  type IntakeObjectiveKey,
} from "./questions";
import type { VerbatimAnswer } from "./types";

/** A substantial answer. Short replies still count as answered, not as covering other ground. */
const RICH_ANSWER_CHARS = 220;
const ANSWER_CHARS = 40;
const THIN_DREAM_CHARS = 120;

const DREAM_KEYS: IntakeObjectiveKey[] = ["future_day", "future_you", "future_customer"];

const FAILURE_PATTERNS =
  /\b(agency|consultant|freelancer|vendor|developer|contractor)\b[\s\S]{0,80}\b(didn'?t|failed|wasted|burn(?:ed|t)|left|ghosted|never)\b|\b(didn'?t work out|waste of money|got burned|fell through)\b/i;

const ASSET_PATTERNS =
  /\b(email list|mailing list|audience|following|database|spreadsheet|archive|library|back catalog(?:ue)?|testimonials|case stud(?:y|ies)|content|course|community|dataset)\b/i;

export type ConversationState = {
  answers: VerbatimAnswer[];
  /** Objective keys the person chose to skip. */
  skipped: IntakeObjectiveKey[];
  /** Follow-ups already asked, so we never repeat one. */
  followUpsAsked: FollowUpKey[];
};

export type NextStep =
  | { kind: "question"; key: IntakeObjectiveKey; prompt: string }
  | { kind: "followup"; key: FollowUpKey; forKey: IntakeObjectiveKey; prompt: string }
  | { kind: "contact" };

function textOf(a: VerbatimAnswer) {
  return (a.answer ?? "").trim();
}

function baseKey(key: VerbatimAnswer["key"]): IntakeObjectiveKey {
  return key.split("__followup_")[0] as IntakeObjectiveKey;
}

/** Objectives explicitly answered with something usable. */
export function answeredObjectives(state: ConversationState): Set<IntakeObjectiveKey> {
  const out = new Set<IntakeObjectiveKey>();
  for (const a of state.answers) {
    if (a.skipped) continue;
    if (textOf(a).length >= ANSWER_CHARS) out.add(baseKey(a.key));
    else if (textOf(a).length > 0) out.add(baseKey(a.key));
  }
  return out;
}

/**
 * Objectives that are understood — either answered directly, or clearly
 * covered inside a rich answer to an earlier question.
 */
export function coveredObjectives(state: ConversationState): Set<IntakeObjectiveKey> {
  const covered = answeredObjectives(state);
  const richText = state.answers
    .filter((a) => !a.skipped && textOf(a).length >= RICH_ANSWER_CHARS)
    .map((a) => textOf(a).toLowerCase());
  if (richText.length === 0) return covered;
  for (const q of INTAKE_QUESTIONS) {
    if (covered.has(q.key) || q.signals.length === 0) continue;
    const hits = richText.some((t) => q.signals.filter((s) => t.includes(s)).length >= 2);
    if (hits) covered.add(q.key);
  }
  return covered;
}

/** 0..1 share of the sixteen objectives we understand. */
export function objectiveCoverage(state: ConversationState): number {
  const covered = coveredObjectives(state);
  return Number((covered.size / INTAKE_QUESTIONS.length).toFixed(3));
}

/** 0..1 share of the conversation the person has moved through, skips included. */
export function completeness(state: ConversationState): number {
  const touched = new Set<IntakeObjectiveKey>([
    ...answeredObjectives(state),
    ...state.skipped,
    ...coveredObjectives(state),
  ]);
  return Number((touched.size / INTAKE_QUESTIONS.length).toFixed(3));
}

/** A warm follow-up owed on the answer just given, if any. */
export function pendingFollowUp(
  state: ConversationState,
  lastKey: IntakeObjectiveKey,
): { key: FollowUpKey; prompt: string } | null {
  const last = [...state.answers].reverse().find((a) => baseKey(a.key) === lastKey && !a.skipped);
  if (!last) return null;
  const text = textOf(last);
  if (!text) return null;

  const candidates: FollowUpKey[] = [];
  if (DREAM_KEYS.includes(lastKey) && text.length < THIN_DREAM_CHARS) candidates.push("thin_dream");
  if (FAILURE_PATTERNS.test(text)) candidates.push("past_failure");
  if (ASSET_PATTERNS.test(text)) candidates.push("hidden_asset");

  const next = candidates.find((c) => !state.followUpsAsked.includes(c));
  return next ? { key: next, prompt: FOLLOW_UPS[next] } : null;
}

/** Whether we already have a strong enough picture to offer wrapping up. */
export function canOfferEarlyExit(state: ConversationState): boolean {
  const answered = state.answers.filter((a) => !a.skipped && textOf(a).length > 0).length;
  const substantive = state.answers.filter(
    (a) => !a.skipped && textOf(a).length >= ANSWER_CHARS,
  ).length;
  // Understanding, not question count: a handful of substantial answers with
  // reasonable coverage is enough to offer wrapping up.
  return (answered >= 8 && objectiveCoverage(state) >= 0.7) ||
    (substantive >= 6 && objectiveCoverage(state) >= 0.4);
}

export const EARLY_EXIT_PROMPT =
  "I have a strong picture now. We can wrap here, or keep going if there's more you want me to understand.";

/** The single next thing to ask. Contact details always come last. */
export function nextStep(state: ConversationState): NextStep {
  const lastAnswer = [...state.answers].reverse().find((a) => !a.key.includes("__followup_"));
  if (lastAnswer) {
    const fu = pendingFollowUp(state, baseKey(lastAnswer.key));
    if (fu) return { kind: "followup", key: fu.key, forKey: baseKey(lastAnswer.key), prompt: fu.prompt };
  }

  const covered = coveredObjectives(state);
  for (const q of INTAKE_QUESTIONS) {
    if (covered.has(q.key)) continue;
    if (state.skipped.includes(q.key)) continue;
    return { kind: "question", key: q.key, prompt: QUESTION_BY_KEY[q.key].prompt };
  }
  return { kind: "contact" };
}

export const CONTACT_PROMPT = "Where should I send what we uncover?";
