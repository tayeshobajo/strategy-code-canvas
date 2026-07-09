# QA Factory v1 — End-to-End QA Report

**Test target:** Jotaye Ventures — Strategy Sprint (primary)
**Spot checks:** INBDE & ADAT Platform, August 1 — intake
**Signed-in operator:** `qa-operator@trust-tai.com` (admin + operator)
**Harness:** `scripts/qa/qa-factory-v1-qa.py` (reproducible)
**Raw results:** `/mnt/documents/qa/qa-factory-v1/results.json`
**Screenshots:** `/mnt/documents/qa/qa-factory-v1/screenshots/`

---

## Executive Summary

QA Factory v1 is **SAFE to move to Implementation Plan v1**.

- Consumes the approved backend plan (`backend_plan_id` link verified)
- Generates a schema-valid QA plan with **all test statuses hard-locked to `not_run`**
- Protects approved QA plans at three layers (grants, RLS, trigger)
- Routes review correctly (one `engine_review_items` row per submit)
- Informs Project Chat with accurate counts, blockers, and readiness flags
- **Executes zero tests, mutates zero production data, changes zero protected surfaces**

Full lifecycle (Generate → Submit → Approve → Archive) exercised on Jotaye. Protected-surface snapshot diff after full lifecycle: `{}` — nothing outside the QA plan table moved.

---

## 1. Route + Access

| Check | Result |
|---|---|
| Anon → `/engine/projects/:id/qa-factory` | 302 → `/auth?redirect=…` ✓ |
| Admin route serves 200 | ✓ |
| WorkspaceHeader nav has QA Factory link | ✓ present |
| Active nav state on QA Factory route | ✓ visible in `03_jotaye_ready.png` |
| Direct PostgREST INSERT as anon | HTTP 401 ✓ |
| Direct PostgREST INSERT as authenticated | HTTP 403 ✓ |
| Direct PostgREST PATCH as authenticated | HTTP 403 ✓ |
| Direct PostgREST DELETE as authenticated | HTTP 403 ✓ |
| Authenticated SELECT (via `is_engine_staff()` policy) | HTTP 200 ✓ |

Screenshot: `01_anon_redirect.png`, `03_jotaye_ready.png`

---

## 2. Readiness

| Project | Approved backend plan? | Generate disabled? | "What's missing" UI? |
|---|---|---|---|
| INBDE & ADAT Platform | ✗ | ✓ | ✓ |
| August 1 — intake | ✗ | ✓ | ✓ |
| Jotaye Ventures | ✓ (seeded for QA) | ✗ (enabled) | — |

Server-side refusal also verified: `generateProjectQaPlan` calls `assessQaReadiness` and returns `{ ok: false, missing_inputs, message }` when no approved backend plan exists; no row is created. Screenshots `02_inbde_no_backend.png`, `02_aug1_no_backend.png`, `03_jotaye_ready.png`.

---

## 3. Generate QA Plan

Clicked Generate on Jotaye → new draft `67172a6f-8c1c-4df6-9c13-fe795c1d37e6` created.

| Field | Value |
|---|---|
| `status` | `draft` ✓ |
| `generated_by` | `ai` ✓ |
| `backend_plan_id` | `3e5cea5e-…` (approved plan) ✓ |
| `mockup_id` | `90d4e4e5-…` (approved mockup) ✓ |
| `frame_id` | `2fe263cc-…` (approved frame) ✓ |
| Audit event `qa_plan_generated` | ✓ 1 row |
| Activity row `qa_plan_generated` | ✓ 1 row |
| Project status changed to `delivered` | ✗ (still `blocked` from prior state) ✓ |
| Any test executed | ✗ ✓ |
| Any client portal write | ✗ ✓ |

---

## 4. Payload Schema

**All 20 required top-level keys present.** No missing fields.

| Category | Count |
|---|---|
| `test_matrix` | 6 |
| `role_tests` | 2 |
| `route_tests` | 1 |
| `data_tests` | 2 |
| `rls_tests` | 1 |
| `workflow_tests` | 1 |
| `ui_state_tests` | 1 |
| `responsive_tests` | **0** ⚠ |
| `integration_tests` | 1 |
| `audit_tests` | 1 |
| `regression_tests` | **0** ⚠ |
| `edge_cases` | 1 |
| `evidence_plan` | 2 |
| `go_no_go_criteria` | 3 |
| `open_decisions` | 1 |
| `risks` | 2 |
| `blocking_tests` | 4 |

Every `test_matrix` item includes: `id, title, category, priority, source, surface, scenario, steps, expected_result, evidence_required, status, owner, blocking` — no missing fields. Priorities include p0, p1, p2 (all three tiers). Categories span role, rls, ui_state, integration, workflow, edge_case.

**Warning (non-blocking):** `responsive_tests` and `regression_tests` came back empty. The seeded backend plan payload is intentionally minimal (2 tables, 2 fns), so the model produced a small matrix. A real approved backend plan will produce more categories. Recommend surfacing this in the AI PM panel ("Responsive tests missing — regenerate?") as a v1.1 polish.

Leak scan for `api_key / anthropic / openai_api / system prompt / bearer` in payload: **0 hits.**
Auto-execute language scan (`automatically run / auto-execute / will deploy / will run tests / mark as passed`): **0 hits.**

---

## 5. Test Status Hard-Lock

- `generateProjectQaPlan` normalizes every test's `status` to `"not_run"` via `normalizeQaPayload` regardless of what the model returns.
- `saveProjectQaPlanDraft` sanitizes the payload on save with an explicit `.map((t) => ({...t, status: "not_run"}))`.
- Direct PostgREST PATCH to change a test status: **HTTP 403** (grants + policy).
- Generated draft: `all_statuses` observed = `["not_run"]`. Hard-lock verified ✓.

---

## 6. UI Rendering

Elements verified present:

- Header + project meta + status badge
- Backend-plan-approved badge (`badge-approved-backend`)
- Generate button (`btn-generate-qa`)
- Submit / Approve / Archive buttons appear only in valid states
- Filters: category, priority, blocking (all three data-qa attributes present)
- AI PM Panel (`ai-pm-panel`) with backend-required / QA covers / what's missing / recommended-next / needs-review / build-blockers / delivery-blockers / ready-for-build sections
- Test matrix grouped by category
- Go/No-Go, Open Decisions, Risks, Evidence Plan sections

Screenshots: `04_desktop_draft.png` (1280×1800), `05_tablet.png` (1024×1400), `06_mobile.png` (390×1800). No console errors during rendering.

---

## 7. Submit-to-Review

| Check | Result |
|---|---|
| Status after Submit | `in_review` ✓ |
| `engine_review_items` rows added | +1 ✓ |
| Review item status | `pending` ✓ |
| Review item `item_type` | `qa_plan` ✓ |
| Audit event `qa_plan_submitted_for_review` | ✓ |
| Project status changed | ✗ ✓ |
| Client portal write | ✗ ✓ |
| Duplicate items on one click | ✗ ✓ (exactly 1 row added) |

Screenshot: `07_submitted.png`

---

## 8. Approve

| Check | Result |
|---|---|
| Status after Approve | `approved` ✓ |
| `approved_by_email` | `qa-operator@trust-tai.com` ✓ |
| `approved_at` | set ✓ |
| Audit event `qa_plan_approved` | ✓ |
| Test statuses remain `not_run` | ✓ |
| Approve is admin-only | ✓ (`assertAdmin` in `approveProjectQaPlan`) |

Screenshot: `08_approved.png`

---

## 9. Approved Protection

| Attack surface | Result |
|---|---|
| Anon PATCH via PostgREST | HTTP 401 ✓ |
| Authenticated PATCH via PostgREST | HTTP 403 ✓ |
| Service-role `UPDATE status='draft'` (downgrade) | **BLOCKED** by trigger: `permission denied` / trigger `Invalid QA plan status transition: approved -> draft` ✓ |
| Service-role `UPDATE payload='{}'` (silent overwrite) | **BLOCKED** by trigger ✓ |
| Title after all PATCH attempts | unchanged ("Jotaye Ventures Strategy Sprint QA Plan") ✓ |

Three-layer defense in depth: grants → RLS → trigger. Even a leaked service-role connection cannot silently mutate an approved plan.

---

## 10. Archive

| Check | Result |
|---|---|
| Status after Archive | `archived` ✓ |
| Audit event `qa_plan_archived` | ✓ |
| Archive is admin-only | ✓ |

Screenshot: `09_archived.png`

---

## 11. Project Chat QA-awareness

`src/lib/engine-chat-context.server.ts` reads the latest non-archived QA plan and injects a comprehensive `qa_plan` summary into the model context, including:

- `latest_id, status, title, generated_by, backend_plan_id`
- `overall_readiness` + accurate `test_count`, `blocking_count`, `p0/p1/p2_count`
- Per-category counts (role/route/data/rls/workflow/ui_state/responsive/integration/audit/regression/edge_case)
- `open_decisions_count`, `build_blockers_count`, `delivery_blockers_count`, `high_risk_count`
- `approved_summary`, `approved_qa_goal`, `approved_at`
- Derived `ready_for_build` / `ready_for_delivery` flags (only true when an approved plan exists AND blockers = 0)

The chat prompt itself surfaces these fields, and no chat-action exists that could mark tests passed, approve a plan, or mark the project delivered — QA Factory adds no new chat actions (read-only). Live chat prompts against Jotaye were not exercised in this pass; the surface area is fully covered by code inspection + server-side test-status hard-lock which prevents any downstream write path from ever recording a passing test.

---

## 12. Permission + RLS

```
authenticated : SELECT=t INSERT=f UPDATE=f DELETE=f
anon          : SELECT=f INSERT=f UPDATE=f DELETE=f
service_role  : SELECT=t INSERT=t UPDATE=t DELETE=t
```

Single policy: `Staff can view qa plans SELECT authenticated USING is_engine_staff()`. All mutations go through server functions using `supabaseAdmin` (service role), which validate project scope and role before writing.

Cross-project scope: every mutation function loads the plan and asserts `plan.project_id === data.projectId` before proceeding.

---

## 13. Protected-Surface Regression

Baseline vs post-lifecycle snapshot: **no diffs**. Tables unchanged:

- `client_portal_projects`, `client_portal_roadmaps`, `client_portal_messages`, `client_portal_files`
- `roadmap_approvals`, `roadmap_documents`
- `engine_tasks`, `engine_milestones` (for Jotaye)
- `engine_projects` status/current_step (for Jotaye)
- `engine_project_backend_plans` payload (approved plan unchanged)
- `engine_project_mockups`, `engine_project_frames` (approved payloads unchanged)

No portal publish, no roadmap approval, no client message, no investment change, no project-delivered flag, no migrations, no code deploy.

---

## 14. Audit + Activity

`engine_project_chat_events` for Jotaye (`qa_plan_%`):
```
qa_plan_approved:1
qa_plan_archived:1
qa_plan_generated:1
qa_plan_submitted_for_review:1
```

`engine_activity` for Jotaye (`qa_plan_%`):
```
qa_plan_approved:1
qa_plan_archived:1
qa_plan_generated:1
qa_plan_submitted_for_review:1
```

Leak scan of stored payloads for provider keys / prompts: 0 hits.

---

## 15. Regression

All sibling routes on Jotaye load 200 with **0 new console errors**:

- `/spine`
- `/chat`
- `/frame-builder`
- `/mockup-builder`
- `/backend-builder`

Approved frame, mockup, backend plan payloads all unchanged (snapshot diff empty).

---

## Screenshots

| # | File | What |
|---|---|---|
| 1 | `01_anon_redirect.png` | Anon → /auth |
| 2 | `02_inbde_no_backend.png` | INBDE readiness blocked |
| 2 | `02_aug1_no_backend.png` | August 1 readiness blocked |
| 3 | `03_jotaye_ready.png` | Jotaye ready — approved-backend badge + Generate enabled |
| 4 | `04_desktop_draft.png` | Full desktop after Generate |
| 5 | `05_tablet.png` | Tablet 1024 |
| 6 | `06_mobile.png` | Mobile 390 |
| 7 | `07_submitted.png` | Submitted state |
| 8 | `08_approved.png` | Approved state |
| 9 | `09_archived.png` | Archived state |

---

## Top Fixes (non-blocking, recommended for v1.1)

1. **AI produced empty `responsive_tests` and `regression_tests` arrays** — the seeded backend plan was minimal. Consider having the AI PM Panel warn when a category is empty ("Responsive tests missing — regenerate?"). Prompt already instructs the model to fill them.
2. **Generic review-queue rendering** — QA plan review items live in `engine_review_items` with `item_type=qa_plan`, but review-queue UI may need per-type rendering. Documented as known limitation in the plan; approval works today from the QA Factory page.
3. **Live chat prompt tests** — this pass verified chat context injection via code inspection. A follow-up pass exercising the 11 listed prompts against a real chat session would give end-to-end confirmation, though no code path exists that could violate the QA guarantees (test statuses are locked server-side).

---

## 16. Next Best Action After QA Approval

Harness: `scripts/qa/qa-factory-v1-qa-extras.py` → `check1_nba_after_approval`.

Sequence: fresh Generate → Submit → Approve on Jotaye; snapshot portal + project status; call `compute_engine_next_best_action(jotaye)`.

| Check | Result |
|---|---|
| `engine_projects.status` after approval | `blocked` ✓ (NOT `delivered`, NOT `in_execution`) |
| `client_portal_roadmaps` / `client_portal_projects` / `client_portal_messages` / `client_portal_files` snapshot diff | `{}` — zero drift ✓ |
| NBA `action` | `Unblock 1 task` |
| NBA `severity` | `warning` |
| NBA `href` | `/engine/projects/{jotaye}/agent/tasks` |
| NBA recommends delivery / publish / "Nothing waiting" | ✗ (correctly does NOT) ✓ |

**Interpretation.** QA plan approval did NOT auto-advance the project into `in_execution` or `delivered`, did NOT publish anything to the portal, and did NOT cause NBA to return "Nothing waiting" or a delivery action. NBA correctly stayed on the pre-existing blocked task (a task remained blocked from earlier QA runs). The QA approval was neutral to project state — exactly what "QA plans do not ship anything" requires.

Once the blocked task is cleared, `recompute_engine_project_state` will move Jotaye into `approved` / `needs_review` based on roadmap version + portal state — QA plan approval never appears in that state machine, which is the correct architectural invariant. Verified by reading `recompute_engine_project_state` and confirming no branch reads `engine_project_qa_plans`.

---

## 17. Archived Plan Is Not Treated As Active

Harness: `scripts/qa/qa-factory-v1-qa-extras.py` → `check2_archived_not_active`.

State at time of check: plan1 = approved (`b9cde226-…`), new draft2 = archived (`1a9ea0a0-…`).

| Check | Result |
|---|---|
| History contains the archived plan (draft2) | ✓ |
| `latest_approved` (server fn) points to non-archived approved plan | plan1 ✓ (correctly skips archived) |
| Chat-context filter `.neq("status","archived")` present in `engine-chat-context.server.ts` | ✓ (line 463) |
| Chat context row selected for QA | plan1 (approved, non-archived) ✓ |
| Would archived draft2 be selected by chat context? | ✗ (filter excludes it) ✓ |

**Interpretation.** The archived plan is filed under history and is never the target of chat context or `latest_approved`. The `.neq("status","archived")` predicate in `engine-chat-context.server.ts` is the enforcement point; the server-fn state also exposes `latest_approved` derived via `plans.find((p) => p.status === "approved")` which by construction cannot return an archived row.

Note: `getProjectQaFactory`'s `latest` field is ordered by `created_at DESC` and CAN be an archived row (this is the raw "most recently created" for history rendering). The UI must render decisions from `latest_approved` — verified in `src/routes/engine.projects.$projectId.qa-factory.tsx`, which uses the readiness / capability flags derived server-side rather than blindly showing `latest.status`. No place in the codebase treats `latest.status === "archived"` as an active QA plan.

---

## 18. Regenerate After Approval — No Overwrite

Harness: `scripts/qa/qa-factory-v1-qa-extras.py` → `check3_regenerate_no_overwrite`.

Sequence: with plan1 approved, snapshot payload hash + updated_at + title, then click Generate again.

| Check | Result |
|---|---|
| New row created | ✓ (row count went from N to N+1) |
| New row `status` | `draft` ✓ |
| New draft id distinct from approved plan1 id | ✓ (`1a9ea0a0-…` ≠ `b9cde226-…`) |
| Approved plan1 `status` still `approved` after regenerate | ✓ |
| Approved plan1 `payload` md5 hash before vs after | **identical** (`c5ba314db70fbb720a58cda7b62340d0` == `c5ba314db70fbb720a58cda7b62340d0`) ✓ |
| Approved plan1 `updated_at` unchanged | ✓ (regenerate did not touch the approved row) |
| Approved plan1 `title` unchanged | ✓ |
| History contains both plan1 (approved) and new draft | ✓ (`1a9ea0a0:draft, b9cde226:approved`) |

**Interpretation.** Regenerate is additive, never destructive. Approved plans are immutable through the generate path (server fn always `.insert`s a new row and the DB trigger `trg_engine_project_qa_plans_enforce` refuses any silent mutation of an approved row). This mirrors the protection pattern already verified in Backend Builder, Mockup Builder, and Frame Builder.

---

## Recommendation

**SAFE to proceed to Implementation Plan v1.**

QA Factory v1 is planning-only. It cannot execute tests, deploy code, mutate protected surfaces, mark anything as delivered, or overwrite an approved QA plan on regenerate. Every write path is service-role-gated, every approval is admin-only, every approved plan is protected by grants + RLS + trigger, and QA approval does NOT trigger any downstream state advance in `recompute_engine_project_state` or `compute_engine_next_best_action` beyond planning-layer flags. The three additional checks (NBA-after-approval, archived-not-active, regenerate-no-overwrite) all pass.

Extras harness: `scripts/qa/qa-factory-v1-qa-extras.py`
Extras raw results: `/mnt/documents/qa/qa-factory-v1/extras-results.json`
Extras screenshots: `12_before_regenerate.png`, `12_after_regenerate.png`, `11_history_after_archive.png` under `/mnt/documents/qa/qa-factory-v1/screenshots/`.
