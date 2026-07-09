# Backend Builder v1

Turn the approved mockup spec into a structured, reviewable backend blueprint. Planning layer only — no migrations applied, no code deployed, no schema changes outside Backend Builder's own table.

## 1. Database (single migration)

New table `public.engine_project_backend_plans`:
- `id`, `project_id` (FK engine_projects), `mockup_id` (FK engine_project_mockups), `frame_id` (nullable FK engine_project_frames)
- `title`, `summary`, `status` (`draft|in_review|approved|archived`), `generated_by` (`ai|human|hybrid`)
- `payload jsonb` (schema per spec: backend_goal, data_model, server_functions, permissions, integrations, workflows, api_endpoints, background_jobs, notifications, security_checks, qa_plan, implementation_sequence, open_decisions, risks)
- `created_by`, `created_by_email`, `approved_by`, `approved_by_email`, `approved_at`, `created_at`, `updated_at`
- Indexes on `project_id`, `mockup_id`, `status`

Grants (Frame/Mockup-parity):
```
REVOKE ALL ON public.engine_project_backend_plans FROM anon, authenticated;
GRANT SELECT ON public.engine_project_backend_plans TO authenticated;
GRANT ALL ON public.engine_project_backend_plans TO service_role;
```

RLS:
- Enable RLS
- SELECT policy: staff only via `has_role(auth.uid(),'operator'|'admin')`
- No INSERT/UPDATE/DELETE policies for anon/authenticated (server-only writes via service_role)

Protection trigger `protect_approved_backend_plan()`:
- On UPDATE/DELETE where OLD.status='approved', raise exception unless status transitioning to `archived` by admin server fn (mirror mockup protection pattern)

`updated_at` trigger.

## 2. Server functions (`src/lib/engine-backend-builder.functions.ts`)

All use `requireSupabaseAuth` + staff-role check. Approve/archive require admin.

- `getProjectBackendBuilder({ projectId })` — returns `{ project, approved_mockup, approved_frame, latest_plan, plans[], readiness: MissingBackendInput[] }`
- `generateProjectBackendPlan({ projectId })` — refuses if no approved mockup; assembles bundle (approved mockup + approved frame + spine + roadmap + artifacts + open decisions), calls AI via `engine-ai.server` with strict JSON schema prompt, inserts new `draft` row, writes audit + engine_activity
- `saveProjectBackendPlanDraft({ planId, payload })` — draft-only; blocks edits to approved
- `submitProjectBackendPlanToReview({ planId })` — status → `in_review`; creates `engine_review_items` row (`item_type='backend_plan'`, `status='pending'`, linked plan id); audit + activity
- `approveProjectBackendPlan({ planId })` — admin; sets approved_by/at; audit + activity; never touches roadmap_approvals, client_portal_*, or schema
- `archiveProjectBackendPlan({ planId })` — admin; status → `archived`; preserves payload

Prompt module: `src/lib/engine-backend-builder-prompt.server.ts` — mirrors mockup prompt module (system prompt: planning-only, spec-only, no runnable SQL executed; JSON schema hint; compact bundle assembly).

Readiness helper `assessBackendReadiness({ approved_mockup })` returns missing inputs (approved mockup required; empty pages array blocks).

## 3. Route + UI

New file `src/routes/engine.projects.$projectId.backend-builder.tsx` under the existing engine workspace layout.

Layout (following Mockup Builder pattern):
- **Header strip**: project name, status, current step, Next Best Action, approved mockup badge, plan status; buttons: Generate Backend Plan (disabled with tooltip if no approved mockup), Save Draft, Submit to Review, Approve (admin), Archive (admin)
- **A. Overview**: backend_goal, source_mockup_summary, architecture_summary, counts (tables, server fns, permissions, integrations, open decisions), readiness state
- **B. Data Model**: tables (name, purpose, fields, relationships, indexes, rls_rules, audit_requirements), enums, views, storage_buckets
- **C. Server Functions**: name, purpose, inputs, outputs, permissions, side_effects, audit_events, failure_modes
- **D. Permissions / RLS**: roles matrix; staff vs client-safe callouts; cross-project + portal boundary notes
- **E. Integrations / Workflows**: integrations, workflows (trigger, steps, success, failure), background_jobs, notifications
- **F. QA Plan**: role/data/rls/integration/edge/regression tests + expected evidence
- **G. Implementation Sequence**: migration → server fn → UI wiring → QA → rollback
- **H. Open Decisions + Risks**: blocking decisions, security risks, integration unknowns, owner, next action
- **Right-side AI PM panel** (reuse `StepAiPanel` shape): mockup requirements vs plan coverage, gaps, blockers, review status, next recommended action

Empty state when no plan exists: readiness card + Generate CTA (or blocked-explanation if no approved mockup).

## 4. Nav

Add "Backend Builder" `<Link>` in `src/components/engine/WorkspaceHeader.tsx` `WorkspaceToolbar`, positioned after Mockup Builder, using a `Database` lucide icon.

## 5. Review integration

`submitProjectBackendPlanToReview` inserts into `engine_review_items` with `item_type='backend_plan'`, `status='pending'`, and plan reference. Approve writes audit + activity; Next Best Action logic updated to recommend QA Factory / Implementation Plan after approved backend plan exists.

## 6. Project Chat integration

Extend `src/lib/engine-chat-context.server.ts` to fetch latest backend plan and inject a compact summary: status, table count, server-function count, permission/RLS count, integration count, open decisions, and approved payload summary (backend_goal + architecture_summary) when approved.

Chat prompt gains a "Backend plan" section describing what the chat can answer (plan status, tables, server fns, RLS, sequence, risks, readiness) and explicit prohibitions: no migration application, no deployment, no plan approval from chat, no schema mutation.

## 7. Safety invariants (enforced in every server fn)

- Never write to `client_portal_*`, `roadmap_approvals`, `roadmap_documents`, `subscriptions`, `orders`
- Never run DDL / never call `supabase.rpc` that mutates schema
- Never modify approved plans (trigger + application check)
- Every mutation writes `engine_audit_log` + `engine_activity`
- Generation refuses without approved mockup — server-side, not just UI

## 8. Files changed

Created:
- `supabase/migrations/<ts>_backend_builder_v1.sql`
- `src/lib/engine-backend-builder.functions.ts`
- `src/lib/engine-backend-builder-prompt.server.ts`
- `src/routes/engine.projects.$projectId.backend-builder.tsx`
- `scripts/qa/backend-builder-v1-qa.py` (harness scaffold; run in follow-up QA turn)

Edited:
- `src/components/engine/WorkspaceHeader.tsx` (nav link)
- `src/lib/engine-chat-context.server.ts` (backend plan context)
- `src/lib/engine-chat-prompt.server.ts` (chat instructions for backend plan)
- `src/integrations/supabase/types.ts` (regenerated after migration)
- `src/routeTree.gen.ts` (regenerated by router plugin)
- `.lovable/plan.md`

## 9. Acceptance verification (post-build)

- Route loads for staff; anon → `/auth`; client role → blocked
- Generate disabled + server-refused without approved mockup
- With approved mockup: generate → schema-valid payload with all required sections
- Save draft / Submit → creates pending `backend_plan` review item
- Approve → status=approved, audit+activity written, protection trigger blocks silent overwrite
- No writes to portal/roadmap tables (verified via probe)
- Project Chat answers backend-plan questions using injected context
- Typecheck clean (aside from pre-existing unrelated errors)

## 10. Known non-goals for v1

- No SQL execution / migration application
- No code deployment
- No auto-linking to QA Factory (recommendation only)
- No versioned diff view between plans (kept as list of preserved rows)

## 11. Recommended QA prompt (for follow-up)

Run Backend Builder v1 end-to-end QA covering: route+access, readiness gate, generation with/without approved mockup, payload schema, must-section coverage, UI rendering, submit-to-review, approve/protection, archive, Project Chat backend awareness, RLS/grants, protected-surface regression (portal/roadmap/tasks/milestones/subscriptions), audit+activity parity. Return report + screenshots + safe/not-safe recommendation for Implementation/QA Factory next.
