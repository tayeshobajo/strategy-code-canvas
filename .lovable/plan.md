# Project Chat Action Mode v3 — Plan

Opt-in action execution layer for Project Chat. AI proposes, operator/admin explicitly triggers, server functions enforce every gate.

## 1. Database changes (single migration)

**a. Project-level Action Mode flag**
- `ALTER TABLE public.engine_projects ADD COLUMN action_mode_enabled boolean NOT NULL DEFAULT false`
- `ADD COLUMN action_mode_updated_at timestamptz`, `action_mode_updated_by text`
- No RLS change (existing staff-only policy covers it); only admins may toggle — enforced at server-fn layer.

**b. New table `engine_project_artifacts`** (staff-only)
```
id uuid pk, project_id uuid fk engine_projects, thread_id uuid null,
source_proposal_id uuid null fk engine_project_chat_proposals,
artifact_type text check in (client_clarification_draft,
  implementation_prompt, qa_checklist, milestone_brief, decision_note),
title text, summary text, payload jsonb default '{}',
status text default 'saved' check in (draft, saved, submitted_for_review, archived),
created_by_email text, created_by_user_id uuid,
created_at, updated_at
```
- GRANT SELECT to authenticated (RLS gates by is_engine_staff), GRANT ALL to service_role. No anon.
- REVOKE INSERT/UPDATE/DELETE from authenticated — mutations only via server fns using `supabaseAdmin`.
- RLS: `SELECT USING (public.is_engine_staff())`; no write policies (service role bypasses).
- Trigger `tg_touch_updated_at`.
- Index on `(project_id, artifact_type, created_at DESC)`.

**c. Audit event kinds** (no schema change — reuse `engine_project_chat_events` and `engine_activity`).

## 2. Action registry (`src/lib/engine-chat-actions.ts`, client-safe)

Single source of truth consumed by both UI (button visibility/labels/confirmation copy) and server (validation).

Fields per action: `action_id`, `label`, `description`, `allowed_proposal_types[]`, `required_capability`, `requires_action_mode` (bool — false only for save/dismiss/copy), `requires_approval` (confirmation), `mutates_protected_truth` (always false in v3), `confirmation_copy`, `success_message`, `failure_message`, `audit_event`.

Actions registered:
| id | proposal types | capability | needs Action Mode |
|---|---|---|---|
| `save_proposal` | all | staff | no |
| `dismiss_proposal` | all | staff | no |
| `submit_proposal_to_review` | review_item, implementation_prompt, qa_checklist, milestone_brief | canSubmitReview | yes |
| `convert_to_suggested_task` | suggested_task | canCreateTasks | yes |
| `save_clarification_draft` | client_clarification | canCreateArtifacts | yes |
| `save_implementation_prompt_artifact` | implementation_prompt | canCreateArtifacts | yes |
| `save_qa_checklist_artifact` | qa_checklist | canCreateArtifacts | yes |
| `save_milestone_brief_artifact` | milestone_brief | canCreateArtifacts | yes |
| `add_internal_decision_note` | any (or free) | canCreateArtifacts | yes |

Capabilities extend existing `getChatCapabilities` server fn with `canCreateArtifacts` (admin OR operator) and `actionModeEnabled` (from project row).

## 3. Server functions (`src/lib/engine-chat-actions.functions.ts`)

Single dispatcher `executeChatAction({ projectId, proposalId, actionId, options })` plus focused fns for artifact creation. Every call:

1. `requireSupabaseAuth` → resolve caller role via `has_role`
2. Load project, verify scope
3. Look up action in registry; fail if unknown
4. Check `action_mode_enabled` when `requires_action_mode`
5. Check capability
6. Load proposal (if applicable), validate `allowed_proposal_types` and current status (must be `draft` or `saved`)
7. Execute via `supabaseAdmin` (write artifact / task / review item)
8. Update proposal → `converted` with `converted_ref` where applicable
9. Insert audit event to `engine_project_chat_events` + activity to `engine_activity`
10. Return `{ artifact | task | reviewItem, proposal }`

Also: `setActionModeEnabled({ projectId, enabled })` — admin only; writes audit + activity (`action_mode_enabled` / `action_mode_disabled`).

Reuses existing hardened `convertChatProposalToSuggestedTask` and `submitChatProposalToReview` internally rather than duplicating.

## 4. UI changes

**`src/routes/engine.projects.$projectId.chat.tsx`**
- Load `actionModeEnabled` via `getChatCapabilities` (add to payload) + project row.
- Right-side panel: new "Action Mode" card for admins with on/off toggle, current status, warning copy.

**`src/components/engine/chat/ProposalCard.tsx`**
- Replace ad-hoc buttons with registry-driven button list. Each button:
  - Hidden when capability/proposal-type/status disallows.
  - Disabled with tooltip "Action Mode is off" when the action requires it and mode is off.
- Confirmation dialog (shadcn `AlertDialog`) shows action name, what will be created, what will NOT happen (no client exposure, no approval), linked proposal/project.
- Success/failure toasts from registry copy.

**New**: `src/components/engine/chat/ActionModePanel.tsx` (admin-only toggle card).

## 5. Protected-action refusals

No new server fn permits approve-roadmap, publish-to-portal, send-client-message, mark-delivered, investment changes, or completing official tasks. `engine-chat-prompt.server.ts` gets a short "refusal template" appended so the LLM answers protected requests with:
> "I can prepare this as a proposal, but I cannot execute or approve it from chat."

## 6. Audit / activity taxonomy

New `event_type` values in `engine_project_chat_events`: `action_mode_enabled`, `action_mode_disabled`, `chat_action_executed`, `chat_action_failed`, `artifact_created`, `decision_note_created` (plus reuses existing `proposal_converted_to_task`, `proposal_submitted_for_review`). `engine_activity` mirrors with `info`/`warning`. Payload includes `action_id`, `proposal_id`, `artifact_id`/`task_id`/`review_item_id`, `success`, `error_code`. Never stores prompts/tokens/secrets.

## 7. QA harness

`scripts/qa/project-chat-action-mode-v3-qa.py`:
- Toggles Action Mode on/off for Jotaye Ventures; verifies audit events.
- For each action id: attempts with mode off (should be blocked), then on (should succeed); asserts artifact/task/review row exists, proposal transitioned, audit written.
- Cross-project attempt (proposal from project A executed with project B id) → rejected.
- Non-admin attempt to toggle → rejected.
- Anon PATCH on `engine_project_artifacts` → rejected (RLS + revoked grants).
- Protected-action prompts ("approve roadmap", "publish to client") → confirms LLM refuses.
- Screenshots at `/tmp/browser/action-mode-v3/`.

## 8. Files

**New**
- `supabase/migrations/<ts>_action_mode_v3.sql`
- `src/lib/engine-chat-actions.ts` (registry, client-safe)
- `src/lib/engine-chat-actions.functions.ts` (dispatcher + artifact fns + toggle fn)
- `src/components/engine/chat/ActionModePanel.tsx`
- `src/components/engine/chat/ActionConfirmDialog.tsx`
- `scripts/qa/project-chat-action-mode-v3-qa.py`

**Edited**
- `src/components/engine/chat/ProposalCard.tsx` — registry-driven buttons + confirm dialog
- `src/routes/engine.projects.$projectId.chat.tsx` — Action Mode panel wiring, capability payload
- `src/lib/engine-chat-proposals.functions.ts` — extend `getChatCapabilities` return
- `src/lib/engine-chat-prompt.server.ts` — refusal template for protected asks
- `src/integrations/supabase/types.ts` — regenerated post-migration

## 9. Out of scope

- Roadmap approval, portal publish, client message send, task completion, investment/scope mutation.
- Auto-execution without operator click.
- Broadening any existing RLS.
- Client portal surfaces.

## 10. Acceptance verification (mapped to your list)

Every acceptance bullet is covered by: (a) migration default `false`, (b) admin-only toggle server fn, (c) registry-gated UI, (d) confirmation dialog, (e) server-fn scope + capability + transition checks, (f) audit + activity writes, (g) untouched roadmap/portal/task-completion paths, (h) RLS staff-only + revoked writes on new artifact table.
