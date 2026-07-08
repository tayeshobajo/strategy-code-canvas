/**
 * Intake extractor — LLM-primary, heuristic fallback.
 *
 * Given the frame + all prior answers, returns a per-field extraction
 * `{ [fieldKey]: { confidence, evidence } }` for EVERY field in the frame
 * profile. The planner consumes this to skip objectives the founder already
 * answered incidentally.
 *
 * Gated on a live intake_drafts.resume_token, same pattern as
 * classify/score/reflect.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { FRAME_DEFINITIONS, type IntakeFrame } from "../intake-frames";
import { getFrameProfile } from "./frame-profiles";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ExtractInput = z.object({
  resume_token: z.string().regex(UUID_RE),
  frame: z.string().trim().min(1).max(64),
  text: z.string().trim().min(1).max(8000),
});

export type ExtractedFacts = Record<string, { confidence: number; evidence: string; source: "heuristic" | "model" }>;

/** Pure heuristic pass — every field's own extractor scanned over the text. */
export function heuristicExtract(frame: IntakeFrame, text: string): ExtractedFacts {
  const profile = getFrameProfile(frame);
  if (!profile) return {};
  const out: ExtractedFacts = {};
  for (const f of [...profile.requiredFields, ...profile.optionalFields]) {
    const r = f.heuristicExtract(text);
    if (r.confidence > 0) out[f.key] = { confidence: r.confidence, evidence: r.evidence, source: "heuristic" };
  }
  return out;
}

function isFrame(v: string): v is IntakeFrame {
  return v in FRAME_DEFINITIONS;
}

export const extractFacts = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ExtractInput.parse(input))
  .handler(async ({ data }): Promise<{ facts: ExtractedFacts; source: "model" | "heuristic" }> => {
    if (!isFrame(data.frame)) return { facts: {}, source: "heuristic" };

    // Gate on live draft.
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
    if (draftErr || !draft) throw new Error("Invalid intake session");

    const heuristic = heuristicExtract(data.frame, data.text);
    const profile = getFrameProfile(data.frame)!;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { facts: heuristic, source: "heuristic" };

    const fieldList = [...profile.requiredFields, ...profile.optionalFields]
      .map((f) => `- ${f.key}: ${f.label}`)
      .join("\n");

    const prompt = [
      "You extract structured facts from an intake conversation for Trust Tai.",
      "You are given a list of fields the brief needs and a block of text the founder has written.",
      "For each field, decide if the text CLEARLY covers it. Confidence 0..1.",
      "Return JSON only: { \"facts\": { <fieldKey>: { \"confidence\": <0..1>, \"evidence\": \"<short quote or paraphrase>\" } } }",
      "Only include fields you can actually credit at >= 0.4. Never invent facts.",
      "",
      `Frame: ${data.frame}`,
      "Fields:",
      fieldList,
      "",
      "Text:",
      data.text,
      "",
      "Return JSON now.",
    ].join("\n");

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
          max_tokens: 1200,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) {
        console.warn("[intake-extract] anthropic non-2xx", res.status);
        return { facts: heuristic, source: "heuristic" };
      }
      const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      const raw = (json.content ?? [])
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text as string)
        .join("\n")
        .trim();
      const jsonText = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
      const parsed = JSON.parse(jsonText) as {
        facts?: Record<string, { confidence?: number; evidence?: string }>;
      };
      const modelFacts: ExtractedFacts = {};
      const allowed = new Set([...profile.requiredFields, ...profile.optionalFields].map((f) => f.key));
      for (const [key, v] of Object.entries(parsed.facts ?? {})) {
        if (!allowed.has(key)) continue;
        const conf = Number(v?.confidence);
        if (!Number.isFinite(conf) || conf <= 0) continue;
        modelFacts[key] = {
          confidence: Math.max(0, Math.min(1, conf)),
          evidence: (v?.evidence ?? "").toString().slice(0, 200),
          source: "model",
        };
      }
      // Merge: prefer higher confidence between heuristic + model.
      const merged: ExtractedFacts = { ...heuristic };
      for (const [k, v] of Object.entries(modelFacts)) {
        const prior = merged[k];
        if (!prior || v.confidence > prior.confidence) merged[k] = v;
      }
      return { facts: merged, source: "model" };
    } catch (err) {
      console.warn("[intake-extract] failed, falling back to heuristic", err);
      return { facts: heuristic, source: "heuristic" };
    }
  });
