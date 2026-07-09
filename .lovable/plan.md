# Mockup Builder v1 — Structured Mockup Specs from Approved Frame

Builds the next factory stage after Frame Builder. Consumes an **approved** `engine_project_frames` payload and produces a structured, buildable mockup spec (no image generation). Mirrors Frame Builder's shape (table + server fns + workspace route + chat context) for consistency.

## 1. Database

New migration creates `public.engine_project_mockups`:

- `id uuid pk`, `project_id uuid → engine_projects`, `frame_id uuid → engine_project_frames`
- `title text`, `summary text`
- `status text` in (`draft`,`in_review`,`approved`,`archived`) default `draft`
- `generated_by text` in (`ai`,`human`,`hybrid`)
- `payload jsonb not null default '{}'`
- `created_by`, `created_by_email`, `approved_by`, `approved_by_email`, `approved_at`
- `created_at`, `updated_at` + trigger
- index on (`project_id`, `status`, `updated_at desc`), (`frame_id`)

Grants + RLS (mirroring hardened Frame Builder):
- `GRANT SELECT ON public.engine_project_mockups TO authenticated;`
- `GRANT ALL ON public.engine_project_mockups TO service_role;`
- **No INSERT/UPDATE/DELETE grants to authenticated/anon** — writes go through server fns using `supabaseAdmin` after capability checks.
- RLS SELECT policy: `public.is_engine_staff(auth.uid())`.
- Trigger `protect_approved_mockup()`: block UPDATE of `payload`/`title`/`status` (except approved→archived by admin) once `status='approved'`; block reverse transitions.
- Trigger `enforce_mockup_status_flow()`: draft→in_review→approved; approved→archived only.
- `submit_project_mockup(mockup_id)` and `approve_project_mockup(mockup_id)` SQL helpers (SECURITY DEFINER) that also write `engine_review_items` (kind=`mockup_set`) and `engine_audit_log`/`engine_activity`.

## 2. Server functions

New file `src/lib/engine-mockup-builder.functions.ts` (client-safe wrapper file, admin import lazy inside handlers):

- `getProjectMockupBuilder({ id })` — returns `{ project, approved_frame_summary, latest_mockup, history, missing_inputs, can_generate, next_best_action }`.
- `generateProjectMockups({ id })` — requires approved frame; calls Lovable AI Gateway with prompt built in new `src/lib/engine-mockup-builder-prompt.server.ts`; validates Zod schema; inserts new draft row (preserving prior versions); writes activity + chat event `mockup_generated`.
- `saveProjectMockupDraft({ mockupId, payload })` — staff only; blocked on approved.
- `submitProjectMockupToReview({ mockupId })` — draft→in_review, creates `engine_review_items` row.
- `approveProjectMockup({ mockupId })` — admin only; sets approved_*, writes audit/activity, triggers `compute_engine_next_best_action` → Backend Builder.
- `archiveProjectMockup({ mockupId })` — admin only.

All use `requireSupabaseAuth` + `has_role`/`is_engine_staff` checks; writes via lazy-imported `supabaseAdmin`.

## 3. Prompt / Zod schema

`src/lib/engine-mockup-builder-prompt.server.ts` — system prompt scoped to structured spec (no image output), inputs = approved frame payload + spine + roadmap summary + open decisions + artifacts.

`MockupBuilderPayload` Zod schema in `.functions.ts` matching the payload shape in the request (mockup_goal, source_frame_summary, design_system_notes, pages[], global_components, navigation_model, interaction_model, responsive_strategy, qa_expectations, open_decisions). Per-page: layout_sections, key_actions, states, responsive_notes, data_dependencies, backend_dependencies, qa_checks, open_questions. Parse strictly; reject on missing must-build pages from the approved frame.

## 4. Route + UI

New route `src/routes/engine.projects.$projectId.mockup-builder.tsx` (mirrors `frame-builder.tsx`):

- Header strip: status, current step, NBA, approved frame badge, mockup status, action buttons (Generate / Submit / Approve / Archive) gated by state + role.
- Sections A–I from the spec: Overview, Page Mockups (grouped by priority), Global Components, Interaction Model, Responsive Strategy, QA Expectations, Open Decisions, right-side AI PM panel.
- Empty state when no approved frame: disabled Generate with "Approve a frame before generating mockups." link back to Frame Builder.

Nav: add `Mockup Builder` step to `WORKSPACE_STEPS` in `src/lib/engine-workspace.ts` immediately after Frame Builder.

## 5. Project Chat integration

Extend `src/lib/engine-chat-context.server.ts` to include `latest_mockup_set` (status, page count, state count, global component count, open decisions, approved summary).

Update `src/lib/engine-chat-prompt.server.ts` (or equivalent) so chat can answer: what mockups exist, which pages/states covered, what's missing before backend, approval status, backend readiness.

## 6. Action Mode

In `src/lib/engine-chat-actions.ts` / `.functions.ts`, register only two low-risk proposals:
- `mockup.save_planning_artifact`
- `mockup.submit_to_review`

Explicitly deny (with clear refusal reason): approve mockup, generate backend, publish to client, send client messages.

## 7. QA script

`scripts/qa/mockup-builder-v1-qa.py` — Playwright-driven, using the seeded Jotaye admin session:

1. Load route as staff → 200; as anon → redirected.
2. With no approved frame (test project) → Generate disabled + copy shown.
3. On Jotaye (approved frame) → click Generate → capture row, chat event, activity.
4. Zod-validate payload; assert pages cover approved frame must-build pages.
5. Submit → verify `in_review` + `engine_review_items` (kind=`mockup_set`, pending).
6. Approve as admin → verify approved fields + NBA advances to Backend Builder.
7. Protection: PostgREST PATCH, reverse transition, silent overwrite — all fail.
8. Regression snapshot: client_portal_*, roadmap_approvals, engine_tasks, milestones — zero deltas.
9. Chat: ask 6 canonical mockup questions; verify grounded answers + refusal on approve/backend asks.
10. Screenshots at 1280×1800, 1024×1366, 390×844 for empty state, generated draft, page cards, global components, interaction model, responsive, QA, open decisions, submitted, approved.
11. Deliverable: `/mnt/documents/qa/mockup-builder-v1/REPORT.md`.

## 8. Out of scope

- Image / visual mockup generation (v2).
- Backend Builder (next stage).
- Client portal surfacing of mockups.
- Broad Action Mode actions beyond the two above.
- Non-admin operator role seeding (still deferred).

## Files (planned)

- `supabase/migrations/<ts>_mockup_builder_v1.sql`
- `src/lib/engine-mockup-builder.functions.ts`
- `src/lib/engine-mockup-builder-prompt.server.ts`
- `src/routes/engine.projects.$projectId.mockup-builder.tsx`
- edits: `src/lib/engine-workspace.ts` (nav step), `src/lib/engine-chat-context.server.ts`, chat prompt, `src/lib/engine-chat-actions*.ts`, `src/integrations/supabase/types.ts` (regen after migration)
- `scripts/qa/mockup-builder-v1-qa.py`

## Acceptance

All acceptance criteria from the request map 1:1 to the checks in the QA script (§7). Typecheck via `tsgo` at the end. No writes to `client_portal_*`, `roadmap_approvals`, `engine_tasks`, or milestones from any Mockup Builder path.
