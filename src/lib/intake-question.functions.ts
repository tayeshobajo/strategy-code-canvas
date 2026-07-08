/**
 * The adaptive intake — generative anchor-question wording.
 *
 * The completeness model still picks the objective. This function only rewrites
 * that objective's anchor question in the person's own language, then runs a
 * voice check. If the check fails, it regenerates once. If that still fails,
 * it returns the anchor verbatim so the intake never stalls.
 *
 * Never called from the browser directly beyond this fn — no client-side model
 * calls. Gated on a live `intake_drafts.resume_token`.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GenerateInput = z.object({
  resume_token: z.string().regex(UUID_RE),
  objective_key: z.string().trim().min(1).max(64),
  objective_label: z.string().trim().min(1).max(200),
  objective_anchor: z.string().trim().min(1).max(400),
  opening: z.string().trim().max(4000).optional().default(""),
  prior_answers: z
    .array(
      z.object({
        label: z.string().trim().max(200),
        response: z.string().trim().max(2000),
      }),
    )
    .max(12)
    .optional()
    .default([]),
  context_facts: z
    .array(
      z.object({
        key: z.string().trim().max(64),
        value: z.string().trim().max(200),
      }),
    )
    .max(20)
    .optional()
    .default([]),
  /** Prior answer to the SAME objective, when the planner is re-asking. */
  previous_attempt: z.string().trim().max(2000).optional().default(""),
  /** True when the planner is re-asking this objective (clarify loop). */
  is_reask: z.boolean().optional().default(false),
});

export type GeneratedQuestion = {
  question: string;
  acknowledgement?: string;
  source: "generated" | "anchor";
};

// Voice conscience. Same banned list as the classifier plus a couple of
// obvious tells. Keep this in lockstep with intake-classify.functions.
const BANNED =
  /[—!]|(\bjust\b|\bvery\b|\breally\b|\bsimply\b|\bsolutions\b|\bsmart\b|\bintelligent\b|\bseamless\b|\bcutting-edge\b|\bhelp\b|\bdeliver\b|\bprovide\b|\boffer\b|\bleverage\b|\bunlock\b|\bempower\b)/i;

function passesVoiceCheck(
  s: string,
  anchor: string,
  opts: { isReask?: boolean } = {},
): boolean {
  const clean = s.trim();
  if (!clean) return false;
  if (clean.length < 8 || clean.length > 240) return false;
  if (BANNED.test(clean)) return false;
  // Reject if the model returned an assistant preface instead of a question.
  if (/^(sure|here|okay|got it|of course)\b/i.test(clean)) return false;
  // On a re-ask, the anchor was already tried; verbatim anchor is a defect
  // because it produces the exact "planner asked the same thing again" UX.
  if (opts.isReask && clean.toLowerCase() === anchor.trim().toLowerCase()) return false;
  return true;
}

function passesAckCheck(s: string): boolean {
  const clean = s.trim();
  if (!clean) return false;
  if (clean.length < 6 || clean.length > 160) return false;
  if (BANNED.test(clean)) return false;
  if (/^(sure|here|okay|got it|of course)\b/i.test(clean)) return false;
  // Ack should be a statement, not a question.
  if (clean.endsWith("?")) return false;
  // Ack should be brief: at most one sentence, ideally under 18 words.
  if (clean.split(/\s+/).length > 22) return false;
  return true;
}

const SYSTEM = [
  "You are the voice of Trust Tai on an adaptive intake.",
  "A completeness model has already chosen the next objective and its anchor question.",
  "Your job is to (a) optionally acknowledge what the founder just told you in one calm clause, then (b) rewrite the anchor question in the founder's own language, using what they have already told you.",
  "",
  "Rules of the voice:",
  "- sentence case",
  "- one sentence for each field, ideally under 22 words",
  "- no em-dashes, no exclamation points",
  "- do not use: just, very, really, simply, solutions, smart, intelligent, seamless, cutting-edge, leverage, unlock, empower",
  "- do not use vendor verbs: help, deliver, provide, offer",
  "- do not invent facts about their business; if you have nothing specific to draw on, stay close to the anchor",
  "- do not name the objective label out loud",
  "- do not preface (no 'sure', 'okay', 'here is')",
  "",
  "The acknowledgement is optional. Only include it when there is a specific prior fact worth naming back. Otherwise omit the field or return an empty string. Never invent it.",
  "The acknowledgement must not be a question and must not end with a question mark.",
  "",
  'Return JSON only: { "acknowledgement": "<optional one clause>", "question": "<one line>" }',
].join("\n");

function buildPrompt(input: z.infer<typeof GenerateInput>): string {
  const priors =
    input.prior_answers.length > 0
      ? input.prior_answers
          .map((a) => `- ${a.label}: ${a.response}`)
          .join("\n")
      : "(nothing yet)";
  const context =
    input.context_facts.length > 0
      ? input.context_facts.map((c) => `- ${c.key}: ${c.value}`).join("\n")
      : "(none)";
  const reaskBlock = input.is_reask
    ? [
        "",
        "This is a RE-ASK of the same objective. The founder already gave a first attempt (below) but it was thin or vague.",
        "Their previous attempt:",
        `"${input.previous_attempt || "(brief)"}"`,
        "",
        "Rewrite so you (a) name back one specific detail from their previous attempt in the acknowledgement, and (b) ask a sharper, more concrete angle on the same objective. Do NOT repeat the anchor verbatim. Ask for a concrete example, a name, a number, or a story.",
      ].join("\n")
    : "";
  return [
    SYSTEM,
    "",
    `Anchor question (the floor, never soften past it): ${input.objective_anchor}`,
    `Objective (internal, do not name): ${input.objective_label}`,
    reaskBlock,
    "",
    "How the founder opened:",
    input.opening || "(no opening statement)",
    "",
    "Context (side facts you may name back — honoree, event type, city, etc.):",
    context,
    "",
    "What they have told us so far:",
    priors,
    "",
    "Return JSON now.",
  ].join("\n");
}

type ModelResult = { question: string; acknowledgement: string | null };

async function callModel(
  prompt: string,
  apiKey: string,
  temperature: number,
): Promise<ModelResult | null> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 260,
        temperature,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      console.warn("[intake-question] anthropic non-2xx", res.status);
      return null;
    }
    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const raw = (json.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("\n")
      .trim();
    const jsonText = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(jsonText) as {
      question?: string;
      acknowledgement?: string;
    };
    const q = (parsed.question ?? "").toString().trim();
    if (!q) return null;
    const ack = (parsed.acknowledgement ?? "").toString().trim();
    return { question: q, acknowledgement: ack || null };
  } catch (err) {
    console.warn("[intake-question] generation failed", err);
    return null;
  }
}

export const generateAnchorWording = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => GenerateInput.parse(input))
  .handler(async ({ data }): Promise<GeneratedQuestion> => {
    // Gate: live intake draft must exist.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: draft, error: draftErr } = await (
      supabaseAdmin.from("intake_drafts") as unknown as {
        select: (s: string) => {
          eq: (c: string, v: string) => {
            maybeSingle: () => Promise<{ data: { resume_token: string } | null; error: unknown }>;
          };
        };
      }
    )
      .select("resume_token")
      .eq("resume_token", data.resume_token)
      .maybeSingle();
    if (draftErr || !draft) {
      throw new Error("Invalid intake session");
    }

    const anchorFallback: GeneratedQuestion = {
      question: data.objective_anchor,
      source: "anchor",
    };

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return anchorFallback;

    const prompt = buildPrompt(data);

    const finalize = (r: ModelResult): GeneratedQuestion => {
      const ack = r.acknowledgement && passesAckCheck(r.acknowledgement) ? r.acknowledgement : undefined;
      return { question: r.question, acknowledgement: ack, source: "generated" };
    };

    // First attempt.
    const first = await callModel(prompt, apiKey, 0.4);
    if (first && passesVoiceCheck(first.question, data.objective_anchor, { isReask: data.is_reask })) {
      return finalize(first);
    }

    // Regenerate once with a tighter reminder and lower temperature.
    const retryPrompt =
      prompt +
      "\n\nThe previous draft failed the voice check. Return one calm sentence that stays close to the anchor, obeys every rule above, and reads like a strategist speaking, not a form.";
    const second = await callModel(retryPrompt, apiKey, 0.2);
    if (second && passesVoiceCheck(second.question, data.objective_anchor, { isReask: data.is_reask })) {
      return finalize(second);
    }

    // Fallback: anchor. Never surface an error to the client.
    return anchorFallback;
  });

