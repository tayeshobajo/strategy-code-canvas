/**
 * Phase RT-5 — LLM materiality classifier.
 *
 * Wraps `callLovableAi` + `parseJsonOutput` to classify a source change
 * into one of the doctrine impact classes. On any failure (missing key,
 * gateway error, unparseable JSON, unknown class) falls back to the
 * rules-based classifier from `materiality.ts`, so RT-5 is a strict
 * additive upgrade — the synthesis pipeline never regresses when the
 * LLM path is unavailable.
 */

import type { SourceChangeImpact } from "./contract";
import { classifySourceChange, type ClassificationInput } from "./materiality";

const VALID_IMPACTS = new Set<SourceChangeImpact>([
  "duplicate",
  "supporting",
  "clarifying",
  "contradictory",
  "material_point_a",
  "material_point_b",
  "material_scope",
  "material_sequence",
  "irrelevant",
]);

const VALID_SPINES = new Set([
  "point-a",
  "point-b",
  "world-entry",
  "execution-boundary",
  "strategic-thesis",
  "milestones",
  "phase-rationale",
  "blueprint",
  "gaps",
  "assets",
  "constraints",
  "sequencing",
  "investment-note",
]);

export type MaterialityDecision = {
  impact: SourceChangeImpact;
  confidence: number; // 0..1
  rationale: string;
  affected_spines: string[];
  classifier: "llm" | "rules";
  model: string | null;
};

const SYSTEM_PROMPT = `You are the Roadmap Engine's materiality classifier. Given a new or updated
source for a business project, decide how it impacts the project's approved truth.

Return STRICT JSON matching:
{
  "impact": one of ["duplicate","supporting","clarifying","contradictory","material_point_a","material_point_b","material_scope","material_sequence","irrelevant"],
  "confidence": number 0..1,
  "rationale": short sentence (<= 240 chars) explaining the pick,
  "affected_spines": array of any of ["point-a","point-b","world-entry","execution-boundary","strategic-thesis","milestones","phase-rationale","blueprint","gaps","assets","constraints","sequencing","investment-note"]
}

Doctrine:
- material_point_a: changes what "current reality" is (constraints, bottlenecks, systems today).
- material_point_b: changes the 24-month destination, goal, or outcome definition.
- material_scope: changes what is in or out of scope, deliverables, boundaries.
- material_sequence: changes dependencies, prerequisites, or ordering.
- contradictory: directly conflicts with an already-approved truth row.
- clarifying: sharpens something already known without moving it.
- supporting: adds evidence but doesn't change the truth.
- duplicate: substantively the same text already in the project.
- irrelevant: not usable for this project's roadmap.

Prefer the most specific material_* class when the source clearly affects that pillar.
Never invent an impact class not in the enum. Return only the JSON — no prose, no fences.`;

export async function classifySourceChangeSmart(
  input: ClassificationInput & { projectContext?: string },
): Promise<MaterialityDecision> {
  const fallback = (): MaterialityDecision => ({
    impact: classifySourceChange(input),
    confidence: 0.5,
    rationale: "Rules-based classifier (LLM unavailable)",
    affected_spines: [],
    classifier: "rules",
    model: null,
  });

  const key = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env?.LOVABLE_API_KEY;
  if (!key) return fallback();
  if (!input.source.raw_text || input.source.raw_text.trim().length < 20) return fallback();

  try {
    // Late imports keep this module client-safe for typing while the runtime
    // path is only ever executed from server handlers.
    const { callLovableAi, parseJsonOutput } = await import("@/lib/engine-ai.server");
    const model = "google/gemini-3.5-flash";
    const projectContext = input.projectContext ?? "";
    const priorSummary = input.existing_sources
      .slice(0, 8)
      .map((s, i) => `${i + 1}. [${s.type ?? "note"}] ${(s.name ?? "").slice(0, 80)}`)
      .join("\n");

    const userPrompt = [
      `Project context:\n${projectContext || "(none provided)"}`,
      `Prior sources (${input.existing_sources.length} total, first 8 shown):\n${priorSummary || "(none)"}`,
      `Contradictions flagged elsewhere: ${input.contradiction_signal_ids.length}`,
      `New source name: ${input.source.name ?? "(untitled)"}`,
      `New source type: ${input.source.type ?? "unknown"}`,
      `New source text (truncated):\n${input.source.raw_text.slice(0, 6_000)}`,
    ].join("\n\n");

    const result = await callLovableAi(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      { model, json: true, temperature: 0 },
    );

    const parsed = parseJsonOutput<{
      impact?: string;
      confidence?: number;
      rationale?: string;
      affected_spines?: unknown;
    }>(result.text);
    if (!parsed) return fallback();

    const impact = parsed.impact as SourceChangeImpact | undefined;
    if (!impact || !VALID_IMPACTS.has(impact)) return fallback();

    const affected = Array.isArray(parsed.affected_spines)
      ? parsed.affected_spines
          .filter((v): v is string => typeof v === "string")
          .filter((v) => VALID_SPINES.has(v))
      : [];

    const confidence = clamp01(
      typeof parsed.confidence === "number" ? parsed.confidence : 0.6,
    );

    return {
      impact,
      confidence,
      rationale: (parsed.rationale ?? "").slice(0, 240) || "LLM classified",
      affected_spines: affected,
      classifier: "llm",
      model,
    };
  } catch {
    return fallback();
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
