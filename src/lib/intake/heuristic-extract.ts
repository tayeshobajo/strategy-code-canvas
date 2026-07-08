/**
 * Client-safe heuristic fact extractor.
 *
 * Separated from `intake-extract.functions.ts` so the route bundle does not
 * import the server-fn module for pure text-scanning.
 */

import type { IntakeFrame } from "../intake-frames";
import { getFrameProfile } from "./frame-profiles";

export type ExtractedFacts = Record<
  string,
  { confidence: number; evidence: string; source: "heuristic" | "model" }
>;

export function heuristicExtract(frame: IntakeFrame, text: string): ExtractedFacts {
  const profile = getFrameProfile(frame);
  if (!profile) return {};
  const out: ExtractedFacts = {};
  for (const f of [...profile.requiredFields, ...profile.optionalFields]) {
    const r = f.heuristicExtract(text);
    if (r.confidence > 0) {
      out[f.key] = { confidence: r.confidence, evidence: r.evidence, source: "heuristic" };
    }
  }
  return out;
}
