# Pipeline Retry Fix — Subagent Output

**Date:** 2026-07-10  
**Task:** Fix NBA retry href + watchdog timeout  
**Status:** ✅ COMPLETE

---

## Fix 1 — NBA "Retry" link now points to Intelligence Layer

### Problem
The `compute_engine_next_best_action` function returned an href of `/engine/projects/{id}/intake` when an extraction run had failed. The intake page has no "Run pipeline" button, so operators clicking "Retry the failed extraction run" landed at a dead end with no way to actually trigger a retry.

### Root cause
In both existing versions of the NBA function:
- `20260708213524_9ab40452-11f0-4548-b404-9bdbb1693fa8.sql`
- `20260710100000_nba_build_qa_coverage.sql`

The failed-run branch returned `/intake`:
```sql
('/engine/projects/' || _project_id || '/intake')::text
```

### Fix
**Migration:** `supabase/migrations/20260710110000_nba_retry_href_fix.sql`

Changed the failed-run branch href from `/intake` to `/intelligence-layer`:
```sql
-- BEFORE
('/engine/projects/' || _project_id || '/intake')::text

-- AFTER
('/engine/projects/' || _project_id || '/intelligence-layer')::text
```

Also updated the "Investigate stalled extraction run" branch href from `/intake` to `/intelligence-layer` for consistency — both actions require the operator to be on the Intelligence Layer page where the `runPipeline` button lives.

The migration is a full `CREATE OR REPLACE FUNCTION` preserving all branches from the latest version of the function (including the Build Execution, OpenClaw, QA Evidence, and Delivery Readiness branches added in `20260710100000`).

---

## Fix 2 — Watchdog timeout increased from 10 to 20 minutes

### Problem
The `engine_extraction_watchdog()` function killed any extraction run that had been in `running` state for more than 10 minutes, marking it `failed` and resetting all linked sources. The Gemini+Claude hybrid pipeline can legitimately take longer than 10 minutes on multi-source projects, causing the watchdog to prematurely terminate valid runs.

### Root cause
In `20260708174603_017bfb5d-c8e2-49a3-8170-1e56d9f2e9dc.sql`:
```sql
AND started_at < now() - interval '10 minutes'
```
And the error messages also referenced "10-minute timeout".

### Fix
**Migration:** `supabase/migrations/20260710110100_watchdog_timeout_increase.sql`

Changed both the query threshold and all error messages from 10 minutes to 20 minutes:
```sql
-- BEFORE
AND started_at < now() - interval '10 minutes'
-- error: 'Watchdog: run exceeded 10-minute timeout without completion.'
-- activity body: format('...exceeded 10 minutes...')

-- AFTER
AND started_at < now() - interval '20 minutes'
-- error: 'Watchdog: run exceeded 20-minute timeout without completion.'
-- activity body: format('...exceeded 20 minutes...')
```

The cron schedule (`*/5 * * * *`), REVOKE/GRANT permissions, and all other logic are preserved verbatim from the original migration.

---

## Files Created
| File | Purpose |
|---|---|
| `supabase/migrations/20260710110000_nba_retry_href_fix.sql` | Fix 1: NBA retry href → intelligence-layer |
| `supabase/migrations/20260710110100_watchdog_timeout_increase.sql` | Fix 2: Watchdog timeout 10 min → 20 min |

## Files Modified
_None._ Existing migrations were not touched.

## Deployment
Apply both migrations to Supabase in order:
```bash
supabase db push
```
Or apply directly to the remote DB via the Supabase dashboard SQL editor.

---

## Verification Steps
1. **NBA fix:** Create a project with a `failed` extraction run. Call `SELECT * FROM compute_engine_next_best_action('<project_id>')`. Confirm the returned `href` contains `/intelligence-layer` not `/intake`.
2. **Watchdog fix:** Confirm `engine_extraction_watchdog()` function body now references `interval '20 minutes'` via `SELECT prosrc FROM pg_proc WHERE proname = 'engine_extraction_watchdog'`.
