
# Phase 4 QA Audit — Read Only

## 1. Final verdict: **FAIL** (needs revision before Phase 4 can be marked COMPLETE)

The Point A/B approval gate is correctly modeled and correctly wired into the **Business Engines** approval path, and the UI surfaces exactly which fields/contradictions block approval. However there are three material gaps:

- **G1 — Provenance not enforced (requirement #7).** The DB does not require ceremony provenance for `status='approved_truth'` writes. An operator (or any SECURITY DEFINER path acting as one) can insert `approved_truth` with `updated_by_actor='ai'` or `'system'` and `ceremony_id=NULL`, satisfying the gate without a ceremony.
- **G2 — Gate is scoped only to `engine_business_engines`.** The user's stated Phase 4 goal is "engine/roadmap proposal from proposed → approved". No BEFORE UPDATE gate exists on `engine_roadmap_versions.status` (which has an `approved_by`/`approved_at` and a status enum). Today no code flips that column, but the requirement says the **DB layer must enforce this** — so a future writer, RPC, or admin SQL will bypass the gate. Same is true for `engine_projects.status`.
- **G3 — No SQL smoke harness.** Only TS-level epistemic tests exist. Cases A–J from the audit prompt cannot be exercised end-to-end without a service-role SQL test file. Several cases are therefore INCONCLUSIVE.

## 2. Evidence table

| # | Requirement | Verdict | Evidence | Notes |
|---|---|---|---|---|
| 1 | `approved_truth` is per-field, not global | PASS | `engine_spine_field_truth` UNIQUE (`project_id,spine,field_key`); `status` is per-row `epistemic_status` | Correct shape |
| 2 | Gate requires ALL canonical keys (not a subset) | PASS | `internal_spine_field_keys(project,'point-a')` returns `lenses, diagnosis, key_diagnosis`; `'point-b'` returns all 7 canonical keys | Matches spec exactly |
| 3 | verified/stated/inferred/assumed/needs_confirmation/missing/contradicted do NOT satisfy | PASS | Both `spine_points_approved()` and `tg_engine_business_engines_gate()` filter `t.status = 'approved_truth'` only | |
| 4 | Active unresolved contradictions block | PASS | `internal_project_has_contradictions()` checks `engine_extracted_signals.status='contradicted' AND superseded_by IS NULL` + any `engine_spine_field_truth.status='contradicted'`; called from gate trigger | |
| 5 | DB/RPC enforces, not only UI | PARTIAL | `engine_business_engines_gate` BEFORE UPDATE trigger enforces; **no equivalent trigger on `engine_roadmap_versions` or `engine_projects`** | **G2** |
| 6 | UI shows exact missing keys & contradictions | PASS | `getSpineReadiness` → `ReadinessBanner` in `src/routes/engine.projects.$projectId.engines.tsx` renders `point_a.missing`, `point_b.missing`, and contradiction message; approve is disabled when `readiness.ready=false` | |
| 7 | AI/system writes cannot create `approved_truth` without ceremony provenance | **FAIL** | No CHECK, no BEFORE INSERT trigger on `engine_spine_field_truth` enforces `status='approved_truth' → ceremony_id NOT NULL AND updated_by_actor='human'` (or equivalent). Existing constraints only require an email when actor='human'. RLS lets any admin/operator write. `engine-epistemic.test.ts` covers the TS assertion — but that's client-side only. | **G1** |
| 8 | Reversing approved_truth → gate fails again | PASS | `spine_points_approved()` recomputes on read; `cascade_point_a_truth_reversal` also marks Point B stale on reversal | |

### Case-level results

| Case | Expected | Result | Evidence |
|---|---|---|---|
| A | full approve + no contradictions ⇒ allowed | PASS (by construction) | Gate logic returns ready=true, trigger passes |
| B | missing 1 Point A key ⇒ blocked | PASS (by construction) | `a_missing` non-empty raises `check_violation` |
| C | missing 1 Point B key ⇒ blocked | PASS (by construction) | Same, `b_missing` |
| D | only smaller "core" subset ⇒ blocked | PASS | `internal_spine_field_keys` hard-codes full canonical arrays |
| E | key is `verified` but not `approved_truth` ⇒ blocked | PASS | Gate filters status='approved_truth' |
| F | contradiction on Point A ⇒ blocked | PASS | `contradicted` row on point-a satisfies contradiction check |
| G | contradiction on Point B ⇒ blocked | PASS | Same |
| H | contradiction in extracted signals ⇒ blocked | PASS | `engine_extracted_signals` branch of `internal_project_has_contradictions` |
| I | reversed approved_truth ⇒ blocked | PASS | Next call to `spine_points_approved()` returns ready=false |
| J | AI/system tries to write `approved_truth` w/o ceremony ⇒ blocked | **FAIL** | No DB enforcement; RLS + existing constraints permit it |
| K | UI shows missing keys / contradictions | PASS | `ReadinessBanner` shows arrays and contradiction message |

Cases A–I are logically proven by the SQL definitions and the readiness helper; they were not exercised as service-role SQL fixtures because no such harness exists (see G3). Mark A–I **PASS by inspection**, J **FAIL**, K **PASS by inspection of the UI**.

## 3. Commands & findings

- `psql \df spine_points_approved / has_contradictions / activate_business_engine` — all present.
- `pg_get_functiondef spine_points_approved(uuid)` — per-field, canonical arrays, contradiction gate, returns `{ready, point_a{required,missing,approved}, point_b{...}, has_active_contradictions}`. **Project-aware and detail-rich as required.**
- `pg_get_functiondef internal_spine_field_keys(uuid,text)` — hard-codes full canonical Point A and Point B key lists.
- `pg_get_triggerdef engine_business_engines_gate` — BEFORE UPDATE OF status; re-runs the exact same missing-key + contradiction checks and raises `check_violation` with `point_a_missing=…, point_b_missing=…` payload for the UI.
- Trigger `engine_business_engines_no_self_approve` prevents `approved_by = created_by` when creator is `agent:*`.
- `pg_get_functiondef activate_business_engine(uuid,text)` — the RPC does not itself check readiness; enforcement is delegated to the trigger, which is correct.
- `pg_trigger` on `engine_roadmap_versions` — only `touch` + `recompute_state_versions`. **No gate.**
- `pg_trigger` on `engine_projects` — only `touch`. **No gate.**
- `pg_get_functiondef tg_engine_spine_field_truth_audit()` — audit only; no ceremony/provenance enforcement.
- Constraints on `engine_spine_field_truth`: `human_needs_email`, `spine_check`, `updated_by_actor_check`. **None require ceremony_id for `status='approved_truth'`.**
- Tests: `src/lib/__tests__/engine-epistemic.test.ts` covers `approved_truth` requiring ceremony_id / operator override at the TS assertion layer only. No DB-level test.

## 4. Gaps / bypasses

1. **G1 — Provenance bypass on `approved_truth` writes.**
   - Missing enforcement: for `NEW.status='approved_truth'`, require either
     - `NEW.ceremony_id IS NOT NULL` AND the referenced ceremony is `completed` for the same project, OR
     - `NEW.updated_by_actor='human'` AND the row was written by an authenticated staff email through an operator-override RPC that stamps `source_ref.kind='operator_override'`.
   - Without this, any operator (or a SECURITY DEFINER path) can flip `status='approved_truth'` with `updated_by_actor='ai'|'system'`, no ceremony, and immediately satisfy the gate.
2. **G2 — Gate not installed on other approval surfaces.**
   - `engine_roadmap_versions` has `approved_by`, `approved_at`, and a status enum but no equivalent BEFORE UPDATE trigger.
   - `engine_projects.status` is unguarded.
   - If Phase 4's intent is "no proposal → approved without the gate", these must carry the same gate as `engine_business_engines`.
3. **G3 — No SQL smoke harness.** Cases A–I are provable by code inspection but should be exercised as SQL fixtures (service-role setup, sample project, then attempt UPDATE and expect the specific exceptions). Without it, regressions in the trigger body will not be caught in CI.
4. **Minor — type/data mismatch.** `SpineReadiness.point_a.approved` is typed `string[]` but the RPC returns a boolean for that field. UI doesn't read `approved`, so no runtime break, but the type should be `boolean`.

## 5. Recommendation

**Do NOT mark Phase 4 complete.** Required to close:

1. Add a BEFORE INSERT/UPDATE trigger on `engine_spine_field_truth` that enforces provenance for `approved_truth` (ceremony_id from a completed ceremony OR explicit operator override with human email + `source_ref.kind='operator_override'`), and block `updated_by_actor IN ('ai','system')` from producing `approved_truth`.
2. Install the same `engine_business_engines_gate` semantics on `engine_roadmap_versions` (and on `engine_projects.status` transitions if that path is expected to move to approved).
3. Add a SQL smoke harness (a `.sql` file under `supabase/tests/` or a `pgtap`-style fixture) that seeds a project, walks cases A–J, and asserts either success or the specific `check_violation` payload.
4. Fix the `SpineReadiness.point_a.approved / point_b.approved` type to `boolean`.

All four are DB-schema-touching (per project rules #1 they go to `.orchestrator/PENDING_MIGRATIONS.md` for Tai, not applied autonomously) except item 4 which is a client-side type fix.

Say **"apply fixes"** to have me draft the pending-migration entries and the type fix as the next build; say **"phase 4 stays open"** to record the audit and continue with a different phase.
