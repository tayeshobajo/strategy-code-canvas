/**
 * Project Spine Contract — Phase 1
 *
 * Authoritative vocabulary for what the Project Spine is. This module
 * is TS-only (no runtime behaviour, no DB) and safe to import from
 * client, server, or edge surfaces. Evaluator wiring, DB projections,
 * and gate enforcement land in later phases.
 *
 * Doctrine mirror: doctrine/PROJECT_SPINE_CONTRACT.md
 */

export type SpineSectionKey =
  | "point_a"
  | "point_b"
  | "business_context"
  | "constraints_risks"
  | "assets_leverage"
  | "approved_scope"
  | "success_measures"
  | "decisions_pending"
  | "roadmap"
  | "milestone_readiness"
  | "investment"
  | "client_acknowledgment";

export type SpineSection = {
  key: SpineSectionKey;
  label: string;
  /** Section must be populated for the Spine to be considered "ready". */
  required: boolean;
  /** Approved values from this section are safe to render into the client roadmap. */
  client_safe: boolean;
  /** Deep-link suffix under `/engine/projects/:projectId/…` for the source-of-truth editor. */
  deep_link_pattern: string;
};

export const SPINE_SECTIONS: readonly SpineSection[] = [
  { key: "point_a",              label: "Point A — Current Reality",   required: true,  client_safe: true,  deep_link_pattern: "point-a" },
  { key: "point_b",              label: "Point B — Desired Future",    required: true,  client_safe: true,  deep_link_pattern: "point-b" },
  { key: "business_context",     label: "Business Context",            required: true,  client_safe: true,  deep_link_pattern: "understanding-room" },
  { key: "constraints_risks",    label: "Constraints & Risks",         required: true,  client_safe: false, deep_link_pattern: "gap-map" },
  { key: "assets_leverage",      label: "Assets & Leverage",           required: false, client_safe: true,  deep_link_pattern: "hidden-assets" },
  { key: "approved_scope",       label: "Approved Scope",              required: true,  client_safe: true,  deep_link_pattern: "builder" },
  { key: "success_measures",     label: "Success Measures",            required: true,  client_safe: true,  deep_link_pattern: "point-b" },
  { key: "decisions_pending",    label: "Decisions Pending",           required: false, client_safe: false, deep_link_pattern: "versions/compare" },
  { key: "roadmap",              label: "Roadmap",                     required: true,  client_safe: true,  deep_link_pattern: "builder" },
  { key: "milestone_readiness",  label: "Milestone Readiness",         required: true,  client_safe: false, deep_link_pattern: "sequencing" },
  { key: "investment",           label: "Investment",                  required: false, client_safe: true,  deep_link_pattern: "investment" },
  { key: "client_acknowledgment",label: "Client Acknowledgment",       required: true,  client_safe: true,  deep_link_pattern: "preview" },
] as const;

export const CLIENT_SAFE_SECTION_KEYS: readonly SpineSectionKey[] =
  SPINE_SECTIONS.filter((s) => s.client_safe).map((s) => s.key);

/**
 * State machine for any Spine field. Raw AI drafts never auto-promote
 * past `inferred` / `needs_confirmation` — a human writes the
 * `approved_truth` transition.
 */
export type SpineFieldStatus =
  | "draft"
  | "inferred"
  | "needs_confirmation"
  | "contradictory"
  | "accepted_assumption"
  | "verified"
  | "approved_truth"
  | "superseded";

export type SpineFieldProvenance = {
  status: SpineFieldStatus;
  source_refs: string[];
  confidence: number | null;
  version: number;
  updated_by: string | null;
  updated_at: string;
  approved_by?: string | null;
  approved_at?: string | null;
  change_reason?: string | null;
};

export type SpineReadinessCheck = {
  id: string;
  label: string;
  section_key: SpineSectionKey;
  /** Evaluator implementations land in Phase 3. */
  evaluator_id: string;
};

export const SPINE_READINESS_CHECKS: readonly SpineReadinessCheck[] = [
  { id: "point_a_approved",           label: "Point A is approved",                                 section_key: "point_a",               evaluator_id: "point_a_approved" },
  { id: "point_b_approved",           label: "Point B is approved",                                 section_key: "point_b",               evaluator_id: "point_b_approved" },
  { id: "no_material_contradiction",  label: "No material contradiction is unresolved",             section_key: "point_a",               evaluator_id: "no_material_contradiction" },
  { id: "assumptions_accepted",       label: "Important assumptions are explicitly accepted",       section_key: "business_context",      evaluator_id: "assumptions_accepted" },
  { id: "constraints_named",          label: "Constraints and risks are named",                     section_key: "constraints_risks",     evaluator_id: "constraints_named" },
  { id: "assets_reviewed",            label: "Hidden assets have been reviewed",                    section_key: "assets_leverage",       evaluator_id: "assets_reviewed" },
  { id: "gaps_classified",            label: "Material gaps have been classified",                  section_key: "constraints_risks",     evaluator_id: "gaps_classified" },
  { id: "blueprint_reflects_solution",label: "System Blueprint reflects the intended solution",     section_key: "approved_scope",        evaluator_id: "blueprint_reflects_solution" },
  { id: "roadmap_rationale_approved", label: "Roadmap phases and milestone rationale are approved", section_key: "roadmap",               evaluator_id: "roadmap_rationale_approved" },
  { id: "sequence_valid",             label: "Dependencies and sequence are valid",                 section_key: "milestone_readiness",   evaluator_id: "sequence_valid" },
  { id: "critical_dates_captured",    label: "Critical dates are captured",                         section_key: "milestone_readiness",   evaluator_id: "critical_dates_captured" },
  { id: "success_metrics_measurable", label: "Success metrics are measurable",                      section_key: "success_measures",      evaluator_id: "success_metrics_measurable" },
  { id: "investment_present_or_deferred", label: "Investment ranges present or intentionally deferred", section_key: "investment",       evaluator_id: "investment_present_or_deferred" },
  { id: "client_acknowledged_destination", label: "Client acknowledged the intended destination (where required)", section_key: "client_acknowledgment", evaluator_id: "client_acknowledged_destination" },
] as const;

export function getSpineSection(key: SpineSectionKey): SpineSection {
  const found = SPINE_SECTIONS.find((s) => s.key === key);
  if (!found) throw new Error(`Unknown Spine section: ${key}`);
  return found;
}
