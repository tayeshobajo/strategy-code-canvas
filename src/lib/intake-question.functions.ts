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

function passesVoiceCheck(s: string, anchor: string): boolean {
  const clean = s.trim();
  if (!clean) return false;
  if (clean.length < 8 || clean.length > 240) return false;
  if (BANNED.test(clean)) return false;
  // Reject if the model returned an assistant preface instead of a question.
  if (/^(sure|here|okay|got it|of course)\b/i.test(clean)) return false;
  // Guardrail: if it's identical to the anchor, that's fine — treat as pass.
  if (clean === anchor.trim()) return true;
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
  return [
    SYSTEM,
    "",
    `Anchor question (the floor, never soften past it): ${input.objective_anchor}`,
    `Objective (internal, do not name): ${input.objective_label}`,
    "",
    "How the founder opened:",
    input.opening || "(no opening statement)",
    "",
    "What they have told us so far:",
    priors,
    "",
    "Return JSON now.",
  ].join("\n");
}

async function callModel(
  prompt: string,
  apiKey: string,
  temperature: number,
): Promise<string | null> {
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
        max_tokens: 200,
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
    const parsed = JSON.parse(jsonText) as { question?: string };
    const q = (parsed.question ?? "").toString().trim();
    return q || null;
  } catch (err) {
    console.warn("[intake-question] generation failed", err);
    return null;
  }
}

export const generateAnchorWording = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => GenerateInput.parse(input))
  .handler(async ({ data }): Promise<GeneratedQuestion> => {
    // Gate: live intake draft must exist. Reads must match saveDraft's write
    // path (main DB via supabaseAdmin) — single source of truth for intake
    // session state.
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

    // First attempt.
    const first = await callModel(prompt, apiKey, 0.4);
    if (first && passesVoiceCheck(first, data.objective_anchor)) {
      return { question: first, source: "generated" };
    }

    // Regenerate once with a tighter reminder and lower temperature.
    const retryPrompt =
      prompt +
      "\n\nThe previous draft failed the voice check. Return one calm sentence that stays close to the anchor, obeys every rule above, and reads like a strategist speaking, not a form.";
    const second = await callModel(retryPrompt, apiKey, 0.2);
    if (second && passesVoiceCheck(second, data.objective_anchor)) {
      return { question: second, source: "generated" };
    }

    // Fallback: anchor. Never surface an error to the client.
    return anchorFallback;
  });
