## Implementation Plan v1 — Build Sequence Layer

Mirror the QA Factory v1 pattern (table + server fns + workspace route + chat context + review integration). Planning-only: no migrations applied, no code deployed, no QA marked passed, no delivery mutations.

### 1. Migration — `engine_project_implementation_plans`

Single migration adding one new table. Follows Cloud grant/RLS discipline.

Columns: `id`, `project_id` (FK `engine_projects`), `backend_plan_id` (FK `engine_project_backend_plans`), `qa_plan_id` (FK `engine_project_qa_plans`), `mockup_id`, `frame_id` (both nullable), `title`, `summary`, `status` (`draft|in_review|approved|archived`, default `draft`), `generated_by` (`ai|human|hybrid`), `payload` jsonb, `created_by`, `created_by_email`, `approved_by`, `approved_by_email`, `approved_at`, `created_at`, `updated_at`.

Indexes: `(project_id, status)`, `(project_id, updated_at desc)`.

Grants + RLS:
- `GRANT SELECT ON ... TO authenticated` (staff-only surface — RLS gates)
- `GRANT ALL ... TO service_role`
- No anon grants
- RLS enabled; SELECT policy: `has_role(auth.uid(),'admin' | 'operator' | 'team_member')`; no INSERT/UPDATE/DELETE policies (server functions use service_role)

Trigger: `protect_approved_implementation_plan()` — blocks UPDATE of `payload`/`title`/`status` downgrades on `approved` rows (mirrors QA plan protection). `updated_at` trigger.

No changes to `client_portal_*`, `roadmap_approvals`, `engine_projects.status`, backend/mockup/frame/QA payloads.

### 2. Server functions — `src/lib/engine-implementation-plan.functions.ts`

All use `requireSupabaseAuth` + staff role check. Load `supabaseAdmin` inside handlers.

- `getProjectImplementationPlan({ projectId })` — returns `{ current, history[], readiness }`. `readiness` reports approved backend plan + approved QA plan presence.
- `generateProjectImplementationPlan({ projectId })` — refuses if either approved backend plan or approved QA plan is missing. Builds prompt from approved payloads (backend, QA, mockup, frame, Spine, milestones, tasks, artifacts, open decisions/risks). Calls Lovable AI, validates schema, inserts new `draft` row. Never mutates prior rows.
- `saveProjectImplementationPlanDraft({ projectId, planId, payload })` — only when status = `draft`. Schema-validated.
- `submitProjectImplementationPlanToReview({ planId })` — sets `in_review`, inserts `engine_review_items` row (`item_type='implementation_plan'`, `status='pending'`).
- `approveProjectImplementationPlan({ planId })` — admin only. Sets `approved`, `approved_by/_at/_email`. Writes audit + activity.
- `archiveProjectImplementationPlan({ planId })` — admin only. Sets `archived`.

Every mutation writes `engine_audit_log` + `engine_activity`. None touch client portal, roadmap approvals, QA test statuses, project delivered status, or approved upstream payloads.

Prompt builder in `src/lib/engine-implementation-plan-prompt.server.ts` producing the payload shape from the user's spec (implementation_goal, phases, build_steps, migration_plan, server_function_plan, ui_wiring_plan, permission_rls_plan, integration_plan, qa_execution_order, developer_prompts, parallelization, rollback_strategy, release_gates, open_decisions, risks).

Zod schema for payload validation (rejects LLM output that marks steps as executed/deployed/passed).

### 3. Route + UI — `src/routes/engine.projects.$projectId.implementation-plan.tsx`

Follow QA Factory page structure.

Header: project name, status, current step, live NBA, approved backend badge, approved QA badge, implementation plan status, Generate / Submit / Approve (admin) / Archive (admin) buttons.

Sections A–L per spec: Overview, Build Phases, Build Steps (grouped by phase + priority), Migration Plan, Server Function Plan, UI Wiring Plan, Permission/RLS Plan, QA Execution Order, Developer Prompts (Lovable / OpenClaw / dev / QA with copy buttons), Rollback + Release Gates, Open Decisions + Risks.

Right rail M: `StepAiPanel`-style AI PM panel showing what's known, what blocks execution, next recommended action.

Empty state when readiness fails: explains "Approve a backend plan and QA plan before generating implementation." Generate button disabled.

### 4. Workspace nav wiring

- `src/components/engine/WorkspaceHeader.tsx` — add "Implementation Plan" step after "QA Factory".
- Any workspace stepper enum / step registry that lists QA Factory — add implementation-plan entry.

### 5. Chat context integration

`src/lib/engine-chat-context.server.ts` — add `implementation_plan` block: `status`, `latest_id`, `phase_count`, `build_step_count`, p0/p1/p2 counts, high-risk count, open decisions, approved summary, `ready_for_build_execution` flag. Filter out `archived` (mirror QA plan handling).

Update chat prompt so it can answer the build-planning questions in the spec, and reiterate it must not apply migrations, deploy, mark tests passed, approve plans, or mark delivered.

### 6. Review + NBA integration

- `engine_review_items` already supports arbitrary `item_type`; add `'implementation_plan'` handling wherever the review console renders labels/links (route to the new page).
- `compute_engine_next_best_action` (SQL function): extend to recommend "Generate Implementation Plan" when backend+QA approved and no draft; "Submit Implementation Plan to Review" when draft exists; "Approve Implementation Plan" when in review; "Ready for Build Execution / OpenClaw handoff" when approved. Never returns "delivered".

### 7. Types + route tree

- Regenerate `src/integrations/supabase/types.ts` (post-migration).
- `src/routeTree.gen.ts` regenerates from new route file.

### 8. Files created / edited

Created:
- `supabase/migrations/<ts>_implementation_plans.sql`
- `src/lib/engine-implementation-plan.functions.ts`
- `src/lib/engine-implementation-plan-prompt.server.ts`
- `src/routes/engine.projects.$projectId.implementation-plan.tsx`

Edited:
- `src/components/engine/WorkspaceHeader.tsx` (nav)
- `src/lib/engine-chat-context.server.ts` (context block)
- `src/lib/engine-chat-prompt.server.ts` (guidance)
- `compute_engine_next_best_action` SQL (in the same migration)
- review console label/link map (if one exists)
- `src/integrations/supabase/types.ts` + `src/routeTree.gen.ts` (regenerated)

### 9. Out of scope (v1)

- No Build Execution / OpenClaw handoff runner
- No auto-migration application
- No code generation from developer prompts
- No changes to Frame / Mockup / Backend / QA payload shapes
- No client portal surfaces

### 10. QA follow-up (separate task after build)

End-to-end harness (mirroring `scripts/qa/qa-factory-v1-qa.py`): readiness gating, generate → submit → approve → archive lifecycle, protection of approved payloads, chat awareness, RLS/permission checks, protected-surface diff (client_portal_*, backend/QA/mockup/frame payloads, project status, roadmap approvals) before/after approval.
