## Action Mode v3 End-to-End QA Plan

Execute a full QA pass against the Jotaye Ventures — Strategy Sprint project, combining DB-level verification (psql), server-function invocation, and Playwright-driven UI checks with screenshots. No feature code changes.

### Approach

Three layers running in sequence:

1. **DB + schema layer** (psql via existing `PG*` env): grants, RLS, column defaults, trigger presence, before/after row counts for `engine_project_artifacts`, `engine_tasks`, `engine_review_items`, `client_portal_*`, `roadmap_approvals`, `engine_project_chat_events`, `client_portal_activity`.
2. **Server-function layer**: exercise `executeChatAction`, `setActionModeEnabled`, `getChatCapabilities`, and cross-project rejection paths via `stack_modern--invoke-server-function` with an admin session; verify capability gating for non-admin.
3. **UI layer** (Playwright, headless Chromium, admin Supabase session injected): navigate `/engine/projects/:projectId/chat`, screenshot the Action Mode panel (off/on), a disabled proposal action with tooltip, one full proposal→confirm→success flow per artifact type, Submit to Review, Convert to Task, protected-action refusal responses. Screenshots under `/tmp/browser/action-mode-v3/screenshots/`.

### Test matrix

| # | Section | Method | Evidence |
|---|---|---|---|
| 1 | Default-off | psql + UI screenshot | column default, disabled buttons |
| 2 | Enable toggle | UI click + psql | column flip, audit + activity row |
| 3-7 | Artifact actions (impl prompt, QA checklist, clarification, milestone brief, decision note) | UI chat prompt → confirm dialog → psql row check | artifact row, audit, activity, no portal writes |
| 8 | Submit to Review | UI + psql | review_item pending, proposal submitted_for_review |
| 9 | Convert to Task (admin + non-admin) | UI + server-fn call | engine_task suggested, capability gate |
| 10 | Disable toggle | UI + psql | column flip, disabled audit |
| 11 | Protected refusals (6 prompts) | UI chat + before/after DB snapshot | refusal text present, zero mutation deltas |
| 12 | Permission/RLS | `has_table_privilege` + anon fetch attempt + cross-project fn call | grants match spec |
| 13 | Audit/activity taxonomy | psql aggregate | all event_type values present, no secrets in payload |
| 14 | Regression | UI: normal chat message, proposal card still renders; `bun run build:dev` typecheck | build passes |

### Deliverables

Report with the exact sections the user asked for (Executive Summary through Recommendation), inline screenshots, and a go/no-go recommendation for Frame Builder v1.

### Assumptions

- Test project id resolved by name `Jotaye Ventures — Strategy Sprint`; falls back to `Jotaye Ventures` if not found.
- Admin session available via `LOVABLE_BROWSER_SUPABASE_*` env (auth status `injected`); if `signed_out`, I'll stop and ask for sign-in.
- A non-admin operator test user for section 9's negative case is best-effort — if none available, I'll verify the capability gate via server-fn call with the admin session stripped of the role rather than a second browser identity, and flag it.
- No new migrations, no code edits; only QA scripts under `scripts/qa/` and screenshots.
