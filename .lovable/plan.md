
# Roadmap Engine — QA Audit & Gap-Closing Plan

Audit against the brief and QA checklist A–K. File:line evidence is cited so each finding is verifiable. No code has changed yet.

---

## 1. What passes

- **Global sidebar (QA-A)** — exactly the 8 required global items, no project-step leakage. `src/routes/engine.tsx:56–65`.
- **Server-side role gating** — every `engine.*` server fn requires `admin` (or `admin|operator` for the global ops set). Non-role users are blocked by both the code guard and RLS on every `engine_*` table.
- **Agent hard blocks** — `send_delivery` and `move_project_to_execution` are unconditionally blocked for agents regardless of stored policy. `engine-execution.functions.ts:30, 589–592`.
- **Approved-snapshot immutability** — `engine_projects.approved_snapshot` is written only by `approveVersion`; `updateProjectStep` and `applyAgentTask` never touch it. `engine-intelligence.functions.ts:447`.
- **`archiveVersion`** blocks archiving the currently approved version.
- **Agent Console, Task Board, Cost Center, Permissions pages** — real, live-data, persisted (`engine.projects.$projectId.agent.*.tsx`). Permissions page enforces the 3-tier policy + per-action Allowed/Needs approval/Blocked with server persistence.
- **Portal read path** — client portal reads `roadmap_documents.body_md` only; no direct engine→portal join exposes internal fields.

## 2. What partially passes

- **Overview page** — has version, deadlines, agent status, next action, activity; **missing "Modules needing review"**. `engine.projects.$projectId.overview.tsx`.
- **14 project steps** — steps 1 (Intelligence Layer) and 2 (Signal Room) are real. Steps 3–14 render live data but the **only write path is `StepEditor`, a raw JSON textarea** — no field-level editing, no AI-draft vs approved badge on any rendered field.
- **Version Compare** — shows added/modified/removed/conflicts/source, but investment-impact and client-copy-impact call-outs are missing, and per-change Accept/Edit/Reject decisions live in `useState` only.
- **Milestone Brief Workspace** — has criteria, dev prompt, QA checklist, dependencies, risks, related gap/asset/node, approval status; **missing** purpose, business/user/system outcomes, included/excluded scope; version history is hard-coded strings (`:291–296`); "Send to Agent" and "Regenerate Brief" buttons have no handlers.
- **Client-facing preview** — key diagnosis, 24-month destination, phases, blueprint pills; no milestone list, no client name, no signature block.
- **Cost Center** — all live except "Time saved" (hardcoded `approvedOutputs * 2h`) and "Download Report" button (stub).

## 3. What fails outright (P1)

1. **"Approve as New Official Version" button is unwired.** `engine.projects.$projectId.versions.compare.tsx:53, 244` — no `onClick`; `approveVersion` is unreachable from UI.
2. **Project-level Delivery "Send approved roadmap" button is unwired.** `engine.projects.$projectId.delivery.tsx:86–91` — no handler, checklist state is `useState` only (does not persist and resets on reload).
3. **`transitionDelivery` has no server-side approval-checklist guard.** Any admin/operator can POST `to: "sent" | "execution"` directly from Delivery Room without an approved review item. `engine-ops.functions.ts:70–103`.
4. **`approveMilestone` has no review-queue gate.** One-click admin approval; the "Approval Gate" section in the UI is cosmetic. `engine-execution.functions.ts:202–219`.
5. **`updateMilestone` overwrites `brief_md` and `acceptance_criteria` even when `approval_status = "approved"`.** `engine-execution.functions.ts:194–198`.
6. **PDF export includes internal-only fields.** `roadmap-pdf.ts:89` exports `point_b["10_year_position"]` verbatim; `:120` falls back to milestone `purpose` (internal) when `client_facing` is null. Any admin can export at any time with no project-status or approval check.
7. **`createProjectAgent` is `assertOps` (operator OR admin), not admin-only.** An operator can spin up a $5k/mo agent in "Execute approved actions" mode. `engine-ops.functions.ts:293`.
8. **`updateBudgetControls` has no upper-bound validation** on `monthly_cap_cents`. `engine-execution.functions.ts:485`.
9. **Investment changes have no dedicated review queue** — `updateProjectStep({ step: "investment" })` writes directly, and `applyAgentTask` in `execute_approved` mode can push investment changes via `MODULE_KEYS`. `engine-agent.functions.ts:271–282`.
10. **`client_preview` is in the agent's writable `MODULE_KEYS`** — an agent can propose direct rewrites of the client-facing preview.
11. **9 of 11 step areas have no draft-vs-approved row separation** (Point A/B, Hidden Assets, Gaps, Blueprint, Sequencing, Deadlines, Investment, Client Preview) — stored as mutable JSONB on `engine_projects`. Nothing (schema-side) prevents an approved value being overwritten in place.
12. **Global Intelligence Memory is a hard-coded 14-item array.** `engine.intelligence.tsx:27–42`. Metrics ("2,487 items", "68 sources") are static strings. Not connected to `engine_sources`/`engine_signals`.
13. **`engine_audit_log` allows UPDATE via RLS** — audit rows are not append-only.

## 4. High-risk approval-bypass paths (concise)

| Gate | Path | Fix |
|---|---|---|
| Approve new official version | UI button is dead stub | Wire button to `approveVersion` mutation |
| Send delivery | UI button is dead stub; server fn has no checklist gate | Add `sendRoadmapDelivery` server fn: assertAdmin + verify approved `engine_review_items` for this delivery + verify checklist rows |
| Move to execution | `transitionDelivery("execution")` has no gate | Require approved review item before this transition |
| Approve milestone | `approveMilestone` has no gate | Require review item OR all criteria verified server-side |
| Investment change | Direct `updateProjectStep` write; agent can propose in execute_approved | Route all `step="investment"` writes through review queue; drop `investment` from agent `MODULE_KEYS` |
| Publish client preview | Direct `updateProjectStep` write; agent can propose | Route through review queue; drop `client_preview` from agent `MODULE_KEYS` |
| Update approved milestone brief | `updateMilestone` overwrites in place | Reject writes when `approval_status = "approved"` unless a new draft version is created |
| Create high-budget agent | `createProjectAgent` = operator | Change to `assertAdmin` |
| Raise budget cap | `updateBudgetControls` has no max | Add `.max(1_000_000)` on `monthly_cap_cents` |

## 5. Client-preview leakage risks

- `roadmap-pdf.ts:89` — `point_b["10_year_position"]` exported verbatim.
- `roadmap-pdf.ts:120` — milestone `purpose` used as fallback when `client_facing` is null (internal text can leak).
- Milestone Brief page renders `m.confidence` and `m.estimated_cost_cents` — currently admin-only page, but no schema/API guard prevents future exposure via a portal fn.
- Preview page has no explicit sanitizer between internal fields and rendered fields.

## 6. Missing versioning guarantees

- No `roadmap_approvals` table — approval is one row column, no history of who approved what and why.
- `engine_change_events` is free-text observations, not a structured per-module diff (added/modified/removed with before/after values).
- `engine_milestones`, `engine_tasks`, `engine_agent_tasks` have no `roadmap_version_id` — version lineage untraceable.
- `client_portal_roadmaps` not FK-linked to `engine_roadmap_versions` — portal copy can silently drift.

## 7. Missing cost-control guarantees

- No `agent_costs` ledger table; cost aggregated on `engine_projects.agent_spend_month_cents`. No per-run cost row means no reliable per-milestone/per-category attribution beyond what's back-computed from `engine_agent_tasks`.
- `updateBudgetControls` accepts any integer for monthly cap.
- No cron-triggered hard stop when cap exceeded (soft warning and hard-stop % are stored but enforcement occurs only inside `assertActionAllowed` at call time — no notification when tripped).

## 8. Data model gaps (against target)

Missing tables: `source_extractions`, `roadmap_modules` (normalized), `roadmap_approvals`, `agent_runs`, `agent_outputs`, `agent_costs`, `milestone_briefs` (versioned), `acceptance_criteria` (as rows), `system_blueprint_nodes`, `hidden_assets`, `gaps`, `deadline_plans`, `investment_phases`, `intelligence_memory`, `client_previews` (versioned).

Missing metadata on agent-writable tables: `roadmap_version_id` FK, `approval_required` flag, `created_by` AI/human distinction (only `engine_tasks` uses `"agent"|"human"`).

Missing role: no `team-member` in `app_role` enum (`admin|operator|user` only; `user` is unused).

Missing audit rows for: intelligence pipeline runs, milestone approval, investment changes, client preview publish, delivery transition, permission/budget changes, source create/remove, review-item decisions.

## 9. Broken or confusing navigation / dead buttons

- Version compare "Approve" — dead
- Milestone brief "Send to Agent" / "Regenerate Brief" — dead
- Tasks board "Generate New Tasks" / "Import Tasks" — dead
- Cost Center "Download Report" — dead
- Project delivery "Send approved roadmap" — dead
- Intelligence Memory row "Actions" dropdown — dead
- Templates page — full "Coming next build" stub

---

## Recommended fixes — in priority order

### Priority 1 — Approval, delivery, leakage, version-history (do these first)

1. Wire the version-compare **Approve** button to `approveVersion` with confirmation checkbox + mutation, invalidating the compare query on success.
2. Build a `sendRoadmapDelivery` server fn (admin-only) that (a) verifies an approved `engine_review_items` row of type `Delivery Approval` exists for this delivery, (b) verifies checklist items are persisted (see #3), (c) then calls the delivery transition. Wire the project delivery "Send" button to it.
3. Persist the project delivery checklist as an `engine_delivery_checklist` table (or a JSONB column on `engine_delivery_items` with a completeness helper); block "Send" server-side until complete.
4. Add server-side review-queue gate to `transitionDelivery` for `sent | execution` transitions (any caller, including Delivery Room) — must reference an approved review item.
5. Add review-queue gate to `approveMilestone`; treat "one-click approve" as invalid without a corresponding approved review item OR a signed criteria checklist.
6. Reject `updateMilestone` writes to `brief_md` / `acceptance_criteria` when `approval_status = "approved"` (require a new draft brief version instead).
7. Route all `step = "investment"` and `step = "preview"` writes through the review queue; drop `investment` and `client_preview` from agent `MODULE_KEYS`.
8. Sanitize `roadmap-pdf.ts` — remove `10_year_position`, replace the milestone `purpose` fallback with an explicit "no client copy yet — omit" rule, add a project-status gate (`status === "approved"`) and a confirmation dialog before export.
9. Change `createProjectAgent` from `assertOps` to `assertAdmin`.
10. Add `.max()` on `monthly_cap_cents` in `updateBudgetControls`.
11. Make `engine_audit_log` append-only (drop UPDATE from RLS; block UPDATE/DELETE for everyone including admin).
12. Add audit rows on: pipeline run, milestone approve, investment save, preview save, delivery transition, permission/budget change, source create/remove, review decision.

### Priority 2 — Workflow, traceability, cost & permission controls

13. Add `roadmap_version_id` FK to `engine_milestones`, `engine_tasks`, `engine_agent_tasks`; backfill for existing rows.
14. Add `approval_required boolean` and normalized `created_by_kind text ('ai' | 'human')` to agent-writable tables (`engine_agent_tasks`, `engine_milestones`, `engine_tasks`). Extend `engine_agent_tasks.status` to include `suggested | needs_review | approved | archived` values.
15. Introduce a `roadmap_approvals` table (version_id, approver, approved_at, notes, review_item_id FK) so approvals have history.
16. Add `team-member` role to `app_role` enum and one RLS policy path (`assigned via user_roles` for the project) so future team assignment has a schema foundation.
17. Persist per-change Accept/Edit/Reject decisions on Version Compare (new `engine_version_change_decisions` table) and use them to compute the "official" merge.
18. Add investment-impact and client-copy-impact call-outs on Version Compare, computed server-side from `getVersionCompareData`.
19. Global **Intelligence Memory** page: replace hard-coded array with a real query — either (a) a new `engine_intelligence_memory` table with type/summary/tags/confidence/used-in that ops promotes items into, or (b) a live aggregation view of `engine_signals` + `engine_change_events` per project. Recommend (a) so promotion into memory is deliberate.
20. Overview page: add "Modules needing review" chip driven by `getVersionCompareData`.
21. Cost Center: wire "Download Report" to a server fn returning CSV; replace hardcoded time-saved with a stored `time_saved_hours_per_output` config.

### Priority 3 — UX polish and structured editors

22. Replace `StepEditor` JSON textareas with structured field-level editors for steps 3–12, each writing a normalized sub-table (Priority-2 schema work is the prerequisite).
23. Milestone Brief: add purpose, business/user/system outcomes, included/excluded scope; wire "Send to Agent" and "Regenerate Brief" to existing agent server fns.
24. Add an AI-draft badge on any field whose most recent writer is `created_by_kind = 'ai'` and whose status is not `approved`.
25. Templates page: real templates list + CRUD.
26. Fix small dead buttons (Generate New Tasks, Import Tasks, Memory-row actions).
27. Client preview: add milestone list, client name, confidentiality header, and an acceptance signature block.

---

## What I need from you before Priority-1 build

- **Confirm the "review queue is the single approval spine"**: every P1 gate (roadmap approve, milestone approve, delivery send, investment change, preview publish) creates an `engine_review_items` row and only proceeds when that row hits `approved`. Yes/no?
- **Delivery checklist source of truth**: keep the current 6 items or replace with a project-configurable checklist?
- **Team-member role**: introduce now (Priority 2) or defer?
- **`10_year_position` in PDF**: strip entirely, or replace with a curated "long-term view" field on `client_preview`?

Once you confirm those four, I'll implement Priority 1 in a single sweep, then Priority 2 as separate migrations + UI passes.
