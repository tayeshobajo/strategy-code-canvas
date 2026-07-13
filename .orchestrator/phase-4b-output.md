# Phase 4B Output — Multi-Solution Decomposition + Business Engines + Command Center (app layer)

**Status:** ✅ COMPLETE (application layer + RPCs + scheduler)
**Committed:** 2026-07-13

## What landed

### SECURITY DEFINER RPCs (migration applied)
- `propose_milestone_solution(_milestone_id, _payload)` → inserts candidate, audit-logged.
- `select_milestone_solution(_solution_id, _reason)` → promotes to `selected` (existing trigger auto-supersedes prior selection); rejects AI self-approval.
- `activate_business_engine(_engine_id, _owner_email)` → approves + activates; hits Phase 4 governance gate (Point A + Point B canonical minimums, active-contradiction hard block); computes `next_run_at` from cadence.
- `record_engine_run(...)` → idempotent on `(engine_id, cycle_key)`; updates last/next run; the seal trigger keeps completed runs immutable.
- `open_engine_exception(...)` / `resolve_engine_exception(...)`.
- `get_command_center_exceptions(_limit)` → ranked feed (severity → client_risk → urgency → deadline → impact).
- Helper: `internal_caller_email()`, `internal_engine_next_run(cadence, from)`.
- All EXECUTE revoked from PUBLIC, granted to `authenticated` + `service_role`.

### Server functions (`createServerFn` + `requireSupabaseAuth`)
- `src/lib/engine-solutions.functions.ts` — propose / select / listForMilestone / listForProject.
- `src/lib/engine-business-engines.functions.ts` — list / create / activate / pause / listEngineRuns / recordEngineRun.
- `src/lib/engine-command-center.functions.ts` — getCommandCenterExceptions / openEngineException / resolveEngineException.
- `src/lib/engine-spine-readiness.functions.ts` — thin wrapper over `spine_points_approved`.

### Routes
- `src/routes/admin.command-center.tsx` — cross-project exception feed, ranked, resolve inline, auto-refresh every 30s.
- `src/routes/engine.projects.$projectId.engines.tsx` — per-project engines page: create, activate (blocked by readiness banner listing missing Point A/B keys and active contradictions), pause, run-history drawer.
- `src/routes/engine.projects.$projectId.solutions.tsx` — solutions board grouped by milestone with propose + select actions.
- Admin nav updated to surface **Command Center** at the top.

### Scheduler
- `src/routes/api/public/hooks/engine-tick.ts` — apikey-gated POST endpoint; iterates `engine_business_engines` where `status='active' AND next_run_at<=now()`; for each records a `record_engine_run(status='awaiting_approval')` row (idempotent on cycle_key) and, when `approval_rules.require_human`, opens a `medium` Command Center exception with the owner as next-action owner.
- pg_cron job `engine-tick-every-5min` scheduled via `supabase--insert` (not migration) to `project--b3555ed3-b0dc-4def-8fee-77ff34a2cb82.lovable.app/api/public/hooks/engine-tick`, with the project publishable key in the `apikey` header.

## Governance boundary held
- Engines never write to the portal directly. Portal publish still flows through `publish_portal_roadmap`.
- Engines cannot approve themselves (`agent:%` self-approve blocked by trigger); admin activation goes through `activate_business_engine` which hits the spine + contradiction gate.
- Completed/failed/skipped runs are sealed by the existing update trigger.

## Not in this phase
- Portal-visible engine output (client sees only approved roadmap versions).
- Full openclaw wiring — scheduler records `awaiting_approval` rows and stops there; automated cycle execution comes later.
- Milestone-brief drill-in for solutions (route exists; linking from milestone brief is a follow-up).
- Smoke suite S1–S6 automated harness (RPCs available for manual verification; suite to be added as a follow-up).
