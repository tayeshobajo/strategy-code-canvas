/**
 * Phase 1A — Pure Spine Readiness evaluator.
 *
 * Implements §4 of doctrine/PROJECT_SPINE_CONTRACT.md as a pure function
 * over a compact input record so it can be unit-tested independently of
 * the DB, and reused by any surface (server fn, admin dashboard, etc.).
 *
 * The evaluator itself has no side effects and does not read from the
 * network. Callers are responsible for assembling the boolean checks
 * from whatever read model they have; see
 * `engine-spine-readiness-eval.functions.ts` for the canonical
 * assembler over Supabase state.
 */
import {
  SPINE_READINESS_CHECKS,
  type SpineReadinessCheck,
  type SpineFieldStatus,
} from "@/lib/spine-contract";

export type SpineReadinessCheckId = SpineReadinessCheck["id"];

/**
 * Compact boolean input, one flag per canonical check. `null` means the
 * evaluator could not determine the check from the current read model —
 * it renders as "unknown" and does NOT count toward readiness.
 */
export type SpineReadinessInput = Record<SpineReadinessCheckId, boolean | null>;

export type SpineReadinessCheckResult = {
  id: SpineReadinessCheckId;
  label: string;
  section_key: SpineReadinessCheck["section_key"];
  state: "pass" | "fail" | "unknown";
  note?: string | null;
};

export type SpineReadinessResult = {
  ready: boolean;
  passed: number;
  failed: number;
  unknown: number;
  total: number;
  checks: SpineReadinessCheckResult[];
};

/**
 * Statuses from the contract's field state machine that are "settled" —
 * i.e. no longer a draft / inference awaiting human review.
 * `approved_truth` alone is what makes Point A/B checks pass; the wider
 * set is used elsewhere (e.g. "gaps classified").
 */
export const SETTLED_STATUSES: readonly SpineFieldStatus[] = [
  "verified",
  "accepted_assumption",
  "approved_truth",
];

export function isApprovedTruth(status: SpineFieldStatus | null | undefined): boolean {
  return status === "approved_truth";
}

export function isSettled(status: SpineFieldStatus | null | undefined): boolean {
  return !!status && (SETTLED_STATUSES as readonly string[]).includes(status);
}

export function evaluateSpineReadiness(input: SpineReadinessInput, notes?: Partial<Record<SpineReadinessCheckId, string>>): SpineReadinessResult {
  const checks: SpineReadinessCheckResult[] = SPINE_READINESS_CHECKS.map((c) => {
    const raw = input[c.id];
    const state: SpineReadinessCheckResult["state"] =
      raw === true ? "pass" : raw === false ? "fail" : "unknown";
    return {
      id: c.id,
      label: c.label,
      section_key: c.section_key,
      state,
      note: notes?.[c.id] ?? null,
    };
  });
  const passed = checks.filter((c) => c.state === "pass").length;
  const failed = checks.filter((c) => c.state === "fail").length;
  const unknown = checks.filter((c) => c.state === "unknown").length;
  return {
    ready: failed === 0 && unknown === 0 && passed === checks.length,
    passed,
    failed,
    unknown,
    total: checks.length,
    checks,
  };
}
