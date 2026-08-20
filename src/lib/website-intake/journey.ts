/**
 * The conversational journey: four quiet phases, plus the living picture the
 * founder can watch being built in the right rail.
 *
 * There is deliberately no step counter and no fixed question count. A phase
 * is complete when the ground inside it is understood, however many turns
 * that took.
 *
 * Pure and client-safe.
 */

import {
  coveredObjectives,
  currentStateUnderstood,
  essentialsSettled,
  remainingEssentials,
  type ConversationState,
} from "./adaptive";
import {
  QUESTION_BY_KEY,
  keysForPhase,
  type IntakeObjectiveKey,
  type IntakePhaseKey,
} from "./questions";
import { condense } from "./reflection";
import type { VerbatimAnswer } from "./types";

export const PHASE_ORDER: IntakePhaseKey[] = [
  "getting_to_know_you",
  "inside_the_business",
  "where_you_want_to_go",
  "putting_it_together",
];

export const PHASE_LABELS: Record<IntakePhaseKey, string> = {
  getting_to_know_you: "Getting to know you",
  inside_the_business: "Inside the business",
  where_you_want_to_go: "Where you want to go",
  putting_it_together: "Putting the picture together",
};

export type PhaseState = "upcoming" | "active" | "complete";

export type JourneyPhase = {
  key: IntakePhaseKey;
  label: string;
  state: PhaseState;
};

function settledIn(phase: IntakePhaseKey, state: ConversationState): boolean {
  const covered = coveredObjectives(state);
  const keys = keysForPhase(phase);
  const essentials = keys.filter((k) => QUESTION_BY_KEY[k].essential);
  const done = (k: IntakeObjectiveKey) => covered.has(k) || state.skipped.includes(k);
  if (essentials.length > 0) return essentials.every(done);
  // Phases with no essential ground close once they have been visited at all.
  return keys.some(done);
}

/**
 * Where the conversation stands. Exactly one phase is active until the whole
 * conversation is understood, and then every phase reads complete.
 */
export function journeyPhases(state: ConversationState): JourneyPhase[] {
  const ready = readyForPicture(state);
  const settled = PHASE_ORDER.map((p) => settledIn(p, state));
  const activeIndex = settled.findIndex((s) => !s);

  return PHASE_ORDER.map((key, i) => {
    let phaseState: PhaseState;
    if (ready || activeIndex === -1) phaseState = "complete";
    else if (i < activeIndex) phaseState = "complete";
    else if (i === activeIndex) phaseState = "active";
    else phaseState = "upcoming";
    return { key, label: PHASE_LABELS[key], state: phaseState };
  });
}

export function activePhase(state: ConversationState): JourneyPhase {
  const phases = journeyPhases(state);
  return phases.find((p) => p.state === "active") ?? phases[phases.length - 1];
}

/** Enough understood to stop asking and show the picture back. */
export function readyForPicture(state: ConversationState): boolean {
  return essentialsSettled(state);
}

/**
 * Plain-language ways of naming ground we have not covered yet. Bare labels
 * read like fragments out of context, so each gap gets a spoken phrase.
 */
const GAP_PHRASES: Partial<Record<IntakeObjectiveKey, string>> = {
  who_you_are: "who you are and your role in the business",
  the_business: "what the business actually does",
  who_you_serve: "who you serve",
  who_carries_the_work: "who carries the work with you",
  your_own_day: "what a normal day looks like for you",
  how_work_arrives: "how new work arrives",
  how_work_gets_delivered: "how the work gets delivered",
  recurring_problem: "the problem that keeps coming back",
  existing_assets: "what you already have to build on",
  whats_in_the_way: "what's getting in the way",
  cost_of_standing_still: "what standing still would cost you",
  ninety_day_wish: "what the next ninety days should look like",
  future_day: "where you want the business to be in two years",
};

/**
 * One or two pieces of important ground still missing. Named out loud so the
 * conversation never ends abruptly on a gap.
 */
export function namedGaps(state: ConversationState): string[] {
  if (readyForPicture(state)) return [];
  const missing = remainingEssentials(state);
  if (missing.length === 0 || missing.length > 2) return [];
  return missing.map((k) => GAP_PHRASES[k] ?? QUESTION_BY_KEY[k].label.toLowerCase());
}

/** How much essential ground is left, for a quiet honest status line. */
export function remainingCount(state: ConversationState): number {
  return remainingEssentials(state).length;
}

export type ChecklistItem = {
  key: IntakeObjectiveKey;
  label: string;
  phase: IntakePhaseKey;
  state: "answered" | "skipped" | "todo";
};

/**
 * Every essential piece of ground, in order, with whether it is answered,
 * skipped, or still to come. This is the honest progress indicator.
 */
export function essentialChecklist(state: ConversationState): ChecklistItem[] {
  const covered = coveredObjectives(state);
  const out: ChecklistItem[] = [];
  for (const phase of PHASE_ORDER) {
    for (const key of keysForPhase(phase)) {
      const q = QUESTION_BY_KEY[key];
      if (!q.essential) continue;
      out.push({
        key,
        label: GAP_PHRASES[key] ?? q.label,
        phase,
        state: covered.has(key)
          ? "answered"
          : state.skipped.includes(key)
            ? "skipped"
            : "todo",
      });
    }
  }
  return out;
}

/** Counts for a one-line "x of y" progress read. */
export function checklistProgress(state: ConversationState): {
  answered: number;
  skipped: number;
  total: number;
  left: number;
} {
  const items = essentialChecklist(state);
  const answered = items.filter((i) => i.state === "answered").length;
  const skipped = items.filter((i) => i.state === "skipped").length;
  return { answered, skipped, total: items.length, left: items.length - answered - skipped };
}

export const PICTURE_TITLE = "The picture so far";

export type PictureItem = {
  id: string;
  label: string;
  text: string;
};

const PICTURE_SLOTS: Array<{ id: string; label: string; keys: IntakeObjectiveKey[] }> = [
  { id: "you", label: "You", keys: ["who_you_are", "what_brought_you"] },
  { id: "business", label: "The business", keys: ["the_business", "who_you_serve", "market_and_stage"] },
  { id: "team", label: "The team", keys: ["who_carries_the_work"] },
  {
    id: "work",
    label: "How work moves",
    keys: ["how_work_arrives", "how_work_gets_delivered", "your_own_day", "tools_and_systems"],
  },
  { id: "working", label: "What's working", keys: ["whats_working", "existing_assets"] },
  {
    id: "friction",
    label: "What's getting in the way",
    keys: ["recurring_problem", "whats_in_the_way", "cost_of_standing_still", "already_tried"],
  },
  {
    id: "direction",
    label: "Where you want to go",
    keys: ["ninety_day_wish", "future_day", "future_you", "how_youd_know"],
  },
];

function baseKey(key: VerbatimAnswer["key"]): IntakeObjectiveKey {
  return key.split("__followup_")[0] as IntakeObjectiveKey;
}

/**
 * Progressive disclosure of what has actually been heard. Only grounded
 * categories appear: an empty category is left out rather than invented.
 */
export function pictureSoFar(answers: VerbatimAnswer[], max = 7): PictureItem[] {
  const out: PictureItem[] = [];
  for (const slot of PICTURE_SLOTS) {
    const hits = answers
      .filter(
        (a) =>
          !a.skipped &&
          !String(a.key).startsWith("aside__") &&
          slot.keys.includes(baseKey(a.key)) &&
          (a.answer ?? "").trim().length >= 12,
      )
      .map((a) => a.answer.trim())
      .sort((a, b) => b.length - a.length);
    if (hits.length === 0) continue;
    out.push({ id: slot.id, label: slot.label, text: condense(hits[0], 150) });
    if (out.length >= max) break;
  }
  return out;
}

/** Enough heard to be worth showing the rail at all. */
export function hasPicture(answers: VerbatimAnswer[]): boolean {
  return pictureSoFar(answers).length >= 2;
}

export { currentStateUnderstood };
