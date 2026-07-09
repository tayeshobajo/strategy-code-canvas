# Implementation Plan v1 — End-to-End QA

Mirror the QA Factory v1 harness pattern. Planning-only verification: no migrations, deployments, or delivery mutations.

## Scope

Verify Implementation Plan v1 consumes approved backend + QA plans, produces schema-valid build sequences, protects approved rows, routes review correctly, informs Project Chat, and never executes anything.

**Test project:** Jotaye Ventures — Strategy Sprint
**Spot checks:** INBDE & ADAT Platform, August 1 intake

## Deliverables

- `.lovable/implementation-plan-v1-qa-report.md` — full report with all 18 sections
- `scripts/qa/implementation-plan-v1-qa.py` — reproducible Playwright + Supabase harness
- `/mnt/documents/qa/implementation-plan-v1/screenshots/` — desktop, tablet, mobile captures per Section 6
- `/mnt/documents/qa/implementation-plan-v1/results.json` — raw check results

## Harness Structure

Single Python script running:

1. **DB baselines** via `supabase--read_query`: snapshot counts + payload hashes for `client_portal_*`, `roadmap_approvals/documents`, `engine_projects.status`, `engine_tasks`, `engine_milestones`, approved backend/QA/mockup/frame payloads.
2. **Route/access** via Playwright with injected Supabase session: admin, operator, anon, client roles against `/engine/projects/:id/implementation-plan`.
3. **Readiness gating**: project without approved backend and/or QA plan → Generate disabled + server refusal.
4. **Generate** on Jotaye → assert draft row, correct FK links, `implementation_plan_generated` audit + activity, planning-only safety re-snapshot diff.
5. **Payload schema validation**: assert every top-level key, every phase field, every build_step field, every developer_prompt field. Check for forbidden phrases ("applied", "deployed", "tests passed").
6. **UI rendering**: capture each section listed + tablet + mobile.
7. **Submit → Approve → Archive** transitions with audit + review_items assertions; test admin vs operator affordance.
8. **Approved-row protection**: direct PostgREST PATCH attempts, downgrades, regenerate-over-approved. Assert hash + updated_at unchanged.
9. **Chat awareness**: post 13 chat questions; assert accurate counts + hard refusals for execute/deploy/approve/deliver requests.
10. **RLS/permissions**: anon/client SELECT + browser-authenticated INSERT/UPDATE/DELETE attempts.
11. **NBA post-approval**: assert recommends Build Execution / OpenClaw Handoff / real blocker; assert project not delivered.
12. **Regenerate-after-approval**: hash + updated_at + title stable on approved row; new draft inserted.
13. **Regression sweep**: load Spine, Chat, Action Mode, Frame, Mockup, Backend, QA Factory routes; assert protected surfaces unchanged; run typecheck.

## Report Sections

Executive Summary → Route + Access → Readiness → Generate → Payload Schema → Planning-Only Safety → UI Rendering → Submit-to-Review → Approve/Protection → Archive → Chat Awareness → Permission/RLS → Protected Surface Regression → Audit/Activity → NBA → Archived Plan Not Active → Regenerate After Approval → Regression → Screenshots → Top Fixes → **Recommendation: SAFE / NOT SAFE to move to Build Execution / OpenClaw Handoff v1**.

## Discipline

No feature code changes unless QA reveals a blocker. If a blocker is found, report it in Top Fixes and pause for user decision before editing.

## Technical Notes

- Reuse patterns from `scripts/qa/qa-factory-v1-qa.py` and `qa-factory-v1-qa-extras.py`.
- Auth via `LOVABLE_BROWSER_SUPABASE_*` injected session.
- Supabase queries via `supabase--read_query` tool (read-only; use direct PostgREST via Playwright for write-attempt negative tests).
- Screenshots at 1280x1800 desktop, 834x1112 tablet, 390x844 mobile.
