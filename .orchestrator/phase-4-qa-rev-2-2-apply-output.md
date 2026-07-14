# Phase 4 QA Fixes Rev 2.2 — Apply Output

**Date:** 2026-07-14
**Status:** APPLIED

## What was already installed (Rev 2.1, 2026-07-13)

- `tg_engine_spine_field_truth_provenance` + `trg_engine_spine_field_truth_provenance` (G1)
- `spine_points_approved` (staff/service-restricted) + `spine_points_ready_summary` (portal-safe) (G1a)
- `tg_engine_roadmap_versions_gate` + `engine_roadmap_versions_gate` (G2)
- `tg_engine_roadmap_versions_no_self_approve` + trigger (G2)
- `tg_engine_projects_gate` + `engine_projects_gate` (G2)
- `has_role_email(...)`
- `supabase/tests/spine-gate-smoke.sql` (G3)

## Rev 2.2 delta applied this turn

Single-purpose follow-up migration: replaced `tg_engine_spine_field_truth_provenance` so the ceremony branch accepts `ceremony.status IN ('in_progress','completed')` instead of only `'completed'`. This closes the deadlock with Phase 2 `recordCeremonyDecision()`, which writes `approved_truth` while the ceremony is still `in_progress`.

The migration also re-ran the Rev 2.2 fail-closed guard using the same predicate as the trigger. Guard passed (0 offending legacy rows), consistent with the enumeration in `.orchestrator/phase-4-qa-rev-2-1-enumeration.md`.

## Verification

- Migration completed successfully.
- Linter warnings surfaced (102) are pre-existing project-wide (public-exec SECURITY DEFINER, mutable search_path) — not introduced by this change.
- Provenance trigger source now reads `ceremony.status NOT IN ('in_progress','completed')` in the reject branch (verified via `pg_proc.prosrc`).

## Follow-ups (unchanged from Rev 2.2 plan)

- **G1b portal caller swap:** `rg` shows the only remaining `spine_points_approved` caller in app code is `src/lib/engine-spine-readiness.functions.ts`, which runs through `requireSupabaseAuth` and is called from the staff Engines UI. No portal-reachable caller exists. Nothing to swap.
- **G1c smoke harness execution role:** run `supabase/tests/spine-gate-smoke.sql` under `service_role` / postgres when Tai wants an end-to-end pass. The harness only exercises trigger paths (INSERT/UPDATE) — no RPC calls — so a plain service_role psql session works. Not run from this sandbox (permissions).

## Phase 4 status

Phase 4 governance gate is now DB-enforced end to end (spine field truth provenance, business engines, roadmap versions, projects). Smoke harness A–M is the remaining verification step before marking Phase 4 COMPLETE — needs to run under service_role.
