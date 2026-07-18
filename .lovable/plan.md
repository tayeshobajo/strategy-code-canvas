# Phase RT-1 — Roadmap Synthesis Orchestrator

**Selective, evidence-aware regeneration of project intelligence without overwriting approved truth.**

This plan supersedes the earlier "AI Fill Retry" draft. The goal is not smarter retry; it is **controlled synthesis** that respects Roadmap Thinking: World first, Constraint second, Milestones third, Evidence always, Human approval before promotion. RT-1 delivers the orchestrator, contracts, and gate-aware execution surface. RT-2 through RT-6 (World Entry workspace, Execution Boundary + Capability Registry, Strategic Thesis + Qualification, Impact Graph, Drift Monitor) are named as required follow-ups so RT-1 is never treated as the complete Roadmap Thinking layer.

---

## Non-negotiables

- Doctrine gates (World Entry, Execution Boundary, Strategic Thesis, Drift Assessment) are **not** synthesis steps. They are prerequisites that gate synthesis.
- Approved truth is **immutable**. New intelligence produces *candidates*; humans decide whether a candidate supersedes an approved artifact.
- Freshness is derived from a **content-addressed input manifest**, never from counts.
- Source changes require **materiality classification** before they can mark outputs stale.
- Every attempt is **append-only**; current state is a projection.
- Every runner is **idempotent per (project, step, input_hash, prompt_version)**.
- Milestones cannot reach `candidate_ready` without capability mapping and the Drift Test qualification record.

---

## A. Layered architecture

```text
Layer 1  Doctrine Preconditions      World Entry · Execution Boundary · Strategic Thesis · Drift Assessment
Layer 2  Intelligence Impact         Source manifests · materiality classification · affected-field graph · staleness
Layer 3  Synthesis Plan              Atomic step DAG · state/reason · candidate generation      <-- RT-1 delivers this
Layer 4  Qualification               Capability mapping · milestone contract · Drift Test · sequence validation
Layer 5  Human Promotion             Review candidates · approve/reject · version · propagate impact
```

RT-1 fully implements Layer 3, defines the interfaces and stub evaluators for Layers 1, 2, 4, and defines the candidate contract that Layer 5 will consume. It does **not** implement the resolution workspaces or the human promotion UI beyond a read-only "candidate awaiting review" surface.

---

## B. Contracts (new module: `src/lib/roadmap-synthesis/contract.ts`)

```ts
type DoctrineGateId =
  | "world_entry" | "execution_boundary"
  | "strategic_thesis" | "drift_assessment";

type SynthesisStepId =
  | "point_a" | "point_b"
  | "milestones" | "milestone_dates" | "phase_rationale"
  | "truth_blueprint" | "truth_gaps" | "truth_assets"
  | "truth_constraints" | "truth_sequencing"
  | "investment_note";

type SynthesisStepState =
  | "satisfied" | "missing" | "failed" | "stale"
  | "blocked" | "running"
  | "candidate_ready" | "awaiting_review" | "superseded";

type StepStateReason =
  | "artifact_missing" | "last_attempt_failed"
  | "input_changed" | "prompt_changed"
  | "doctrine_gate_missing" | "contradiction_unresolved"
  | "candidate_waiting_review" | "approved_truth_impacted"
  | "dependency_running";

type StepInputManifest = {
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

type StepDefinition = {
  id: SynthesisStepId;
  label: string;
  depends_on: Array<DoctrineGateId | SynthesisStepId>;
  output_type: string;
  requires_human_review: boolean;
  may_affect_approved_truth: boolean;
  runner: string; // module id, resolved by orchestrator
};
```

Canonical DAG lives in `src/lib/roadmap-synthesis/registry.ts` and is validated (no cycles, all `depends_on` resolve) in a unit test.

**Fill modes** (no `"all"`):

```ts
type FillMode =
  | "repair"        // failed | missing only
  | "refresh"       // stale + affected only (respects materiality)
  | "rebuild_draft" // regenerate every draft candidate; approved truth untouched
```

---

## C. Materiality + impact (Layer 2 minimal implementation)

New: `src/lib/roadmap-synthesis/materiality.ts`.

```ts
type SourceChangeImpact =
  | "duplicate" | "supporting" | "clarifying" | "contradictory"
  | "material_point_a" | "material_point_b"
  | "material_scope" | "material_sequence" | "irrelevant";
```

RT-1 ships a rules-based classifier (content hash + section keyword heuristics + explicit "contradicts" signals already stored in `engine_extracted_signals`). A pluggable interface lets RT-5 replace it with an LLM classifier. Only impacts other than `duplicate | supporting | irrelevant` mark downstream steps `stale`. `contradictory | material_*` on an already-approved artifact produces a **candidate revision + awaiting_review**, never an in-place rewrite.

---

## D. Candidate artifacts (Layer 5 contract, read-only surface)

Every runner writes to a candidate table, never to the operational field, when `may_affect_approved_truth` is true and the current state is `approved_truth`.

```ts
type SynthesisCandidate = {
  id: string; project_id: string; step_id: SynthesisStepId;
  attempt_id: string;
  supersedes_version: number | null;
  proposed_artifact: unknown;         // shape defined per step
  impact_summary: string;
  evidence_delta: string[];           // source_ids
  drift_qualification: DriftQualification | null;
  created_at: string;
};

type CandidateDecision = "approve" | "reject" | "request_revision"
  | "accept_as_supporting" | "defer" | "amend_roadmap";
```

`reviewSynthesisCandidate` server function stub is defined but returns `{status:"not_implemented"}` — real UI ships in RT-4/RT-5.

---

## E. Milestone qualification (Layer 4 minimal implementation)

Milestone runner cannot emit `candidate_ready` unless every milestone object contains:

`name, strategic_role, what_it_is, why_now, what_it_unlocks, durable_asset, trust_tai_capability_id, execution_mode, access_required, access_confirmed, client_responsibilities, trust_tai_responsibilities, evidence_refs, dependencies, success_measures, visual_brief?, exclusions`

And passes a structured qualification record (not booleans):

```ts
type DriftQualification = {
  world:       GateResult; constraint: GateResult; language: GateResult;
  unlock:      GateResult; wow:        GateResult; evidence:  GateResult;
  sequence:    GateResult; ownership:  GateResult; measurement: GateResult;
  overall: "pass" | "review" | "fail";
};
type GateResult = { status: "pass"|"review"|"fail"; note: string; evidence_refs: string[] };
```

RT-1 ships **deterministic evaluators** for `constraint` (capability mapping present + access_confirmed), `language` (rejects names in a generic-agency blocklist; requires ≥1 niche vocabulary token from World Entry), `unlock` (non-empty + not a restatement of name), `evidence` (≥1 evidence_ref), `ownership` (both responsibility fields present), `measurement` (≥1 success_measures entry), `sequence` (all `dependencies` resolve). `world` and `wow` return `review` with a note until RT-4 delivers LLM judges — they are surfaced honestly, not faked as `pass`.

**Capability registry (RT-1 stub):** a versioned JSON menu at `src/lib/roadmap-synthesis/capability-menu.ts` seeded from the playbook. `capability_menu_version` is a checksum of that file so prompt/menu changes participate in staleness. RT-3 replaces it with a DB-backed registry.

---

## F. Doctrine gate evaluators (Layer 1 minimal implementation)

`src/lib/roadmap-synthesis/gates.ts` implements read-only evaluators:

- `world_entry`: satisfied iff a `world_entry` truth row exists with ≥3 competitors, industry destination text, ≥5 vocabulary tokens.
- `execution_boundary`: satisfied iff an `execution_boundary` truth row exists with ≥1 approved capability and explicit `client_owned_areas`.
- `strategic_thesis`: satisfied iff a `strategic_thesis` truth row exists referencing world_entry_version + execution_boundary_version.
- `drift_assessment`: satisfied iff latest milestone candidate set has `overall: "pass"`.

RT-1 does **not** build editors for these. When unmet, blocked steps expose a `resolution_deep_link` — for now these point to the existing Understanding Room / Blueprint editors and a clearly labeled "RT-2 workspace coming" banner. This is documented as an intentional temporary path in `.orchestrator/BUILD_STATE.md`.

---

## G. Persistence (written to `.orchestrator/PENDING_MIGRATIONS.md`, not applied)

Two tables + one candidate table. All follow the mandatory GRANT + RLS pattern.

**`engine_project_synthesis_step_state`** (current projection, one row per project+step)
`project_id, step_id, state, reason, current_input_hash, latest_attempt_id, latest_candidate_id, blocker_json, updated_at`

**`engine_project_synthesis_attempts`** (append-only)
`id, run_group_id, project_id, step_id, trigger, actor_email, input_manifest, input_hash, prompt_version, provider, model, started_at, completed_at, status, error_category, error_message, output_refs, token_usage, cost_usd, superseded_by`

**`engine_project_synthesis_candidates`** (append-only, per §D)

Until Tai applies the migration, the orchestrator degrades gracefully: state is re-derived from existing artifacts each call (loses `failed` / attempt history / cost tracking but functionally correct for `missing` / `satisfied` / `blocked`). Degradation is explicit — the UI shows a "Attempt history unavailable — pending migration" chip so we never silently hide the gap.

---

## H. Concurrency + idempotency

- `idempotency_key = sha256(project_id | step_id | input_hash | prompt_version)`.
- Postgres advisory lock (`pg_try_advisory_xact_lock(hashtext(idempotency_key))`) around attempt insert; duplicate request returns the in-flight attempt row.
- Input change during a run → in-flight attempt is marked `superseded`; result is stored but not promoted.
- Retry policy: bounded (max 3 automatic per input_hash), exponential backoff between automatic retries only, manual retries always allowed but coalesced via the advisory lock.
- Cancellation writes a terminal `cancelled` status with actor + reason.

---

## I. Server functions (all `requireSupabaseAuth`, admin-gated per existing pattern)

Split across `src/lib/roadmap-synthesis/*.functions.ts` (thin) + `*.server.ts` (helpers) to respect `tanstack-serverfn-splitting`.

- `getRoadmapSynthesisPlan({ projectId })` → `{ gates: DoctrineGateReadiness[], steps: SynthesisStepView[], attempts_available: boolean }`
- `runRoadmapSynthesis({ projectId, mode, stepIds? })` → `{ runGroupId, ran: [], skipped: [], blocked: [], superseded: [], candidatesAwaitingReview: [] }`
- `getSynthesisAttempt({ attemptId })` → attempt + candidate detail for the drawer.
- `cancelSynthesisAttempt({ attemptId })`
- `reviewSynthesisCandidate({ candidateId, decision, reason })` — RT-1 stub, returns `not_implemented` for `approve|reject|amend_roadmap`; `defer` is honored (marks state `awaiting_review` with reason).

`fillMissingSpineDetailsFromIntake` is preserved as a thin adapter that delegates to `runRoadmapSynthesis({ mode: "repair" })` so existing callers keep working during rollout.

---

## J. UI (`src/routes/engine.projects.$projectId.roadmap.tsx` + new drawer)

Header action is renamed **Refresh Project Intelligence**. Split button:
- **Primary click** → `mode: "repair"` (missing + failed only; never touches stale until user reviews impact).
- **Menu** → *Refresh with new intelligence* (`refresh`), *Rebuild drafts* (`rebuild_draft`, confirms explicitly it never touches approved truth).

New drawer `src/components/engine/roadmap/SynthesisPlanDrawer.tsx` with three sections:

1. **Doctrine readiness** — one row per gate with state, missing pieces, deep link (RT-2/RT-3 workspaces labeled as pending).
2. **Synthesis steps** — one row per step: state chip, reason code, human-readable reason ("Input changed: Point B v2→v3"), last attempt (time, model, cost), latest candidate link, per-step **Retry** disabled with tooltip when blocked.
3. **Impact review** — appears only when candidates target approved truth. Copy: *"New intelligence may affect approved Point B and 3 milestones. Approved truth stays live until you review."* Deep links to per-candidate review stub.

Stale banner on the roadmap page: *"N synthesis steps are out of date. Review impact before refreshing."* Never auto-runs.

---

## K. Audit + notifications

Every state transition writes a structured `engine_activity` row via the existing guarded inserter with `kind` values:
`synthesis.plan.computed | step.started | step.completed | step.failed | step.blocked | step.superseded | candidate.created | approved_truth.impacted | review.requested`

Payload includes `run_group_id`, `attempt_id`, `input_hash`, `prompt_version`, `cost_usd`. Toasts summarize per-run-group, not per-step.

---

## L. Files

**New**
- `src/lib/roadmap-synthesis/contract.ts`
- `src/lib/roadmap-synthesis/registry.ts`
- `src/lib/roadmap-synthesis/manifest.ts` (build + hash `StepInputManifest`)
- `src/lib/roadmap-synthesis/materiality.ts`
- `src/lib/roadmap-synthesis/gates.ts`
- `src/lib/roadmap-synthesis/qualification.ts`
- `src/lib/roadmap-synthesis/capability-menu.ts`
- `src/lib/roadmap-synthesis/runners/*.server.ts` (one per step; wrap existing generation code from `engine-spine-ai-fill.functions.ts`)
- `src/lib/roadmap-synthesis/orchestrator.server.ts` (DAG walk, lock, mode logic)
- `src/lib/roadmap-synthesis/plan.functions.ts` (server fns above)
- `src/lib/roadmap-synthesis/*.test.ts` (see §M)
- `src/components/engine/roadmap/SynthesisPlanDrawer.tsx`

**Edit**
- `src/lib/engine-spine-ai-fill.functions.ts` → thin adapter → orchestrator
- `src/routes/engine.projects.$projectId.roadmap.tsx` → split button + drawer + stale banner

**Append**
- `.orchestrator/PENDING_MIGRATIONS.md` (three tables + advisory-lock helper)
- `.orchestrator/BUILD_STATE.md` (RT-1 done, RT-2..RT-6 queued, temporary deep-link caveat)
- `.orchestrator/phase-rt-1-output.md` on completion

---

## M. Verification

**Unit (Vitest)**
- DAG has no cycles; every `depends_on` resolves.
- State derivation matrix: `satisfied | missing | failed | stale | blocked | superseded` from fixtures.
- Manifest hashing is stable (key order independent) and changes on any component change.
- Materiality: duplicate source → `duplicate` (no stale); contradictory signal on approved Point B → `material_point_b` + candidate.
- Qualification: milestone missing `access_confirmed` → `constraint: fail`; generic name in blocklist → `language: fail`; missing evidence_refs → `evidence: fail`.
- Approved truth protection: `rebuild_draft` on a project with approved Point B writes a candidate row and leaves `engine_spine_field_truth` untouched.
- Idempotency: two concurrent `runRoadmapSynthesis` calls with same input_hash produce one attempt row.
- Prompt-version bump marks affected steps stale without touching approved truth.

**Integration (Playwright against localhost)**
- On `cakepro`: doctrine gate missing → drawer shows blocked with resolution link, primary button disabled with explanation.
- Seed a minimal `world_entry` + `execution_boundary` truth row directly → primary button enables → `repair` produces candidates for missing steps only; sibling `satisfied` steps unchanged.
- Attach a duplicate source → no steps go stale.
- Attach a contradictory source → `awaiting_review` appears; approved artifacts unchanged in DB.
- Force a runner to throw → that step is `failed`, others remain `satisfied`, per-step retry re-runs only it.
- Simultaneous manual retries collapse to one attempt row.

**Not verified in RT-1** (documented as RT-2..RT-6 acceptance): human approval of a candidate, LLM-driven materiality, World/Wow qualification judges, execution drift monitoring, parent/child scoping.

---

## Follow-up phases (must be queued, not optional)

- **RT-2 World Entry Workspace** — competitor review, destination, vocabulary, evidence, human approval.
- **RT-3 Execution Boundary + Capability Registry** — versioned DB-backed capability menu, per-project boundary approval.
- **RT-4 Strategic Thesis + Full Qualification** — thesis artifact, LLM `world` and `wow` judges, milestone approval ceremony.
- **RT-5 Responsive Intelligence + Impact Graph** — LLM materiality classifier, source→truth→milestone→work graph, controlled roadmap amendments.
- **RT-6 Execution Drift Monitor** — Work/QA/Delivery divergence from thesis, milestone rationale, capability boundary.

RT-1 is only useful in the presence of RT-2 and RT-3; the plan explicitly names them as the immediate next commitments so the blocker in doctrine gates has a real resolution ceremony on the roadmap.
