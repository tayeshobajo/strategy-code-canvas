/**
 * Phase RT-1 — Roadmap Synthesis Orchestrator: contracts.
 *
 * Pure TS. Client-safe. No runtime, no DB, no side effects.
 *
 * These types are the shared vocabulary between:
 *  - the doctrine gate evaluators (Layer 1)
 *  - the materiality classifier and staleness derivation (Layer 2)
 *  - the synthesis plan / orchestrator (Layer 3 — RT-1)
 *  - the milestone qualification evaluator (Layer 4)
 *  - the candidate contract that Layer 5 (human promotion) will consume
 *
 * Doctrine anchor: World first → Constraint second → Milestones third →
 * Evidence always → Human approval before promotion.
 */

export type DoctrineGateId =
  | "world_entry"
  | "execution_boundary"
  | "strategic_thesis"
  | "drift_assessment";

export type SynthesisStepId =
  | "point_a"
  | "point_b"
  | "milestones"
  | "milestone_dates"
  | "phase_rationale"
  | "truth_blueprint"
  | "truth_gaps"
  | "truth_assets"
  | "truth_constraints"
  | "truth_sequencing"
  | "investment_note";

export type SynthesisStepState =
  | "satisfied"
  | "missing"
  | "failed"
  | "stale"
  | "blocked"
  | "running"
  | "candidate_ready"
  | "awaiting_review"
  | "superseded";

export type StepStateReason =
  | "artifact_missing"
  | "last_attempt_failed"
  | "input_changed"
  | "prompt_changed"
  | "doctrine_gate_missing"
  | "contradiction_unresolved"
  | "candidate_waiting_review"
  | "approved_truth_impacted"
  | "dependency_running";

/**
 * Content-addressed inputs for a single synthesis step. The hash of the
 * canonical form of this manifest is what decides staleness — never
 * counts, never timestamps.
 */
export type StepInputManifest = {
  source_versions: Record<string, string>;
  truth_versions: Record<string, number>;
  world_entry_version: number | null;
  execution_boundary_version: number | null;
  strategic_thesis_version: number | null;
  roadmap_version: string | null;
  capability_menu_version: string;
  prompt_version: string;
  model_policy_version: string;
};

export type StepDefinition = {
  id: SynthesisStepId;
  label: string;
  depends_on: Array<DoctrineGateId | SynthesisStepId>;
  output_type: string;
  requires_human_review: boolean;
  may_affect_approved_truth: boolean;
  runner: string;
};

/**
 * Modes explicitly exclude "all". A rebuild is scoped to *drafts*; it
 * never touches approved truth in place.
 */
export type FillMode = "repair" | "refresh" | "rebuild_draft";

export type DoctrineGateReadiness = {
  id: DoctrineGateId;
  label: string;
  satisfied: boolean;
  missing_pieces: string[];
  /** Deep link to the resolution surface. In RT-1 several point at temporary editors. */
  resolution_deep_link: string;
  /** True when the resolution surface is a placeholder (RT-2/RT-3 pending). */
  resolution_pending: boolean;
  version: number | null;
};

export type SynthesisStepView = {
  id: SynthesisStepId;
  label: string;
  state: SynthesisStepState;
  reason: StepStateReason | null;
  reason_detail: string;
  blocked_by: Array<DoctrineGateId | SynthesisStepId>;
  last_attempt_at: string | null;
  last_error: string | null;
  last_input_hash: string | null;
  current_input_hash: string;
  requires_human_review: boolean;
  may_affect_approved_truth: boolean;
};

export type SynthesisPlan = {
  gates: DoctrineGateReadiness[];
  steps: SynthesisStepView[];
  /** False when persistence tables from PENDING_MIGRATIONS have not been applied. */
  attempts_available: boolean;
  /** True when at least one gate is unsatisfied — primary "repair" run should refuse. */
  gated: boolean;
  /** Steps that would run under mode="repair" right now, respecting gates. */
  runnable_repair: SynthesisStepId[];
};

// ---------- Qualification (Layer 4 contract, minimal RT-1 evaluator) ----------

export type QualificationStatus = "pass" | "review" | "fail";

export type GateResult = {
  status: QualificationStatus;
  note: string;
  evidence_refs: string[];
};

export type DriftQualification = {
  world: GateResult;
  constraint: GateResult;
  language: GateResult;
  unlock: GateResult;
  wow: GateResult;
  evidence: GateResult;
  sequence: GateResult;
  ownership: GateResult;
  measurement: GateResult;
  overall: QualificationStatus;
};

// ---------- Candidate contract (Layer 5, RT-1 defines but does not promote) ----------

export type CandidateDecision =
  | "approve"
  | "reject"
  | "request_revision"
  | "accept_as_supporting"
  | "defer"
  | "amend_roadmap";

export type SynthesisCandidate = {
  id: string;
  project_id: string;
  step_id: SynthesisStepId;
  attempt_id: string;
  supersedes_version: number | null;
  proposed_artifact: unknown;
  impact_summary: string;
  evidence_delta: string[];
  drift_qualification: DriftQualification | null;
  created_at: string;
};

// ---------- Materiality (Layer 2) ----------

export type SourceChangeImpact =
  | "duplicate"
  | "supporting"
  | "clarifying"
  | "contradictory"
  | "material_point_a"
  | "material_point_b"
  | "material_scope"
  | "material_sequence"
  | "irrelevant";

/** Impacts that mark downstream steps stale. Duplicate/supporting/irrelevant do not. */
export const MATERIAL_IMPACTS: ReadonlySet<SourceChangeImpact> = new Set<SourceChangeImpact>([
  "contradictory",
  "material_point_a",
  "material_point_b",
  "material_scope",
  "material_sequence",
]);

export const HUMAN_LABEL_FOR_REASON: Record<StepStateReason, string> = {
  artifact_missing: "Nothing generated yet.",
  last_attempt_failed: "Previous attempt failed. Retry available.",
  input_changed: "Inputs changed since the last run.",
  prompt_changed: "Prompt or model policy changed since the last run.",
  doctrine_gate_missing: "A doctrine gate is unmet. Resolve it before running this step.",
  contradiction_unresolved: "A contradictory source is unresolved. Review before regenerating.",
  candidate_waiting_review: "A candidate is waiting for human review.",
  approved_truth_impacted:
    "New intelligence may affect approved truth. A candidate will be created for review.",
  dependency_running: "A dependency is still running.",
};
