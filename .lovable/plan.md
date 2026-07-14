## Verification & Cleanup — H1 + H6·B12 + H4

Verify the three applied migrations are complete, evidence is captured, and no direct-writer bypasses remain. No new migrations unless verification proves one is missing.

### 1. Migration presence check
Query `supabase_migrations.schema_migrations` (or equivalent) for the four ids:
- `20260714-175059-742685` (H1)
- `20260714-175310-970763` (H6·B12)
- `20260714-175406-713684` (B12 search_path)
- `20260714-175459-098362` (H4)

If any missing → stop and report before proceeding.

### 2. Doc consistency
- Grep `.orchestrator/PENDING_MIGRATIONS.md` for H1/H4/H6·B12 sections; confirm each is marked APPLIED with the matching id. Fix status lines only if drift is found (no unrelated edits).
- Confirm `.orchestrator/phase-h1-h4-h6b12-apply-output.md` exists and matches (already verified in context).

### 3. Direct-writer audit (B12)
Confirm code fixes present:
- `regenerateMilestoneSection` → `admin_edit_milestone_governed`
- `updateProjectImplementationPlan` → `admin_edit_impl_plan_governed`

Then run:
```
rg -n "engine_milestones" src/ | rg "brief_md|acceptance_criteria|developer_prompt|client_safe_md"
rg -n "engine_project_implementation_plans" src/ | rg "\.update\(|summary|payload"
```
Classify each hit as governed-RPC / non-governed field / read-only. Report any remaining bypass.

### 4. H1 live-fire smoke (QA project)
On a clearly labelled QA project (`[QA] cost-guard smoke <ts>` in name/notes):
- set tiny `monthly_budget_cents` (e.g. 100)
- insert synthetic `engine_agent_costs` row for current month over budget, `actor_email='qa+costguard@trusttai.com'`
- assert: `cost_paused_at IS NOT NULL`, `cost_paused_reason` populated, 1 `engine_review_items` row `item_type='cost_overrun'`, 1 `engine_activity` `project.cost.autopause`
- attempt resume via `/admin/cost-guard` as same email → must fail; retry as different staff email → must succeed and clear columns
- delete synthetic cost row + review item + audit row, or leave with `[QA]` markers per user's choice (default: clean up)

### 5. H4 verification
- `SELECT jobid, jobname, schedule, active, command FROM cron.job WHERE jobid=117 OR jobname='outcome-checkins-daily';`
- Inspect `command` — confirm real publishable key present, not the placeholder.
- Manually run one `net.http_post` matching the cron body; capture request id and poll `net._http_response` for status/body.
- Check `engine_review_items WHERE item_type='outcome_checkin' AND created_at > now() - interval '10 min'`.
- Note: scheduler proof (that pg_cron itself fires) deferred to post-09:00 UTC `cron.job_run_details` check — flagged as PENDING in output doc.

### 6. Repo validation
Run repo-standard checks (lint + typecheck). Report any new errors.

### 7. Update apply-output doc
Append a "Verification 2026-07-14 (post-apply sweep)" section to `.orchestrator/phase-h1-h4-h6b12-apply-output.md` with PASS/PARTIAL/FAIL for each of steps 1–6, including query results, direct-writer audit summary, smoke evidence, and pg_net response.

### 8. Final pending queue report
Summarize which items remain in `PENDING_MIGRATIONS.md` at end. No edits to unrelated sections.

### Deliverables
- Updated `.orchestrator/phase-h1-h4-h6b12-apply-output.md`
- Possible small status-line touch-ups in `PENDING_MIGRATIONS.md` (only if drift found)
- Chat report: per-task PASS/PARTIAL/FAIL, direct-writer audit table, smoke evidence, deferred cron-tick check flagged
