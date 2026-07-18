
# Phase RT-1 QA Audit Plan

Read-only-first, evidence-based audit against the full RT-1 acceptance criteria. Output is a single report at `.orchestrator/phase-rt-1-qa-report.md` with structured evidence under `.orchestrator/evidence/rt-1/`. No production data will be modified — controlled reads only, plus reversible fixtures in a scratch namespace where a scenario cannot be observed passively.

## Scope confirmed

- Full audit: all P0s + all 12 canonical scenarios + functional / state-machine / concurrency / persistence / security / UI / audit / model / performance / regression sections.
- Environments A/B/C sourced from existing projects (I will query `engine_projects` + related tables and pick safe candidates matching empty / draft / approved profiles). No new test projects are created unless a scenario cannot be observed on any existing project; if that happens I'll pause and ask before writing.

## Deliverables

- `.orchestrator/phase-rt-1-qa-report.md` — full report, capability status table, defects, final verdict.
- `.orchestrator/evidence/rt-1/` — one folder per scenario / P0 containing DB snapshots (JSON), screenshots (PNG), server-fn responses, attempt/candidate/activity rows, input-hash before/after, and error output where applicable.
- `.orchestrator/evidence/rt-1/INDEX.md` — cross-reference from every capability row in the report to its evidence artifacts.

## Method

Every capability gets one of: **Proven / Partial / Presentation only / Blocked / Failed / Not in RT-1 scope**. No status is asserted from screenshots alone — each needs a code path + DB row or server response.

### Step 1 — Architecture read (read-only)
Read the RT-1 substrate to map claims to code before running anything:
- `src/lib/roadmap-synthesis/`: `registry.ts`, `gates.ts`, `manifest.ts`, `materiality.ts`, `materiality-llm.ts`, `qualification.ts`, `capability-menu.ts`, `contract.ts`, `orchestrator.server.ts`, `plan.server.ts`, `plan.functions.ts`, `runners/*`.
- Callers: `engine-spine-ai-fill.functions.ts`, roadmap route, `SynthesisPlanDrawer.tsx`.
- Persistence tables in current DB: `engine_project_synthesis_attempts`, `engine_project_synthesis_candidates`, `engine_project_synthesis_step_state`, `engine_spine_field_truth`, `engine_activity`, `engine_roadmap_amendments`.
- Confirm which of the four persistence/idempotency tables actually exist and which columns are present — this decides whether P0 persistence claims can be Proven or must be Partial (migration pending).

### Step 2 — Environment selection (read-only DB queries)
Query candidates for:
- **A (empty):** no world_entry_workspace, no execution_boundary, no strategic_thesis, no approved point_a/point_b truth rows.
- **B (draft):** world_entry + execution_boundary + strategic_thesis present, some Spine truth still `assumed`/`drafted`, no `approved` roadmap version.
- **C (approved):** approved point_a + point_b, approved roadmap_version, existing milestones + sources.
Record the three project IDs in the report; all evidence references them by ID.

### Step 3 — P0 verification (release-blocking)
For each P0 I collect before/after DB snapshots + server responses + screenshots.
- **P0.1 Approved-truth immutability:** on Env C, run repair / refresh / rebuild_draft. Diff `engine_spine_field_truth` rows where `status='approved'` before/after. Force a contradictory source and confirm candidate creation + `approved_truth.impacted` activity + approved row unchanged. Confirm superseded attempts cannot promote.
- **P0.2 Doctrine gates:** on Env A, call `getRoadmapSynthesisPlan`; confirm milestone-dependent steps return `blocked` with structured blocker + resolution link, and orchestrator does not invoke blocked runners (grep orchestrator + observe absence of attempt rows). Satisfy each gate individually and confirm eligibility flips. Verify each gate's minimum-content acceptance in `gates.ts`.
- **P0.3 Milestone qualification:** inspect `qualification.ts` against the required fields list; construct a fixture milestone missing capability id / success measures / generic name; run qualifier; confirm `overall != pass` and `sequence/constraint/language/measurement/evidence` fail per rule; confirm `world`/`wow` report `review`, not fake `pass`.
- **P0.4 No source-count freshness:** inspect `manifest.ts` canonicalization + hash. Unit-test that key-reorder is stable, exact-duplicate source yields identical hash, unrelated source change does not change unrelated step hash. Add temporary in-repo test under `.orchestrator/evidence/rt-1/tests/` (not committed to `src/`).
- **P0.5 Materiality precedes staleness:** feed 9 fixture source deltas through the classifier and confirm each classification path; confirm duplicate/irrelevant do not mark steps stale; confirm classifier self-identifies as rules-based, not AI-certified.

### Step 4 — Functional (§6) + state machine (§7) + concurrency/idempotency (§8)
- Call `getRoadmapSynthesisPlan`, `runRoadmapSynthesis` in `repair` / `refresh` / `rebuild_draft` modes on Envs A/B/C; capture responses to JSON.
- Verify per-step retry only reruns selected step + unsatisfied deps.
- Verify `fillMissingSpineDetailsFromIntake` still resolves and now delegates to repair.
- State-machine: enumerate observed transitions from `engine_project_synthesis_step_state` history + attempts; flag any disallowed transition.
- Concurrency: fire two identical `runRoadmapSynthesis` calls in parallel via `stack_modern--invoke-server-function`; confirm one attempt, one idempotency key, one candidate, no duplicate cost.
- Mid-run input change: bump a source version between plan and run; confirm attempt becomes `superseded` and output is not promoted.

### Step 5 — Persistence (§9), migration/degraded mode (§10), security (§11)
- Snapshot table DDL (`information_schema.columns`, `pg_indexes`, `pg_policies`) for the three synthesis tables; verify grants, RLS, unique/idempotency constraints, append-only shape.
- If any required table/column is missing, mark the affected capabilities **Partial — migration pending** and record the exact missing DDL as a defect + recommended migration (do not apply autonomously per repo doctrine — write to `.orchestrator/PENDING_MIGRATIONS.md`).
- RLS: attempt cross-project reads/writes via `supabase--read_query` under a different `project_id` filter to confirm isolation at the query layer; inspect policies for auth requirement.
- Confirm no server function is unauthenticated (grep for `createServerFn` without `requireSupabaseAuth` in `roadmap-synthesis/`).

### Step 6 — UI (§12) + audit (§13) + model/prompt (§14) via Playwright
- Playwright against `localhost:8080` with injected Supabase session:
  - Roadmap page → primary action label reads "Refresh Project Intelligence", split menu options, doctrine section, per-step rows show reason/deps/attempt/provider/model/cost/candidate/retry, stale banner behavior, approved-truth wording, long-running progress restoration on reload, error-state per row.
- Audit: query `engine_activity` for `synthesis.plan.computed`, `step.started/completed/failed/blocked/superseded`, `candidate.created`, `approved_truth.impacted`, `review.requested` across scenarios; confirm shape includes run_group/attempt/step/actor/input_hash/prompt_version/provider/model/cost/timestamp.
- Prompt/model: confirm every AI runner records `prompt_version` + `provider` + `model` on attempt rows; provider failure preserves approved truth (inject failure via forced bad model id in a scratch fn call, not production runner).

### Step 7 — Performance (§15) + regression (§16)
- Time `getRoadmapSynthesisPlan` on Env C (no AI calls expected — verify by counting attempt-row deltas = 0).
- Regression: load Spine, Roadmap, Work, Client View, intake flow on Env C via Playwright; verify no draft candidate leaks to client portal / client export.

### Step 8 — 12 canonical scenarios (§17)
Each scenario gets its own evidence subfolder with the mandated fields (test name, preconditions, steps, expected, actual, status, screenshot, DB rows, activity rows, attempt/run-group IDs, input hash, candidate id, error output, changed files, test output, known limitation). Scenario 12 (migration unavailable) is naturally satisfied if Step 5 shows missing tables — recorded honestly as Partial.

### Step 9 — Scope-boundary honesty check (§18)
Grep UI for links to World Entry / Execution Boundary / Capability Registry / LLM World+Wow / candidate promotion ceremony / drift monitor; confirm each unfinished surface is visibly labeled pending RT-2 through RT-6. Any placeholder presented as functioning becomes a defect.

### Step 10 — Automated tests (§19)
Run existing suite (`bunx vitest run`) and record output. Where a required unit test from §19 is missing (DAG cycle, manifest canonicalization, hash sensitivity, materiality classification, gate/qualification evaluation, idempotency key, migration-degraded behavior), list as defect with severity — do not write missing tests in this audit turn (that's a fix, not QA).

### Step 11 — Compile the report
Final report structure:
1. Environments used (project IDs + profiles)
2. Method + evidence index
3. P0 results (P0.1–P0.5) with proof per criterion
4. Section-by-section results (§6–§16)
5. 12 canonical scenarios
6. Deferred-scope honesty check (§18)
7. Automated-test output (§19)
8. Defects table (id, severity P0/P1/P2, title, repro, expected, actual, owner=captain, recommended fix)
9. Capability status table (exact 15 rows from §21)
10. Final verdict: **PROVEN / PARTIAL / FAILED / BLOCKED** with justification. If any P0 fails or persistence migration is unapplied, verdict is Partial or Blocked — never "Phase complete".

## Guardrails

- No schema migrations applied. Any needed DDL goes to `.orchestrator/PENDING_MIGRATIONS.md` with rationale.
- No writes to approved truth, no writes to `engine_projects` rows outside a scratch namespace, no changes to client portal data.
- Scenarios that require forcing a runner failure use a scratch project + a controlled bad input; production projects are read-only for the audit.
- No claim in the report is stated without a linked evidence artifact.

## Technical details

Tools I'll use: `code--view` / `rg` for code; `supabase--read_query` for DB reads; `stack_modern--invoke-server-function` + `server-function-logs` for orchestrator calls; Playwright via `code--exec` for UI evidence; `bunx vitest run` for the existing test suite. All evidence written under `.orchestrator/evidence/rt-1/`.

Estimated turns: this is multi-turn. I'll checkpoint after Step 2 (env selection) and after Step 5 (persistence/security) so you can course-correct before I invest in the full 12-scenario matrix.
