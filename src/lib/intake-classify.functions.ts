/**
 * The adaptive intake — frame classifier.
 *
 * Reads the open first answer and returns the best frame plus a short,
 * voice-clean confirmation label. Wraps Anthropic when the key is present,
 * falls back to the heuristic classifier from `intake-frames` when the model
 * call fails or the key is missing.
 *
 * A confirmed frame is never trusted from the browser; this fn only suggests.
 * The client shows the "sounds like…" confirmation and the person confirms
 * or corrects, then that confirmed frame is what future turns use.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { FRAME_DEFINITIONS, heuristicClassify, type IntakeFrame } from "./intake-frames";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ClassifyInput = z.object({
  resume_token: z.string().regex(UUID_RE),
  open_answer: z.string().trim().min(1).max(4000),
});

const ALL_FRAMES = Object.keys(FRAME_DEFINITIONS) as IntakeFrame[];

const SYSTEM = [
  "You classify the first message a founder writes on an intake called Trust Tai.",
  "You return exactly one frame from this fixed list, plus a short confirmation label.",
  "",
  "Frames:",
  "- roadmap: a founder-led business asking to be mapped from where it is to where it needs to be. A full business, not one build.",
  "- project.event_site: one event site (wedding, gala, launch event, birthday).",
  "- project.internal_tool: one tool for staff use.",
  "- project.client_portal: one portal for clients to log in to.",
  "- project.redesign: redesigning an existing site.",
  "- project.automation: automating a manual process.",
  "- project.lms: a learning/course system.",
  "- project.crm: a CRM or lead pipeline system.",
  "- project.ecommerce: an online store.",
  "- project.ai_assistant: an AI chatbot or agent for a defined task.",
  "- project.content_engine: a cadence of published content for authority.",
  "- project.generic: a scoped project that does not match any sub-type above.",
  "- not_a_fit: person wants the cheapest option, execution without a plan, or fast over right, or something outside our lane.",
  "",
  "Voice: sentence case. No em-dashes. No exclamation points. Do not use the words just, very, really, simply, solutions. Do not use the vendor verbs help, deliver, provide, offer. Do not use the hype adjectives smart, intelligent, seamless, cutting-edge.",
  "",
  "Return JSON only, no prose. Shape: { \"frame\": <one frame key from the list>, \"label\": <short noun phrase, five words or fewer, for the confirmation line, e.g. 'a scoped event site' or 'a full roadmap'> }.",
].join("\n");

type ClassifyResult = {
  frame: IntakeFrame;
  label: string;
  source: "model" | "heuristic";
};

export const classifyIntakeFrame = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ClassifyInput.parse(input))
  .handler(async ({ data }): Promise<ClassifyResult> => {
    // Gate on an existing intake draft so this call cannot be triggered by
    // arbitrary unauthenticated callers. Same gate pattern as reflectAnswer.
    const { getIntakeClient } = await import("@/integrations/intake/client.server");
    const intake = getIntakeClient();
    const { data: draft, error: draftErr } = await intake
      .from("intake_drafts")
      .select("resume_token")
      .eq("resume_token", data.resume_token)
      .maybeSingle();
    if (draftErr || !draft) {
      throw new Error("Invalid intake session");
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const fallback = (): ClassifyResult => {
      const frame = heuristicClassify(data.open_answer);
      return { frame, label: FRAME_DEFINITIONS[frame].label, source: "heuristic" };
    };

    if (!apiKey) return fallback();

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
          max_tokens: 400,
          messages: [
            {
              role: "user",
              content: `${SYSTEM}\n\nFounder's opening:\n${data.open_answer}\n\nReturn JSON now.`,
            },
          ],
        }),
      });
      if (!res.ok) {
        console.warn("[classify-intake] anthropic non-2xx", res.status);
        return fallback();
      }
      const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      const raw = (json.content ?? [])
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text as string)
        .join("\n")
        .trim();

      // The model sometimes wraps JSON in a code fence. Strip it if present.
      const jsonText = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
      const parsed = JSON.parse(jsonText) as { frame?: string; label?: string };
      const frame = (parsed.frame ?? "").trim() as IntakeFrame;
      if (!ALL_FRAMES.includes(frame)) {
        console.warn("[classify-intake] unknown frame from model", parsed.frame);
        return fallback();
      }

      const cleanLabel = (parsed.label ?? "").trim();
      const bannedInLabel = /[—!]|(\bjust\b|\bvery\b|\breally\b|\bsimply\b|\bsolutions\b|\bsmart\b|\bintelligent\b|\bseamless\b|\bcutting-edge\b)/i;
      const label =
        cleanLabel && cleanLabel.length <= 60 && !bannedInLabel.test(cleanLabel)
          ? cleanLabel
          : FRAME_DEFINITIONS[frame].label;

      return { frame, label, source: "model" };
    } catch (err) {
      console.warn("[classify-intake] failed, falling back to heuristic", err);
      return fallback();
    }
  });
