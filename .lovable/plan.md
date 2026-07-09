## QA Factory v1 — Extended QA (3 additional checks)

Re-run the existing QA Factory v1 end-to-end harness on Jotaye Ventures (with spot checks on INBDE and August 1), and extend it with three new assertions. No feature code changes unless a blocker is uncovered.

### New checks to add to `scripts/qa/qa-factory-v1-qa.py`

**1. Next Best Action after QA approval**
After the `qa_plan_approved` step in the Jotaye lifecycle:
- Call `SELECT * FROM compute_engine_next_best_action(:jotaye_project_id)` via psql.
- Assert `action` recommends Implementation Plan / Build Execution / next build layer (regex: `implementation|build|execute|next.*build`), not "Publish", "Deliver", or "Nothing waiting".
- Assert `engine_projects.status` for Jotaye is NOT `delivered` and NOT `in_execution`.
- Snapshot `client_portal_roadmaps` (status, updated_at) and `client_portal_projects.last_client_activity_at` before and after approval — assert zero diff.

**2. Archived plan is not treated as active**
After the `qa_plan_archived` step:
- Invoke `getProjectQaFactory` server fn (via `stack_modern--invoke-server-function` with seeded admin session) for Jotaye.
- Assert archived plan appears in the returned `history` array.
- Assert the returned `active` / `current` / `latest` plan field is NOT the archived plan id (either null or a different non-archived row).
- Inspect `engine-chat-context.server.ts` runtime output: call chat-context server fn and assert `qa_plan.status` is not `archived` and `qa_plan.latest_id` is not the archived plan id. If no non-archived plan exists, assert the context reports no active QA plan (readiness flags false).

**3. New generation after approval creates a new draft (no overwrite)**
After archiving the first approved plan is complete, first re-approve a second plan for a cleaner test — OR before archiving, capture the approved plan and:
- Compute a stable hash of the approved plan's `payload` JSONB (`md5(payload::text)`) and record `updated_at`, `title`, `status`.
- Call `generateProjectQaPlan` again via server fn.
- Assert a new row is inserted with `status = 'draft'` and a distinct `id`.
- Re-read the previously-approved row: assert `status = 'approved'`, `payload` hash unchanged, `updated_at` unchanged, `title` unchanged.
- Assert `SELECT count(*) FROM engine_project_qa_plans WHERE project_id = :jotaye` reflects both rows (approved + new draft) plus any prior rows.
- Assert `getProjectQaFactory` history contains both.

Sequence the lifecycle so check 3 runs BEFORE archive (so the approved plan is the protected target), then archive, then run check 2.

### Report additions to `.lovable/qa-factory-v1-qa-report.md`

Add three new sections under numbered headings:
- **16. Next Best Action After Approval** — table with action recommended, project status, portal diff.
- **17. Archived Plan Not Treated as Active** — table with active-plan id, history includes archived, chat context snapshot.
- **18. Regenerate After Approval — No Overwrite** — table with approved payload hash before/after, new draft id, history row count.

Update the Executive Summary and final Recommendation line (SAFE or NOT SAFE) based on outcomes.

### Deliverables
- Updated `scripts/qa/qa-factory-v1-qa.py` (reproducible)
- Updated `.lovable/qa-factory-v1-qa-report.md` with sections 16–18 + refreshed recommendation
- New screenshots (if UI evidence produced) under `/mnt/documents/qa/qa-factory-v1/screenshots/` (e.g. `10_nba_after_approval.png`, `11_history_after_archive.png`, `12_regenerate_new_draft.png`)

### Not in scope
No migrations, no server-fn changes, no UI changes unless a check fails and reveals a real blocker — in which case stop and report before fixing.
