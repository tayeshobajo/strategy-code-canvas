# Frame Builder v1 — End-to-End QA Plan

Run the full 14-section QA on Frame Builder v1 against Jotaye Ventures — Strategy Sprint (primary), with spot checks on INBDE & ADAT Platform and August 1 — intake. No feature work. Do not build Mockup Builder.

## Approach

Combine three evidence channels:
- **Playwright (headless Chromium)** with the injected admin Supabase session for UI, nav, active state, screenshots (desktop/tablet/mobile), and anon-redirect proof.
- **Direct server-fn invocation** (`stack_modern--invoke-server-function`) for `getProjectFrameBuilder`, `generateProjectFrame`, `saveProjectFrameDraft`, `submitProjectFrameToReview`, `approveProjectFrame`, `archiveProjectFrame` — including cross-project scope refusal and non-admin refusal simulations.
- **psql** for RLS/grants, trigger presence, row-level state (`engine_project_frames`, `engine_review_items`, `engine_activity`, `engine_project_chat_events`), and protected-surface diffs (`client_portal_*`, `roadmap_approvals`, `engine_tasks`, `engine_milestones`).

## Execution steps

1. **Baseline snapshot** — capture row counts + latest timestamps for `engine_project_frames`, `engine_review_items`, `engine_activity`, `engine_project_chat_events`, `client_portal_messages`, `client_portal_roadmaps`, `roadmap_approvals`, `engine_tasks`, `engine_milestones` for the three test projects. Used later to prove protected-surface isolation.

2. **Route + access (§1)** — Playwright: admin loads `/engine/projects/<jotaye>/frame-builder` (screenshot), verify workspace nav "Frame Builder" link + active state, anon session hits route → redirect to `/auth` (screenshot). psql: confirm RLS policies + GRANTs on `engine_project_frames` match the plan (staff-only SELECT via `is_engine_staff()`, no INSERT/UPDATE/DELETE to `authenticated`). Attempt anon + authenticated-non-staff PostgREST insert → expect denial.

3. **Readiness / missing inputs (§2)** — Pick a project with no Point A / goal / milestones (August 1 — intake likely candidate; confirm via psql). Invoke `generateProjectFrame`. Expect `{ ok: false, missing_inputs: [...] }`, no new `engine_project_frames` row. Screenshot UI state.

4. **Generate Frame Set (§3)** — On Jotaye: invoke `generateProjectFrame`. Assert draft row exists, `status='draft'`, `generated_by` in {ai, hybrid}. JSON-schema-validate `payload` against the Zod shape in `engine-frame-builder-prompt.server.ts`: `project_summary`, `frame_goal`, `roles`, `pages[]` (with all 17 required page fields), `flows[]`, `data_objects[]`, `backend_requirements[]`, `permissions[]`, `qa_gates[]`, `open_decisions[]`. Sanity-check pages aren't generic and reference project spine facts.

5. **UI rendering (§4)** — Screenshots at 1440×900, 1024×1366, 390×844 of: full page, Pages/Screens (Must/Should/Later groups), Flows, Data+Backend, QA, Open Decisions, AI PM panel, history. Verify Approve/Archive visibility for admin.

6. **Save draft (§5)** — If `saveProjectFrameDraft` supports edit, mutate a draft field, verify persistence + audit + activity. If UI edit not shipped, mark N/A and just verify generated draft persists across reload.

7. **Submit to Review (§6)** — Click Submit (or invoke fn). Assert: status→`in_review`, exactly one new `engine_review_items` row (`item_type='frame_set'`, `status='pending'`, links to frame), audit + activity events, no `client_portal_*` / `roadmap_approvals` deltas, no duplicate on second click within debounce.

8. **Approve (§7)** — As admin: approve. Assert status=`approved`, `approved_by`/`approved_at` set, audit + activity, NBA on route updates toward Mockup Builder. Simulate non-admin: call `approveProjectFrame` with operator-only session (or by asserting server-side capability check path); expect refusal.

9. **Approved protection (§8)** — Attempt via server fn: overwrite payload, reverse status approved→draft. Attempt PostgREST direct UPDATE as authenticated. All must fail via `enforce_transition` / `preserve_approved` triggers + RLS. Verify archive from approved works only if plan allows and is audited.

10. **Archive (§9)** — Admin archives a draft; non-admin attempt fails.

11. **Project Chat integration (§10)** — Via chat server fn, send the 7 canonical questions; assert answers reference the latest approved frame (page count, must-build count, open decisions). Confirm chat cannot approve/generate mockups/mutate protected surfaces (verify by post-chat protected-surface diff).

12. **Permission / RLS (§11)** — psql matrix: SELECT/INSERT/UPDATE/DELETE attempts as anon, authenticated non-staff, staff. Cross-project scope: call `saveProjectFrameDraft` with mismatched `projectId` vs `frameId`; expect rejection.

13. **Protected-surface regression (§12)** — Diff baseline vs post-QA counts/max(updated_at) on `client_portal_*`, `roadmap_approvals`, `engine_tasks`, `engine_milestones`, investment fields, delivered status. Zero deltas expected except explicitly-created review item + frame rows + audit/activity.

14. **Audit / activity (§13)** — Query `engine_project_chat_events` + `engine_activity` for event kinds: `frame_generated`, `frame_saved` (if applicable), `frame_submitted_to_review`, `frame_approved`, `frame_archived`, `frame_generation_failed` (induce by empty-input call). Grep stored payloads for leaks: system prompt, API keys, chain-of-thought, auth tokens.

15. **Regression (§14)** — Load Spine, Chat, Action Mode panel, Proposals list, NBA endpoint; run `tsgo` typecheck; confirm no console/runtime errors.

## Deliverable

Single report with the 12 result sections + Executive Summary + Screenshots index + Top Fixes + explicit go/no-go recommendation for Mockup Builder v1. Screenshots saved to `/tmp/browser/frame-builder-v1/screenshots/` and referenced by path.

## Technical details

- Playwright script at `/tmp/browser/frame-builder-v1/run.py`, viewport 1280×1800 (plus 1024×1366, 390×844 for responsive shots), restore `LOVABLE_BROWSER_SUPABASE_*` session against `http://localhost:8080`.
- Anon proof: fresh context with no session restoration.
- Non-admin refusal: preferred path is calling the server fn with a session for `qa-operator-lite@trust-tai.com`; if no password is provisioned in this environment, fall back to asserting the capability-check code path + a psql check that operator role lacks admin, and note the limitation in the report.
- All destructive-looking ops are gated (drafts + one approval on a test frame we created), and every side-effect is included in the audit/activity totals.
- No schema changes. No app code edits.
