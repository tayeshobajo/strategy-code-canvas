/**
 * Phase 1 R2 — Canonical spine field-key allowlists.
 *
 * The single source of truth for which top-level keys can appear inside
 * `engine_projects.point_a_status` / `point_b_status` sidecars. Prevents
 * silent drift where an operator or an AI writes a status against a
 * field key that no editor / reader actually recognises.
 *
 * Point B has a fixed section list.
 * Point A has fixed base keys plus a `diagnosis:<title>` namespace for
 * dynamic diagnosis cards (whose titles are generated per project).
 */

export type Spine = "point-a" | "point-b";

export const POINT_B_FIELD_KEYS = [
  "24_month_destination",
  "10_year_position",
  "client_outcome",
  "customer_outcome",
  "operational_outcome",
  "revenue_outcome",
  "brand_position",
] as const;
export type PointBFieldKey = (typeof POINT_B_FIELD_KEYS)[number];

export const POINT_A_BASE_FIELD_KEYS = [
  "lenses",
  "diagnosis",
  "key_diagnosis",
] as const;
export type PointABaseFieldKey = (typeof POINT_A_BASE_FIELD_KEYS)[number];

/**
 * Phase 1 (Spine 2.0) — Allowlists for additional Spine sections. These
 * are TS-level guards for future writes into `engine_spine_field_truth`
 * so a typo cannot silently persist against an unknown section key.
 * No DB migration; mirrors the section catalogue in `src/lib/spine-contract.ts`.
 */
export const BUSINESS_CONTEXT_FIELD_KEYS = ["summary", "market", "operating_model", "team"] as const;
export const CONSTRAINTS_RISKS_FIELD_KEYS = ["constraints", "risks", "dependencies"] as const;
export const ASSETS_LEVERAGE_FIELD_KEYS = ["assets", "leverage_opportunities"] as const;
export const APPROVED_SCOPE_FIELD_KEYS = ["in_scope", "out_of_scope", "exclusions"] as const;
export const SUCCESS_MEASURES_FIELD_KEYS = ["metrics", "targets", "measurement_method"] as const;
export const INVESTMENT_FIELD_KEYS = ["phase_ranges", "milestone_ranges", "deferred_reason"] as const;

/**
 * Diagnosis card keys are dynamic and driven by the AI-generated card
 * title. We namespace them with the `diagnosis:` prefix so an allowlist
 * can validate them without enumerating every possible title.
 */
export const POINT_A_DIAGNOSIS_PREFIX = "diagnosis:";

export function pointADiagnosisKey(title: string): string {
  return `${POINT_A_DIAGNOSIS_PREFIX}${title.trim()}`;
}

export function isKnownSpineFieldKey(spine: Spine, key: string): boolean {
  if (typeof key !== "string" || key.length === 0) return false;
  if (spine === "point-b") {
    return (POINT_B_FIELD_KEYS as readonly string[]).includes(key);
  }
  // point-a: base keys or a namespaced diagnosis-card key.
  if ((POINT_A_BASE_FIELD_KEYS as readonly string[]).includes(key)) return true;
  if (!key.startsWith(POINT_A_DIAGNOSIS_PREFIX)) return false;
  const suffix = key.slice(POINT_A_DIAGNOSIS_PREFIX.length).trim();
  return suffix.length > 0 && suffix.length <= 180;
}
