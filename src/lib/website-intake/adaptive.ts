/**
 * Adaptive conversation logic. Pure functions, fully testable, client-safe.
 *
 * Laws encoded here:
 * - one question at a time
 * - skip anything already covered in the person's own words
 * - at most one warm follow-up per trigger, and never a chain
 * - skipping is never punished, and short answerers are not dragged
 * - stop as soon as the essential ground is understood
 */

import {
  ESSENTIAL_KEYS,
  FOLLOW_UPS,
  INTAKE_QUESTIONS,
  QUESTION_BY_KEY,
  type FollowUpKey,
  type IntakeObjectiveKey,
} from "./questions";
import type { VerbatimAnswer } from "./types";

/** A substantial answer. Short replies still count as answered, not as covering other ground. */
const RICH_ANSWER_CHARS = 160;
const ANSWER_CHARS = 40;
const THIN_DREAM_CHARS = 120;
/** Below this the person is being deliberately brief; a follow-up would nag. */
const FOLLOW_UP_FLOOR_CHARS = 25;

/** Hard ceilings so nobody is interrogated. */
const MAX_QUESTIONS = 12;
const MAX_QUESTIONS_WHEN_BRIEF = 9;
const MAX_FOLLOW_UPS = 2;
/** Once the essentials are understood, this is enough conversation. */
const ENOUGH_QUESTIONS = 9;
const ENOUGH_COVERAGE = 0.75;

const DREAM_KEYS: IntakeObjectiveKey[] = ["future_day", "future_you", "future_customer"];

/** Ground that must be heard first-hand, never assumed from other answers. */
const NEVER_INFERRED: IntakeObjectiveKey[] = ["future_day"];

/** A past-attempt follow-up only belongs on an answer about past attempts. */
const FAILURE_CONTEXT_KEYS: IntakeObjectiveKey[] = ["already_tried", "whats_in_the_way", "whats_working"];

const FAILURE_PATTERNS =
  /\b(agency|consultant|freelancer|vendor|developer|contractor)\b[\s\S]{0,80}\b(didn'?t|failed|wasted|burn(?:ed|t)|left|ghosted|never)\b|\b(didn'?t work out|waste of money|got burned|fell through|nobody (?:kept|used)|never delivered|nothing changed)\b/i;

const ASSET_PATTERNS =
  /\b(email list|mailing list|waiting list|audience|following|database|archive|library|back catalog(?:ue)?|testimonials|case stud(?:y|ies)|order history|past customers|course|community|dataset)\b/i;

export type ConversationState = {
  answers: VerbatimAnswer[];
  /** Objective keys the person chose to skip. */
  skipped: IntakeObjectiveKey[];
  /** Follow-ups already asked, so we never repeat one. */
  followUpsAsked: FollowUpKey[];
};

export type NextStep =
  | { kind: "question"; key: IntakeObjectiveKey; prompt: string; transition?: string }
  | { kind: "followup"; key: FollowUpKey; forKey: IntakeObjectiveKey; prompt: string }
  | { kind: "contact" };

function textOf(a: VerbatimAnswer) {
  return (a.answer ?? "").trim();
}

function baseKey(key: VerbatimAnswer["key"]): IntakeObjectiveKey {
  return key.split("__followup_")[0] as IntakeObjectiveKey;
}

function isFollowUp(a: VerbatimAnswer) {
  return String(a.key).includes("__followup_");
}

/** Objectives explicitly answered with something usable. */
export function answeredObjectives(state: ConversationState): Set<IntakeObjectiveKey> {
  const out = new Set<IntakeObjectiveKey>();
  for (const a of state.answers) {
    if (a.skipped) continue;
    if (textOf(a).length > 0) out.add(baseKey(a.key));
  }
  return out;
}

/**
 * Objectives that are understood — either answered directly, or clearly
 * covered inside what the person already said in their own words.
 */
export function coveredObjectives(state: ConversationState): Set<IntakeObjectiveKey> {
  const covered = answeredObjectives(state);
  const spoken = state.answers.filter((a) => !a.skipped && textOf(a).length > 0);
  if (spoken.length === 0) return covered;

  const richText = spoken
    .filter((a) => textOf(a).length >= RICH_ANSWER_CHARS)
    .map((a) => textOf(a).toLowerCase());
  const allText = spoken.map((a) => textOf(a).toLowerCase()).join("\n");

  for (const q of INTAKE_QUESTIONS) {
    if (covered.has(q.key) || q.signals.length === 0) continue;
    // The two-year Tuesday is the one moment we always ask for in their words.
    if (NEVER_INFERRED.includes(q.key)) continue;
    const distinct = (t: string) => q.signals.filter((s) => t.includes(s)).length;
    // A rich answer that touches this ground twice has covered it.
    if (richText.some((t) => distinct(t) >= 2)) {
      covered.add(q.key);
      continue;
    }
    // Optional ground only needs to have surfaced clearly across the conversation.
    if (!q.essential && distinct(allText) >= 2) covered.add(q.key);
  }
  return covered;
}

/** 0..1 share of the objectives we understand. */
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

/** How many real questions this person has been put through. */
export function questionsAsked(state: ConversationState): number {
  const answered = new Set(
    state.answers.filter((a) => !isFollowUp(a)).map((a) => baseKey(a.key) as string),
  );
  for (const k of state.skipped) answered.add(k);
  return answered.size;
}

/** Someone answering in a few words at a time. Respect it: ask less, follow up never. */
export function isBriefAnswerer(state: ConversationState): boolean {
  const spoken = state.answers.filter((a) => !a.skipped && !isFollowUp(a) && textOf(a).length > 0);
  if (spoken.length < 3) return false;
  const thin = spoken.filter((a) => textOf(a).length < ANSWER_CHARS).length;
  return thin / spoken.length >= 0.6;
}

/** A warm follow-up owed on the answer just given, if any. */
export function pendingFollowUp(
  state: ConversationState,
  lastKey: IntakeObjectiveKey,
): { key: FollowUpKey; prompt: string } | null {
  if (state.followUpsAsked.length >= MAX_FOLLOW_UPS) return null;
  if (isBriefAnswerer(state)) return null;

  const last = [...state.answers].reverse().find((a) => baseKey(a.key) === lastKey && !a.skipped);
  if (!last) return null;
  const text = textOf(last);
  if (text.length < FOLLOW_UP_FLOOR_CHARS) return null;

  const candidates: FollowUpKey[] = [];

  if (DREAM_KEYS.includes(lastKey) && text.length < THIN_DREAM_CHARS) {
    // Only if the dream hasn't already been painted properly somewhere else.
    const dreamAlreadyRich = state.answers.some(
      (a) =>
        !a.skipped &&
        DREAM_KEYS.includes(baseKey(a.key)) &&
        textOf(a).length >= THIN_DREAM_CHARS,
    );
    if (!dreamAlreadyRich) candidates.push("thin_dream");
  }

  const isFailureStory =
    FAILURE_CONTEXT_KEYS.includes(lastKey) && FAILURE_PATTERNS.test(text);
  if (isFailureStory) candidates.push("past_failure");

  // Never ask "what would become possible if you used that well" about
  // something the person just told us failed.
  if (!isFailureStory && lastKey !== "already_tried" && ASSET_PATTERNS.test(text)) {
    candidates.push("hidden_asset");
  }

  const next = candidates.find((c) => !state.followUpsAsked.includes(c));
  return next ? { key: next, prompt: FOLLOW_UPS[next] } : null;
}

/** Every piece of ground we refuse to leave unexplored. */
export function essentialsSettled(state: ConversationState): boolean {
  const covered = coveredObjectives(state);
  return ESSENTIAL_KEYS.every((k) => covered.has(k) || state.skipped.includes(k));
}

/** Whether we already have a strong enough picture to offer wrapping up. */
export function canOfferEarlyExit(state: ConversationState): boolean {
  if (!essentialsSettled(state)) return false;
  const substantive = state.answers.filter(
    (a) => !a.skipped && textOf(a).length >= ANSWER_CHARS,
  ).length;
  return substantive >= 4 || questionsAsked(state) >= 6;
}

export const EARLY_EXIT_PROMPT =
  "I have a strong picture now. We can wrap here, or keep going if there's more you want me to understand.";

/** The single next thing to ask. Contact details always come last. */
export function nextStep(state: ConversationState): NextStep {
  const lastAnswer = [...state.answers].reverse().find((a) => !isFollowUp(a));
  if (lastAnswer) {
    const fu = pendingFollowUp(state, baseKey(lastAnswer.key));
    if (fu) {
      return { kind: "followup", key: fu.key, forKey: baseKey(lastAnswer.key), prompt: fu.prompt };
    }
  }

  const asked = questionsAsked(state);
  const brief = isBriefAnswerer(state);
  const cap = brief ? MAX_QUESTIONS_WHEN_BRIEF : MAX_QUESTIONS;
  const settled = essentialsSettled(state);

  if (asked >= cap) return { kind: "contact" };
  if (settled && (asked >= ENOUGH_QUESTIONS || objectiveCoverage(state) >= ENOUGH_COVERAGE)) {
    return { kind: "contact" };
  }

  const covered = coveredObjectives(state);
  const pool = INTAKE_QUESTIONS.filter(
    (q) => !covered.has(q.key) && !state.skipped.includes(q.key),
  );
  // A brief answerer only gets the ground that genuinely matters.
  let shortlist = pool;
  if (!settled && (brief || asked >= 5)) {
    // Don't let optional colour push the essential ground to the very end.
    const essentials = pool.filter((q) => q.essential);
    if (essentials.length > 0) shortlist = essentials;
  }
  const q = (shortlist.length > 0 ? shortlist : pool)[0];
  if (!q) return { kind: "contact" };

  const question = QUESTION_BY_KEY[q.key];
  return {
    kind: "question",
    key: q.key,
    prompt: question.prompt,
    ...(question.transition ? { transition: question.transition } : {}),
  };
}

export const CONTACT_PROMPT = "Where should I send what we uncover?";
