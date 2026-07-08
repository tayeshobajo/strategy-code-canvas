/**
 * IntakeMemory — the running "what we know" for a single draft.
 *
 * Client-safe, pure. Reducers merge extracted facts, recompute confidence,
 * and track question/answer history so the planner can rank the next gap
 * and the generator can avoid repeats.
 *
 * Serialized into `intake_drafts.answers` under the internal key `_memory`
 * so it round-trips through saveDraft/loadDraft with no migration.
 */

import type { IntakeFrame } from "../intake-frames";
import type { FrameProfile } from "./frame-profiles";

export type KnownFact = {
  confidence: number; // 0..1
  evidence: string;
  source: "heuristic" | "model" | "answered";
};

export type QuestionHistoryEntry = {
  fieldKey: string;
  question: string;
  askedAt: string; // ISO
};

export type AnswerHistoryEntry = {
  fieldKey: string;
  response: string;
  answeredAt: string;
};

/**
 * Side-fact captured from free text (honoree name, event type, city, …).
 * Not an objective on the frame — used to colour acknowledgements and
 * enrich generator prompts without expanding the required-field set.
 */
export type ContextFact = { value: string; evidence: string };

export type IntakeMemory = {
  frame: IntakeFrame | null;
  knownFacts: Record<string, KnownFact>;
  /** Non-objective side facts (Phase 14). */
  contextFacts: Record<string, ContextFact>;
  questionHistory: QuestionHistoryEntry[];
  answerHistory: AnswerHistoryEntry[];
};

export function emptyMemory(frame: IntakeFrame | null = null): IntakeMemory {
  return {
    frame,
    knownFacts: {},
    contextFacts: {},
    questionHistory: [],
    answerHistory: [],
  };
}

/** Merge context facts. First non-empty value wins (they are static hints). */
export function mergeContextFacts(
  memory: IntakeMemory,
  facts: Record<string, ContextFact>,
): IntakeMemory {
  const next = { ...(memory.contextFacts ?? {}) };
  for (const [k, v] of Object.entries(facts)) {
    if (!v || !v.value.trim()) continue;
    if (!next[k]) next[k] = { value: v.value.trim(), evidence: v.evidence };
  }
  return { ...memory, contextFacts: next };
}

/** Merge new per-field extractions into memory. Higher confidence wins. */
export function mergeFacts(
  memory: IntakeMemory,
  extracted: Record<string, { confidence: number; evidence: string; source?: KnownFact["source"] }>,
): IntakeMemory {
  const next = { ...memory.knownFacts };
  for (const [key, ex] of Object.entries(extracted)) {
    if (!ex || ex.confidence <= 0) continue;
    const prior = next[key];
    if (!prior || ex.confidence > prior.confidence) {
      next[key] = {
        confidence: Math.max(0, Math.min(1, ex.confidence)),
        evidence: ex.evidence,
        source: ex.source ?? "heuristic",
      };
    }
  }
  return { ...memory, knownFacts: next };
}

export function recordQuestion(memory: IntakeMemory, entry: QuestionHistoryEntry): IntakeMemory {
  return { ...memory, questionHistory: [...memory.questionHistory, entry] };
}

export function recordAnswer(memory: IntakeMemory, entry: AnswerHistoryEntry): IntakeMemory {
  return { ...memory, answerHistory: [...memory.answerHistory, entry] };
}

export function missingFields(memory: IntakeMemory, profile: FrameProfile, threshold = 0.5): string[] {
  return profile.requiredFields
    .filter((f) => (memory.knownFacts[f.key]?.confidence ?? 0) < threshold)
    .map((f) => f.key);
}

/** Mean confidence across required fields, 0..1. */
export function confidenceScore(memory: IntakeMemory, profile: FrameProfile): number {
  if (profile.requiredFields.length === 0) return 1;
  const sum = profile.requiredFields.reduce(
    (acc, f) => acc + Math.min(1, memory.knownFacts[f.key]?.confidence ?? 0),
    0,
  );
  return sum / profile.requiredFields.length;
}

/** Count of required fields at or above the threshold. */
export function knownRequiredCount(
  memory: IntakeMemory,
  profile: FrameProfile,
  threshold = 0.5,
): number {
  return profile.requiredFields.filter(
    (f) => (memory.knownFacts[f.key]?.confidence ?? 0) >= threshold,
  ).length;
}
