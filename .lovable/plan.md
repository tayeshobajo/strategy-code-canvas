# Frame Builder v1

Turn approved project direction into a buildable structural frame (pages, flows, roles, actions, states, data, backend, QA, open decisions) — before mockups.

## 1. Database

**Migration:** `engine_project_frames`
- id, project_id (FK engine_projects), source_version_id, source_artifact_id, title, summary
- status: `draft | in_review | approved | archived` (default draft)
- generated_by: `ai | human | hybrid`
- payload jsonb NOT NULL
- created_by, created_at, updated_at, approved_by, approved_at
- Indexes: (project_id, status), (project_id, created_at desc)

**GRANTs:** `SELECT` to authenticated; `ALL` to service_role. No anon.

**RLS:** staff-only SELECT via `is_engine_staff()`. No INSERT/UPDATE/DELETE policies — all writes go through server functions using `supabaseAdmin` (same pattern as `engine_project_artifacts`).

**Triggers:**
- `touch_updated_at`
- `enforce_transition`: draft→in_review→approved; draft→archived; approved→archived; block silent overwrite of approved payload (require archive-then-new-draft, or bump status field)
- `preserve_approved`: reject UPDATE of `payload` when previous status = approved unless new status = archived

## 2. Server functions

New file `src/lib/engine-frame-builder.functions.ts`:
- `getProjectFrameBuilder({ projectId })` — returns latest frame + history summary + capability flags
- `generateProjectFrame({ projectId })` — pulls spine/roadmap/artifacts/chat proposals via existing helpers, calls Lovable AI, returns draft frame; refuses & returns `missing_inputs[]` if insufficient approved direction
- `saveProjectFrameDraft({ projectId, frameId?, payload, title?, summary? })` — creates new draft or updates existing draft (never touches approved)
- `submitProjectFrameToReview({ frameId })` — status draft→in_review, creates `engine_review_items` row (`item_type='frame_set'`, `status='pending'`)
- `approveProjectFrame({ frameId })` — admin/owner only; in_review→approved; sets approved_by/at; writes activity recommending Mockup Builder as NBA
- `archiveProjectFrame({ frameId })`

Every mutation: `assertAdmin`/staff gate → project scope check → mutation → `engine_project_chat_events`/audit + `engine_activity` row. No client portal writes. No roadmap publish.

## 3. AI generation

Reuse `engine-ai.server.ts` gateway (`openai/gpt-5.5`). Prompt assembled from:
- `getProjectSpine` output
- approved roadmap milestones
- artifacts (implementation prompts, QA checklists)
- relevant chat proposals

Structured output via Zod schema mirroring the payload spec. Refusal path returns `{ ok: false, missing_inputs, recommended_clarifications }` — no invention.

## 4. Route + UI

**Route:** `src/routes/engine.projects.$projectId.frame-builder.tsx` (under existing workspace layout)

**Nav:** add "Frame Builder" entry to workspace nav near Project Spine/Chat.

Sections (single scrollable page):
- **Header**: project name, status, current step, NBA, frame status badge, `Generate Frame Set`, `Submit to Review`
- **Frame Overview**: summary, goal, roles, counts (pages/flows/open decisions/backend reqs), QA readiness
- **Pages/Screens**: cards grouped by `Must / Should / Later` — title, type, goal, primary user, roles, actions, states, data reads/writes, backend reqs, QA checks, open questions
- **User Flows**: actor, steps, success condition, edge cases
- **Data + Backend**: data objects, permissions, integrations, implied APIs/server fns
- **QA Expectations**: role/flow/data/edge/responsive tests, approval gates
- **Open Decisions**: blockers for mockups/backend/delivery, owner, suggested next action
- **Right-side AI PM panel**: what frame knows/missing/recommends/needs review/ready-for-mockups (reuses `StepAiPanel` style)

## 5. Review integration

Submit → `engine_review_items` insert (pending, linked frame_id). Approval flow is separate manual admin action in Frame Builder UI (no auto-approve on review). On approval, NBA text updates to "Move to Mockup Builder".

## 6. Project Chat integration

Extend `engine-chat-context.server.ts` to include latest frame: status, page count, must-build count, open decisions, approved summary. Chat can answer questions but cannot approve (no action added).

## 7. Action Mode integration

Add two proposal types to `engine-chat-actions.ts` action registry:
- `save_frame_artifact` — persists AI-generated frame payload as new draft
- `submit_frame_to_review` — advances existing draft

Both require Action Mode + admin capability. Approval intentionally excluded.

## 8. Hardening add-ons

- **Options validator**: change `.optional()` → `.nullish()` for `options` in `executeChatAction` (and other action-mode server fns) so `{"options": null}` succeeds.
- **Non-admin operator seed**: add doc/note in migration comment and seed `qa-operator-lite@trust-tai.com` via `user_roles` insert (role=`operator` only). Password provisioning noted in `.lovable/plan.md` — actual password set via Supabase Auth Admin API in a one-off script (documented, not committed).

## 9. Files (new + edited)

**New**
- `supabase/migrations/<ts>_frame_builder_v1.sql` — table, grants, RLS, triggers
- `supabase/migrations/<ts>_seed_qa_operator.sql` — role seed
- `src/lib/engine-frame-builder.functions.ts`
- `src/lib/engine-frame-builder-prompt.server.ts`
- `src/routes/engine.projects.$projectId.frame-builder.tsx`
- `src/components/engine/frame/FrameOverview.tsx`
- `src/components/engine/frame/FramePageCard.tsx`
- `src/components/engine/frame/FrameFlows.tsx`
- `src/components/engine/frame/FrameDataBackend.tsx`
- `src/components/engine/frame/FrameQA.tsx`
- `src/components/engine/frame/FrameOpenDecisions.tsx`
- `src/components/engine/frame/FrameAiPanel.tsx`
- `scripts/qa/frame-builder-v1-qa.py`

**Edited**
- `src/lib/engine-workspace.ts` — nav entry (or wherever workspace nav is defined)
- `src/components/engine/WorkspaceStepper.tsx` / workspace nav component
- `src/lib/engine-chat-actions.ts` — register new actions
- `src/lib/engine-chat-actions.functions.ts` — implement handlers, apply `.nullish()`
- `src/lib/engine-chat-context.server.ts` — include latest frame
- `src/lib/engine-chat-proposals.functions.ts` — allow new proposal types
- `src/integrations/supabase/types.ts` — regenerated after migration

## 10. QA harness

`scripts/qa/frame-builder-v1-qa.py`: Playwright + psql covering: staff-only access, generation with/without approved direction, draft save, submit-to-review, admin-only approval, protected-overwrite of approved, chat context includes frame, action-mode save/submit gated, no client_portal writes, audit/activity rows.

## 11. Acceptance

Matches the 14 acceptance items in the request. Returns after build: files changed, tables/RLS, server fns, schema, screenshots, test evidence, limitations, QA prompt.
