/**
 * Phase RT-1 — Milestone qualification (Drift Test).
 *
 * Deterministic evaluators for constraint, language, unlock, evidence,
 * ownership, measurement, and sequence. world/wow return "review" with
 * a note — surfaced honestly, not faked as pass. RT-4 delivers LLM
 * judges for those two.
 */

import type { DriftQualification, GateResult, QualificationStatus } from "./contract";
import { findCapability, GENERIC_MILESTONE_NAME_BLOCKLIST } from "./capability-menu";

export type CandidateMilestone = {
  id: string;
  name: string;
  strategic_role?: string;
  what_it_is?: string;
  why_now?: string;
  what_it_unlocks?: string;
  durable_asset?: string;
  trust_tai_capability_id?: string;
  execution_mode?: "trust_tai_build" | "trust_tai_coordinate" | "client_owned" | "partner_required" | "future_capability";
  access_required?: string[];
  access_confirmed?: boolean;
  client_responsibilities?: string[];
  trust_tai_responsibilities?: string[];
  evidence_refs?: string[];
  dependencies?: string[];
  success_measures?: string[];
  visual_brief?: string;
  exclusions?: string[];
};

export type QualificationContext = {
  vocabulary: string[]; // niche vocabulary tokens from World Entry
  known_milestone_ids: Set<string>;
};

const REQUIRED_FIELDS: Array<keyof CandidateMilestone> = [
  "name",
  "strategic_role",
  "what_it_is",
  "why_now",
  "what_it_unlocks",
  "durable_asset",
  "trust_tai_capability_id",
  "execution_mode",
  "client_responsibilities",
  "trust_tai_responsibilities",
  "evidence_refs",
  "success_measures",
];

export function contractComplete(m: CandidateMilestone): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const key of REQUIRED_FIELDS) {
    const v = m[key];
    if (v == null) missing.push(String(key));
    else if (typeof v === "string" && !v.trim()) missing.push(String(key));
    else if (Array.isArray(v) && v.length === 0) missing.push(String(key));
  }
  return { ok: missing.length === 0, missing };
}

function pass(note = ""): GateResult {
  return { status: "pass", note, evidence_refs: [] };
}
function fail(note: string, evidence_refs: string[] = []): GateResult {
  return { status: "fail", note, evidence_refs };
}
function review(note: string): GateResult {
  return { status: "review", note, evidence_refs: [] };
}

export function qualifyMilestone(
  m: CandidateMilestone,
  ctx: QualificationContext,
): DriftQualification {
  // constraint: capability mapped, execution mode aligned, access confirmed for build/coordinate
  let constraint: GateResult;
  if (!m.trust_tai_capability_id) {
    constraint = fail("Missing trust_tai_capability_id");
  } else if (!findCapability(m.trust_tai_capability_id)) {
    constraint = fail(`Capability ${m.trust_tai_capability_id} not in menu`);
  } else if (
    (m.execution_mode === "trust_tai_build" || m.execution_mode === "trust_tai_coordinate") &&
    m.access_confirmed !== true
  ) {
    constraint = fail("access_confirmed is not true for a Trust Tai-owned milestone");
  } else {
    constraint = pass();
  }

  // language: no blocklist match; ≥1 niche vocabulary token in the name.
  const nameLower = (m.name ?? "").toLowerCase();
  let language: GateResult;
  const blocked = GENERIC_MILESTONE_NAME_BLOCKLIST.find((phrase) => nameLower.includes(phrase));
  if (blocked) {
    language = fail(`Name contains generic phrase "${blocked}"`);
  } else if (ctx.vocabulary.length > 0) {
    const hit = ctx.vocabulary.some((tok) => nameLower.includes(tok.toLowerCase()));
    language = hit
      ? pass()
      : fail("Name does not use any World Entry vocabulary token");
  } else {
    language = review("No World Entry vocabulary yet — cannot verify niche language");
  }

  // unlock: non-empty and not a restatement of the name
  const unlock = (m.what_it_unlocks ?? "").trim();
  let unlockResult: GateResult;
  if (!unlock) unlockResult = fail("what_it_unlocks is empty");
  else if (unlock.toLowerCase() === nameLower) unlockResult = fail("Unlock restates the name");
  else unlockResult = pass();

  // evidence: ≥1 evidence_ref
  const evidence: GateResult =
    (m.evidence_refs ?? []).length > 0
      ? pass()
      : fail("No evidence_refs on milestone");

  // ownership: both responsibility fields present
  const ownership: GateResult =
    (m.client_responsibilities ?? []).length > 0 &&
    (m.trust_tai_responsibilities ?? []).length > 0
      ? pass()
      : fail("Client + Trust Tai responsibilities must both be listed");

  // measurement: ≥1 success_measures entry
  const measurement: GateResult =
    (m.success_measures ?? []).length > 0
      ? pass()
      : fail("No success_measures listed");

  // sequence: every dependency resolves to a known milestone id
  const deps = m.dependencies ?? [];
  const missingDeps = deps.filter((d) => !ctx.known_milestone_ids.has(d));
  const sequence: GateResult =
    missingDeps.length === 0
      ? pass()
      : fail(`Unresolved dependencies: ${missingDeps.join(", ")}`);

  const world = review("World gate requires LLM judge (RT-4)");
  const wow = review("Wow gate requires LLM judge (RT-4)");

  const overall = rollup([constraint, language, unlockResult, evidence, ownership, measurement, sequence, world, wow]);

  return {
    world,
    constraint,
    language,
    unlock: unlockResult,
    wow,
    evidence,
    sequence,
    ownership,
    measurement,
    overall,
  };
}

function rollup(results: GateResult[]): QualificationStatus {
  if (results.some((r) => r.status === "fail")) return "fail";
  if (results.some((r) => r.status === "review")) return "review";
  return "pass";
}
