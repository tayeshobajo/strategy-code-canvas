# Project Spine v1 — QA Plan

Verification only. No feature code. Approve to run in build mode.

## Test Projects
Query `engine_projects` to pick IDs for: Jotaye, INBDE, August 1, one fresh intake (status='intake', no version), one approved (has approved `engine_roadmap_versions`). Record IDs in the final report.

## Execution

### A. Data accuracy (SQL, read-only via `supabase--read_query`)
For each project ID, run and cross-check against Spine UI:
- `SELECT name, status, current_step, current_step_num, point_a, point_b, settings, roadmap FROM engine_projects WHERE id=...`
- `SELECT * FROM compute_engine_next_best_action('<id>')`
- `SELECT count(*), status FROM engine_sources WHERE project_id=... GROUP BY status`
- Latest `engine_extraction_runs` row
- Latest `engine_roadmap_versions` (status, label, payload keys)
- `engine_milestones` grouped by phase (count, status)
- `engine_tasks` counts by phase, milestone_id, status, ai_generated
- `engine_review_items` pending count
- Latest 20 `engine_activity`, 10 `operator_notifications`, audit rows
- `client_portal_roadmaps` status for portal-safety gate

Produce mismatch table: field | DB value | Spine UI value | pass/fail.

### B. Route + access (Playwright, headless Chromium)
Using `LOVABLE_BROWSER_SUPABASE_*` session injection:
1. Admin session → `/engine/projects/<id>/spine` loads, pinned nav link visible/active.
2. Operator session (if a distinct role account exists — otherwise note as skipped) → loads.
3. Client-only session (portal user) → blocked/redirected. Confirm no data render.
4. Signed-out → redirect to `/auth`.

If only one session is injectable, verify client/anon paths by driving the browser without restoring the session and by manually clearing role via a temporary test account only if the user already has one; otherwise flag as "session-limited — verified via RLS + route gate code inspection."

### C. Section-by-section visual QA
Screenshot at 1440 desktop and 390 mobile for one representative project (August 1). For each of the 7 sections, capture element screenshot + note:
- Project Direction (NBA live vs SQL)
- Approved Scope (missing keys show "Not yet captured", not fabricated)
- Roadmap Spine (phase grouping, blocked indicator)
- Task Spine (phase+milestone nesting, ai_generated dashed border, acceptance criteria/QA checklist/expected artifact/risks/deps render)
- AI PM Panel (buckets differ across projects — compare Jotaye vs INBDE payloads)
- QA Gates (each row has status pill + reason + next action link)
- Activity & Decisions (deep links resolve)

### D. AI PM panel non-static check
Load Spine for 3 projects, snapshot the panel HTML for each, diff. Fail if identical.

### E. Safety regression
- Grep for Spine payload usage in `src/routes/portal.*` and `src/components/portal/*` — must be zero.
- Confirm `getProjectSpine` requires operator/admin (read function source).
- Confirm no `supporting_notes` / internal task fields flow to any portal server fn (grep `client_portal_*` server fns for the same field names surfaced on Spine).

## Deliverables
Report with: executive summary, pass/fail table per checklist item, mismatch table, screenshots (`/tmp/browser/spine-qa/*.png`, viewed inline), permission findings, stale/static areas, top fixes ranked, remaining gaps. No code changes.

## Out of scope
Building fixes for anything discovered. Findings feed the next slice.
