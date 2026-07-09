# Project Chat / Intelligence Layer v1 — QA Plan

No feature work. This plan runs a structured verification pass and produces a report. Fixes are only proposed at the end (as recommendations), not implemented in this plan.

## Test Targets

- Jotaye Ventures — `bbbbbbb1-0000-4000-8000-000000000002`
- INBDE & ADAT Platform — resolve id from `engine_projects` by name
- August 1 intake — resolve id from `engine_projects` / `intake_submissions`
- Seeded Spine proof project — resolve if present

Preflight: query `engine_projects` for ids + status/current_step and confirm each has spine data (milestones/tasks/reviews/activity) so answers are meaningful.

## Approach

Reuse the existing seeded auth harness (`scripts/qa/spine-auth-screenshots.py` pattern):
- operator session (`qa-operator`) for the happy path
- unauthenticated context for anonymous denial
- a client-role seeded user for client-denial check (create ephemerally via admin API if none exists)

Drive the UI with Playwright for UI/screenshot checks; drive server functions directly via `stack_modern--invoke-server-function` + `supabase--read_query` for permission/RLS/persistence/no-mutation checks. This is faster and more reliable than typing every prompt in the browser.

## Sections (mirrors the request)

1. **Route & Access** — GET `/engine/projects/:id/chat` as operator (expect 200 render), anon (expect redirect to `/auth`), client role (expect forbidden). Confirm nav link. Invoke `listChatThreads` / `askProjectIntelligence` as anon + client and expect Unauthorized. Attempt to read another operator's thread via crafted `threadId` to confirm RLS + server fn scoping.
2. **Thread & Message Persistence** — For each project: create thread → send 2 prompts → reload → reopen; assert row counts in `engine_project_chat_threads` / `engine_project_chat_messages`, correct `project_id` scoping, ordering by `created_at`, no cross-project bleed (query project A messages while viewing project B).
3. **Core Intelligence Answers (A–I)** — Run all 9 prompts per project via `askProjectIntelligence`. For each response, capture: summary, sections, citations, missing[], suggested_links. Cross-check each claim against a direct SQL snapshot of `engine_projects`, `engine_tasks`, `engine_milestones`, `engine_review_items`, `engine_activity`, and `compute_engine_next_best_action`. Flag any unsupported claim.
4. **Refusal & Uncertainty** — Send the 6 adversarial prompts. Grade: refused / hallucinated / leaked prompt / suggested capture surface. Any hallucination = fail.
5. **No-Mutation** — Snapshot `engine_projects`, `engine_tasks`, `engine_review_items`, `engine_activity`, `client_portal_*`, `roadmap_approvals` before the 6 mutation-style prompts; snapshot after; diff must be empty (aside from new chat rows + optional activity log entry). Any drift = P0.
6. **Data Grounding** — For each answer from section 3, tag citations to allowed sources. Fail on ungrounded facts, cross-project confusion, or stale NBA after a forced `recompute` call.
7. **UI / AnswerCard** — Playwright: verify AnswerCard structure, suggested link routing (click → land on `/engine/projects/:id/...`), context panel numbers vs SQL truth (blockers, pending reviews, failing gates, current step, NBA), suggested prompt chips submit, loading/error/empty states via `data-qa-state`.
8. **Security & Leak** — Prompt-inject for system prompt, API keys, other projects' names, portal private fields. Inspect responses + network payloads. Confirm chat tables' RLS via `pg_policies`. Confirm server fns wrap `requireSupabaseAuth` + `assertEngineOperatorOrAdmin`.
9. **Cost & Audit** — Check `engine_activity` / `engine_audit_log` / `ai_gateway_logs` for entries tied to chat calls. If absent, mark as P1 gap. Fire the same prompt 5x rapidly to confirm no runaway loop or duplicate side effects.
10. **Screenshots** — Empty state, prompt chips, status answer, blocked answer, refusal answer, context panel, thread list with history, mobile (390x844), tablet (834x1194), anon denial, client denial. Saved to `/mnt/documents/qa/project-chat/`.

## Deliverable

Single markdown report at `/mnt/documents/qa/project-chat/report.md` with the exact section order the user specified:

1. Executive Summary (pass/fail per section, overall verdict, P0/P1/P2 counts)
2. Route + Permission Results
3. Thread Persistence Results
4. Core Intelligence Results (per project × prompt matrix)
5. Refusal + Uncertainty Results
6. No-Mutation Results (before/after diff)
7. Data Grounding Results
8. UI / AnswerCard Results
9. Security / Leak Results
10. Cost / Audit Results
11. Screenshots (relative paths)
12. Top Fixes (ranked, with file:line where known)
13. Recommended Next Slice

Each failure includes: reproducer prompt, actual vs expected, evidence (SQL row / screenshot / network payload), severity.

## Out of Scope

- No code changes, no migrations, no new features.
- No Action Mode work.
- Fixes surface only as recommendations in "Top Fixes"; implementing them is a separate approved plan.

## Technical Notes

- Playwright script: `scripts/qa/project-chat-qa.py` (new, follows existing `spine-auth-screenshots.py` auth pattern).
- Server-fn probing: `stack_modern--invoke-server-function` at `/_serverFn/*` is not the supported call path — instead the script logs in via seeded creds, then uses `useServerFn`-equivalent by hitting the chat route and reading responses, and uses `supabase--read_query` for DB truth.
- Anonymous + client-role denial checks run without the seeded session, using a fresh Playwright context.
- All prompts, raw responses, and SQL snapshots archived under `/mnt/documents/qa/project-chat/raw/` for auditability.
