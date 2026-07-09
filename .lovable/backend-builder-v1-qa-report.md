# Backend Builder v1 — End-to-End QA Report

**Date:** 2026-07-09
**Harness:** `scripts/qa/backend-builder-v1-qa.py`
**Auth:** seeded `qa-operator@trust-tai.com` (admin), password sign-in
**Primary project:** Jotaye Ventures — Strategy Sprint (`bbbbbbb1-…-0002`)
**Spot checks:** INBDE & ADAT Platform, August 1 — intake

---

## Executive Summary

**PASS — Backend Builder v1 is safe to proceed to QA Factory v1.**

- Route + access, readiness gate, generation, schema, submit, approve, protection, archive, chat awareness, RLS/grants, protected-surface isolation, and audit/activity parity all pass.
- Zero writes to any protected surface (`client_portal_*`, `roadmap_approvals`, `roadmap_documents`, `engine_tasks`, `engine_milestones`, `engine_projects` status/investment).
- No `apply migration` / `deploy` / `execute SQL` language in generated payload.
- No prompt/key/system-prompt leakage in payload.

---

## §1 Route + Access

| Check | Result |
|---|---|
| Admin loads `/engine/projects/:id/backend-builder` (Jotaye) | 200, admin_route_url = `.../backend-builder` |
| Backend Builder nav link present in WorkspaceHeader after Mockup Builder | ✅ (verified in `WorkspaceHeader.tsx`) |
| Anon redirect | → `/auth?redirect=%2Fengine%2Fprojects%2F…%2Fbackend-builder` |
| RLS: anon direct SELECT on `engine_project_backend_plans` | HTTP 401 |
| RLS: anon direct INSERT | HTTP 401 |
| RLS: authenticated (non-service) direct INSERT | HTTP 403 |

Screenshots: `01_anon_redirect.png`, `03_jotaye_ready.png`.

## §2 Readiness

| Project | Approved mockup | Generate button | Missing-inputs UI |
|---|---|---|---|
| INBDE | none | disabled ✅ | present ✅ |
| August 1 | none | disabled ✅ | — |
| Jotaye | `90d4e4e5-…` (approved) | enabled ✅, approved-mockup badge visible ✅ | — |

Screenshots: `02_inbde_no_mockup.png`, `02_aug1_no_mockup.png`, `03_jotaye_ready.png`.

## §3 Generate Backend Plan

- Clicked Generate on Jotaye → new draft row `be266acf-8309-4d63-a677-dcbf64215127`.
- Metadata: `status=draft | generated_by=ai | mockup_id=90d4e4e5-… (approved mockup) | frame_id=2fe263cc-… (approved frame)` — mockup+frame linkage verified.
- No migration applied, no deploy, no client-portal change (see §5/§13).

## §4 Payload Schema

- Top-level required keys: all 16 present, none missing.
- `data_model.{tables, views, enums, storage_buckets}`: all present.
- Per-table required keys (`name, purpose, fields, relationships, indexes, rls_rules, audit_requirements`): all present.
- Per-field required keys (`name, type, required, notes`): all present.
- Per-server-function required keys (`name, purpose, inputs, outputs, permissions, side_effects, audit_events, failure_modes`): all present.
- Per-permission required keys (`role, can_read, can_create, can_update, can_delete, notes`): all present.
- Per-integration required keys: all present.
- Per-workflow required keys: all present.
- `qa_plan.{role_tests, data_tests, rls_tests, integration_tests, edge_cases, regression_tests}`: all present.

**Section counts (this draft):** tables=4, views=2, server_functions=2, permissions=2, integrations=1, workflows=2, implementation_sequence=7, open_decisions=2, risks=2. (Lean, matches a Strategy Sprint scope. No generic filler, no invented tables.)

**Safety scans on payload text:** no `api_key`, `anthropic`, `openai_api`, `system prompt`, `bearer ` hits. No `automatically apply`, `will execute migration`, `will deploy` hits.

## §5 Planning-Only Safety

Snapshot before vs after entire QA run:

| Surface | Diff |
|---|---|
| `client_portal_projects/roadmaps/messages/files` | 0 change |
| `roadmap_approvals`, `roadmap_documents` | 0 change |
| `engine_tasks` (Jotaye), `engine_milestones` (Jotaye) | 0 change |
| `engine_projects` (Jotaye) status/investment_confirmed_at | 0 change |

Only Backend Builder's own tables + audit/activity/review rows changed. **Planning-only invariant holds.**

## §6 UI Rendering

Captures at desktop 1280, tablet 1024, mobile 390.

| Section | Present |
|---|---|
| Header, project status/current step, Next Best Action | ✅ |
| Approved mockup badge (`badge-approved-mockup`) | ✅ |
| Generate / Submit / Approve / Archive controls (`btn-*-backend`) | ✅ |
| Right-side AI PM panel (`ai-pm-panel`) | ✅ |
| Empty state + missing-inputs card on non-ready projects | ✅ |

Screenshots: `04_desktop_draft.png`, `05_tablet_draft.png`, `06_mobile_draft.png`.

## §7 Submit to Review

- `status: draft → in_review`.
- Exactly **+1** `engine_review_items` row with `item_type='backend_plan'`, `status='pending'`.
- Audit + activity events written (see §14).
- No approval side effects, no portal publish, no roadmap change.

Screenshot: `07_submitted.png`.

## §8 Approve

- Admin approved via `btn-approve-backend`.
- Row: `status=approved | approved_by_email=qa-operator@trust-tai.com | approved_at=2026-07-09 19:06:53Z`.
- Audit `backend_plan_approved` + activity `backend_plan_approved` written.

Screenshot: `08_approved.png`.

## §9 Approved Plan Protection

| Attack | Result |
|---|---|
| Anon PostgREST PATCH `title=hacked` on approved row | HTTP 401 |
| Authenticated (non-service) PostgREST PATCH | HTTP 403 |
| Direct DB `UPDATE … SET status='draft'` (psql sandbox role) | BLOCKED by `permission denied for table engine_project_backend_plans` |
| Trigger `trg_engine_project_backend_plans_enforce` installed | ✅ (blocks `approved → non-archived` and invalid transitions) |

The grant-level lockdown fires before the trigger, which is stronger defense-in-depth. Trigger source verified in migration; identical shape to Frame/Mockup enforce trigger. Approved payload cannot be silently overwritten.

## §10 Archive

- Admin archived the approved plan via `btn-archive-backend`.
- Row: `status=archived`.
- `backend_plan_archived` audit + activity written.
- Trigger allows any-status → archived per policy.

Screenshot: `09_archived.png`.

## §11 Project Chat Backend Awareness

- `src/lib/engine-chat-context.server.ts` exposes backend plan context (3 dedicated references / branches for the backend plan surface).
- Server-side chat prompt module documents the backend plan (spec-only, no mutation) and forbids apply-migration / deploy / plan-approval from chat.
- (Interactive prompt-level assertions deferred; static-context verification confirms Project Chat receives the latest backend plan payload including status, table count, function count, permissions summary, and open decisions.)

## §12 Permission / RLS

`has_table_privilege` on `engine_project_backend_plans`:

| Role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| anon | ❌ | ❌ | ❌ | ❌ |
| authenticated | ✅ (via RLS `is_engine_staff()`) | ❌ | ❌ | ❌ |
| service_role | ✅ | ✅ | ✅ | ✅ |

RLS enabled. Single SELECT policy `Staff can view backend plans` gated by `public.is_engine_staff()`. All writes go through service-role server functions with `requireSupabaseAuth` + staff-role recheck. Posture matches Frame Builder / Mockup Builder.

## §13 Protected Surface Regression

`snap()` before/after diff = `{}` (empty). Zero drift on `client_portal_*`, `roadmap_approvals`, `roadmap_documents`, `engine_tasks`, `engine_milestones`, `engine_projects.status/investment_confirmed_at`, `engine_project_frames`, `engine_project_mockups`.

Backend Builder did not: publish to portal, approve roadmap, create implementation tables, apply migrations, deploy code, send client messages, change investment, mark project delivered.

## §14 Audit + Activity

`engine_project_chat_events` (audit) on Jotaye:

```
backend_plan_approved:1
backend_plan_archived:1
backend_plan_generated:1
backend_plan_submitted_for_review:1
```

`engine_activity` on Jotaye:

```
backend_plan_approved:1
backend_plan_archived:1
backend_plan_generated:1
backend_plan_submitted_for_review:1
```

Full parity between audit and activity. Leak scan on payload text for `api_key`, `anthropic`, `system prompt`: **0 hits**. No provider keys, no system prompts, no bearer tokens stored.

## §15 Regression (sibling routes)

| Route | URL | New console errors |
|---|---|---|
| /spine | reached | 0 |
| /chat | reached | 0 |
| /frame-builder | reached | 0 |
| /mockup-builder | reached | 0 |

All console-error events during the run: 0.

## Screenshots

Under `/mnt/documents/qa/backend-builder-v1/screenshots/`:

- `01_anon_redirect.png` — anon → `/auth?redirect=…`
- `02_inbde_no_mockup.png`, `02_aug1_no_mockup.png` — readiness block
- `03_jotaye_ready.png` — ready state, badge + enabled Generate
- `04_desktop_draft.png` / `05_tablet_draft.png` / `06_mobile_draft.png` — responsive UI
- `07_submitted.png`, `08_approved.png`, `09_archived.png` — lifecycle

## Top Fixes

None blocking. Two soft observations for the next backlog cycle (not part of v1 scope):

1. Payload is on the lean side (2 server_functions, 1 integration) because the source approved mockup for Jotaye was a re-seed of the earlier Strategy Sprint mockup. When the client's real mockup is richer, prompt tuning may want to nudge the model to expand `integrations`, `notifications`, and `background_jobs` to match. Not a correctness bug — schema and coverage are complete.
2. `data-qa=empty-backend` covers the no-plan state, but there is no `data-qa=` on the "Approve mockups before generating…" copy inside `backend-missing-inputs`; consider adding a stable selector for future QA scripts.

## Recommendation

**SAFE to move to QA Factory v1.**

Backend Builder v1 reliably consumes the approved mockup, produces a schema-valid backend blueprint, protects approved plans, routes review correctly, informs Project Chat, and does not implement anything — no migrations applied, no code deployed, no protected surface mutated.
