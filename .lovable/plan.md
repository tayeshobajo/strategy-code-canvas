## QA Factory v1 — End-to-end QA Plan

Mirror the Backend Builder v1 QA harness (`scripts/qa/backend-builder-v1-qa.py` + Playwright + psql) applied to QA Factory v1. No feature code changes — verification only.

### Test targets
- Primary: Jotaye Ventures — Strategy Sprint (has approved backend plan from prior QA)
- Spot: INBDE & ADAT Platform, August 1 — intake

### Harness
Create `scripts/qa/qa-factory-v1-qa.py` — psql + server-fn checks covering:
1. Grants: anon/authenticated revoked writes, authenticated SELECT, service_role ALL on `engine_project_qa_plans`
2. RLS policies + `is_engine_staff()` gate
3. Trigger `trg_engine_project_qa_plans_enforce` (block out-of-approved except archive, block silent payload overwrite when approved, block skipping in_review)
4. Direct PostgREST INSERT/UPDATE/DELETE as anon and authenticated → expect 401/403
5. Cross-project scoping check

Playwright script `/tmp/browser/qa-factory/run.py` (seeded admin session, restore Supabase session from env):
- Route load `/engine/projects/:id/qa-factory` for each target project
- Nav active state + WorkspaceHeader placement after Backend Builder
- Anon redirect proof (fresh context, no session)
- Readiness gating: project without approved backend plan → Generate disabled + explainer text
- Jotaye lifecycle: Generate → inspect draft payload → Save (with poisoned status=passed → expect normalized to not_run) → Submit → Approve → Archive
- Screenshots: desktop full page, Test Matrix + filters, each category section, Go/No-Go, AI PM panel, tablet, mobile
- Approved-plan protection: attempt overwrite via server fn + direct PATCH → expect refusal
- Non-admin operator: approve/archive controls hidden + server fn 403

### Payload schema verification
Read latest generated draft from DB via psql, parse `payload` JSONB, assert every top-level key:
`qa_goal, source_backend_summary, overall_readiness, test_matrix, role_tests, route_tests, data_tests, rls_tests, workflow_tests, ui_state_tests, responsive_tests, integration_tests, audit_tests, regression_tests, edge_cases, blocked_items, evidence_plan, go_no_go_criteria, open_decisions, risks`.

For each `test_matrix` item, assert required fields present and `status == "not_run"`. Assert P0/P1/P2 distribution non-empty. Assert evidence_required non-empty. Assert RLS/role/responsive/audit tests present.

### Project Chat awareness
Drive the chat UI with the 11 listed prompts against Jotaye after approval. Verify context injection returns accurate counts (compare to payload). Verify refusal to mark tests passed / approve / mark delivered.

### Protected surface regression
Snapshot before/after all lifecycle actions:
- `client_portal_*` row counts + updated_at
- `roadmap_approvals`, `roadmap_documents`
- `engine_projects.status` for Jotaye
- `engine_tasks`, `engine_milestones` counts + status distribution
- Approved backend plan / mockup / frame payloads (hash)
Expect zero drift.

### Audit + activity
Query `engine_audit_log` and `engine_activity` for each lifecycle event. Assert events present with expected names (`qa_plan_generated`, `qa_plan_saved`, `qa_plan_submitted_to_review`, `qa_plan_approved`, `qa_plan_archived`). Assert no system prompt / provider key / auth token stored (grep payloads).

### Regression sanity
Load Spine, Project Chat, Frame Builder, Mockup Builder, Backend Builder routes for Jotaye. Screenshot each. Confirm typecheck runs clean vs prior baseline.

### Deliverable
`.lovable/qa-factory-v1-qa-report.md` with all sections requested:
Executive Summary, Route+Access, Readiness, Generate, Payload Schema, Test Status Hard-Lock, UI Rendering, Submit-to-Review, Approve/Protection, Archive, Chat Awareness, Permission/RLS, Protected Surface Regression, Audit/Activity, Screenshots (linked from `/mnt/documents/qa/qa-factory-v1/screenshots/`), Top Fixes, Recommendation (safe / not safe → Implementation Plan v1).

Reproducible harness committed at `scripts/qa/qa-factory-v1-qa.py`.
