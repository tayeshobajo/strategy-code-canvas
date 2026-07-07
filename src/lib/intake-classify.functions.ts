/**
 * The adaptive intake — frame classifier.
 *
 * Server-side only. The browser never calls Anthropic directly; it calls this
 * function, which gates on a valid intake draft, then returns a rich shape:
 *
 *   {
 *     frame:  "roadmap" | "scoped_project" | "not_fit",
 *     subtype: "event_site" | "internal_tool" | ... | null,
 *     confidence: 0-100,
 *     reason: "short internal reason",           // never shown to client
 *     confirmation_copy: "sounds like ...",       // for high-confidence path
 *     clarifying_question: "..."                  // for low-confidence path
 *   }
 *
 * Rules the caller applies (spec §Phase 6):
 *  - confidence >= HIGH_BAR → show confirmation_copy
 *  - confidence <  HIGH_BAR → ask clarifying_question
 *  - frame === "not_fit"    → respectful redirect, do not interrogate
 *
 * A confirmed frame is never trusted from the browser; this fn only suggests.
 *
 * Backward compatibility: legacy `frame` (internal `IntakeFrame` string like
 * "project.event_site") and `label` (short human noun phrase) are still
 * returned as `_legacy_frame` / `label` for existing callers.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { FRAME_DEFINITIONS, heuristicClassify, type IntakeFrame } from "./intake-frames";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ClassifyInput = z.object({
  resume_token: z.string().regex(UUID_RE),
  open_answer: z.string().trim().min(1).max(4000),
});

/** Confidence at or above this shows the confirmation. Below it, we clarify. */
export const HIGH_CONFIDENCE_BAR = 70;

export type ClassifierFrame = "roadmap" | "scoped_project" | "not_fit";
export type ClassifierSubtype =
  | "event_site"
  | "internal_tool"
  | "client_portal"
  | "redesign"
  | "automation"
  | "ecommerce"
  | "lms"
  | "crm"
  | "ai_assistant"
  | "content_engine"
  | null;

export type ClassifyResult = {
  frame: ClassifierFrame;
  subtype: ClassifierSubtype;
  confidence: number;
  reason: string;
  confirmation_copy: string;
  clarifying_question: string;
  /** Internal — the fine-grained IntakeFrame the rest of the app already uses. */
  _legacy_frame: IntakeFrame;
  /** Short human noun phrase; used inside confirmation_copy on the client. */
  label: string;
  source: "model" | "heuristic";
};

const SUBTYPES: Exclude<ClassifierSubtype, null>[] = [
  "event_site",
  "internal_tool",
  "client_portal",
  "redesign",
  "automation",
  "ecommerce",
  "lms",
  "crm",
  "ai_assistant",
  "content_engine",
];

const ALL_LEGACY_FRAMES = Object.keys(FRAME_DEFINITIONS) as IntakeFrame[];

/** Map the internal fine-grained frame to the {frame, subtype} pair. */
function legacyToPair(f: IntakeFrame): { frame: ClassifierFrame; subtype: ClassifierSubtype } {
  if (f === "roadmap") return { frame: "roadmap", subtype: null };
  if (f === "not_a_fit") return { frame: "not_fit", subtype: null };
  if (f === "project.generic") return { frame: "scoped_project", subtype: null };
  const sub = f.replace(/^project\./, "") as Exclude<ClassifierSubtype, null>;
  return { frame: "scoped_project", subtype: SUBTYPES.includes(sub) ? sub : null };
}

/** Map the {frame, subtype} pair to the internal fine-grained frame. */
function pairToLegacy(frame: ClassifierFrame, subtype: ClassifierSubtype): IntakeFrame {
  if (frame === "roadmap") return "roadmap";
  if (frame === "not_fit") return "not_a_fit";
  if (!subtype) return "project.generic";
  const candidate = `project.${subtype}` as IntakeFrame;
  return ALL_LEGACY_FRAMES.includes(candidate) ? candidate : "project.generic";
}

const BANNED = /[—!]|(\bjust\b|\bvery\b|\breally\b|\bsimply\b|\bsolutions\b|\bsmart\b|\bintelligent\b|\bseamless\b|\bcutting-edge\b|\bhelp\b|\bdeliver\b|\bprovide\b|\boffer\b)/i;

function safeCopy(s: string | undefined, fallback: string, maxLen = 200): string {
  const clean = (s ?? "").trim();
  if (!clean || clean.length > maxLen || BANNED.test(clean)) return fallback;
  return clean;
}

const SYSTEM = [
  "You classify the first message a founder writes on an intake called Trust Tai.",
  "The intake has three possible frames:",
  "- roadmap: a founder-led business asking to be mapped from where it is to where it needs to be.",
  "- scoped_project: one defined build. Pick a subtype when one clearly fits.",
  "- not_fit: person wants the cheapest option, execution without a plan, fast over right, or something outside our lane.",
  "",
  "Subtypes (only valid when frame = scoped_project):",
  "event_site, internal_tool, client_portal, redesign, automation, ecommerce, lms, crm, ai_assistant, content_engine.",
  "Return subtype = null when nothing clearly fits.",
  "",
  "Voice: sentence case. No em-dashes. No exclamation points. Do not use just, very, really, simply, solutions, smart, intelligent, seamless, cutting-edge. Do not use vendor verbs help, deliver, provide, offer.",
  "",
  "Return JSON only, no prose. Shape:",
  "{",
  '  "frame": "roadmap" | "scoped_project" | "not_fit",',
  '  "subtype": "<one of the subtypes>" | null,',
  '  "confidence": <integer 0-100, your own read of how sure you are>,',
  '  "reason": "<one short internal sentence, not shown to the person>",',
  '  "label": "<short noun phrase, five words or fewer, e.g. \'a scoped event site\', \'a full roadmap\', \'outside our lane\'>",',
  '  "confirmation_copy": "<one line the person will see if confidence is high, e.g. \'sounds like you are planning an event site, is that right\'>",',
  '  "clarifying_question": "<one short question the person will see if confidence is low, asking them to say more so you can tell which frame fits>"',
  "}",
  "",
  "Guidance on confidence:",
  "- 85-100: the opening names the thing directly (a wedding site, a CRM for our sales team, a full 24-month roadmap).",
  "- 60-84: the opening strongly implies it but leaves one branch open.",
  "- below 60: the opening is short, vague, or could reasonably be two different frames.",
].join("\n");

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

    const buildFallback = (legacy: IntakeFrame): ClassifyResult => {
      const pair = legacyToPair(legacy);
      const label = FRAME_DEFINITIONS[legacy].label;
      const confirmSuffix = FRAME_DEFINITIONS[legacy].confirmSuffix;
      const confirmation_copy =
        pair.frame === "not_fit"
          ? "this may sit outside what we do best"
          : `sounds like ${label}, is that right`;
      const clarifying_question =
        pair.frame === "not_fit"
          ? "before we go further, can you say a little more about what you are hoping we do together"
          : "can you say a little more so we can tell which frame fits";
      return {
        frame: pair.frame,
        subtype: pair.subtype,
        confidence: 45, // heuristic is never high-confidence
        reason: "heuristic keyword match",
        confirmation_copy,
        clarifying_question,
        _legacy_frame: legacy,
        label,
        source: "heuristic",
      };
    };

    const heuristicResult = () => buildFallback(heuristicClassify(data.open_answer));

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return heuristicResult();

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
          max_tokens: 600,
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
        return heuristicResult();
      }
      const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      const raw = (json.content ?? [])
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text as string)
        .join("\n")
        .trim();
      const jsonText = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
      const parsed = JSON.parse(jsonText) as {
        frame?: string;
        subtype?: string | null;
        confidence?: number;
        reason?: string;
        label?: string;
        confirmation_copy?: string;
        clarifying_question?: string;
      };

      const frame: ClassifierFrame =
        parsed.frame === "roadmap" || parsed.frame === "scoped_project" || parsed.frame === "not_fit"
          ? parsed.frame
          : "scoped_project";

      let subtype: ClassifierSubtype = null;
      if (frame === "scoped_project" && parsed.subtype && SUBTYPES.includes(parsed.subtype as Exclude<ClassifierSubtype, null>)) {
        subtype = parsed.subtype as Exclude<ClassifierSubtype, null>;
      }

      const legacy = pairToLegacy(frame, subtype);
      const fallbackShape = buildFallback(legacy);

      const rawConf = Number(parsed.confidence);
      const confidence = Number.isFinite(rawConf)
        ? Math.max(0, Math.min(100, Math.round(rawConf)))
        : 55;

      const label = safeCopy(parsed.label, FRAME_DEFINITIONS[legacy].label, 60);
      const confirmation_copy = safeCopy(
        parsed.confirmation_copy,
        fallbackShape.confirmation_copy,
        200,
      );
      const clarifying_question = safeCopy(
        parsed.clarifying_question,
        fallbackShape.clarifying_question,
        240,
      );
      const reason = (parsed.reason ?? "").toString().trim().slice(0, 240) || "model classification";

      return {
        frame,
        subtype,
        confidence,
        reason,
        confirmation_copy,
        clarifying_question,
        _legacy_frame: legacy,
        label,
        source: "model",
      };
    } catch (err) {
      console.warn("[classify-intake] failed, falling back to heuristic", err);
      return heuristicResult();
    }
  });
