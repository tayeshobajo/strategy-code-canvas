/**
 * Planner adapter — the bridge between the live intake route and the
 * adaptive Conversation Planner.
 *
 * The route stores its answer/score state in the shape it already used
 * pre-Phase 13 (Record<string, AnswerRow>, Record<string, number> scores
 * 0..100, string[] askedKeys). The planner and gap-analyzer operate on
 * IntakeMemory (knownFacts confidence 0..1, question/answer history).
 *
 * This module:
 *   1. Converts route state → IntakeMemory (client-safe, pure).
 *   2. Runs planNextTurn to pick the next gap.
 *   3. Maps the returned RankedGap back to the concrete IntakeObjective
 *      from FRAME_DEFINITIONS so the existing ObjectiveScreen keeps working.
 *
 * Client-safe. No server calls. No imports of *.functions.ts.
 */

import {
  FRAME_DEFINITIONS,
  type IntakeFrame,
  type IntakeObjective,
} from "../intake-frames";
import { planNextTurn, type PlanDecision } from "./conversation-planner";
import { getFrameProfile } from "./frame-profiles";
import {
  confidenceScore,
  emptyMemory,
  missingFields,
  type AnswerHistoryEntry,
  type IntakeMemory,
  type QuestionHistoryEntry,
} from "./intake-memory";

/** Route-state answer row shape (matches build-my-roadmap.write.tsx). */
export type RouteAnswer = {
  key: string;
  question: string;
  response: string;
};

export type PlannerCandidateDebug = {
  field_key: string;
  label: string;
  importance: number;
  confidence: number;
  information_gain: number;
  confidence_impact: number;
  flow_bonus: number;
  score: number;
  asked_before: boolean;
};

export type PlannerSnapshot = {
  frame: IntakeFrame | null;
  memory: IntakeMemory;
  decision: PlanDecision;
  /** IntakeObjective corresponding to decision.gap, or null when done/redirect. */
  next_objective: IntakeObjective | null;
  /** Convenience mirrors so callers/logs don't re-derive. */
  known_facts: IntakeMemory["knownFacts"];
  context_facts: IntakeMemory["contextFacts"];
  missing_fields: string[];
  question_history: QuestionHistoryEntry[];
  answer_history: AnswerHistoryEntry[];
  confidence_score: number; // 0..1
  confidence_threshold: number; // 0..1 (per-frame)
  enough_signal: boolean;
  selected_reason: string;
  /** Full ranked candidate list for debug + tuning. Empty when done/redirect. */
  candidates: PlannerCandidateDebug[];
};


/** Build IntakeMemory from the route's raw state. */
export function buildIntakeMemory(
  frame: IntakeFrame | null,
  answers: Record<string, { key: string; question: string; response: string } | undefined>,
  askedKeys: readonly string[],
  scores: Record<string, number>,
): IntakeMemory {
  const memory = emptyMemory(frame);
  const profile = frame ? getFrameProfile(frame) : null;

  if (profile) {
    const allFields = [...profile.requiredFields, ...profile.optionalFields];
    for (const f of allFields) {
      const raw = scores[f.key];
      if (typeof raw === "number" && raw > 0) {
        const conf = Math.max(0, Math.min(1, raw / 100));
        const ans = answers[f.key]?.response ?? "";
        memory.knownFacts[f.key] = {
          confidence: conf,
          evidence: ans ? ans.slice(0, 200) : `score=${raw}`,
          source: ans ? "answered" : "heuristic",
        };
      }
    }
  }

  for (const key of askedKeys) {
    const q = answers[key]?.question ?? key;
    memory.questionHistory.push({
      fieldKey: key,
      question: q,
      askedAt: new Date(0).toISOString(),
    });
    const resp = answers[key]?.response ?? "";
    if (resp.trim()) {
      memory.answerHistory.push({
        fieldKey: key,
        response: resp,
        answeredAt: new Date(0).toISOString(),
      });
    }
  }

  // Phase 14: harvest context facts from every prior answer so acks and
  // downstream logs can name them. Uses the client-safe heuristic scanner.
  if (frame) {
    for (const key of askedKeys) {
      const resp = answers[key]?.response ?? "";
      if (!resp.trim()) continue;
      const ctx = extractContextFacts(frame, resp);
      for (const [k, v] of Object.entries(ctx)) {
        if (!memory.contextFacts[k]) memory.contextFacts[k] = v;
      }
    }
  }

  return memory;
}

/** Look up the IntakeObjective on the current frame by key. */
function objectiveForKey(frame: IntakeFrame, key: string): IntakeObjective | null {
  const def = FRAME_DEFINITIONS[frame];
  if (!def) return null;
  return def.objectives.find((o) => o.key === key) ?? null;
}

/**
 * Ask the planner what to do next. Returns a snapshot the route can render
 * and dump to `window.__intakeDebug`.
 */
export function planNextObjective(
  frame: IntakeFrame | null,
  answers: Record<string, { key: string; question: string; response: string } | undefined>,
  askedKeys: readonly string[],
  scores: Record<string, number>,
  opts: { hardCap?: number; confidenceThreshold?: number } = {},
): PlannerSnapshot {
  const memory = buildIntakeMemory(frame, answers, askedKeys, scores);
  const decision = planNextTurn(frame, memory, opts);
  const profile = frame ? getFrameProfile(frame) : null;

  let next_objective: IntakeObjective | null = null;
  if (decision.kind === "ask" && frame) {
    next_objective = objectiveForKey(frame, decision.gap.field.key);
  }

  const missing = profile ? missingFields(memory, profile) : [];
  const conf = profile ? confidenceScore(memory, profile) : 0;
  const threshold = profile?.confidenceThreshold ?? opts.confidenceThreshold ?? 0.75;
  const enough = decision.kind === "done";
  const candidates: PlannerCandidateDebug[] =
    decision.kind === "ask"
      ? decision.candidates.map((c) => ({
          field_key: c.field.key,
          label: c.field.label,
          importance: c.field.importance,
          confidence: c.confidence,
          information_gain: c.information_gain,
          confidence_impact: c.confidence_impact,
          flow_bonus: c.flow_bonus,
          score: c.score,
          asked_before: c.askedBefore,
        }))
      : [];

  return {
    frame,
    memory,
    decision,
    next_objective,
    known_facts: memory.knownFacts,
    missing_fields: missing,
    question_history: memory.questionHistory,
    answer_history: memory.answerHistory,
    confidence_score: conf,
    confidence_threshold: threshold,
    enough_signal: enough,
    candidates,
  };
}

