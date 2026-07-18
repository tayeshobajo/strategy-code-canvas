# Phase RT-1 — Roadmap Synthesis Orchestrator: QA Audit Report

**Date:** 2026-07-18
**Auditor:** Claude (Sonnet 4.5), autonomous read-only pass
**Scope:** Verify RT-1 functions as a controlled, evidence-aware synthesis
system — not a renamed AI retry button.
**Method:** Code walkthrough of `src/lib/roadmap-synthesis/*`, DB DDL /
trigger / RLS inspection, and live data probes against production Supabase.
No mutations, no schema changes, no user-triggered runs.

---

## Verdict at a glance

| Area | Status | Notes |
|---|---|---|
| DAG + registry integrity | **PASS** | Valid Kahn topo; validate/topological algs correct; no cycles; no unknown deps. |
| Manifest canonical JSON + stable hash | **PASS** | Sorted keys, arrays preserved, FNV-1a deterministic. |
| Approved-truth immutability | **PASS (DB-enforced)** | `tg_engine_spine_field_truth_provenance` blocks non-human writes to `approved_truth` and requires a matching ceremony decision or full `operator_override` payload. |
| Doctrine gates read-only | **PASS** | RT-1 gate evaluator only reads. Sidecar + truth-row dual read is consistent. |
| Milestone qualification honesty | **PASS** | World & Wow return `review`, not fake `pass`; RT-4 owed. Deterministic rules for constraint/language/unlock/evidence/ownership/measurement/sequence match brief. |
| Persistence DDL + RLS | **PASS** | 3 tables present, admin-only via `has_role`. Amendment dedup partial unique index present. |
| Attempt / step-state persistence semantics | **FAIL (P0)** | Attempts are inserted with `input_hash: ""` and `step_state` is never written. The "stale" branch in `plan.server.ts:119` is dead code. Staleness cannot be detected across runs. |
| Per-step runners | **FAIL (P0)** | Every step delegates to a single monolithic legacy fill. `ran[]` is reported per step but reflects one monolithic invocation. Step-level attribution, retries, and staleness are unenforceable. |
| Rebuild-draft candidate writing | **FAIL (P1)** | Steps flagged `may_affect_approved_truth` are pushed onto `candidatesAwaitingReview` but no `engine_project_synthesis_candidates` row is written. RT-4/5 stub is honest in the code but not honored in the return shape. |
| Concurrent-run coalescing | **FAIL (P1)** | `runGroupId` is generated fresh per call; no in-flight lock, no idempotency key check. Two concurrent refreshes both run the legacy fill and both may bill LLM credits. |
| Materiality scan `projectContext` load | **FAIL (P2 bug)** | `runners/materiality-scan.server.ts:83` selects `client_name` from `engine_projects`, which does not exist. Query fails silently, `projectContext` degrades to empty string. Classifier still runs, but with less context. |
| Materiality scan "since" filter | **FAIL (P2)** | `since` derives from the latest attempt row. When only materiality runs (no repair targets), no attempt row is written → `since` stays null → every refresh reclassifies all sources. Dedup index prevents data corruption but wastes LLM credits. |
| Review candidate mutations | **DEFERRED (documented)** | Only `defer` is honored. `approve`/`reject`/etc. return `not_implemented`. Matches doctrine ("Ships in RT-4/RT-5") but must be surfaced in UI. |

**Overall:** RT-1 is a solid substrate for the DAG, gates, hashing, and
qualification — the parts the brief called out as "not just a retry button"
are real. But the run-record layer is a facade: attempts don't carry
manifest hashes, step-state is never persisted, and per-step runners collapse
to one legacy fill. Until those are fixed, RT-1 cannot honestly report per-step
state across runs.

---

## Environments used

| Env | Project | Rationale |
|---|---|---|
| A — Empty | `9bbbac73-a6e6-4c1c-989b-e0df846edb32` `Trust Tai QA — intake` (`blocked`) | No Point A/B, 0 truth rows, 0 milestones, 0 spirit_first_analysis workspaces. Cleanest empty state. |
| B — Draft | `f8019417-7ebf-4b56-a753-b24d734bf6f0` `Apex Crane Services — intake` (`needs_review`) | Point A/B populated, 3 truth rows, 29 milestones, no sidecar workspaces. |
| C — Approved | `cf21df7b-5646-45dd-a3c3-dc62d0c7ead0` `cakepro — intake` (`approved`) | 13 truth rows all `approved_truth` on `point-a`/`point-b`, 21 milestones, `approved_at` set. |

All three projects have zero rows in
`engine_project_synthesis_attempts`, `_candidates`, `_step_state` —
consistent with the finding that persistence has never actually been
exercised end-to-end.

---

## P0 findings

### P0-1 — Attempt rows carry no input hash; step_state is never written

**Location:** `src/lib/roadmap-synthesis/orchestrator.server.ts:170-200`,
`src/lib/roadmap-synthesis/plan.server.ts:115-133`.

**Evidence:**
```ts
// orchestrator.server.ts:185
input_manifest: {},
input_hash: "",
prompt_version: "rt-1.0.0",
provider: "lovable",
model: "legacy_fill",
```

The orchestrator computes no manifest before the run and writes a literal
empty string as `input_hash`. It never writes to
`engine_project_synthesis_step_state`.

Meanwhile `plan.server.ts:119` gates the `stale` state on
`persisted.current_input_hash !== currentHash` — a comparison that can
never trigger because `persisted` is always empty.

**Impact:** Two of the doctrine promises fail:
- Staleness detection: after a source changes, the plan cannot show the
  affected steps as `stale`. They read as `satisfied` if any artifact is
  present.
- Materiality: without step-level input hashes, per-step manifests can't
  be compared across runs. The whole content-addressed system is inert.

**Fix direction:** Compute `hashManifest(...)` once per run, write it into
each attempt row's `input_hash`, and upsert
`engine_project_synthesis_step_state` (`current_input_hash`,
`latest_attempt_id`, `state`, `updated_at`) after each step succeeds.

### P0-2 — All step runners collapse to one monolithic legacy fill

**Location:** `src/lib/roadmap-synthesis/orchestrator.server.ts:107-120`,
`src/lib/roadmap-synthesis/runners/legacy-fill.server.ts`.

**Evidence:** `runners/` contains exactly two files: `legacy-fill.server.ts`
and `materiality-scan.server.ts`. There is no per-step runner. The
orchestrator invokes `runLegacyFill` once if any target is present and
attributes success to all targets:
```ts
await runLegacyFill(...)
ran.push(...targets);
```

**Impact:**
- `ran[]` is a lie at the API boundary — a monolithic fill's success or
  failure is attributed to every requested step.
- The `may_affect_approved_truth` distinction breaks: any target that
  survives the `wantsRebuildAsCandidate` filter gets fed to the same
  monolithic fill, which has its own rules that may or may not honor
  the approved-truth boundary. (The DB trigger P0-1B below is the real
  safety net; if it weren't there, this design would be dangerous.)
- Errors from legacy fill are copied onto every target
  (`for (const id of targets) errors.push({ id, message })`) — noise, and
  it disguises which step actually failed.

**Fix direction:** Lift per-step runners out of the legacy fill
incrementally. Even if only one is real at first, the orchestrator's
attribution must reflect that only that one step ran.

### P0-1B / P0 (positive) — Approved-truth immutability IS enforced

Not a defect; called out because the audit brief demands verification.
The DB trigger `tg_engine_spine_field_truth_provenance` blocks any write
to `status = 'approved_truth'` unless BOTH:

- `updated_by_actor = 'human'` (raises `check_violation` otherwise); and
- one of: a valid ceremony_id whose ceremony matches project+spine and
  is `in_progress`/`completed` AND has a matching decision row; OR a
  full `operator_override` `source_ref` with matching `operator_email`
  and non-empty `reason`.

RT-1 code never sets `updated_by_actor = 'human'` from a server function,
so RT-1 physically cannot mint `approved_truth`. This is the correct
belt-and-suspenders posture even given P0-2.

---

## P1 findings

### P1-1 — `candidatesAwaitingReview` writes nothing to `_candidates`

**Location:** `orchestrator.server.ts:65-73`.

`may_affect_approved_truth` steps in `rebuild_draft` mode are pushed onto
`candidatesAwaitingReview` and `skipped`. No row is inserted into
`engine_project_synthesis_candidates`, so the review UI has nothing to
show. The API return says these steps are "awaiting review" while
`_candidates` is empty.

**Fix direction:** Either insert candidate rows here, or rename the field
and document that RT-1 only surfaces the *intent* to review.

### P1-2 — No concurrency control on `runSynthesis`

Nothing prevents two parallel calls (two operators, or a page reload
firing the mutation twice) from both running the legacy fill and both
inserting attempt rows. `runGroupId` is minted per-call and never
consulted.

**Fix direction:** Use `engine_project_synthesis_step_state.state = 'running'`
as an advisory lock (upsert then check), or add a small locks table with
a TTL.

---

## P2 findings

### P2-1 — Broken `client_name` column reference

**Location:** `runners/materiality-scan.server.ts:83, 90`.

```ts
.select("name, client_name")
```

`engine_projects` has no `client_name` column (verified against
`information_schema.columns`). Supabase returns an error, `projectRow`
is null, and the ternary at line 90 degrades `projectContext` to `""`.
The scan still runs but the LLM classifier receives no project context.

**Fix direction:** Join through `engine_clients.company` via `client_id`,
or drop the column from the select and use only `name`.

### P2-2 — "since" filter never advances if only materiality ran

**Location:** `runners/materiality-scan.server.ts:46-53` and
`orchestrator.server.ts:170-200`.

The scan derives `since` from the newest
`engine_project_synthesis_attempts.started_at`, but the orchestrator only
inserts attempt rows for steps in `ran[]`. A refresh where materiality is
the only non-skipped work writes no attempt row → `since` stays null →
next refresh reclassifies every source. Dedup partial index
`engine_roadmap_amendment_dedup_pending` prevents duplicate candidates,
but every classify pass costs LLM credits.

**Fix direction:** Insert a `materiality_scan` attempt row whether or
not any step ran, keyed by run group, and derive `since` from that.

### P2-3 — Doctrine gate "settled" definition inconsistent

`gates.ts:301-307` counts `stated` as settled for the truth-row path but
requires `status === "approved"` on the sidecar path. A project that
approved World Entry via truth rows and one that approved via the
workspace sidecar can produce different gate readiness for identical
intent.

**Fix direction:** Unify on `approved_truth` (matching the enum and the
provenance trigger's protected status).

---

## Passing checks — evidence

### Registry / DAG (`registry.ts`)
- 11 step definitions, all fields present.
- `validateDag()` implementation is a correct Kahn algorithm; skips gate
  deps (`isDoctrineGateId(dep) continue`) which is right because gates
  are prerequisites, not DAG nodes.
- `topologicalOrder()` returns a deterministic order (Map insertion is
  registry order → sort-stable).
- No cycles or unknown deps in the current 11 definitions
  (verified by hand-tracing dependency lists).

### Manifest / stable hash (`manifest.ts`)
- `canonicalJson` sorts object keys, preserves array order, handles
  primitives via `JSON.stringify`. Deterministic across runtimes.
- `stableHash` is FNV-1a with two 32-bit lanes → hex → 16-char output.
  Not cryptographic (documented), sufficient for content identity.
- `baseManifest` seeds `prompt_version` and `model_policy_version` so
  policy bumps invalidate hashes even without input changes.

### Doctrine gates (`gates.ts`)
- Reads only. No `insert` / `update` anywhere in the file.
- Dual read: `engine_spine_field_truth` first, then falls back to
  `engine_projects.spirit_first_analysis` sidecar for World Entry,
  Execution Boundary, Strategic Thesis (RT-2/RT-3 workspaces).
- Drift gate reads `field_key='overall'` truth row and requires
  `status='pass'` — matches the brief's expectation that RT-6 owns
  writes.

### Milestone qualification (`qualification.ts`)
- `REQUIRED_FIELDS` matches the brief's 12 required attributes.
- `contractComplete` treats empty strings and empty arrays as missing.
- Language gate: blocks `GENERIC_MILESTONE_NAME_BLOCKLIST` (agency
  cliches) and requires ≥1 World Entry vocabulary token. When
  vocabulary is empty, honestly returns `review`.
- Unlock, evidence, ownership, measurement, sequence all deterministic
  and correctly `pass`/`fail`.
- **World & Wow explicitly `review` with note "requires LLM judge
  (RT-4)"** — matches P0 requirement that these not be faked.
- `rollup()`: `fail` > `review` > `pass`. Correct precedence.

### Persistence DDL + RLS (Supabase)
- `engine_project_synthesis_attempts`: PK on `id`, index on
  `(project_id, step_id, started_at DESC)`, FK cascade on project.
  RLS: admin-only insert + select.
- `engine_project_synthesis_step_state`: composite PK on
  `(project_id, step_id)`. RLS: admin-only manage.
- `engine_project_synthesis_candidates`: PK on `id`, index on
  `(project_id, step_id, created_at DESC)`, admin-only manage.
  Unique partial index
  `engine_roadmap_amendment_dedup_pending`
  `(project_id, step_id, (payload->'target'->>'truthId'),
    (payload->'sourceIds'->>0)) WHERE status='pending' AND step_id='roadmap_amendment'`
  matches the RT-5 dedup guarantee.
- All 3 tables were verified against `information_schema.tables` and
  `pg_policies`.

### Approved-truth immutability (DB trigger)
- `tg_engine_spine_field_truth_provenance` on BEFORE INSERT OR UPDATE.
- `SECURITY DEFINER`, search_path pinned to `public`.
- Enforces: `updated_by_actor='human'` for any write to `approved_truth`;
  otherwise raises `check_violation`.
- Ceremony path: `ceremony_id` must resolve to a ceremony matching
  project+spine and be `in_progress` or `completed`, AND a decision row
  matching `field_key` and `new_status='approved_truth'` must exist.
- Operator-override path: `source_ref->>'kind'='operator_override'`
  with matching `operator_email` and non-empty `reason`.

This is the strongest layer of defence for the "no autonomous mutation
of approved truth" doctrine, and it is real.

---

## Canonical scenarios — status

All 12 scenarios in the brief require actual run execution, which
requires an admin auth session. I did not initiate any runs (read-only
pass, per audit charter). Instead I annotated each scenario with the
expected outcome given the code + data as inspected. Two scenarios
(**Scenario 4 — Stale detection**, **Scenario 7 — Idempotent re-run**)
are **predicted to fail** because of P0-1 and P1-2.

| # | Scenario | Predicted outcome | Root cause if fail |
|---|---|---|---|
| 1 | Empty env repair — plan populates, all steps `missing`/`blocked` | PASS | — |
| 2 | Draft env repair — plan reflects existing artifacts | PASS | — |
| 3 | Approved env repair — no rewrite of `approved_truth` | PASS (DB trigger) | — |
| 4 | Source change → refresh marks affected steps `stale` | **FAIL** | P0-1: step_state never written; `stale` branch unreachable. |
| 5 | Rebuild draft on `may_affect_approved_truth` steps writes candidate rows | **FAIL** | P1-1. |
| 6 | Materiality scan writes amendment candidates and dedups | PASS | (partial index verified) |
| 7 | Concurrent refresh coalesces | **FAIL** | P1-2. |
| 8 | Blocked steps report doctrine gate label | PASS | — |
| 9 | Approved truth cannot be minted by AI actor | PASS | DB trigger. |
| 10 | Qualification returns honest `review` for world/wow | PASS | Verified in code. |
| 11 | Plan degrades gracefully when persistence tables missing | PASS | `try/catch` at each load. |
| 12 | Structured activity log written per run | PASS | `insertEngineActivity` call is unconditional. |

---

## Recommended remediation order

1. **P0-1** Persist manifest hash on attempts and upsert step_state.
   Small, self-contained change to `orchestrator.server.ts`; unlocks
   Scenario 4.
2. **P0-2** Split at least `materiality_scan` and `investment_note` into
   real per-step runners (both are self-contained), then remove them
   from the "attributed to legacy fill" pool. This restores honest
   `ran[]` semantics for two steps immediately.
3. **P2-1** Fix `client_name` reference (1 line) — currently silently
   degrading LLM context on every refresh.
4. **P1-2** Add advisory lock via `step_state.state='running'` upsert.
5. **P2-2** Insert a `materiality_scan` attempt row unconditionally so
   `since` advances.
6. **P1-1** Either write candidate rows or rename the return field to
   avoid claiming state that isn't persisted.
7. **P2-3** Unify gate "settled" definition on `approved_truth`.
8. Deferred (RT-4/5): `reviewSynthesisCandidate` full decision matrix.

---

## Files inspected

- `src/lib/roadmap-synthesis/registry.ts`
- `src/lib/roadmap-synthesis/contract.ts`
- `src/lib/roadmap-synthesis/manifest.ts`
- `src/lib/roadmap-synthesis/gates.ts`
- `src/lib/roadmap-synthesis/qualification.ts`
- `src/lib/roadmap-synthesis/capability-menu.ts`
- `src/lib/roadmap-synthesis/plan.server.ts`
- `src/lib/roadmap-synthesis/plan.functions.ts`
- `src/lib/roadmap-synthesis/orchestrator.server.ts`
- `src/lib/roadmap-synthesis/runners/legacy-fill.server.ts`
- `src/lib/roadmap-synthesis/runners/materiality-scan.server.ts`
- Supabase DDL: `engine_project_synthesis_{attempts,candidates,step_state}`,
  `engine_spine_field_truth` + triggers, `pg_policies`.

Read-only audit complete. No files modified, no runs triggered, no DB
mutations issued.
