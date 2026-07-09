# Project Chat Action Proposals v2 — QA Plan

Run a read-only QA pass against Project Chat Action Proposals v2 on Jotaye Ventures (primary) with spot checks on INBDE & ADAT Platform and August 1 — intake. No new features, no schema changes, no mutations beyond what the QA flow explicitly tests (save/dismiss/submit/convert as intended).

## Approach

Extend the existing QA harness (`scripts/qa/project-chat-proposals-qa.py`) rather than starting from scratch, then drive the live preview with Playwright for UI evidence and responsive screenshots. All DB verification uses `psql` (read-only) and the existing server functions via authenticated HTTP.

## Steps

1. **Harness prep**
   - Reuse operator credentials via `QA_SEED_TOKEN` / `QA_SEED_PASSWORD` / managed Supabase session.
   - Resolve project IDs for Jotaye Ventures, INBDE & ADAT Platform, August 1 — intake.
   - Snapshot pre-state counts: `engine_tasks`, `engine_review_items`, `client_portal_messages`, `roadmap_approvals`, `client_portal_roadmaps`, `engine_projects.status`, `engine_project_chat_proposals`, `engine_project_chat_events`.

2. **Section 1 — Proposal generation (A–F)**
   Send the six canonical prompts to `/api/chat` (or the server fn) per project. For each, record: prompt, expected type, actual type, fields present vs required, pass/fail.

3. **Section 2 — Persistence**
   Query `engine_project_chat_proposals` grouped by type/project/thread/status/created_by. Reload chat route via Playwright and confirm cards re-hydrate under the correct assistant message. Cross-project isolation check via direct list call.

4. **Section 3 — UI (Playwright)**
   Capture screenshots per proposal type (desktop 1280, tablet 834, mobile 390). Capture dismissed and saved states. Verify Save/Submit/Convert/Copy/Dismiss visibility rules by role (admin vs operator).

5. **Section 4 — Status transitions**
   Exercise draft→saved, draft→dismissed, saved→submitted_for_review, suggested_task→converted. Attempt invalid transitions (e.g. dismissed→saved) and expect rejection. Verify audit rows.

6. **Section 5 — Submit-to-review**
   Click once, assert exactly one `engine_review_items` row created with `status='pending'`, `source='project_chat'`, no `approved_at`/`approved_by`, no roadmap/portal changes. Double-click guard check.

7. **Section 6 — Convert-to-task**
   As admin: convert, assert one `engine_tasks` row with `status='suggested'`, `ai_generated=true`, chat proposal source ref, all payload fields persisted, proposal status `converted`. As non-admin operator: button hidden and server call rejected.

8. **Section 7 — Protected action refusal**
   Fire the six protected prompts. Assert verbatim refusal sentence. DB before/after diff must be zero for approvals, portal publishes, project status, client messages, task completions, investment changes.

9. **Section 8 — Permission / RLS**
   Direct `select` from anon and client sessions must fail. Cross-project read (project A token reading project B proposal id) must return empty/denied. Server functions must reject cross-project input.

10. **Section 9 — Audit / activity**
    Verify each event kind fired at the right transition. Scan payloads for absence of system prompts, provider keys, hidden reasoning, secrets. Confirm error messages are truncated.

11. **Section 10 — Regression**
    Re-run existing v1 QA script (`project-chat-qa.py`) plus anonymous redirect + nav link checks. Confirm Project Spine loads, no client portal leak.

12. **Report**
    Emit the requested report structure with all sections, screenshot paths under `/tmp/browser/proposals-v2-qa/screenshots/`, top fixes prioritized, and an explicit safe / not-safe recommendation for Action Mode v3.

## Deliverables

- Extended QA script under `scripts/qa/` (read-only + intentional transition writes only).
- Playwright script under `/tmp/browser/proposals-v2-qa/` producing screenshots.
- Markdown report saved to `/mnt/documents/project-chat-proposals-v2-qa.md` and summarized in chat.
- No product code changes.

## Out of scope

- Building Action Mode v3.
- Loosening `engine_tasks` RLS.
- Any schema, RLS, or UI changes beyond QA instrumentation.
