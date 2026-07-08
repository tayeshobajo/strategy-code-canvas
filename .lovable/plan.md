
# Roadmap Engine — Operator + AI PM QA Audit

Read-only audit. No code changes proposed for this pass; a fix backlog follows the findings.

---

## Executive Summary

- **Overall status:** Structurally sound as an operator workbench with strong server-side approval/publish gates and strong client-portal isolation. **Weak as an AI project manager** — the engine mostly *displays* state instead of *driving* it.
- **Biggest risk:** The 14-step stepper is purely navigational — nothing gates step order or forces upstream completion. Combined with the fact that only the intake→pipeline transition is automatic and only the milestone-brief page has per-section AI generation, the operator carries the workflow themselves after step 3.
- **What is working:**
  - Server-side role gates on every irreversible action (`assertAdminEmail`, `assertAdmin`, inner admin checks inside `assertOps` functions).
  - Agent hard-block set (`send_delivery`, `move_project_to_execution`) plus module exclusions (`investment`, `client_preview`) enforced in code, not just config.
  - Client-portal isolation: static `portal-safety-guard` test, `CLIENT_SAFE_KEYS` runtime allowlist, admin-only RLS on `engine_*` tables.
  - Intelligence pipeline auto-creates versioned draft + `roadmap_version` review item + operator notification.
  - Watchdog cron (`engine_extraction_watchdog`) recovers stuck extraction runs every 5 min.
- **What is not working:**
  - No true "Next Best Action" recompute — `engine_projects.next_action` is a stored string set at intake, never refreshed.
  - Steps 4–8 and 10–12 have no per-step AI generate buttons; they are display-only.
  - Task decomposition from milestones is entirely manual — no `generateTasks` function.
  - `operator_notifications` and critical `engine_activity` rows are written but **no UI surfaces them** (no bell, no feed). Watchdog failures and pipeline timeouts are invisible.
  - Milestone briefs / investment recs / publish requests do **not** create independent review items — one `roadmap_version` item implicitly approves everything downstream.
- **Recommended next action:** Fix P0/P1 items from the backlog below (state-driven Next Best Action, notification surface for watchdog + operator_notifications, portal view column cleanup) before promising Mubo's project as a repeatable customer-facing flow.

---

## 1. Operator Role Matrix

Full permissions verified server-side unless noted.

| Role | Route / Action | View | Create | Edit | Approve | Publish | Server-enforced? | Notes |
|---|---|---|---|---|---|---|---|---|
| admin | `/engine/*`, `/admin/*`, `/ops/*`, all step pages | ✅ | ✅ | ✅ | ✅ | ✅ | RLS + `assertAdmin` | Full access |
| operator | `/engine/*`, `/ops/*` | ✅ | ✅ (drafts, notes, tasks, sources) | ✅ (drafts) | ❌ versions/preview | ❌ | `assertOps` + inner admin check on approve/publish | Correct |
| operator | `/admin/*` | ✅ (shell) | mixed | mixed | ❌ | ❌ | `beforeLoad` allows operator | **⚠ Bypass risk** — operator enters admin shell; individual admin sub-pages rely on server-fn gates for writes but reads may over-expose |
| operator | Approve roadmap version | — | — | — | ❌ | — | `decideReviewItem` inner admin check | Server hard-block |
| operator | Publish to portal / approve preview / confirm investment / send delivery | — | — | — | — | ❌ | `assertAdminEmail` | Server hard-block |
| operator | Investment / preview / agent-permissions pages | ✅ | — | ❌ (UI + server) | — | — | `OperatorLockNotice` (UI) + `assertAdmin` (server) | Defense-in-depth OK, no per-route `beforeLoad` |
| AI agent (draft_only) | Write draft version, suggest tasks | — | ✅ suggest | ✅ AI-draft rows only | ❌ | ❌ | `assertActionAllowed` — all writes become `needs_approval` | Correct |
| AI agent (propose_updates / execute_approved) | Same as draft with fewer needs-approval | — | ✅ | ✅ AI-draft rows | ❌ | ❌ | Server + `HARD_BLOCKED` set for `send_delivery`, `move_project_to_execution` | `investment` + `client_preview` excluded from `MODULE_KEYS` — cannot be overridden |
| client | `/portal/*` | ✅ approved/published snapshot only | ✅ decisions/uploads on their project | — | — | — | Portal RLS: `status IN ('approved','delivered') AND source_version_id IS NOT NULL AND approved_at IS NOT NULL` + `CLIENT_SAFE_KEYS` allowlist + `portal-safety-guard` static test | No access to engine tables |

---

## 2. AI Product Manager Behavior

**Currently proactive:**
- Intelligence pipeline: extraction → all module drafts (point_a, point_b, hidden_assets, gap_map, blueprint, roadmap) → versioned row → `engine_review_items` (roadmap_version) → optional `operator_notifications`.
- Command Center `next_best_actions` list is rule-based ranked (`STATUS_WEIGHT`) — semi-proactive.
- Milestone Brief page — `Sparkles` regenerate per section (Brief, Acceptance Criteria, QA Checklist, Risks, Developer Prompt).

**Currently passive (gaps vs. spec):**
- No per-project "Next Best Action" recompute — `next_action` is a static string stored at intake.
- Steps 4–8 (Point A, Point B, Hidden Assets, Gap Map, Blueprint) and 10–12 (Sequencing, Deadlines, Investment) have **no per-step Generate button** — display-only. Operator must go back to Intelligence to re-run everything.
- No auto task decomposition from milestones — `generateTasks` does not exist; operator adds tasks manually.
- No AI-generated "what's missing" analysis of the current project shown anywhere.
- Project status/current_step do **not** auto-advance after pipeline — stays `intake` until manually changed.
- 14-step stepper is purely navigational — no gating, no unlock logic.

---

## 3. Workflow Step Audit

| # | Step | State known? | AI action available | Operator action | Review action | Pass/Fail |
|---|---|---|---|---|---|---|
| 1 | Intelligence Layer | ✅ pipeline status | ✅ Run pipeline | Review results | ✅ Auto review item | **Pass** |
| 2 | Signal Room | ✅ sources | Upload only | ✅ Add/manage sources | — | **Pass** |
| 3 | Signal Extraction | ✅ extracted signals | ✅ Re-run pipeline | Inspect signals | — | **Pass** |
| 4 | Point A Diagnosis | Display-only | ❌ No AI generate | Manual edit via `StepEditor` | — | **Fail** (no AI, no missing-info detection) |
| 5 | Point B Definition | Display-only | ❌ | Manual edit | — | **Fail** |
| 6 | Hidden Asset Map | Display-only | ❌ | Manual edit | — | **Fail** |
| 7 | Gap Map | Display-only | ❌ | Manual edit | — | **Fail** |
| 8 | System Blueprint | Display-only | ❌ | Manual edit | — | **Fail** |
| 9 | Roadmap Builder | Milestones from DB | ⚠️ Hint only ("run the AI pipeline") | Manual add/edit | Via version review | **Partial** |
| 10 | Sequencing | Display-only | ❌ | Manual reorder | — | **Fail** |
| 11 | Deadline Plan | Display-only | ❌ | Manual dates | — | **Fail** |
| 12 | Investment Builder | Display-only | ❌ | Admin-only edit | Admin approve | **Partial** (no AI cost estimation) |
| 13 | Client Preview | ✅ preview status | ⚠️ Regenerate per section on milestone brief only | Submit for approval (operator) / approve (admin) | ✅ Review item | **Pass** |
| 14 | Delivery Prep | ✅ delivery state | ❌ | Publish (admin only) | Approval required | **Pass** |

---

## 4. Project Momentum Audit

- **Automatic transitions:** intake submission → engine_project + source → pipeline (now synchronous, watchdog-protected) → module writes + version + review item + optional notification.
- **Waits unnecessarily:**
  - After pipeline: `status` and `current_step_num` not auto-advanced.
  - After approval: no auto-publish path or auto-preview-generation.
  - Task board not populated from milestones automatically.
  - `next_action` string never refreshed.
- **Missing automation triggers:**
  - Post-pipeline status advance to `needs_review`.
  - Post-approval `client_preview` draft auto-generation.
  - Per-milestone task decomposition when a version is approved.
  - Missing-info detector that recommends "request clarification" instead of AI hallucinating.

---

## 5. Task + Acceptance Criteria Audit

- Milestones carry `acceptance_criteria` and `qa_checklist` columns and can be regenerated per section (`regenerateMilestoneSection`) — **good**.
- `engine_tasks` are **not** auto-decomposed from milestones. `sendMilestoneToTasks` exists but requires manual per-task entry.
- No `generateTasks` server function found. No AI-generated task titles, owners, dependencies, or Lovable prompts tied to a milestone.
- Result: tasks in the board are what operators type in — no engine-guaranteed link between "approved milestone" and "reviewable, criteria-bearing tasks."

---

## 6. Approval + Safety Audit

**Strong:**
- All approve/publish paths server-enforced via `assertAdminEmail` / inner admin check.
- Self-approval blocked in `decideReviewItem:353` (`created_by = actor` refused; AI-authored bypasses intentionally).
- Client publish requires both `status = 'approved'` on the version and `client_preview_status = 'approved'` on the project.
- DB trigger `tg_client_portal_roadmaps_require_source_version` blocks publishing an `ai_generated` version.
- Approved versions preserved via `_findOrCreateAiDraft` — AI writes never touch approved rows.

**Gaps / risks:**
1. **Column-name mismatch on the publish trigger.** Portal migration added `source_version_id`; the AI-draft gate trigger checks `approved_roadmap_version_id`. If the two columns ever diverge, the trigger checks the wrong one. Application-level check in `engine-ops.functions.ts:1076` currently backstops this.
2. **One review item covers everything.** Milestone briefs, investment recs, and publish requests do not create their own `engine_review_items` rows. Approving the `roadmap_version` item implicitly approves all sub-artifacts. No `publish_request` or `investment_recommendation` item type exists.
3. **`portal_roadmaps_v` view still includes `supporting_notes`.** Migration `20260706210000` nulled the data + deprecated the column but never rebuilt the view. Column is null today; any future writer immediately leaks.
4. **`adminGetPortal` uses `select("*")`** on `client_portal_projects`. Operator-gated, but defense-in-depth gap.
5. **`/admin` route allows operator role** — reads may over-expose admin sub-pages.

---

## 7. Cost + Agent Operations Audit

- **Cost Center** at `engine.projects.$projectId.agent.costs.tsx`: total/monthly spend, budget remaining, projected month-end, cost per approved output, unused draft cost, daily line chart, category donut, milestone attribution, budget controls, CSV export. **Solid.**
- Global spend + top spenders visible on `engine.index.tsx` and `engine.operations.tsx`.
- Per-run line-item visibility: server returns `recent` + `ledger`; UI table for per-run may be export-only (needs a quick JSX check).
- Task board (`engine_agent_tasks`): statuses `suggested / drafted / needs_review / approved / in_progress / blocked / completed / rejected / archived`; kanban + owner + priority + calendar views.
- **Gap:** No escalation when a task is set to `blocked` — silent status change, no `operator_notifications` write, no review item.
- **Gap:** Watchdog writes `engine_activity` `severity: critical` on pipeline timeout — **no UI reads engine_activity**, so the recovery is invisible. Would only be noticed if operator refreshes and sees status flip back to `intake`.

---

## 8. QA Scenarios — Result Preview (based on code paths, not live run)

- **A. Fresh intake project:** Extraction runs synchronously (post-fix), review item created. **Next Best Action absent per-project** (only stored string). Partial pass.
- **B. Operator reviews AI draft:** Can inspect, send_back, reject. Cannot approve — server blocks. Pass.
- **C. AI generates tasks from milestone:** ❌ Not supported — no `generateTasks`. Fail.
- **D. Missing information:** No missing-info detector on step pages. Operator must eyeball. Fail.
- **E. Approval gate:** `approved_by` + `approved_at` set; previous drafts preserved; portal untouched until separate publish action. Pass.
- **F. Client safety:** Static `portal-safety-guard` test + `CLIENT_SAFE_KEYS` + admin-only RLS on engine tables. Pass — with the `portal_roadmaps_v` view caveat above.

---

## Top 10 Fixes (proposed backlog, not executed)

| # | Pri | Issue | Where | Expected | Current | Fix direction |
|---|---|---|---|---|---|---|
| 1 | P0 | Watchdog + pipeline failures invisible to operator | `engine_activity` writes; no UI reader | Bell/feed shows critical activity + operator_notifications | Silent | Notification bell reading `operator_notifications` + `engine_activity` `severity in ('critical','warning')`, unread count in header |
| 2 | P0 | `portal_roadmaps_v` view exposes `supporting_notes` column | migration `20260702192431:110` | Column absent from view | Present, null today | New migration: recreate view with column removed |
| 3 | P0 | No per-project "Next Best Action" recompute | `engine_projects.next_action` static | Derived from state (status × step_states × review items × decisions) | Set once at intake | Server function computing NBA on-demand + surfaced in `overview.tsx` |
| 4 | P1 | Steps 4–8, 10–12 have no per-step AI generate button | route files under `engine.projects.$projectId.*.tsx` | Per-step Generate/Regenerate wired to server fn | Display + manual edit only | Add `regenerateStep(step)` server fn + Sparkles button per page |
| 5 | P1 | No task decomposition from approved milestones | `engine-execution.functions.ts` | `generateTasks(milestoneId)` producing titles + acceptance criteria + dev prompt + owner suggestion | Manual entry only | Add server fn; auto-suggest on approval, require operator confirmation before `create` |
| 6 | P1 | Milestone briefs / investment / publish create no independent review items | `engine-ops.functions.ts` | New `item_type` values with own approval | Single `roadmap_version` item covers all | Add typed review items for each artifact + admin gate on each |
| 7 | P1 | Publish trigger checks a different column than the schema uses in some paths | trigger `tg_client_portal_roadmaps_require_source_version` vs `source_version_id` | Trigger checks the canonical column consistently | Two columns coexist | Unify column, drop the dead one, rebuild trigger |
| 8 | P1 | Project status/current_step don't auto-advance post-pipeline | `runIntelligencePipelineInternal` end | Advance to `needs_review` + set current_step to Roadmap Builder | Stays `intake` | Add state-machine step at pipeline tail |
| 9 | P2 | `/admin` beforeLoad allows operator | `routes/admin.tsx:17-34` | Admin only, or explicit per-sub-route gate | Operator enters admin shell | Tighten `beforeLoad` to admin; move operator-safe admin pages elsewhere |
| 10 | P2 | Blocked agent tasks silent — no escalation | `engine.projects.$projectId.agent.tasks.tsx` + task server fns | Setting `blocked` fires `operator_notifications` + optional review item | Silent status change | Add trigger or server-side hook on task update to `blocked`/`needs_review` |

---

## Confirmation needed before Build mode

- Should the next build session focus on **P0 (1–3)** first, or the **momentum triad (3, 5, 8)** first?
- Any items to drop or reprioritize before I turn this backlog into an implementation plan?
