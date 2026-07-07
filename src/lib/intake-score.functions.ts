/**
 * The adaptive intake — objective scoring server fn.
 *
 * Given an objective (label + anchor) and the person's answer, returns a
 * hidden 0–100 confidence score. Uses Anthropic when the key is present, and
 * always falls back to the heuristic `scoreAnswer` from `intake-scoring`
 * silently on any failure. The score is never surfaced to the client as a
 * number; the route only uses it to pick the next question.
 *
 * Gated on a live `intake_drafts.resume_token` so this can't be triggered by
 * arbitrary unauthenticated callers.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { scoreAnswer } from "./intake-scoring";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ScoreInput = z.object({
  resume_token: z.string().regex(UUID_RE),
  objective_key: z.string().trim().min(1).max(64),
  objective_label: z.string().trim().min(1).max(200),
  objective_anchor: z.string().trim().min(1).max(400),
  response: z.string().trim().max(8000),
});

type ScoreResult = {
  score: number;
  covered: boolean;
  source: "model" | "heuristic";
};

const SYSTEM = [
  "You score how well a founder's answer covers a specific intake objective.",
  "Return JSON only: { \"score\": <integer 0-100>, \"covered\": <boolean> }.",
  "",
  "Scoring:",
  "- 0-20: empty, unrelated, or a shrug.",
  "- 21-45: gestures at the objective but lacks specifics.",
  "- 46-65: covers the objective in plain terms; a strategist has enough to work with.",
  "- 66-85: specific, concrete, actionable.",
  "- 86-100: unusually clear and complete.",
  "Set covered=true when score >= 60.",
  "",
  "Do not include any prose, apology, or explanation. Return the JSON object only.",
].join("\n");

export const scoreObjective = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ScoreInput.parse(input))
  .handler(async ({ data }): Promise<ScoreResult> => {
    // Gate: live intake draft must exist.
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

    const heuristic = (): ScoreResult => {
      const s = scoreAnswer(data.objective_key, data.response);
      return { score: s, covered: s >= 60, source: "heuristic" };
    };

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return heuristic();
    if (!data.response.trim()) return heuristic();

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
          max_tokens: 120,
          messages: [
            {
              role: "user",
              content: [
                SYSTEM,
                "",
                `Objective label: ${data.objective_label}`,
                `Anchor question: ${data.objective_anchor}`,
                "",
                "Founder's answer:",
                data.response,
                "",
                "Return JSON now.",
              ].join("\n"),
            },
          ],
        }),
      });
      if (!res.ok) {
        console.warn("[score-objective] anthropic non-2xx", res.status);
        return heuristic();
      }
      const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      const raw = (json.content ?? [])
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text as string)
        .join("\n")
        .trim();
      const jsonText = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
      const parsed = JSON.parse(jsonText) as { score?: number; covered?: boolean };
      const scoreNum = Number(parsed.score);
      if (!Number.isFinite(scoreNum)) return heuristic();
      const score = Math.max(0, Math.min(100, Math.round(scoreNum)));
      const covered =
        typeof parsed.covered === "boolean" ? parsed.covered : score >= 60;
      return { score, covered, source: "model" };
    } catch (err) {
      console.warn("[score-objective] failed, falling back to heuristic", err);
      return heuristic();
    }
  });
