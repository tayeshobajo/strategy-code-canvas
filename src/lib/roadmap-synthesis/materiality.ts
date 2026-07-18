/**
 * Phase RT-1 — Materiality classifier (rules-based, RT-5 replaces with LLM).
 *
 * Given a new source (or an update to an existing one), classify its
 * impact on the project. Only impacts in MATERIAL_IMPACTS mark
 * downstream synthesis steps stale.
 */

import type { SourceChangeImpact } from "./contract";

export type SourceRecord = {
  id: string;
  name: string | null;
  type: string | null;
  raw_text: string | null;
  updated_at?: string | null;
};

export type ClassificationInput = {
  source: SourceRecord;
  existing_sources: SourceRecord[];
  contradiction_signal_ids: string[]; // engine_extracted_signals rows tagged as contradictions
};

/** Keyword heuristics per doctrine section. Deliberately conservative. */
const KEYWORDS = {
  material_point_a: [
    "current reality",
    "today we",
    "bottleneck",
    "constraint",
    "we struggle",
    "we can't",
    "we cannot",
  ],
  material_point_b: [
    "goal",
    "destination",
    "objective",
    "outcome",
    "in 24 months",
    "we want to",
    "long term",
    "target",
  ],
  material_scope: ["scope", "in scope", "out of scope", "boundary", "deliverable", "milestone"],
  material_sequence: ["depends on", "sequence", "before", "after", "prerequisite", "order"],
} as const;

function normalizeText(v: string | null | undefined): string {
  return (v ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function isDuplicate(source: SourceRecord, prior: SourceRecord[]): boolean {
  const text = normalizeText(source.raw_text);
  if (!text) return true;
  for (const p of prior) {
    if (p.id === source.id) continue;
    const other = normalizeText(p.raw_text);
    if (!other) continue;
    if (other === text) return true;
    // Very high overlap on short sources counts as duplicate.
    if (text.length < 400 && other.includes(text)) return true;
    if (other.length < 400 && text.includes(other)) return true;
  }
  return false;
}

export function classifySourceChange(input: ClassificationInput): SourceChangeImpact {
  const text = normalizeText(input.source.raw_text);
  if (!text) return "irrelevant";
  if (input.contradiction_signal_ids.length > 0) return "contradictory";
  if (isDuplicate(input.source, input.existing_sources)) return "duplicate";

  for (const kw of KEYWORDS.material_point_b) if (text.includes(kw)) return "material_point_b";
  for (const kw of KEYWORDS.material_point_a) if (text.includes(kw)) return "material_point_a";
  for (const kw of KEYWORDS.material_scope) if (text.includes(kw)) return "material_scope";
  for (const kw of KEYWORDS.material_sequence) if (text.includes(kw)) return "material_sequence";

  // Something new but not clearly aligned to a doctrine slot.
  return "supporting";
}

/**
 * Map a materiality impact to the synthesis steps it affects.
 * Steps not listed are unaffected and remain satisfied.
 */
import type { SynthesisStepId } from "./contract";

export function affectedSteps(impact: SourceChangeImpact): SynthesisStepId[] {
  switch (impact) {
    case "material_point_a":
      return [
        "point_a",
        "truth_gaps",
        "truth_assets",
        "milestones",
        "phase_rationale",
        "truth_sequencing",
      ];
    case "material_point_b":
      return [
        "point_b",
        "milestones",
        "phase_rationale",
        "truth_blueprint",
        "truth_sequencing",
      ];
    case "material_scope":
      return ["truth_blueprint", "milestones", "phase_rationale"];
    case "material_sequence":
      return ["truth_sequencing", "milestones", "milestone_dates", "phase_rationale"];
    case "contradictory":
      // Contradictions must be resolved by a human. Everything downstream
      // of Point A/B is potentially impacted.
      return [
        "point_a",
        "point_b",
        "milestones",
        "phase_rationale",
        "truth_blueprint",
        "truth_sequencing",
      ];
    default:
      return [];
  }
}
