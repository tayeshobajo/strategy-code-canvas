# Phase 4 QA Audit — Output

**Date:** 2026-07-13
**Scope:** Verify Phase 4 governance gate (Point A / Point B `approved_truth` + contradictions) blocks proposed→approved.

## Verdict

**FAIL** — three gaps found. Phase 4 cannot be marked COMPLETE until the fixes in `PENDING_MIGRATIONS.md → Phase 4 QA Fixes` are applied.

## What passes

- Per-field `approved_truth` model (`engine_spine_field_truth` UNIQUE on `project_id, spine, field_key`).
- Full canonical key sets (`internal_spine_field_keys` hard-codes all 3 Point A and all 7 Point B keys).
- `spine_points_approved(project_id)` returns detailed `{ ready, point_a{required,missing,approved}, point_b{...}, has_active_contradictions }`.
- BEFORE UPDATE trigger `engine_business_engines_gate` re-checks the same rules server-side and raises `check_violation` with the missing-key payload.
- `engine_business_engines_no_self_approve` blocks `approved_by = created_by` when creator is `agent:*`.
- UI (`engine.projects.$projectId.engines.tsx` → `ReadinessBanner`) shows exact missing keys + contradiction message and disables Approve.
- Reversing an `approved_truth` field flips the gate back to `ready=false` and cascades Point B to stale via `cascade_point_a_truth_reversal`.

## What fails

1. **G1 — Provenance bypass.** No DB constraint or trigger requires ceremony provenance for `status='approved_truth'`. AI/system actors can currently write approved truth without a ceremony.
2. **G2 — Gate scoped to `engine_business_engines` only.** `engine_roadmap_versions.status` (which has `approved_by`/`approved_at`) has no equivalent gate. Any future writer to that column bypasses Phase 4.
3. **G3 — No SQL smoke harness.** Cases A–J in the audit prompt are provable by code inspection but not exercised by tests.

## Fixes queued

See `.orchestrator/PENDING_MIGRATIONS.md → Phase 4 QA Fixes — Governance Gate Hardening` for:

- Trigger `tg_engine_spine_field_truth_provenance` (G1).
- Trigger `tg_engine_roadmap_versions_gate` + `..._no_self_approve` (G2).
- `supabase/tests/spine-gate-smoke.sql` fixture (G3).
- Backfill audit query to run BEFORE installing G1.

## App-layer fix applied

- `src/lib/engine-spine-readiness.functions.ts` — `SpineReadiness.point_a.approved` / `point_b.approved` retyped from `string[]` to `boolean` to match the RPC.

## Cases

| Case | Verdict | How proved |
|---|---|---|
| A full approve, no contradictions | PASS (inspection) | Gate + trigger logic |
| B missing 1 Point A key | PASS (inspection) | `a_missing` branch |
| C missing 1 Point B key | PASS (inspection) | `b_missing` branch |
| D only core subset approved | PASS | `internal_spine_field_keys` hard-codes full set |
| E `verified` not `approved_truth` | PASS | `status='approved_truth'` filter |
| F contradicted point-a truth | PASS | `internal_project_has_contradictions` |
| G contradicted point-b truth | PASS | same |
| H contradicted extracted signal | PASS | same |
| I reversed approved_truth | PASS | recomputed on next call |
| J AI writes approved_truth w/o ceremony | **FAIL** | no DB enforcement — G1 fix pending |
| K UI shows missing keys / contradictions | PASS | ReadinessBanner |

Status: **Phase 4 stays open until Tai approves the pending G1/G2/G3 migration bundle.**
