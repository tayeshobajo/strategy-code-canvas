/**
 * Phase 1A — Pure Spine Readiness evaluator.
 *
 * Implements §4 of doctrine/PROJECT_SPINE_CONTRACT.md as a pure function
 * over a compact input record so it can be unit-tested independently of
 * the DB, and reused by any surface (server fn, admin dashboard, etc.).
 *
 * The evaluator has no side effects and does no I/O. Callers are
 * responsible for assembling the boolean checks from whatever read
 * model they have; see `engine-spine-readiness-eval.functions.ts` for
 * the canonical assembler over Supabase state.
 *
 * Return contract (stable — external callers depend on it):
 *   { ready, passed, total, evaluated_at, checks, blockers }
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
 * it renders as "unknown" and blocks readiness.
 */
export type SpineReadinessInput = Record<SpineReadinessCheckId, boolean | null>;

export type SpineReadinessCheckState = "pass" | "fail" | "unknown";

export type SpineReadinessCheckResult = {
  id: SpineReadinessCheckId;
  label: string;
  section_key: SpineReadinessCheck["section_key"];
  state: SpineReadinessCheckState;
  note: string | null;
};

export type SpineReadinessBlocker = {
  id: SpineReadinessCheckId;
  label: string;
  section_key: SpineReadinessCheck["section_key"];
  reason: "failing" | "unknown";
  note: string | null;
};

export type SpineReadinessResult = {
  ready: boolean;
  passed: number;
  total: number;
  evaluated_at: string;
  checks: SpineReadinessCheckResult[];
  blockers: SpineReadinessBlocker[];
};

export type EvaluateSpineReadinessOptions = {
  /** ISO timestamp injected into `evaluated_at`; defaults to `new Date().toISOString()`. */
  now?: string;
  /** Optional short notes per check id (e.g. "3/5 phases have rationale"). */
  notes?: Partial<Record<SpineReadinessCheckId, string>>;
};

/**
 * Statuses from the contract's field state machine that count as
 * "settled" — no longer a draft or an unreviewed inference.
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

export function evaluateSpineReadiness(
  input: SpineReadinessInput,
  options: EvaluateSpineReadinessOptions = {},
): SpineReadinessResult {
  const notes = options.notes ?? {};
  const checks: SpineReadinessCheckResult[] = SPINE_READINESS_CHECKS.map((c) => {
    const raw = input[c.id];
    const state: SpineReadinessCheckState =
      raw === true ? "pass" : raw === false ? "fail" : "unknown";
    return {
      id: c.id,
      label: c.label,
      section_key: c.section_key,
      state,
      note: notes[c.id] ?? null,
    };
  });

  const passed = checks.filter((c) => c.state === "pass").length;
  const total = checks.length;

  const blockers: SpineReadinessBlocker[] = checks
    .filter((c) => c.state !== "pass")
    .map((c) => ({
      id: c.id,
      label: c.label,
      section_key: c.section_key,
      reason: c.state === "fail" ? "failing" : "unknown",
      note: c.note,
    }));

  return {
    ready: blockers.length === 0,
    passed,
    total,
    evaluated_at: options.now ?? new Date().toISOString(),
    checks,
    blockers,
  };
}
