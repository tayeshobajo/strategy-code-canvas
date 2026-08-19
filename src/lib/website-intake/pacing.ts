/**
 * Conversation pacing telemetry — local and preview only.
 *
 * This exists to answer one product question: does the intake feel like a
 * respectful conversation, or an interrogation? It measures nothing about the
 * founder and is never sent anywhere. Pure functions, so simulations and the
 * live room read exactly the same numbers.
 */

import type { ConversationState } from "./adaptive";
import type { IntakeObjectiveKey } from "./questions";
import type { VerbatimAnswer } from "./types";

export type PacingMetrics = {
  /** Distinct objectives asked, excluding follow-ups and the confirmation record. */
  questionsAsked: number;
  followUps: number;
  /** Follow-ups per question asked. */
  followUpRate: number;
  skipped: number;
  /** Share of asked questions the founder skipped. */
  skipRate: number;
  /** Answers of real substance (40+ characters). */
  substantiveAnswers: number;
  /** Median characters per answered question. */
  medianAnswerChars: number;
  /** Wall-clock minutes from first answer to the reflection, one decimal. */
  minutesToReflection: number | null;
  /** Median seconds a founder spent on each answer. */
  medianSecondsPerAnswer: number | null;
};

const SUBSTANTIVE_CHARS = 40;
const CONFIRMED_KEY = "founder_confirmed_reflection";

function isFollowUp(a: VerbatimAnswer) {
  return String(a.key).includes("__followup_");
}

function isConfirmation(a: VerbatimAnswer) {
  return String(a.key) === CONFIRMED_KEY;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function round(value: number, places = 1): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

export function measurePacing(
  state: Pick<ConversationState, "answers" | "skipped">,
  reflectionAt: Date | number | string = Date.now(),
): PacingMetrics {
  const real = state.answers.filter((a) => !isConfirmation(a));
  const questions = real.filter((a) => !isFollowUp(a));
  const followUps = real.filter(isFollowUp);
  const skippedKeys = new Set<IntakeObjectiveKey>(state.skipped);
  for (const a of questions) if (a.skipped) skippedKeys.add(a.key as IntakeObjectiveKey);

  const answered = questions.filter((a) => !a.skipped && (a.answer ?? "").trim().length > 0);
  const lengths = answered.map((a) => a.answer.trim().length);

  const times = real
    .map((a) => Date.parse(a.answered_at))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  const end = new Date(reflectionAt).getTime();
  const minutes =
    times.length > 0 && Number.isFinite(end) && end >= times[0]
      ? round((end - times[0]) / 60_000)
      : null;

  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) gaps.push((times[i] - times[i - 1]) / 1000);
  const medianGap = median(gaps);

  const asked = questions.length;
  return {
    questionsAsked: asked,
    followUps: followUps.length,
    followUpRate: asked > 0 ? round(followUps.length / asked, 2) : 0,
    skipped: skippedKeys.size,
    skipRate: asked > 0 ? round(skippedKeys.size / asked, 2) : 0,
    substantiveAnswers: answered.filter((a) => a.answer.trim().length >= SUBSTANTIVE_CHARS).length,
    medianAnswerChars: Math.round(median(lengths) ?? 0),
    minutesToReflection: minutes,
    medianSecondsPerAnswer: medianGap === null ? null : round(medianGap),
  };
}

/** One-line human summary, used by both the console log and the simulation runner. */
export function formatPacing(m: PacingMetrics): string {
  const mins = m.minutesToReflection === null ? "n/a" : `${m.minutesToReflection}m`;
  const pace = m.medianSecondsPerAnswer === null ? "n/a" : `${m.medianSecondsPerAnswer}s/answer`;
  return [
    `${m.questionsAsked} questions`,
    `${m.followUps} follow-ups (${Math.round(m.followUpRate * 100)}%)`,
    `${m.skipped} skips (${Math.round(m.skipRate * 100)}%)`,
    `${m.substantiveAnswers} substantive`,
    `median ${m.medianAnswerChars} chars`,
    `${mins} to reflection`,
    pace,
  ].join(" · ");
}

/** True only in local dev and Lovable preview builds — never in production. */
export function pacingLoggingEnabled(): boolean {
  try {
    if (import.meta.env?.DEV) return true;
    if (typeof window === "undefined") return false;
    const host = window.location.hostname;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".lovable.app") ||
      host.endsWith(".lovableproject.com")
    );
  } catch {
    return false;
  }
}

/** Prints the pacing summary in dev/preview. Silent in production. */
export function logPacing(
  label: string,
  state: Pick<ConversationState, "answers" | "skipped">,
  reflectionAt: Date | number | string = Date.now(),
): PacingMetrics | null {
  const metrics = measurePacing(state, reflectionAt);
  if (!pacingLoggingEnabled()) return metrics;
  // eslint-disable-next-line no-console
  console.info(`[intake pacing] ${label} — ${formatPacing(metrics)}`, metrics);
  return metrics;
}
