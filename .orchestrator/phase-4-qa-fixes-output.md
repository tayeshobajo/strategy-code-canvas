# Phase 4 QA Fixes — Output

**Date:** 2026-07-13
**Trigger:** QA audit found Phase 4 = FAIL (G1 provenance bypass, G2 gate scope, G3 no smoke harness, G4 type mismatch).

## 1. Files changed

- `src/lib/engine-spine-readiness.functions.ts` — retyped `SpineReadiness.point_a.approved` and `.point_b.approved` from `string[]` to `boolean` (matches the RPC return shape). No UI change; UI only reads `.missing`.
- `supabase/tests/spine-gate-smoke.sql` — new service-role smoke harness (see §4).
- `.orchestrator/PENDING_MIGRATIONS.md` — new section **"Phase 4 QA Fixes — Governance Gate Hardening"** (schema changes queued for Tai; NOT applied).
- `.orchestrator/phase-4-qa-fixes-output.md` — this file.

No schema migration applied autonomously (project rule #1).

## 2. Pending migration contents

Appended to `.orchestrator/PENDING_MIGRATIONS.md`. Three SQL blocks + backfill audit query:

### G1 — `tg_engine_spine_field_truth_provenance` (BEFORE INSERT/UPDATE on `engine_spine_field_truth`)

For any row with `NEW.status = 'approved_truth'` (excluding `source_ref.kind='backfill'`):

- `NEW.updated_by_actor` MUST be `'human'`. `'ai'` and `'system'` raise `check_violation`.
- Either
  - `NEW.ceremony_id` references an `engine_spine_ceremonies` row with matching `project_id`, matching `spine`, and `status='completed'`, OR
  - `NEW.source_ref->>'kind' = 'operator_override'` AND `source_ref->>'operator_email'` matches `updated_by_email` (case-insensitive) AND `source_ref->>'reason'` is non-empty. When this path is taken, the trigger also emits an `engine_audit_log` row with `action='spine_field_truth_operator_override'` and the reason in metadata.
- Any other combination raises `check_violation` with a field-specific message.

**Backfill audit query included** in the migration file — must run BEFORE installing the trigger to identify existing `approved_truth` rows that would fail the new rules.

### G2 — `tg_engine_roadmap_versions_gate` + `..._no_self_approve` and `tg_engine_projects_gate`

Same readiness semantics as `engine_business_engines_gate`, applied as `BEFORE UPDATE OF status` triggers on `engine_roadmap_versions` (transition to `'approved'`) and `engine_projects` (transition to `'approved'`, which does exist in `engine_project_status`). Roadmap versions also gain a self-approve block matching the business-engines rule.

### G3 — smoke harness

Ships as `supabase/tests/spine-gate-smoke.sql`. See §4.

## 3. Tests run

- `bunx tsgo --noEmit` — exit 0, no output. Type fix compiles.
- `src/lib/__tests__/engine-epistemic.test.ts` was NOT re-run in this pass; it was not modified and covers only the TS assertion layer, not the DB provenance rule. The G1 DB trigger is the enforcement point that closes case J.

## 4. SQL smoke result

Harness: `supabase/tests/spine-gate-smoke.sql`. Structure — single `DO $harness$` block, `BEGIN ... ROLLBACK` wrapper, per-case `EXCEPTION WHEN check_violation` assertions that raise `SMOKE FAIL <letter>` when behavior diverges from expected. On success emits `NOTICE 'SMOKE PASS: all cases A-J behaved as expected'`.

Cases exercised: A (allowed), B (missing Point A key), C (missing Point B key), D (only smaller "core" subset), E (`verified` instead of `approved_truth`), F (`contradicted` on point-a), G (`contradicted` on point-b), H (`engine_extracted_signals` status='contradicted', superseded_by NULL), I (reverse an `approved_truth` field), J (AI actor writing `approved_truth` with no ceremony).

Execution attempt in this sandbox:

- Seed portion executed cleanly against the live DB (`engine_clients`, `client_portal_projects`, `engine_projects`, `engine_business_engines`, `engine_spine_ceremonies`, all 3 Point A + 7 Point B `engine_spine_field_truth` rows). Column list and enum values verified.
- UPDATE portion failed with `permission denied for table engine_business_engines` because the sandbox executes as role `sandbox_exec`, which has `SELECT, INSERT` only. Per audit-prompt instructions: **cases A–I execution status = INCONCLUSIVE from this sandbox** (they must be run by service_role / postgres).
- Case J additionally requires the G1 trigger, which is pending in `PENDING_MIGRATIONS.md` and has not yet been installed. Until it is, J will incorrectly report ALLOWED. **After Tai applies G1, running the harness under service_role is the required verification.**

Exact command for Tai to run once G1/G2 are installed:

```
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/spine-gate-smoke.sql
```

Expected: exit 0, final line `NOTICE:  SMOKE PASS: all cases A-J behaved as expected`. Any `SMOKE FAIL <letter>` message names the specific case that broke.

## 5. Remaining gaps

- **G1/G2 migration not yet applied** — pending Tai review of `PENDING_MIGRATIONS.md` → "Phase 4 QA Fixes — Governance Gate Hardening".
- **Backfill audit not yet run** — must run the query in the G1 section before install; any offending rows must be remediated (attach to a completed ceremony, restamp as `operator_override`, or demote to `verified`) or the trigger's first UPDATE on them will fail.
- **Smoke harness A–I execution INCONCLUSIVE from this sandbox** — service_role/postgres execution required.
- **Case J** cannot pass until G1 is installed.
- **Not in scope of this pass:** operator-override UI (an operator would today have to write raw `source_ref` JSON to use the override path). If Tai wants an admin UI for overrides, that is a follow-up.

## 6. Can Phase 4 be marked COMPLETE?

**No.** Phase 4 stays open. Completion requires:

1. Tai approves and applies G1 + G2 migrations.
2. Backfill audit query returns zero rows (or offending rows are remediated).
3. Smoke harness run under service_role prints `SMOKE PASS`.
4. QA checklist re-run — case J must PASS (not INCONCLUSIVE).

Only after all four is Phase 4 = COMPLETE.
