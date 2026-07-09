# Implementation Plan v1 — End-to-End QA Report

**Date:** 2026-07-09
**Test project:** Jotaye Ventures — Strategy Sprint (`bbbbbbb1-…-0002`)
**Spot checks:** INBDE & ADAT Platform, August 1 — intake
**Harness:** `scripts/qa/implementation-plan-v1-qa.py`
**Raw results:** `/mnt/documents/qa/implementation-plan-v1/results.json`
**Screenshots:** `/mnt/documents/qa/implementation-plan-v1/screenshots/`

## Executive Summary

Implementation Plan v1 passes end-to-end. It consumes the approved Backend
Plan + approved QA Plan, generates a schema-valid ordered build sequence,
protects approved rows via grants + status trigger + PostgREST 403, routes
review correctly, writes audit + activity for every mutation, informs
Project Chat, and performs zero side effects on protected surfaces (client
portal, roadmap approvals, project delivery status, upstream approved
payloads). No feature code changes were required.

**Recommendation: SAFE to move to Build Execution / OpenClaw Handoff v1.**

## 1. Route + Access Results — PASS

| Check | Result |
|---|---|
| `/engine/projects/:id/implementation-plan` serves 200 for staff | ✅ `http 200`, admin loads UI |
| Nav link present after QA Factory | ✅ `nav_order_ok=true` (spine → chat → frame → mockup → backend → qa-factory → **implementation-plan**) |
| Active nav state | ✅ `data-qa-nav=implementation-plan` |
| Anon redirect | ✅ `→ /auth?redirect=%2Fengine%2F…%2Fimplementation-plan` |
| RLS `SELECT` for anon | ✅ HTTP 401 |
| RLS `SELECT` for authenticated staff | ✅ HTTP 200 |
| RLS `INSERT/UPDATE/DELETE` from authenticated browser | ✅ HTTP 403 (grants block writes; only SELECT policy exists) |

## 2. Readiness Results — PASS

| Project | Approved backend | Approved QA | Generate button | Missing-inputs UI |
|---|---|---|---|---|
| INBDE & ADAT Platform | no | no | ✅ disabled | ✅ visible |
| August 1 — intake | no | no | ✅ disabled | ✅ visible |
| Jotaye Ventures | ✅ `3e5cea5e…` | ✅ `b9cde226…` | ✅ enabled | n/a |

`generateProjectImplementationPlan` server-side refuses without both
approved upstream plans (readiness gate in `.functions.ts`); UI mirrors it.

## 3. Generate Implementation Plan Results — PASS

- Draft row created (`33eb6ce5-f1aa-4f5e-b482-06cacd31081f`).
- `status=draft`, `generated_by=ai`.
- `backend_plan_id` = approved backend `3e5cea5e-…` ✅
- `qa_plan_id` = approved QA `b9cde226-…` ✅
- `mockup_id` + `frame_id` linked ✅
- Audit event `implementation_plan_generated` written ✅
- `engine_activity` row `implementation_plan_generated` written ✅
- No migration applied, no code deployed, no QA test marked passed, no
  project status change (still `blocked | Client Preview`), no client
  portal writes.

## 4. Payload Schema Results — PASS

All 18 required top-level keys present:
`implementation_goal`, `source_backend_summary`, `source_qa_summary`,
`build_strategy`, `phases`, `build_steps`, `migration_plan`,
`server_function_plan`, `ui_wiring_plan`, `permission_rls_plan`,
`integration_plan`, `qa_execution_order`, `developer_prompts`,
`parallelization`, `rollback_strategy`, `release_gates`,
`open_decisions`, `risks`.

**Element counts:** phases=4, build_steps=4 (p0=3, p1=1, p2=0; risk
high=1/med=2/low=1), migration_plan=1, server_function_plan=1,
ui_wiring_plan=1, permission_rls_plan=1, integration_plan=1,
qa_execution_order=2, developer_prompts=4, rollback_strategy=2,
release_gates=2, open_decisions=1, risks=2.

Every `phase`, `build_step`, and `developer_prompt` object contains its
full required field set (`schema_problems=[]`).

**Developer prompt targets present:** Lovable, OpenClaw, developer, QA ✅
(exceeds required minimum of one each).

**Safety scans:** no leaked secrets (`api_key`, `bearer`, `system prompt`),
no auto-execution phrasing (`migration applied`, `deployed to production`,
`tests passed`, `marked as delivered`).

## 5. Planning-Only Safety Results — PASS

Full pre/post snapshot diff of protected surfaces returned `{}` — no
drift on:

- `client_portal_projects`, `_roadmaps`, `_messages`, `_files`
- `roadmap_approvals`, `roadmap_documents`
- `engine_projects.status`, `.current_step`
- `engine_tasks`, `engine_milestones` counts/updated_at for Jotaye
- Approved backend plan payload hash (`0255cb8d…`) — unchanged
- Approved QA plan payload hash (`c5ba314d…`) — unchanged
- Approved mockup payload hash (`6d334c83…`) — unchanged
- Approved frame payload hash (`d3d74692…`) — unchanged

Only writes observed: `engine_project_implementation_plans`,
`engine_project_chat_events`, `engine_activity`, and (on submit)
`engine_review_items`.

## 6. UI Rendering Results — PASS

Captured screenshots (see `/mnt/documents/qa/implementation-plan-v1/screenshots/`):

- `01_anon_redirect.png`
- `02_inbde_missing.png`, `02_aug1_missing.png` — empty state + disabled Generate
- `03_jotaye_ready.png` — approved backend + QA badges visible
- `04_desktop_draft.png` — Overview, Phases, Steps, Migration/Server/UI/RLS/Integration plans, QA execution order, developer prompts, rollback, release gates, parallelization, open decisions, risks, history
- `05_tablet.png`, `06_mobile.png` — responsive smoke
- `07_submitted.png`, `08_approved.png`, `09_archived.png`

AI PM panel present (`data-qa=ai-pm-panel`). Phase/type/priority filters
all present.

## 7. Submit-to-Review Results — PASS

- `status: draft → in_review` ✅
- Exactly one `engine_review_items` row created (`review_items_added=1`)
- `item_type=implementation_plan`, `status=pending`
- Audit `implementation_plan_submitted_for_review` written
- No auto-approval, no build execution, no migration/deployment, no
  portal publish.

## 8. Approve / Protection Results — PASS

- `status: in_review → approved`, `approved_by_email=qa-operator@trust-tai.com`,
  `approved_at` set.
- Audit + activity events written.
- Approved fingerprint captured: `md5(payload)=ad84e521…`.
- Project **not** marked delivered (`blocked | Client Preview` unchanged).

### Approved-row protection (§9)

| Attack | Result |
|---|---|
| Anon PATCH via PostgREST | HTTP 401 ✅ |
| Authenticated PATCH via PostgREST | HTTP 403 ✅ |
| Direct SQL downgrade `approved → draft` | BLOCKED (permission denied) ✅ |
| Direct SQL payload overwrite | BLOCKED ✅ |
| Direct SQL title overwrite | BLOCKED ✅ |
| Title after all attacks | unchanged ✅ |

Trigger `protect_approved_implementation_plan` source-verified: raises
`check_violation` on any mutation of an approved row that isn't
`archived`. Only allowed transitions: `draft↔in_review`, `in_review→approved`,
any→`archived`. Grants restrict INSERT/UPDATE/DELETE to `service_role`
only, so browser attempts return 403 before reaching the trigger.

## 9. Approve (already covered above)

## 10. Archive Results — PASS

- Archived a fresh draft (`2e668d78-…`) via admin button.
- `status=archived` ✅
- Audit + activity `implementation_plan_archived` written.
- Approved row (`33eb6ce5-…`) remained approved with fingerprint stable.

## 11. Project Chat Implementation-Awareness Results — PASS (source-verified)

Chat context (`src/lib/engine-chat-context.server.ts`) exposes an
`implementation_plan` block with status, latest_id, phase_count,
build_step_count, priority counts, risk counts, ready_for_build_execution.

Chat prompt (`src/lib/engine-chat-prompt.server.ts`) has 4 explicit
references guiding the AI to use `implementation_plan` for ordered build
steps and to hard-refuse execute/deploy/approve/deliver requests via the
existing "I can prepare this as a proposal, but I cannot execute or
approve it from chat." rule.

## 12. Permission / RLS Results — PASS

| Role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| anon | ❌ (no priv, no policy) | ❌ | ❌ | ❌ |
| authenticated | ✅ via `is_engine_staff()` policy; grants strip write | ❌ | ❌ | ❌ |
| service_role | ✅ | ✅ | ✅ | ✅ |

Mutations only go through server functions guarded by
`requireSupabaseAuth` + staff role check. Cross-project access blocked at
policy layer (`is_engine_staff()` combined with server-fn project scope
validation).

## 13. Protected Surface Regression — PASS

See §5. No drift on any client-facing or upstream approved surface. No
schema changes outside `engine_project_implementation_plans`. No portal
publishes, no roadmap approvals, no investment/delivery mutations, no
QA test status flips.

## 14. Audit / Activity Results — PASS

```
audit_events:
  implementation_plan_approved: 2
  implementation_plan_archived: 1
  implementation_plan_generated: 3
  implementation_plan_submitted_for_review: 2

activity_events:  (identical distribution)
```

No system prompts, provider keys, hidden reasoning, or auth tokens
stored in payloads (`leak_scan=0`). Errors truncated in
`implementation_plan_generation_failed` / `_refused` paths.

## 15. Next Best Action Results — PASS

Post-approval `compute_engine_next_best_action('bbbbbbb1-…')`:

> `Unblock 1 task : Tasks are blocked and need operator input.`

NBA correctly prioritizes an **existing real blocker** (blocked task on
Jotaye) rather than pushing Build Execution while blockers remain. Project
status **not** marked delivered; portal publish state unchanged. This is
the intended safety behaviour — NBA does not auto-advance past unresolved
blockers even when implementation plan is approved.

## 16. Archived Plan Not Active Results — PASS

The archived draft (`2e668d78-…`) still appears via
`getProjectImplementationPlan` history but is not the `latest` /
`active_approved` slot. Chat context implementation summary reads from
approved-or-latest-non-archived, so archived rows never present as
current.

## 17. Regenerate After Approval Results — PASS

- Approved fingerprint before regen: `ad84e521…|approved|2026-07-09 21:26:33.476969+00`
- New draft row inserted (distinct id).
- Approved fingerprint after regen: **identical** (`approved_fp_stable=true`).
- History contains approved + new draft.
- No approved payload overwrite.

## 18. Regression Results — PASS

Loaded all sibling workspace routes for Jotaye with zero new console errors:

| Route | New console errors |
|---|---|
| spine | 0 |
| chat | 0 |
| frame-builder | 0 |
| mockup-builder | 0 |
| backend-builder | 0 |
| qa-factory | 0 |
| implementation-plan | 0 |

Approved frame / mockup / backend plan / QA plan payload hashes all
unchanged. Client portal isolation unchanged.

## Screenshots

`/mnt/documents/qa/implementation-plan-v1/screenshots/` (10 files listed above).

## Top Fixes

None required. No blockers, no regressions, no security issues found.

Minor observations (non-blocking, no action required):

- Sample generated plan has small element counts (phases=4, steps=4)
  because Jotaye's approved backend + QA plans are lightweight; schema and
  guardrails are correct.
- NBA post-approval intentionally recommends unblocking the existing
  blocked task before Build Execution. If desired later, NBA could add an
  explicit "Approved implementation plan ready — resolve blockers, then
  hand off to Build Execution" hint, but the current behaviour is safe
  and consistent with the "do not auto-advance past real blockers" rule.

## Recommendation

**SAFE to move to Build Execution / OpenClaw Handoff v1.**

Implementation Plan v1 is:
- Read/plan-only — writes only its own table + audit + activity + review
  item; no upstream mutation, no code deploy, no test-status flip, no
  delivery flag change.
- Correctly gated on approved backend + approved QA plans.
- Schema-complete with Lovable / OpenClaw / developer / QA prompts.
- Protected at grants + policy + trigger + PostgREST layers.
- Audited end-to-end.
- Non-disruptive to all sibling engine surfaces and the client portal.
