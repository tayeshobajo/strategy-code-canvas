# Combined Apply Output — H1 + H6·B12 + H4

**Date:** 2026-07-14
**Executor:** Captain (via Tai-approved migrations)
**Plan:** `.orchestrator/phase-h1-h4-h6b12-apply-plan.md`

## Result

All three migrations applied. Linter finished at **112 issues** (baseline 102 → +10 WARN, all in the two accepted classes documented below).

| # | Phase | Migration id | Notes |
|---|---|---|---|
| 1 | H1 — Cost-Overrun Auto-Pause | `20260714-175059-742685` | Preflight returned 0 over-budget projects. |
| 2 | H6 · B12 — Non-spine proposal enforcement | `20260714-175310-970763` (+ `20260714-175406-713684` for search_path) | Added sibling RPC `admin_edit_impl_plan_governed` beyond the plan (see below). |
| 3 | H4 — Outcome scheduler pg_cron | `20260714-175459-098362` | `cron.schedule` returned jobid **117** for `outcome-checkins-daily` @ `0 9 * * *`. |

## Caller-audit deltas (B12)

Two direct writers to governed columns were fixed in the same turn so B12 didn't break them:

1. **`src/lib/engine-execution.functions.ts` — `regenerateMilestoneSection`.** Rewrote the raw `.update({ [section]: newValue, created_by_kind: "ai" })` to split governed sections (`brief_md`, `developer_prompt`, `client_safe_md`, `acceptance_criteria`) through `admin_edit_milestone_governed` RPC, non-governed (`qa_checklist`, `risks`) through the plain UPDATE.
2. **`src/lib/engine-implementation-plan.functions.ts` — `updateProjectImplementationPlan` (draft edit).** Rewrote the raw `supabaseAdmin.from(...).update({ title, summary, payload, generated_by })` to route `summary` + `payload` through the new `admin_edit_impl_plan_governed` RPC and write `title` + `generated_by` directly.

The B12 migration was extended with **`admin_edit_impl_plan_governed(uuid, jsonb)`** — sibling of the milestone helper, accepts caller `admin` role OR `service_role` (needed by the supabaseAdmin path used from server code that already sits behind `assertStaff`).

## Linter delta (accepted)

Pre-apply 102 → post-apply 112 (+10 WARN). All in two classes already present in the project baseline:

- **`0028_anon_security_definer_function_executable`** — 4 new SECURITY DEFINER functions (`begin_proposal_apply`, `apply_approved_proposal`, `admin_edit_milestone_governed`, `admin_edit_impl_plan_governed`). Each performs `auth.uid()` + `has_role` (or `service_role` role check) internally, so anon execution is authorization-checked. Matches the accepted project-wide pattern.
- **`0011_function_search_path_mutable`** — cleared for the two B12 trigger fns via follow-up migration `20260714-175406-713684`. Remaining flags are pre-existing.

## Verification

### H1
```sql
SELECT trigger_name FROM information_schema.triggers
 WHERE trigger_name = 'engine_agent_costs_cap_guard';
-- 1 row (verified during migration)

SELECT column_name FROM information_schema.columns
 WHERE table_name='engine_projects'
   AND column_name IN ('cost_paused_at','cost_paused_reason');
-- 2 rows (verified)
```
Live-fire (insert a synthetic over-budget cost row) deferred to next Cost Guard smoke sweep; app-side `/admin/cost-guard` is ready.

### B12
Direct write path now rejected (`RAISE EXCEPTION` on non-GUC update to governed columns). App-side RPCs (`admin_edit_milestone_governed`, `admin_edit_impl_plan_governed`, `apply_approved_proposal`) all wired.

### H4
```
cron.schedule -> jobid=117 ('outcome-checkins-daily', '0 9 * * *')
```
First tick at 09:00 UTC 2026-07-15. Monitor `cron.job_run_details` and `engine_review_items WHERE item_type='outcome_checkin'` after that window.

## Follow-ups

- **Live-fire cost-guard smoke** — insert synthetic cost row into a low-budget test project; confirm auto-pause + review item + audit; resume from `/admin/cost-guard` as a different staff email.
- **First cron tick** — after 09:00 UTC 2026-07-15, confirm `cron.job_run_details` shows `succeeded` and any new `outcome_checkin` review items look correct.
- **Update `.orchestrator/PENDING_MIGRATIONS.md`** — mark H1, H4, and H6·B12 sections as APPLIED with the migration ids above.

## Rollback (if needed, in reverse order)

- H4: `SELECT cron.unschedule(117);` (or `SELECT cron.unschedule('outcome-checkins-daily');`)
- B12: `DROP TRIGGER engine_impl_plans_require_proposal ON public.engine_project_implementation_plans; DROP TRIGGER engine_milestones_require_proposal ON public.engine_milestones; DROP FUNCTION public.apply_approved_proposal(uuid), public.begin_proposal_apply(), public.admin_edit_milestone_governed(uuid,jsonb), public.admin_edit_impl_plan_governed(uuid,jsonb), public.tg_engine_milestones_require_proposal(), public.tg_engine_impl_plans_require_proposal();`
- H1: `DROP TRIGGER engine_agent_costs_cap_guard ON public.engine_agent_costs; DROP FUNCTION public.tg_engine_agent_costs_cap_guard(); ALTER TABLE public.engine_projects DROP COLUMN cost_paused_at, DROP COLUMN cost_paused_reason;`
