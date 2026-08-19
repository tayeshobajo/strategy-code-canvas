/**
 * The governed reasoning turn behind the Spirit First conversation.
 *
 * The model is never in charge. `planTurn` in `posture.ts` produces a grounded
 * turn from the founder's own words; the model is asked to improve the wording
 * within a strict contract. Anything it returns that breaks the contract —
 * multiple questions, invented facts, jargon, an unknown objective — is
 * dropped and the deterministic plan is used instead.
 *
 * Server-only: reads LOVABLE_API_KEY / OPENAI_API_KEY inside the call.
 */

import {
  planTurn,
  renderTurn,
  type Move,
  type Posture,
  type TurnPlan,
} from "./posture";
import type { ConversationState } from "./adaptive";
import { QUESTION_BY_KEY, type IntakeObjectiveKey } from "./questions";
import type { VerbatimAnswer } from "./types";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/responses";
const OPENAI_URL = "https://api.openai.com/v1/responses";
const GATEWAY_MODEL = "openai/gpt-5.6-sol";
const OPENAI_MODEL = "gpt-5.6-sol";

const POSTURES: Posture[] = [
  "greeting",
  "social_or_relational",
  "uncertain",
  "emotional_or_frustrated",
  "excited_or_visionary",
  "detailed_or_rich",
  "direct_problem_statement",
  "answer_to_current_objective",
  "correction_or_disagreement",
  "wants_to_keep_talking",
  "other",
];

const MOVES: Move[] = ["RECEIVE", "CONNECT", "REFLECT", "CLARIFY", "EXPLORE", "ADVANCE", "STAY"];

const OBJECTIVE_KEYS = Object.keys(QUESTION_BY_KEY) as IntakeObjectiveKey[];

export type TurnResult = TurnPlan & {
  /** The single message shown to the founder. */
  message: string;
  /** Where the wording came from. Internal only. */
  source: "model" | "local";
};

const SYSTEM_PROMPT = `You are Tai, sitting with a founder in a quiet conversation about their business.

The law of this conversation: meet the person where they are before you advance your own agenda. An unanswered internal objective NEVER outranks what the person just said.

Rules you cannot break:
- Reply to what they actually said first. If they greet you, greet them back. If they ask you a question, answer it plainly before asking anything.
- Ask at most ONE question per turn. Never two. Never a question stacked on a question.
- Never invent a fact, a number, a client, a result, or anything they did not say.
- Never use business jargon, process language, framework names, scoring, percentages or step counters.
- Never use the em dash character. Use a period, a comma, or a new sentence instead.
- Never use stock assistant phrasing. Banned openers and fillers include: "What I'm hearing is", "It sounds like", "Got it", "Understood", "I can hear", "That's a great", "Let's unpack that", "Let's dive in", "Thanks for sharing", "Based on what you've shared", "I appreciate you sharing".
- Do not repeat the founder's sentence back to them. Reflect only when it genuinely adds something, and never twice in a row.
- Most turns need no acknowledgement at all. Leave it empty and just ask the one question.
- Never praise ("great answer", "love that") and never flatter. Do not over-validate or over-explain.
- Never say you are an AI, a bot, a model, an assistant, or that you are following a process. Never mention objectives, coverage, confidence, frameworks or intake logic.
- If they correct you, their version wins immediately and completely.
- If they are tired, frustrated or overwhelmed, acknowledge that in one plain sentence, then ask one grounded question.
- If they are unsure, reduce the burden and offer an easier way in. Never repeat the same question back at them.
- Short, warm, human sentences. Natural US English. No emoji. No bullet lists.
- Never claim a personal history, past companies, clients or credentials. You have no biography to share.
- A social or relational message is a real turn in the conversation, but it answers no business objective.

You are given a deterministic draft turn. Keep its intent, its move and its objective. You may only improve the wording so it sounds like a person who was listening. If the draft is already right, return it nearly unchanged.`;


const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    posture: { type: "string", enum: POSTURES },
    move: { type: "string", enum: MOVES },
    acknowledgement: { type: "string" },
    next_question: { type: "string" },
    objective: { type: ["string", "null"], enum: [...OBJECTIVE_KEYS, null] },
    addressed_objectives: { type: "array", items: { type: "string", enum: OBJECTIVE_KEYS } },
    newly_supported_objectives: {
      type: "array",
      items: { type: "string", enum: OBJECTIVE_KEYS },
    },
    should_advance: { type: "boolean" },
    should_end: { type: "boolean" },
    rationale_internal: { type: "string" },
  },
  required: [
    "posture",
    "move",
    "acknowledgement",
    "next_question",
    "objective",
    "addressed_objectives",
    "newly_supported_objectives",
    "should_advance",
    "should_end",
    "rationale_internal",
  ],
} as const;

/** Recent conversation, oldest first, as plain readable transcript. */
function transcript(answers: VerbatimAnswer[], limit = 12): string {
  return answers
    .slice(-limit)
    .map((a) => `Tai: ${a.question}\nFounder: ${a.skipped ? "(skipped)" : a.answer}`)
    .join("\n\n");
}

/** Stock assistant phrasing that gives the conversation an AI cadence. */
const BANNED_PHRASES =
  /(what i'?m hearing|it sounds like|^got it\b|^understood\b|that'?s a great|i can hear|let'?s unpack|let'?s dive in|thanks for sharing|based on what you'?ve shared|i appreciate you sharing)/i;

/** Strip typographic dashes from visitor-facing wording. */
function deDash(text: string): string {
  return text
    .replace(/\s*[\u2014\u2013]\s*/g, ", ")
    .replace(/\s*,\s*,/g, ",")
    .replace(/\s+([.,;:?!])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Reject anything that breaks the contract. */
function sanitize(raw: unknown, fallback: TurnPlan): { plan: TurnPlan; used: boolean } {
  if (!raw || typeof raw !== "object") return { plan: fallback, used: false };
  const r = raw as Record<string, unknown>;
  const ack = typeof r.acknowledgement === "string" ? deDash(r.acknowledgement) : "";
  const question = typeof r.next_question === "string" ? deDash(r.next_question) : "";

  // At most one question, ever.
  if ((question.match(/\?/g) ?? []).length > 1) return { plan: fallback, used: false };
  if (ack.includes("?") && question.includes("?")) return { plan: fallback, used: false };
  if (ack.length > 400 || question.length > 300) return { plan: fallback, used: false };
  if (!ack && !question) return { plan: fallback, used: false };
  if (/\b(as an ai|language model|i'm an assistant|as a bot)\b/i.test(`${ack} ${question}`)) {
    return { plan: fallback, used: false };
  }
  // Stock assistant cadence falls back to the deterministic plan.
  if (BANNED_PHRASES.test(ack.trim()) || BANNED_PHRASES.test(question.trim())) {
    return { plan: fallback, used: false };
  }


  const objective =
    typeof r.objective === "string" && (OBJECTIVE_KEYS as string[]).includes(r.objective)
      ? (r.objective as IntakeObjectiveKey)
      : fallback.objective;

  const keys = (v: unknown): IntakeObjectiveKey[] =>
    Array.isArray(v)
      ? (v.filter((k) => typeof k === "string" && (OBJECTIVE_KEYS as string[]).includes(k)) as IntakeObjectiveKey[])
      : [];

  return {
    plan: {
      // Posture and move stay ours unless the model returns a legal value.
      posture: POSTURES.includes(r.posture as Posture) ? (r.posture as Posture) : fallback.posture,
      move: MOVES.includes(r.move as Move) ? (r.move as Move) : fallback.move,
      acknowledgement: ack,
      next_question: question,
      objective: question ? objective : null,
      addressed_objectives: keys(r.addressed_objectives).length
        ? keys(r.addressed_objectives)
        : fallback.addressed_objectives,
      newly_supported_objectives: keys(r.newly_supported_objectives),
      should_advance:
        typeof r.should_advance === "boolean" ? r.should_advance : fallback.should_advance,
      // Ending the conversation is never the model's call.
      should_end: fallback.should_end,
      rationale_internal:
        typeof r.rationale_internal === "string"
          ? r.rationale_internal.slice(0, 300)
          : fallback.rationale_internal,
    },
    used: true,
  };
}

/** Read an SSE body and return the completed JSON text. */
async function readResponsesStream(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const evt = JSON.parse(payload) as {
          type?: string;
          delta?: string;
          response?: { output_text?: string };
        };
        if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") {
          text += evt.delta;
        } else if (evt.type === "response.completed" && evt.response?.output_text) {
          if (!text) text = evt.response.output_text;
        }
      } catch {
        /* partial frame — ignore */
      }
    }
  }
  return text.trim();
}

/**
 * Produce the next assistant turn.
 *
 * Always returns something usable: if no model is reachable, or the model
 * breaks the contract, the deterministic plan is returned unchanged.
 */
export async function reasonTurn(input: {
  state: ConversationState;
  latest: string;
  currentObjective?: IntakeObjectiveKey | null;
  isFirstTurn?: boolean;
}): Promise<TurnResult> {
  const fallback = planTurn(input);

  const openaiKey = process.env["OPENAI_API_KEY"];
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const direct = Boolean(openaiKey);
  const key = openaiKey ?? lovableKey;
  if (!key) {
    return { ...fallback, message: renderTurn(fallback), source: "local" };
  }

  const remaining = OBJECTIVE_KEYS.filter(
    (k) => !(input.state.supported ?? []).includes(k),
  ).map((k) => `${k}: ${QUESTION_BY_KEY[k].prompt}`);

  const userInput = [
    `Conversation so far:\n${transcript(input.state.answers) || "(nothing yet)"}`,
    `The founder just said:\n"""${input.latest}"""`,
    `Ground still worth understanding (internal only, never name these):\n${remaining.join("\n")}`,
    `Deterministic draft turn (JSON):\n${JSON.stringify(fallback)}`,
    `Return json matching the schema. Keep the draft's move and objective.`,
  ].join("\n\n");

  try {
    const res = await fetch(direct ? OPENAI_URL : GATEWAY_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(direct
          ? { authorization: `Bearer ${key}` }
          : { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" }),
      },
      body: JSON.stringify({
        model: direct ? OPENAI_MODEL : GATEWAY_MODEL,
        stream: true,
        store: false,
        instructions: SYSTEM_PROMPT,
        input: userInput,
        text: {
          format: {
            type: "json_schema",
            name: "intake_turn",
            strict: true,
            schema: OUTPUT_SCHEMA,
          },
        },
      }),
    });

    if (!res.ok) {
      return { ...fallback, message: renderTurn(fallback), source: "local" };
    }

    const text = await readResponsesStream(res);
    if (!text) return { ...fallback, message: renderTurn(fallback), source: "local" };

    const { plan, used } = sanitize(JSON.parse(text), fallback);
    return { ...plan, message: renderTurn(plan), source: used ? "model" : "local" };
  } catch {
    // A model outage never breaks the conversation.
    return { ...fallback, message: renderTurn(fallback), source: "local" };
  }
}
