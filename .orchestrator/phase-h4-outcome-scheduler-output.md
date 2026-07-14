# Phase H4 — Outcome Scheduler & Coverage

**Status:** ✅ Complete (app-side). pg_cron schedule proposed in `.orchestrator/PENDING_MIGRATIONS.md`, NOT applied.

## What shipped

- `src/lib/engine-outcome-scheduler.functions.ts`
  - `runOutcomeCheckins({ dryRun })` — staff-gated server fn
  - `internalRunOutcomeCheckins(sb, actor, dryRun)` — shared code path used by the public cron hook
  - `getRecentOutcomeCheckins()` — snapshot for the admin surface
- `src/routes/api/public/hooks/outcome-checkins.ts` — POST hook, verifies `apikey` header against `SUPABASE_PUBLISHABLE_KEY`, calls `supabaseAdmin`
- `src/routes/admin.outcome-scheduler.tsx` — dry-run / run-now / recent-items UI
- Admin nav entry ("Outcome scheduler") in `src/routes/admin.tsx`

## Trigger coverage

| Subject | Windows |
|---|---|
| Delivered project (`engine_projects.completed_at`) | 30d, 60d, 90d |
| Completed milestone (`engine_milestones.status IN complete/completed`) | 14d, 30d |
| Active business engine (`engine_business_engines.status='active'`) | 30d |
| Cost-resumed project (`cost_paused_at IS NULL` + recent `updated_at`) | 7d |

Each finding lands as an `engine_review_items` row (`item_type='outcome_checkin'`, `source='outcome_scheduler'`, `status='pending'`) plus an `engine_activity` audit event (`kind='outcome.checkin.scheduled'`).

## Idempotency

Dedupe key: `(project_id, title)` scoped to open items created in the last 24h. Titles are deterministic and embed the trigger kind + window + subject name.

## Guardrails

- Human review required — every emission is `pending`, never auto-approved.
- Public hook validates the shared `apikey` header inside the handler (no bearer required by design of `/api/public/*`).
- No schema changes applied. pg_cron migration lives in `.orchestrator/PENDING_MIGRATIONS.md`.
