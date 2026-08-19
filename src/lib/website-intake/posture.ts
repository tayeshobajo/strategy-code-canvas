/**
 * Spirit First conversation posture layer.
 *
 * The law this module encodes: meet the person where they are before
 * advancing our agenda. An uncovered objective never outranks what the
 * founder just said.
 *
 * Everything here is pure and client-safe. It serves three jobs:
 *  1. deterministic posture classification of the latest visitor turn,
 *  2. the move policy (what Tai should do with that turn),
 *  3. a grounded local reply, used verbatim when no model is reachable and
 *     as the governed skeleton the model is asked to improve on.
 *
 * Nothing here is shown as jargon to the visitor.
 */

import { nextStep, type ConversationState } from "./adaptive";
import { QUESTION_BY_KEY, type IntakeObjectiveKey } from "./questions";

export type Posture =
  | "greeting"
  | "social_or_relational"
  | "uncertain"
  | "emotional_or_frustrated"
  | "excited_or_visionary"
  | "detailed_or_rich"
  | "direct_problem_statement"
  | "answer_to_current_objective"
  | "correction_or_disagreement"
  | "wants_to_keep_talking"
  | "other";

export type Move = "RECEIVE" | "CONNECT" | "REFLECT" | "CLARIFY" | "EXPLORE" | "ADVANCE" | "STAY";

/** The governed shape of one assistant turn. Never rendered as metadata. */
export type TurnPlan = {
  posture: Posture;
  move: Move;
  /** One short line answering the person's actual message. May be empty. */
  acknowledgement: string;
  /** At most one question. Empty when we are deliberately not asking. */
  next_question: string;
  /** Objective the question serves. Null when this turn advances nothing. */
  objective: IntakeObjectiveKey | null;
  /** Objectives the latest turn spoke to, so we never re-ask them. */
  addressed_objectives: IntakeObjectiveKey[];
  newly_supported_objectives: IntakeObjectiveKey[];
  should_advance: boolean;
  should_end: boolean;
  /** Internal only. One short line. Never shown. */
  rationale_internal: string;
};

const RICH_CHARS = 380;

const GREETING =
  /^\s*(hey|hi|hello|hiya|yo|howdy|good (morning|afternoon|evening))\b[\s,!.]*(tai|there|mate|folks)?[\s,!.?]*$/i;
const SOCIAL =
  /\b(how are you|how's it going|how are things|hows your day|how's your day|nice to meet|good to meet|thanks for|thank you|appreciate (it|you))\b/i;
const ABOUT_US =
  /\b(what (do|does) (you|trust ?tai)|who are you|what is trust ?tai|how (does|do) (this|it|you) work|what happens (next|after)|how much|what does (it|this) cost|are you (a )?(bot|ai|human)|is this (a )?(bot|ai))\b/i;
const UNCERTAIN =
  /\b(i don'?t know|i dont know|not sure|no idea|unsure|where (do i|to|should i) start|hard to say|can'?t think)\b/i;
const EMOTIONAL =
  /\b(exhaust|burn(?:ed|t)? out|burnout|overwhelm|stressed|knackered|drowning|sick of|fed up|had enough|can'?t keep (?:this|going)|everything (?:depends|comes back) (?:on|to) me|frustrat|worn out|no life|never switch off)/i;
const VISIONARY =
  /\b(excited|i dream|the dream|i imagine|imagine if|my vision|would love|if it really worked|one day i|i keep picturing)\b/i;
const CORRECTION =
  /^\s*(no[,.\s]|nope\b|not quite|that'?s not (?:right|it|what)|that isn'?t|you (?:got|have) (?:that|it|me) wrong|i didn'?t say|actually,? )/i;
const KEEP_TALKING =
  /\b(one more thing|there'?s (?:one )?more|something else|before we (?:finish|wrap|move)|can i add|i should (?:also )?mention|i forgot)\b/i;
const PROBLEM =
  /\b(i need|we need|the problem is|the issue is|struggling|not enough|we'?re losing|i'?m losing|nothing (?:works|converts)|too (?:few|many)|keeps? (?:breaking|failing))\b/i;

/** Frame the founder's own strong language back without paraphrasing it away. */
export function quoteFragment(text: string, max = 90): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > 0 ? space : max)}…`;
}

export function asksAboutUs(text: string): boolean {
  return ABOUT_US.test(text ?? "");
}

/**
 * Classify one visitor turn. Deterministic, so the same words always land the
 * same way whether or not a model is reachable.
 */
export function classifyPosture(text: string, opts?: { hasCurrentObjective?: boolean }): Posture {
  const raw = (text ?? "").trim();
  if (!raw) return "other";
  const short = raw.length <= 80;

  if (GREETING.test(raw)) return "greeting";
  if (CORRECTION.test(raw)) return "correction_or_disagreement";
  if (short && (SOCIAL.test(raw) || ABOUT_US.test(raw))) return "social_or_relational";
  if (ABOUT_US.test(raw) && raw.length <= 160) return "social_or_relational";
  if (KEEP_TALKING.test(raw)) return "wants_to_keep_talking";
  if (EMOTIONAL.test(raw)) return "emotional_or_frustrated";
  if (UNCERTAIN.test(raw) && raw.length < 220) return "uncertain";
  if (raw.length >= RICH_CHARS) return "detailed_or_rich";
  if (VISIONARY.test(raw)) return "excited_or_visionary";
  if (PROBLEM.test(raw)) return "direct_problem_statement";
  if (opts?.hasCurrentObjective !== false && raw.length >= 12) return "answer_to_current_objective";
  return "other";
}

/** Postures that must never be recorded as answering a business objective. */
export const NON_SUBSTANTIVE: Posture[] = ["greeting", "social_or_relational", "other"];

export function isSocialTurn(posture: Posture): boolean {
  return posture === "greeting" || posture === "social_or_relational";
}

const MOVE_BY_POSTURE: Record<Posture, Move> = {
  greeting: "CONNECT",
  social_or_relational: "CONNECT",
  uncertain: "RECEIVE",
  emotional_or_frustrated: "RECEIVE",
  excited_or_visionary: "EXPLORE",
  detailed_or_rich: "REFLECT",
  direct_problem_statement: "CLARIFY",
  answer_to_current_objective: "ADVANCE",
  correction_or_disagreement: "RECEIVE",
  wants_to_keep_talking: "STAY",
  other: "RECEIVE",
};

export function chooseMove(posture: Posture): Move {
  return MOVE_BY_POSTURE[posture];
}

/** Objectives the founder's words clearly speak to, used to skip redundancy. */
export function supportedObjectives(text: string): IntakeObjectiveKey[] {
  const t = (text ?? "").toLowerCase();
  if (t.length < 60) return [];
  const out: IntakeObjectiveKey[] = [];
  for (const q of Object.values(QUESTION_BY_KEY)) {
    if (q.key === "future_day") continue; // always heard first-hand
    const hits = q.signals.filter((s) => t.includes(s)).length;
    if (hits >= 2) out.push(q.key);
  }
  return out;
}

function nextObjective(state: ConversationState): IntakeObjectiveKey | null {
  const step = nextStep(state);
  if (step.kind === "question") return step.key;
  if (step.kind === "followup") return step.forKey;
  return null;
}

function objectivePrompt(key: IntakeObjectiveKey | null): string {
  return key ? QUESTION_BY_KEY[key].prompt : "";
}

/**
 * A grounded, warm reply built only from what was actually said.
 * Used live when no model is reachable, and as the floor the model improves.
 */
export function planTurn(input: {
  state: ConversationState;
  latest: string;
  /** Objective the previous question was serving, if any. */
  currentObjective?: IntakeObjectiveKey | null;
  isFirstTurn?: boolean;
}): TurnPlan {
  const latest = (input.latest ?? "").trim();
  const posture = classifyPosture(latest, {
    hasCurrentObjective: Boolean(input.currentObjective),
  });
  const move = chooseMove(posture);
  const supported = supportedObjectives(latest);
  const addressed =
    !NON_SUBSTANTIVE.includes(posture) && input.currentObjective ? [input.currentObjective] : [];

  const upcoming = nextObjective(input.state);
  const atEnd = upcoming === null;
  const wantsMore = posture === "wants_to_keep_talking";

  const base = {
    posture,
    move,
    addressed_objectives: addressed,
    newly_supported_objectives: supported,
    should_advance: move === "ADVANCE",
    should_end: atEnd && !wantsMore && !isSocialTurn(posture),
  };

  switch (posture) {
    case "greeting":
      return {
        ...base,
        acknowledgement: "Hey, good to meet you.",
        next_question: "What brought you in today?",
        objective: null,
        rationale_internal: "Social opening; answered socially, no objective consumed.",
      };
    case "social_or_relational": {
      const ack = asksAboutUs(latest)
        ? "I'm Tai. I sit with founders, get to know the business properly, then come back with a roadmap. That's all this is."
        : "I'm well, thanks for asking.";
      return {
        ...base,
        acknowledgement: ack,
        next_question: "Whenever you're ready, what's going on in the business?",
        objective: null,
        rationale_internal: "Answered the person first, then reopened gently.",
      };
    }
    case "uncertain":
      return {
        ...base,
        acknowledgement: "No problem.",
        next_question: "What has been taking up the most space in your head lately?",
        objective: "recurring_problem",
        rationale_internal: "Lowered the burden with an easier entry point.",
      };
    case "emotional_or_frustrated":
      return {
        ...base,
        acknowledgement: "That sounds exhausting.",
        next_question: "When everything keeps coming back to you, what tends to land on your plate most?",
        objective: "recurring_problem",
        rationale_internal: "Acknowledged the weight, then one grounded follow-up.",
      };
    case "excited_or_visionary":
      return {
        ...base,
        acknowledgement: "",
        next_question: "Take me into it. If it really worked, what would the business look like?",
        objective: "future_day",
        rationale_internal: "Followed the energy into the future-state door.",
      };
    case "detailed_or_rich":
      return {
        ...base,
        acknowledgement: "",
        next_question: objectivePrompt(upcoming),
        objective: upcoming,
        should_advance: true,
        rationale_internal: "Rich answer taken as read; covered ground skipped.",
      };
    case "direct_problem_statement":
      return {
        ...base,
        acknowledgement: "",
        next_question: `What makes you think that's the main thing holding the business back right now?`,
        objective: input.currentObjective ?? "recurring_problem",
        rationale_internal: "Clarified the evidence before assuming a solution.",
      };
    case "correction_or_disagreement":
      return {
        ...base,
        acknowledgement: "Thanks for correcting that.",
        next_question: "Say it the way you mean it, and I'll work from there.",
        objective: input.currentObjective ?? null,
        rationale_internal: "Founder correction is authoritative; prior reading dropped.",
      };
    case "wants_to_keep_talking":
      return {
        ...base,
        acknowledgement: "Good, I'd rather hear it now.",
        next_question: "Go on, I'm listening.",
        objective: null,
        should_end: false,
        rationale_internal: "Held the floor open rather than forcing the contact step.",
      };
    case "answer_to_current_objective":
    default:
      if (atEnd) {
        return {
          ...base,
          acknowledgement: "That gives me what I need.",
          next_question: "",
          objective: null,
          rationale_internal: "Essential ground settled; ready to reflect.",
        };
      }
      return {
        ...base,
        acknowledgement: "",
        next_question: objectivePrompt(upcoming),
        objective: upcoming,
        should_advance: true,
        rationale_internal: "Objective answered; moved to the next uncovered ground.",
      };
  }
}


/** The single visitor-facing message. Acknowledgement + at most one question. */
export function renderTurn(plan: Pick<TurnPlan, "acknowledgement" | "next_question">): string {
  return [plan.acknowledgement?.trim(), plan.next_question?.trim()]
    .filter((s) => Boolean(s))
    .join("\n\n");
}
