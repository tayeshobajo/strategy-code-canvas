/**
 * Frame profiles — the shape of a "good enough" brief per frame.
 *
 * Client-safe. No server calls. Each profile lists the fields (which map 1:1
 * to the existing IntakeObjective keys inside FRAME_DEFINITIONS) plus:
 *   - importance (1..5)     — higher = ask sooner
 *   - dependsOn?            — soft ordering hints (dependency asked first)
 *   - heuristicExtract      — pure text-scanner that credits this field from
 *                             any answer, so an opening statement can satisfy
 *                             multiple objectives at once.
 *
 * The planner ranks required-and-missing fields by
 * `importance × (1 - confidence)` and breaks ties by dependency order.
 * The question generator can inline `label` / `examples` in its prompt.
 *
 * Rule: profiles NEVER add fields that aren't objectives on the same frame in
 * `intake-frames.ts`. That keeps the review artifact + brief unchanged.
 */

import { FRAME_DEFINITIONS, type IntakeFrame, type IntakeObjective } from "../intake-frames";

export type FieldExtraction = { confidence: number; evidence: string };

export type FieldProfile = {
  /** Same key as the IntakeObjective it maps to. */
  key: string;
  label: string;
  importance: 1 | 2 | 3 | 4 | 5;
  required: boolean;
  examples: string[];
  dependsOn?: string[];
  heuristicExtract: (text: string) => FieldExtraction;
};

export type FrameProfile = {
  frame: IntakeFrame;
  requiredFields: FieldProfile[];
  optionalFields: FieldProfile[];
  /** Confidence 0..1 at which planner may stop. Higher = more thorough intake. */
  confidenceThreshold: number;
  /** Fields that MUST be captured before enough_signal can fire (Phase 14). */
  blockers: string[];
  /** At least one of these must have confidence ≥ 0.6 (success outcome). */
  successOutcomeKeys: string[];
};

/* ---------- Small heuristic building blocks ---------- */

const DATE_RE =
  /\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(\/\d{2,4})?|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(,?\s+\d{2,4})?|(q[1-4]\s?\d{2,4})|(next|this)\s+(week|month|quarter|year|spring|summer|fall|winter))\b/i;
const NUMBER_RE = /\b\d[\d,]*(\.\d+)?\b/;
const LIST_RE = /(,|;|\n|•|-|\*)/;

function has(text: string, re: RegExp): FieldExtraction {
  const m = text.match(re);
  return m
    ? { confidence: 0.85, evidence: m[0].slice(0, 120) }
    : { confidence: 0, evidence: "" };
}

function anyOf(text: string, words: RegExp): FieldExtraction {
  return has(text, words);
}

function wordDense(text: string, min: number, evidenceHint: string): FieldExtraction {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words >= min + 12) return { confidence: 0.8, evidence: evidenceHint };
  if (words >= min) return { confidence: 0.6, evidence: evidenceHint };
  return { confidence: 0, evidence: "" };
}

function combine(...results: FieldExtraction[]): FieldExtraction {
  const best = results.reduce((a, b) => (b.confidence > a.confidence ? b : a), {
    confidence: 0,
    evidence: "",
  });
  return best;
}

/* ---------- Per-field extractors ---------- */

// Generic project fields (goal, deadline, audience, features, assets, constraints)
const generic: Record<string, FieldProfile["heuristicExtract"]> = {
  goal: (t) =>
    combine(
      anyOf(t, /\b(goal|win|success|so that|so we can|because)\b/i),
      wordDense(t, 15, "answer describes outcome"),
    ),
  deadline: (t) =>
    combine(
      has(t, DATE_RE),
      anyOf(t, /\b(deadline|by\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|end of|q[1-4])|launch|go[- ]live)\b/i),
    ),
  audience: (t) =>
    anyOf(t, /\b(guests?|customers?|clients?|users?|team|staff|students?|leads?|founders?|families|friends|mother|father|parents?|honoree)\b/i),
  features: (t) =>
    combine(
      anyOf(t, /\b(invitations?|rsvp|form|checkout|dashboard|login|signup|email|calendar|gallery|schedule|registry|map|directions|countdown)\b/i),
      wordDense(t, 14, "answer lists functional pieces"),
    ),
  assets: (t) =>
    anyOf(t, /\b(logo|brand|photos?|images?|copy|content|assets|deck|figma|domain)\b/i),
  constraints: (t) =>
    anyOf(t, /\b(budget|deadline|privacy|gdpr|regulatory|compliance|hipaa|limitation|constraint)\b/i),
};

// Event site specifics
const eventSpec: Record<string, FieldProfile["heuristicExtract"]> = {
  event_date: (t) =>
    combine(
      has(t, DATE_RE),
      anyOf(t, /\bon\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i),
    ),
  privacy: (t) => anyOf(t, /\b(public|private|password|invite[- ]?only|unlisted)\b/i),
  rsvp_fields: (t) => anyOf(t, /\b(rsvp|dietary|plus[- ]one|allergies|meal choice)\b/i),
  guest_count: (t) => {
    const num = t.match(/\b(?:about|around|roughly|approximately|~)?\s*(\d{2,5})\s*(guests?|people|invitees?|attendees?)\b/i);
    if (num) return { confidence: 0.9, evidence: num[0] };
    return anyOf(t, /\b(guest count|invite list|guest list)\b/i);
  },
  extras: (t) =>
    anyOf(t, /\b(registry|dress code|schedule|directions|parking|hotel|accommodation)\b/i),
};

// Roadmap specifics (using existing objective keys: point_a, weight, point_b, unbuilt_asset, point_c, practical)
const roadmapSpec: Record<string, FieldProfile["heuristicExtract"]> = {
  point_a: (t) =>
    combine(
      anyOf(t, /\b(business|company|team|revenue|clients?|customers?|running|selling|doing)\b/i),
      wordDense(t, 12, "answer describes current state"),
    ),
  weight: (t) =>
    anyOf(t, /\b(runs?\s+through\s+me|everything\s+runs?\s+through\s+me|I['’]?m\s+the\s+bottleneck|bottleneck|stuck|overwhelm|too much|carry|drag|dependent on me|only I|everything I|manual)\b/i),
  point_b: (t) =>
    combine(
      anyOf(t, /\b(24 months?|two years?|by then|goal|vision|want|hope|scale|grow|systems? in place|running without me)\b/i),
      wordDense(t, 15, "answer describes future"),
    ),
  unbuilt_asset: (t) =>
    anyOf(t, /\b(asset|already have|list|following|audience|reputation|content library|network|relationships)\b/i),
  point_c: (t) =>
    anyOf(t, /\b(ten years?|decade|legacy|long[- ]term|eventually|position)\b/i),
  practical: (t) =>
    combine(
      anyOf(t, /\b(partner|co[- ]founder|team member|advisor|deadline|timeline|by (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))\b/i),
      has(t, DATE_RE),
    ),
};

// Internal tool specifics
const internalToolSpec: Record<string, FieldProfile["heuristicExtract"]> = {
  users: (t) => anyOf(t, /\b(team|staff|admin|operator|ops|sales|marketing|finance|support)\b/i),
  task: (t) => wordDense(t, 8, "answer describes task"),
  today: (t) => anyOf(t, /\b(spreadsheet|manual|copy[- ]paste|excel|google sheets?|by hand|paper)\b/i),
  data: (t) => anyOf(t, /\b(database|spreadsheet|api|records?|table|rows|customers?|orders?)\b/i),
};

// CRM specifics
const crmSpec: Record<string, FieldProfile["heuristicExtract"]> = {
  pipeline_today: (t) =>
    anyOf(t, /\b(pipeline|first touch|discovery|proposal|close|stages?|funnel|leads?)\b/i),
  sources: (t) =>
    anyOf(t, /\b(website|referrals?|linkedin|inbound|outbound|events?|ads?|seo|contact form)\b/i),
  follow_up_gap: (t) =>
    anyOf(t, /\b(fall through|cracks|dropped|no follow[- ]up|slow|forget|manual)\b/i),
};

// Automation specifics
const automationSpec: Record<string, FieldProfile["heuristicExtract"]> = {
  manual_today: (t) => wordDense(t, 10, "answer describes manual process"),
  trigger: (t) =>
    anyOf(t, /\b(form|email|webhook|schedule|cron|time|event|submission|new (order|lead|customer|signup))\b/i),
  volume: (t) => {
    const num = t.match(/\b(\d+)\s*(per|a)\s*(day|week|month|year)\b/i);
    if (num) return { confidence: 0.9, evidence: num[0] };
    return anyOf(t, /\b(hundreds?|thousands?|dozens?|daily|weekly)\b/i);
  },
  systems: (t) =>
    anyOf(t, /\b(zapier|make|n8n|slack|gmail|airtable|notion|hubspot|salesforce|stripe|api)\b/i),
};

// Fallback for any other field: assume any prose credits it a little.
const genericProse: FieldProfile["heuristicExtract"] = (t) =>
  wordDense(t, 8, "answer covers objective in prose");

/* ---------- Profile assembly ---------- */

const IMPORTANCE_BY_KEY: Record<string, 1 | 2 | 3 | 4 | 5> = {
  // Event
  event_date: 5,
  rsvp_fields: 5,
  guest_count: 4,
  privacy: 3,
  extras: 2,
  // Common
  goal: 5,
  deadline: 4,
  audience: 4,
  features: 4,
  assets: 3,
  constraints: 2,
  // Roadmap
  point_a: 5,
  weight: 5,
  point_b: 5,
  practical: 4,
  unbuilt_asset: 3,
  point_c: 2,
  // Internal tool
  users: 5,
  task: 5,
  today: 4,
  data: 4,
  // CRM
  pipeline_today: 5,
  sources: 5,
  follow_up_gap: 4,
  // Automation
  manual_today: 5,
  trigger: 5,
  systems: 4,
  volume: 3,
};

const DEPENDS_BY_KEY: Record<string, string[]> = {
  guest_count: ["event_date"],
  rsvp_fields: ["event_date"],
  extras: ["event_date", "guest_count"],
  follow_up_gap: ["pipeline_today"],
  systems: ["manual_today"],
};

function extractorFor(key: string): FieldProfile["heuristicExtract"] {
  return (
    generic[key] ??
    eventSpec[key] ??
    roadmapSpec[key] ??
    internalToolSpec[key] ??
    crmSpec[key] ??
    automationSpec[key] ??
    genericProse
  );
}

function toFieldProfile(o: IntakeObjective): FieldProfile {
  return {
    key: o.key,
    label: o.label,
    importance: IMPORTANCE_BY_KEY[o.key] ?? 3,
    required: o.required,
    examples: [],
    dependsOn: DEPENDS_BY_KEY[o.key],
    heuristicExtract: extractorFor(o.key),
  };
}

const CONFIDENCE_THRESHOLD_BY_FRAME: Partial<Record<IntakeFrame, number>> = {
  "project.event_site": 0.7,
  "project.crm": 0.78,
  "project.automation": 0.78,
  "project.internal_tool": 0.78,
  roadmap: 0.82,
};

const DEFAULT_FRAME_CONFIDENCE_THRESHOLD = 0.75;

function build(frame: IntakeFrame): FrameProfile | null {
  const def = FRAME_DEFINITIONS[frame];
  if (!def || def.objectives.length === 0) return null;
  const fields = def.objectives.map(toFieldProfile);
  return {
    frame,
    requiredFields: fields.filter((f) => f.required),
    optionalFields: fields.filter((f) => !f.required),
    confidenceThreshold:
      CONFIDENCE_THRESHOLD_BY_FRAME[frame] ?? DEFAULT_FRAME_CONFIDENCE_THRESHOLD,
  };
}

export const FRAME_PROFILES: Partial<Record<IntakeFrame, FrameProfile>> = {
  roadmap: build("roadmap")!,
  "project.event_site": build("project.event_site")!,
  "project.internal_tool": build("project.internal_tool")!,
  "project.client_portal": build("project.client_portal")!,
  "project.redesign": build("project.redesign")!,
  "project.automation": build("project.automation")!,
  "project.lms": build("project.lms")!,
  "project.crm": build("project.crm")!,
  "project.ecommerce": build("project.ecommerce")!,
  "project.ai_assistant": build("project.ai_assistant")!,
  "project.content_engine": build("project.content_engine")!,
  "project.generic": build("project.generic")!,
  // not_a_fit intentionally omitted
};

export function getFrameProfile(frame: IntakeFrame): FrameProfile | null {
  return FRAME_PROFILES[frame] ?? null;
}
