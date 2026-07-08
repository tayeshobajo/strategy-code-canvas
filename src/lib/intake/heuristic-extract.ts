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

/* ---------- Phase 14: context facts (non-objective side facts) ---------- */

import type { ContextFact } from "./intake-memory";

const RELATION_RE =
  /\bmy\s+(mother|mom|father|dad|wife|husband|sister|brother|son|daughter|friend|boss|partner|co[- ]?founder)\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?)/;
const NAKED_POSSESSIVE_RE = /\b([A-Z][a-zA-Z'-]{2,})'s\b/;
const EVENT_TYPE_RE =
  /\b((?:\d{1,3}(?:st|nd|rd|th)?\s+)?(?:birthday|wedding|anniversary|gala|fundraiser|baby\s+shower|graduation|retirement|reunion|memorial|christening|bar\s+mitzvah|bat\s+mitzvah))\b/i;
const LOCATION_RE =
  /\b(?:in|at)\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,2})/;
const FOUNDER_DEP_RE =
  /\b(runs?\s+through\s+me|only\s+I\s+(?:can|know|do)|I['’]?m\s+the\s+bottleneck|everything\s+depends\s+on\s+me|can['’]?t\s+step\s+away)\b/i;
const LEAD_SOURCE_RE =
  /\b(website|contact\s+form|referrals?|linkedin|instagram|facebook|google\s+ads|seo|inbound|outbound|events?)\b/i;
const MANUAL_PROCESS_RE =
  /\b(copy\s*[-]?\s*paste|by\s+hand|manually|spreadsheet|excel|google\s+sheets?)\b/i;


function firstMatch(re: RegExp, text: string, group = 1): string | null {
  const m = text.match(re);
  return m && m[group] ? m[group].trim() : null;
}

export function extractContextFacts(
  frame: IntakeFrame,
  text: string,
): Record<string, ContextFact> {
  const out: Record<string, ContextFact> = {};
  const t = text ?? "";
  if (!t.trim()) return out;

  // Honoree / host — event frame, but harmless elsewhere.
  const rel = t.match(RELATION_RE);
  if (rel) {
    out.honoree_or_host = {
      value: `${rel[2]} (${rel[1]})`,
      evidence: rel[0].slice(0, 120),
    };
  } else {
    const bare = t.match(NAKED_POSSESSIVE_RE);
    if (bare && !/^(this|that|today|tomorrow|next)$/i.test(bare[1])) {
      out.honoree_or_host = { value: bare[1], evidence: bare[0] };
    }
  }

  const et = firstMatch(EVENT_TYPE_RE, t);
  if (et) out.event_type = { value: et, evidence: et };

  const loc = t.match(LOCATION_RE);
  if (loc) {
    const candidate = loc[1].trim();
    const head = candidate.split(/\s+/)[0];
    const isMonth = /^(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)$/.test(head);
    if (!isMonth) {
      out.location = { value: candidate, evidence: loc[0] };
    }
  }

  if (FOUNDER_DEP_RE.test(t)) {
    const m = t.match(FOUNDER_DEP_RE)!;
    out.founder_dependency = { value: "yes", evidence: m[0] };
  }

  if (frame === "project.crm" || frame === "project.automation") {
    const src = firstMatch(LEAD_SOURCE_RE, t, 0);
    if (src) out.lead_source_hint = { value: src.toLowerCase(), evidence: src };
    const mp = firstMatch(MANUAL_PROCESS_RE, t, 0);
    if (mp) out.manual_process_hint = { value: mp.toLowerCase(), evidence: mp };
  }

  return out;
}
