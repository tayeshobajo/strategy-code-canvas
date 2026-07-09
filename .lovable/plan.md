# QA Factory v1

Mirror the Backend Builder v1 pattern (grants-hardened table, service-role server functions, staff-only UI, chat context injection, review integration) applied to QA planning derived from the approved backend plan + mockup + frame + spine.

## 1. Migration

`supabase/migrations/<ts>_qa_factory_v1.sql`

Create `public.engine_project_qa_plans`:
- `id uuid pk`, `project_id uuid` (fk `engine_projects`, cascade), `backend_plan_id uuid` (fk `engine_project_backend_plans`), `mockup_id uuid null`, `frame_id uuid null`
- `title text`, `summary text`, `status text check in (draft,in_review,approved,archived) default 'draft'`
- `generated_by text check in (ai,human,hybrid) default 'ai'`
- `payload jsonb not null default '{}'`
- `created_by uuid`, `created_by_email text`, `approved_by uuid null`, `approved_by_email text null`, `approved_at timestamptz null`
- `created_at`, `updated_at` + updated_at trigger

Grants (mirror Frame/Mockup/Backend hygiene):
```
REVOKE ALL ON public.engine_project_qa_plans FROM anon, authenticated;
GRANT SELECT ON public.engine_project_qa_plans TO authenticated;
GRANT ALL ON public.engine_project_qa_plans TO service_role;
```

RLS: enable; single SELECT policy `Staff can view qa plans` → `authenticated USING public.is_engine_staff()`. No INSERT/UPDATE/DELETE policies — all writes go through service-role server functions.

Trigger `trg_engine_project_qa_plans_enforce`:
- block transitions out of `approved` except to `archived`
- block silent overwrite of `payload` when status = `approved` (must archive + new draft)
- block status jumps that skip `in_review` before `approved`

Indexes: `(project_id, status)`, `(backend_plan_id)`.

## 2. Server functions

`src/lib/engine-qa-factory.functions.ts` (all `requireSupabaseAuth`, verify staff via `is_engine_staff`; approve/archive require admin role):

- `getProjectQaFactory({ projectId })` → readiness (approved backend plan? mockup? frame?), latest plan, history, review item state
- `generateProjectQaPlan({ projectId })` → refuses without approved backend plan; loads approved backend/mockup/frame payloads + spine + milestones/tasks/artifacts + open decisions/risks; calls AI via `engine-ai.server` with prompt from new `engine-qa-factory-prompt.server.ts`; validates payload schema (zod) covering all matrix categories + role/route/data/rls/workflow/ui_state/responsive/integration/audit/regression/edge_cases + evidence_plan + go_no_go_criteria + open_decisions + risks; inserts draft row; writes `engine_audit_log` + `engine_activity`
- `saveProjectQaPlanDraft({ planId, payload })` → only when status = `draft`; re-validates schema
- `submitProjectQaPlanToReview({ planId })` → draft → in_review; creates `engine_review_items` row `item_type='qa_plan'`, `status='pending'`, linked plan id; audit/activity
- `approveProjectQaPlan({ planId })` → admin only; in_review → approved; sets approved_by/at; audit/activity; refuses if already approved
- `archiveProjectQaPlan({ planId })` → admin only; any → archived; audit/activity

Guardrails (all functions): never touch `client_portal_*`, `roadmap_approvals`, `roadmap_documents`, `engine_projects.status`/investment fields, `engine_tasks`/`engine_milestones` status. No test execution. No deploy. Enforce in code and rely on grants as defense-in-depth.

## 3. Prompt

`src/lib/engine-qa-factory-prompt.server.ts` — system + user prompt builders. Inputs: approved backend plan payload, approved mockup payload, approved frame payload, spine snapshot, milestones/tasks, open decisions & risks. Output contract = payload schema above. Explicitly instruct: planning only, no auto-pass statuses, no delivery/deploy language, all statuses start `not_run`.

## 4. Chat context

Edit `src/lib/engine-chat-context.server.ts` to fetch latest non-archived `engine_project_qa_plans` row for the project and inject: status, overall_readiness, test count, blocking count, P0/P1/P2 counts, open decision count, risk count, approved summary. No new chat actions — read-only.

## 5. Route + UI

`src/routes/engine.projects.$projectId.qa-factory.tsx` — mirror `backend-builder.tsx` structure:
- Loader ensures staff via `requireSupabaseAuth`; suspense query on `getProjectQaFactory`
- Header: project meta, backend-plan-approved badge, QA plan status, buttons (Generate disabled with tooltip when no approved backend plan; Submit when draft; Approve/Archive admin-only)
- Sections A–K as specified: Overview, Test Matrix (grouped tabs by category / filters by priority + blocking), Role+Route, Data+RLS, Workflow, UI State+Responsive, Integration+Audit, Go/No-Go, Open Decisions+Risks, right-side AI PM panel summarizing coverage vs approved backend plan
- Uses existing engine primitives (`EngineStatusBadge`, cards, `AuditTrail`, `AIDraftBadge`) — no new design system

Add nav entry in `src/components/engine/WorkspaceHeader.tsx` `WorkspaceToolbar` after Backend Builder: `QA Factory` linking to the new route (icon `ClipboardCheck`).

## 6. Review integration

Reuse existing `engine_review_items` table. Add handling in the review queue UI only if it already renders by `item_type` generically; otherwise leave to a follow-up (out of scope for v1 — plan approval works from the QA Factory page). Note this as a known limitation.

## 7. Acceptance verification (post-build)

- typecheck
- migration applies cleanly (grants + RLS + trigger)
- `psql` sanity: anon/authenticated cannot INSERT/UPDATE/DELETE; authenticated SELECT via `is_engine_staff`
- Route loads for staff; hidden for anon/client
- Generate disabled without approved backend plan, enabled with one; produces schema-valid payload
- Submit → creates pending qa_plan review item
- Approve blocks silent overwrite (trigger)
- No writes to protected surfaces (snapshot before/after)
- Chat answers listed questions

## Deliverables (returned after build)

Files changed, tables/RLS/grants, server functions, payload schema (zod), screenshots, test evidence, known limitations (v1 does not execute tests; generic review-queue rendering may need per-item-type UI follow-up), recommended QA prompt.

## Files touched

New:
- `supabase/migrations/<ts>_qa_factory_v1.sql`
- `src/lib/engine-qa-factory.functions.ts`
- `src/lib/engine-qa-factory-prompt.server.ts`
- `src/routes/engine.projects.$projectId.qa-factory.tsx`

Edited:
- `src/components/engine/WorkspaceHeader.tsx` (nav entry)
- `src/lib/engine-chat-context.server.ts` (QA context injection)
- `src/integrations/supabase/types.ts` (regenerated by migration)
- `src/routeTree.gen.ts` (auto)
