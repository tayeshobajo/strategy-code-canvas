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

---

## Verification 2026-07-14 (post-apply sweep)

| # | Check | Result |
|---|---|---|
| 1 | Four migration ids present in DB (H1/B12/B12-searchpath/H4) | **PASS** — migration files exist under `supabase/migrations/`, and the trigger/functions/columns/cron-job they create are all live (queried directly). Cannot read `supabase_migrations.schema_migrations` from managed DB access, so verified by object presence instead. |
| 2 | `PENDING_MIGRATIONS.md` marks H1/H4/H6·B12 APPLIED with correct ids | **PASS** — grep confirmed lines 4078 (H1 → `20260714-175059-742685`), 4222 (H4 → `20260714-175459-098362`), 4266 (H6·B12 → `20260714-175310-970763` + `20260714-175406-713684`). No edits needed. |
| 3 | This apply-output doc exists and matches | **PASS** |
| 4 | B12 direct-writer audit | **PASS** — `regenerateMilestoneSection` (`engine-execution.functions.ts:176, 1422`) and `updateProjectImplementationPlan` (`engine-implementation-plan.functions.ts:1075`) both call the governed RPCs. Remaining `.update()` calls on `engine_milestones` (`engine-execution.functions.ts:1428` writes `created_by_kind` only; `engine.functions.ts:1563-1564` swap `sort_index`) touch only non-governed columns. Zero direct `.update()` on `engine_project_implementation_plans`. |
| 5a | H1 live-fire smoke (auto-pause) | **PASS after hotfix** — first attempt exposed a defect: original H1 trigger inserted `now()::text` into `engine_audit_log.new_value` (jsonb), so every trigger fire raised `42804` and the cost insert was rolled back. Hotfix migration `20260714-185205-901446` replaced the function body with `to_jsonb(v_now)` (and `'null'::jsonb` for `old_value`). Retry: QA project `a4dd8688-…` (budget $1.00) received a $5.00 cost row and auto-paused (`cost_paused_at=2026-07-14 18:52:21+00`, `cost_paused_reason='Month-to-date spend $5.00 exceeded budget $1.00'`) + 1 review item (`cost_overrun`, `high`, `pending`) + 1 audit row (`project.cost.autopause`, `system:cost_guard`, jsonb value written correctly). |
| 5b | Resume path enforces separate-approver | **PASS (code-verified)** — `resumeProjectAfterCostReview` (`engine-cost-guard.functions.ts:190-225`) requires `approverEmail === signed-in staffEmail`, then rejects if that email matches the last cost row's `actor_email`. DB-side end-to-end test skipped (would need two authed sessions); logic covered by code inspection. |
| 5c | QA data cleaned up | **PASS** — cost row, review item, audit rows, project, and client all deleted. |
| 6a | H4 cron registration | **PASS** — `cron.job` row: `jobid=117`, `jobname='outcome-checkins-daily'`, `schedule='0 9 * * *'`, `active=true`. `command` includes the real publishable key (`sb_publishable_mF24_…`), not the placeholder. |
| 6b | H4 hook smoke (manual `net.http_post`) | **PASS** — request id `595`, `status_code=200`, response `{"ok":true,"ranAt":"2026-07-14T18:53:31.962Z","summary":{"emitted":0,"deduped":0},"scanned":{"deliveredProjects":0,"completedMilestones":0,"activeEngines":0,"costResumedProjects":16}}`. No new `outcome_checkin` review items in the last 10 min (nothing eligible today — expected). |
| 6c | pg_cron scheduler proof | **PENDING** — deferred to post 09:00 UTC 2026-07-15. After that tick, query `cron.job_run_details WHERE jobid=117 ORDER BY start_time DESC LIMIT 5`. |
| 7 | Typecheck (`bunx tsgo --noEmit`) | **PASS** — no errors. |

### Hotfix migration applied this sweep

- **`20260714-185205-901446` — H1 trigger jsonb cast fix** (defect discovered during step 5). Function body only; no schema change. Linter baseline held steady at 112 issues.

### Direct-writer audit table

| Location | Column(s) touched | Verdict |
|---|---|---|
| `engine-execution.functions.ts:176` | `admin_edit_milestone_governed` RPC | governed path ✅ |
| `engine-execution.functions.ts:1422` | `admin_edit_milestone_governed` RPC | governed path ✅ |
| `engine-execution.functions.ts:1428` | `created_by_kind` (non-governed) | direct update OK ✅ |
| `engine.functions.ts:1563-1564` | `sort_index` (non-governed) | direct update OK ✅ |
| `engine-implementation-plan.functions.ts:1075` | `admin_edit_impl_plan_governed` RPC | governed path ✅ |

### Final pending queue status (H1/H4/H6·B12 scope only)

- **H1** — closed. Trigger hotfix `20260714-185205-901446` merged same-day; no follow-ups.
- **H4** — closed pending the natural 09:00 UTC scheduler tick check (step 6c).
- **H6·B12** — closed. All direct-writer paths audited.

Unrelated items in `PENDING_MIGRATIONS.md` (Phase H1.b notifications trigger, Top-10 Gap Sweep P1 governance gate, other historical proposals) are outside this sweep and untouched.

