# Backend Builder v1 — End-to-End QA Plan

Run a full read-only QA sweep against Backend Builder v1 on the seeded admin session. No feature code changes; only a QA script + report.

## Scope

- Primary project: **Jotaye Ventures — Strategy Sprint**
- Spot-check: **INBDE & ADAT Platform**, **August 1 — intake**
- Do NOT build QA Factory. Do NOT modify Backend Builder code unless a blocking bug is found (then stop and report before fixing).

## Approach

1. **DB baseline snapshot** via `psql` (read-only) — capture pre-state counts for protected surfaces so post-QA diff proves planning-only safety:
   - `client_portal_*`, `roadmap_approvals`, `roadmap_documents`, `engine_tasks`, `engine_milestones`, `engine_projects.status/investment_confirmed_at`, migration file list, `engine_project_backend_plans` row count.

2. **Grants / RLS probe** (SQL): confirm `anon` has no privs, `authenticated` SELECT only, `service_role` ALL; confirm RLS policies + approved-plan protection trigger on `engine_project_backend_plans`.

3. **Playwright QA script** at `scripts/qa/backend-builder-v1-qa.py` (mirrors `mockup-builder-v1-qa.py` shape) using the seeded admin session env vars:
   - Route + access: load `/engine/projects/:projectId/backend-builder` as admin; capture screenshots; test anon redirect in a clean context.
   - Readiness: visit a project with no approved mockup → assert Generate disabled + guidance copy; assert server refusal (invoke server fn directly via page fetch).
   - Generate: click Generate on Jotaye → assert new draft row, `mockup_id`/`frame_id` linkage, audit + activity written.
   - Payload schema: fetch the plan via server fn, validate every required top-level key + nested keys (data_model.tables[].{name,purpose,fields[].{name,type,required,notes},relationships,indexes,rls_rules,audit_requirements}, server_functions[], permissions[], integrations[], workflows[], qa_plan.{role_tests,...}, implementation_sequence, open_decisions, risks). Fail on generic/empty sections.
   - Submit → in_review: assert exactly one `engine_review_items` row with `item_type='backend_plan'`, `status='pending'`; assert audit event.
   - Approve (admin): assert status/approved_by/approved_at, audit + activity, Next Best Action shift.
   - Protection: attempt PostgREST PATCH from authenticated browser client (via `page.evaluate` + supabase client) on approved row → assert failure; attempt regeneration → assert new draft, approved untouched.
   - Archive: admin archive a draft, assert status + audit; non-admin path skipped if no non-admin seed.
   - Project Chat awareness: send the 8 prompts; assert answers cite table/function/permission counts matching payload; assert chat refuses to apply migrations or approve.
   - UI capture: desktop + tablet (1024) + mobile (390) screenshots for each section listed in step 6.

4. **Planning-only safety diff**: re-snapshot protected surfaces post-QA; diff against baseline; fail if anything except `engine_project_backend_plans`, `engine_audit_log`, `engine_activity`, `engine_review_items` changed.

5. **Regression smoke**: hit Spine, Chat, Frame Builder, Mockup Builder routes; assert 200 + no console errors.

6. **Report** in `.lovable/backend-builder-v1-qa-report.md` with all 16 sections from the request + screenshots index + Top Fixes + safe/not-safe recommendation for QA Factory v1.

## Deliverables

- `scripts/qa/backend-builder-v1-qa.py` (new)
- `/tmp/browser/backend-builder-v1/screenshots/*.png`
- `.lovable/backend-builder-v1-qa-report.md`
- Chat reply with the full report inline

## Non-goals

- No Backend Builder code changes.
- No QA Factory work.
- No migrations (except if a blocking security finding is confirmed — stop and ask first).
