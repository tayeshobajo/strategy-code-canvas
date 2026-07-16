/**
 * Phase 1A follow-up — Point A / Point B durable truth status helpers.
 *
 * Pure, dependency-light utilities so both the server (getProjectSpine)
 * and the Spine page can agree on:
 *
 *   1. How to map the DB's `engine_spine_field_truth.status` vocabulary
 *      onto the eight canonical statuses defined in
 *      doctrine/PROJECT_SPINE_CONTRACT.md §3.
 *   2. How to aggregate the field-level rows for a single Spine section
 *      (`point-a` / `point-b`) into ONE durable status for the section.
 *   3. Human-readable labels + tones for every one of the eight statuses.
 *   4. The single approval check the whole app must use — only
 *      `approved_truth` counts as approved.
 *
 * NO DB reads and NO React here. Keep this file safe to import from
 * server functions, route components, and unit tests alike.
 */
import type { SpineFieldStatus } from "@/lib/spine-contract";

/** DB-side status vocabulary written by `engine_spine_field_truth`. */
export type DbSpineFieldStatus =
  | "stated"
  | "inferred"
  | "assumed"
  | "missing"
  | "contradicted"
  | "needs_confirmation"
  | "verified"
  | "approved_truth";

/**
 * Map a DB status onto the canonical contract vocabulary. Returns null
 * when the input is unrecognised so callers can degrade gracefully.
 */
export function mapDbStatusToContract(
  status: string | null | undefined,
): SpineFieldStatus | null {
  switch (status) {
    case "approved_truth": return "approved_truth";
    case "verified":       return "verified";
    case "assumed":        return "accepted_assumption";
    case "contradicted":   return "contradictory";
    case "needs_confirmation": return "needs_confirmation";
    case "stated":         return "needs_confirmation"; // asserted, not yet reviewed
    case "inferred":       return "inferred";
    case "missing":        return "draft";
    default:               return null;
  }
}

/**
 * Only `approved_truth` counts as approved anywhere in the app. Every
 * badge / variant / count that previously used "has meaningful value"
 * MUST route through this check instead.
 */
export function isApprovedTruth(status: SpineFieldStatus | null | undefined): boolean {
  return status === "approved_truth";
}

/**
 * Rank order used when picking the "worst" (least confident) status
 * inside a section — a section is only as strong as its shakiest field.
 * Higher number = more settled truth.
 */
const RANK: Record<SpineFieldStatus, number> = {
  superseded: 0,
  draft: 1,
  inferred: 2,
  needs_confirmation: 3,
  accepted_assumption: 4,
  verified: 5,
  approved_truth: 6,
  contradictory: -1, // handled specially — contradictions always dominate
};

export type SpineTruthRow = { status: string | null | undefined };

/**
 * Aggregate a section's field-truth rows into ONE durable status.
 *
 * Rules (in order):
 *   1. If any row maps to `contradictory` → `contradictory`.
 *   2. If no rows exist → `null` (unknown; UI falls back to "not started").
 *   3. If every mapped row is `approved_truth` → `approved_truth`.
 *   4. Otherwise return the LOWEST-ranked (weakest) mapped status —
 *      the section is not stronger than its weakest link.
 *
 * Rows whose DB status is unrecognised are ignored (they neither
 * strengthen nor weaken the aggregate).
 */
export function aggregateSpineStatus(rows: readonly SpineTruthRow[]): SpineFieldStatus | null {
  const mapped: SpineFieldStatus[] = [];
  for (const r of rows) {
    const s = mapDbStatusToContract(r.status);
    if (s === null) continue;
    if (s === "contradictory") return "contradictory";
    mapped.push(s);
  }
  if (mapped.length === 0) return null;
  if (mapped.every((s) => s === "approved_truth")) return "approved_truth";
  let worst: SpineFieldStatus = mapped[0];
  for (const s of mapped) {
    if (RANK[s] < RANK[worst]) worst = s;
  }
  return worst;
}

export type SpineStatusPresentation = {
  /** Short uppercase badge label (≤ 12 chars). */
  label: string;
  /** Full sentence-cased label suitable for tooltips / prose. */
  fullLabel: string;
  /** Design-system tone bucket. */
  tone: "approved" | "verified" | "assumption" | "review" | "draft" | "contradiction" | "history";
};

/** Presentation for every one of the eight canonical contract statuses. */
export const SPINE_STATUS_LABELS: Record<SpineFieldStatus, SpineStatusPresentation> = {
  draft:               { label: "DRAFT",              fullLabel: "Draft",                        tone: "draft" },
  inferred:            { label: "INFERRED",           fullLabel: "Inferred by AI",               tone: "review" },
  needs_confirmation:  { label: "NEEDS REVIEW",       fullLabel: "Needs confirmation",           tone: "review" },
  contradictory:       { label: "CONTRADICTORY",      fullLabel: "Contradictory — resolve",      tone: "contradiction" },
  accepted_assumption: { label: "ASSUMED",            fullLabel: "Accepted assumption",          tone: "assumption" },
  verified:            { label: "VERIFIED",           fullLabel: "Verified",                     tone: "verified" },
  approved_truth:      { label: "APPROVED",           fullLabel: "Approved truth",               tone: "approved" },
  superseded:          { label: "SUPERSEDED",         fullLabel: "Superseded by newer version",  tone: "history" },
};

/**
 * Presentation for a section that has NO field-truth rows yet. Kept
 * separate from the 8 contract statuses because "no record" is not one
 * of them.
 */
export const SPINE_STATUS_NONE: SpineStatusPresentation = {
  label: "NOT STARTED",
  fullLabel: "No truth recorded yet",
  tone: "draft",
};

export function presentationFor(status: SpineFieldStatus | null | undefined): SpineStatusPresentation {
  if (!status) return SPINE_STATUS_NONE;
  return SPINE_STATUS_LABELS[status];
}
