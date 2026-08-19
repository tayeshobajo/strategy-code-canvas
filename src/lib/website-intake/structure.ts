/**
 * Layer B — derived understanding.
 *
 * Verbatim answers stay authoritative. This module only groups what was said
 * into buckets Trust Tai OS can reason over, and reads a light frame signal
 * from the existing frame library. Nothing here is shown as truth to the
 * person answering.
 */

import { FRAME_DEFINITIONS, type IntakeFrame } from "@/lib/intake-frames";
import { QUESTION_BY_KEY, type IntakeObjectiveKey } from "./questions";
import { EMPTY_STRUCTURED, type IntakeSignals, type StructuredUnderstanding, type VerbatimAnswer } from "./types";

function baseKey(key: VerbatimAnswer["key"]): IntakeObjectiveKey {
  return key.split("__followup_")[0] as IntakeObjectiveKey;
}

export function deriveStructured(answers: VerbatimAnswer[]): StructuredUnderstanding {
  const out: StructuredUnderstanding = {
    ...EMPTY_STRUCTURED,
    current_state: [],
    desired_future: [],
    pains: [],
    goals: [],
    constraints: [],
    existing_assets: [],
    ideas: [],
    open_questions: [],
  };
  for (const a of answers) {
    const text = (a.answer ?? "").trim();
    if (!text || a.skipped) continue;
    const q = QUESTION_BY_KEY[baseKey(a.key)];
    if (!q) continue;
    out[q.bucket].push(text);
  }
  return out;
}

const FRAME_HINTS: Array<{ frame: IntakeFrame; patterns: RegExp }> = [
  { frame: "project.ecommerce", patterns: /\b(shop|store|products?|orders?|shipping|checkout)\b/i },
  { frame: "project.crm", patterns: /\b(leads?|pipeline|follow ups?|enquir|inquir|prospects?)\b/i },
  { frame: "project.automation", patterns: /\b(manually|by hand|copy and paste|spreadsheet|repetitive)\b/i },
  { frame: "project.lms", patterns: /\b(course|students?|training|lessons?|curriculum)\b/i },
  { frame: "project.client_portal", patterns: /\b(clients? log ?in|portal|client area|dashboard for clients)\b/i },
  { frame: "project.content_engine", patterns: /\b(newsletter|blog|podcast|content|posts?)\b/i },
  { frame: "project.ai_assistant", patterns: /\b(assistant|answer questions|chat|agent)\b/i },
];

/** A light frame read used only as a routing hint for Scout. */
export function deriveFrame(answers: VerbatimAnswer[]): { frame: IntakeFrame; confidence: number } {
  const text = answers
    .filter((a) => !a.skipped)
    .map((a) => a.answer ?? "")
    .join(" \n ");
  if (text.trim().length < 40) return { frame: "roadmap", confidence: 0.2 };
  let best: { frame: IntakeFrame; hits: number } = { frame: "roadmap", hits: 0 };
  for (const h of FRAME_HINTS) {
    const hits = (text.match(new RegExp(h.patterns.source, "gi")) ?? []).length;
    if (hits > best.hits) best = { frame: h.frame, hits };
  }
  if (best.hits === 0) return { frame: "roadmap", confidence: 0.5 };
  const known = Object.prototype.hasOwnProperty.call(FRAME_DEFINITIONS, best.frame);
  return {
    frame: known ? best.frame : "roadmap",
    confidence: Math.min(0.9, 0.4 + best.hits * 0.1),
  };
}

export function buildSignals(
  answers: VerbatimAnswer[],
  coverage: number,
  completeness: number,
): IntakeSignals {
  const { frame, confidence } = deriveFrame(answers);
  return {
    frame,
    frame_confidence: confidence,
    objective_coverage: coverage,
    completeness,
  };
}
