# Paired apply: Phase 1 R3 (Truth Model) + Phase 2 (Ceremonies)

Both blocks in `.orchestrator/PENDING_MIGRATIONS.md` share `engine_spine_field_truth` and `epistemic_status`. Applying them in separate migration windows leaves an intermediate state where the truth table exists but ceremonies can't reference it. This plan concatenates them into one migration submission.

## Steps

1. **Combined preflight (read-only)** — run both preflight blocks against the live DB via `supabase--read_query`:
   - Phase 1: `epistemic_status` type absent, `engine_spine_field_truth` absent, no `status/source_ref/superseded_by` on `engine_extracted_signals`, project/point_a/point_b row counts.
   - Phase 2: `is_engine_staff()`, `has_role_email()`, `tg_touch_updated_at()`, `engine_audit_log`, `epistemic_status` (will exist by end of Phase 1 in the same file), plus `POINT_A_BASE_FIELD_KEYS` / `POINT_B_FIELD_KEYS` static list matches TS registry (already fixed).
   - Abort if any check fails; report to Tai.

2. **Assemble a single migration SQL body**, in this exact order (no edits to the SQL beyond concatenation):
   1. Phase 1 R3 Variant B block (enum → signal columns → truth table → GRANTs → RLS → policies → audit trigger → backfill from `engine_projects.point_a/point_b`).
   2. Phase 2 R4 + R4B block (ceremonies + decisions tables → GRANTs → RLS → `internal_spine_field_keys` (with the corrected Point A/B static arrays) → `spine_field_keys` wrapper → `internal_project_has_contradictions` → all `trg_enforce_*` and cascade triggers → `trg_engine_spine_ceremonies_updated` using `public.tg_touch_updated_at()` → Phase 2B invalidation columns/table/triggers).

3. **Submit via `supabase--migration`** with a plain-English description covering: new truth model, ceremony/decision model, invalidation cascade, RLS (staff read; admin/operator write; no delete), audit trail. Wait for Tai's approval — the tool blocks until approved.

4. **Post-apply verification** — run the documented smoke plans:
   - Phase 1 R3 smoke queries → append to `.orchestrator/phase-1-output.md`.
   - Phase 2 22-case smoke (existing `/tmp/browser/phase2-ui-smoke/run.py`) → append results to `.orchestrator/phase-2-output.md`.
   - Run `bunx vitest run src/lib/__tests__/spine-field-keys-drift.test.ts`.
   - Run `supabase--linter`; record any new WARN findings (expected: `SECURITY DEFINER` pattern warnings, same class as existing 45).

5. **Rollback readiness (not executed)** — keep the two documented rollback blocks side-by-side in a scratch file so Tai can reverse in Phase 2 → Phase 1 order if smoke fails.

## Out of scope

- No SQL rewrites beyond concatenation. The two blocks were signed off individually; the paired-apply is a scheduling change, not a design change.
- No app-layer edits in this window — `src/lib/engine-spine-ceremonies.functions.ts` and `engine-spine-invalidation.functions.ts` already exist and match the shipped shape per `.orchestrator/phase-2-output.md`.
- Phase 2B UI (`CeremonyPanel`, stepper badge) — already shipped; nothing to redo.

## Risks

- **Single failure = full rollback.** A trigger error in Phase 2 aborts the whole transaction, including Phase 1 enum/table creation. This is the desired atomicity; call it out to Tai when submitting.
- Backfill volume in Phase 1 is bounded by project count (small); no performance concern.
- Linter WARN noise is expected and pre-existing pattern; not a blocker.
