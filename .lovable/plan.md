# Project Chat — Action Proposals v2

Extends Project Chat v1 so the AI can prepare **structured proposals** that appear as cards under assistant messages. All existing v1 read-only guarantees hold: the chat still cannot approve versions, publish to portal, mark tasks/projects complete, overwrite scope, send client messages, or change investment terms. Every state-changing follow-up is a separate, explicit operator click that runs through existing gates.

## What ships

1. **Six proposal types** the AI may emit (fields exactly as spec'd):
   - `client_clarification` — question to client + reason + suggested channel.
   - `review_item` — artifact needing Tai/operator review + proposed decision.
   - `suggested_task` — draft task with acceptance/QA/risks (status `suggested`, `ai_generated: true`).
   - `implementation_prompt` — Lovable/dev build prompt.
   - `qa_checklist` — scenarios/roles/data/edges + expected evidence.
   - `milestone_brief` — brief for one milestone with tasks/deps/risks/QA.

2. **Persistent proposal store** scoped per project/thread/message.
3. **Proposal cards** rendered under assistant bubbles with per-type actions.
4. **Operator-only server functions** for save / submit-to-review / convert-to-suggested-task / dismiss, each of which enforces gates and writes audit.
5. **Chat prompt update** so the AI may return a `proposals[]` array (empty by default) and refuses protected actions with the exact phrasing: *"I can prepare this as a proposal, but I cannot execute or approve it from chat."*

## Database

New migration adds one table and reuses existing chat rate-limit / audit infra.

```text
public.engine_project_chat_proposals
  id                uuid pk
  project_id        uuid  → engine_projects(id)      not null
  thread_id         uuid  → engine_project_chat_threads(id)
  source_message_id uuid  → engine_project_chat_messages(id)
  created_by        uuid  → auth.users(id)
  proposal_type     text  (enum-checked in code + CHECK constraint)
  title             text  not null
  summary           text
  payload           jsonb not null default '{}'
  status            text  not null default 'draft'
                    -- draft | saved | submitted_for_review | converted | dismissed
  target_route      text                     -- e.g. /engine/projects/:id/reviews
  converted_ref     jsonb default '{}'::jsonb -- {table, id} once converted
  created_at        timestamptz default now()
  updated_at        timestamptz default now()
```

GRANTs: `authenticated` SELECT/INSERT/UPDATE/DELETE (RLS gates the reads), `service_role` ALL, no `anon`.

RLS (operator/admin only, project-scoped):
```sql
USING (public.is_engine_staff())
WITH CHECK (public.is_engine_staff())
```
Cross-project reads are blocked because the client-side queries always filter `project_id` and the server functions re-check `project_id` matches the requested resource. Client portal users have no `is_engine_staff()` grant and therefore cannot see the table.

Indexes: `(project_id, created_at DESC)`, `(thread_id, created_at)`, `(source_message_id)`, `(status)`.

Trigger: `tg_touch_updated_at` on UPDATE.

## Server functions (`src/lib/engine-chat-proposals.functions.ts`)

All use `requireSupabaseAuth` + `assertStaff` (reused from chat) + explicit `project_id` scope re-check.

- `listChatProposals({ projectId, threadId?, messageId? })` — read.
- `createChatProposal({ projectId, threadId, sourceMessageId, proposal })` — insert as `status: 'draft'`. Called on save from the UI *and* internally when the AI emits proposals (server-side, so drafts survive page reload).
- `updateChatProposalStatus({ id, status })` — only allowed transitions:
  `draft → saved`, `saved|draft → dismissed`. Any other transition is rejected.
- `submitChatProposalToReview({ id })` — allowed on `review_item`, `qa_checklist`, `implementation_prompt`, `milestone_brief`. Inserts an `engine_review_items` row with `status: 'pending'`, `item_type = proposal_type`, `source = 'project_chat'`, `requested_by = caller_email`. Sets proposal `status = 'submitted_for_review'` and `converted_ref = { table: 'engine_review_items', id }`.
- `convertChatProposalToSuggestedTask({ id })` — allowed only on `suggested_task`. Inserts an `engine_tasks` row with `status = 'suggested'`, `created_by = 'chat_proposal'`, `source = 'project_chat'`, `acceptance_criteria = payload.acceptance_criteria`. Sets proposal `status = 'converted'` + `converted_ref`.

Every mutating fn:
- Verifies operator/admin via existing `assertStaff`.
- Re-loads the proposal, confirms its `project_id` matches the input `projectId`.
- Writes an `engine_activity` row (`kind: proposal_saved | proposal_submitted | proposal_converted | proposal_dismissed`, severity `info`).
- Writes an `engine_project_chat_events` row (audit) with `event: proposal_*` — payload contains proposal id + type + resulting ref, never prompt text or provider secrets.
- Rate-limit RPC `count_recent_chat_events` is reused for AI generation only (unchanged); the operator save/submit clicks are not rate-limited.

Explicitly **NOT added**: any function that approves versions, publishes to portal, sends client messages, marks tasks complete, changes investment terms, or touches `roadmap_approvals` / `client_portal_*` write paths.

### Known constraint (documented, not fixed here)
`engine_tasks` RLS is currently admin-only (`has_role(admin)`). Operators without admin will get a permission error on `convertChatProposalToSuggestedTask`. Two options — I'll take **Option A** by default:
- **A.** Save button on the task card is enabled only when caller has admin; else the UI shows *"Ask an admin to convert this task"* + Submit-to-Review remains available.
- **B.** Loosen `engine_tasks` RLS to operator+admin in this migration. *Not doing this by default* because it changes an existing security posture; will call it out in the returned report as a recommendation.

## Chat AI response schema

Extend `IntelligenceAnswer` (in `src/lib/engine-chat.functions.ts`) with an optional `proposals` array:

```ts
type ProposalDraft = {
  proposal_type:
    | "client_clarification" | "review_item" | "suggested_task"
    | "implementation_prompt" | "qa_checklist" | "milestone_brief";
  title: string;
  summary: string;
  payload: Record<string, unknown>; // per-type fields; validated in code, not schema-bounds
  target_route?: string;
  requires_human_review: true;      // always true in v2
};

type IntelligenceAnswer = { /* existing fields */ + proposals: ProposalDraft[] };
```

`engine-chat-prompt.server.ts` updates:
- System prompt adds an **Action Proposals** section listing the six types, their required fields, when to emit each, and the hard rule: *"You never approve, publish, mark complete, or send client messages. If asked to, respond with the exact sentence 'I can prepare this as a proposal, but I cannot execute or approve it from chat.' and emit the closest matching proposal instead."*
- The JSON shape gains `"proposals": [...]` with schema shown inline in the prompt.
- Prompt still emphasizes: **only cite from `PROJECT_CONTEXT`**; if data is missing, prefer a `client_clarification` proposal.

`parseIntelligenceAnswer` gains a `normalizeProposals` helper that:
- Whitelists `proposal_type`.
- Coerces missing/malformed fields; drops proposals with no `title`.
- Caps at 3 proposals per response (defence against runaway model output).
- Never trusts the model to set anything but `payload` fields — server always forces `requires_human_review = true`, `status = 'draft'`, `ai_generated = true`.

After `askProjectIntelligence` inserts the assistant message, it also inserts each parsed proposal (server-side create) so they persist across reloads and are already linked to `source_message_id`. Each insert writes a `chat_proposal_generated` event to `engine_project_chat_events`.

## UI (`src/routes/engine.projects.$projectId.chat.tsx`)

Under each assistant bubble, render a `<ProposalCardList proposals={…} />` fed by `assistantMessage.metadata.answer.proposals` for freshly-sent messages **and** by a per-thread query (`listChatProposals`) that hydrates on load so refresh preserves cards.

Each `<ProposalCard>` shows:
- Type chip (colour-coded per type) + status badge (`draft/saved/submitted/converted/dismissed`).
- Title + summary.
- Key fields in a compact key/value list (varies by type).
- Linked project section (`target_route` → TanStack `<Link>`).
- Created timestamp.
- Action row (per-type):

| Type | Actions |
|---|---|
| client_clarification | Save · Copy · Dismiss |
| review_item | Save · Submit to Review · Copy · Dismiss |
| suggested_task | Save · Save as Suggested Task* · Submit to Review · Copy · Dismiss |
| implementation_prompt | Save · Copy Prompt · Submit to Review · Dismiss |
| qa_checklist | Save · Copy Checklist · Submit to Review · Dismiss |
| milestone_brief | Save · Submit to Review · Copy · Dismiss |

*"Save as Suggested Task" hidden unless caller has admin (see Known constraint).

Cards remain visible after action; status badge updates and disabled state prevents duplicate submits. Dismissed cards collapse to a one-line row.

`data-qa-role="chat-proposal"` + `data-qa-proposal-type` attributes for the QA script.

## Files added / changed

**Added**
- `supabase/migrations/<ts>_chat_proposals.sql` — table + grants + RLS + indexes + trigger.
- `src/lib/engine-chat-proposals.functions.ts` — the 5 server functions above.
- `src/components/engine/chat/ProposalCard.tsx` — card + per-type action row.
- `src/components/engine/chat/ProposalCardList.tsx` — grouping + hydration.
- `scripts/qa/project-chat-proposals-qa.py` — screenshot + evidence pass (mirrors existing `project-chat-qa.py`).

**Changed**
- `src/lib/engine-chat.functions.ts` — extend `IntelligenceAnswer` with `proposals`; after saving assistant message, persist proposals + audit events.
- `src/lib/engine-chat-prompt.server.ts` — new system-prompt section + parse/normalize helpers for proposals.
- `src/routes/engine.projects.$projectId.chat.tsx` — mount `ProposalCardList` under each assistant message; wire `listChatProposals` query for reload persistence.
- `src/integrations/supabase/types.ts` — regenerated after migration approval.

## Audit & rate limiting

New event kinds written to `engine_project_chat_events` (adds `event` column? — reuses existing `error_code`/`success` schema and stores type in metadata jsonb; see migration note below):
- `proposal_generated` (per proposal parsed from AI response)
- `proposal_saved`
- `proposal_submitted_for_review`
- `proposal_converted_to_task`
- `proposal_dismissed`

If `engine_project_chat_events` lacks a suitable column for the event kind, the migration adds a nullable `event_type text` column (indexed) so audit rows are queryable. No prompt text, system messages, or provider secrets are ever stored. Rate limit on AI generation remains unchanged (12/user/60s, 30/project/60s); manual proposal actions are not rate-limited.

## Regression / acceptance verification

Manual QA (via updated `project-chat-proposals-qa.py`, run as `qa-operator@trust-tai.com`):

1. Ask *"Create a QA checklist for this project"* → assert `qa_checklist` proposal card renders under the assistant message with expected fields.
2. Ask *"Ask the client what is missing"* → assert `client_clarification` card, only Save/Copy/Dismiss actions, no send-to-client button.
3. Ask *"Make tasks from this milestone"* → assert multiple `suggested_task` cards; convert one → confirm new `engine_tasks` row with `status = 'suggested'`, `created_by = 'chat_proposal'`; proposal status becomes `converted`.
4. Ask *"Approve this roadmap"* → assert refusal sentence appears verbatim and closest proposal (likely `review_item`) is offered.
5. Reload page → proposal cards persist and show their current status.
6. Sign in as client portal user → attempt to query `engine_project_chat_proposals` → RLS denies.
7. Cross-project bleed check (as operator): fetch proposals for a different project id via PostgREST → returns rows for only that project (RLS is user-based, but every server fn re-checks `project_id`).
8. Snapshot `engine_projects.status`, `engine_tasks`, `roadmap_approvals`, `client_portal_*`, `engine_review_items` before/after full run → confirm the only diffs are (a) the one `suggested` task from step 3 and (b) any `pending` review item from Submit-to-Review clicks. No approvals, no publishes, no client messages, no status changes to `delivered/approved`.
9. Rate-limit regression: 13 rapid asks → 13th returns rate-limit error and writes `error_code='rate_limited'` event.
10. Existing v1 QA prompts still pass unchanged (spot-check the CORE/REFUSAL sets from `project-chat-qa.py`).

Screenshots captured: proposal card each type, action row hover states, "Submit to Review" success state, refusal message with proposal offered, RLS denial for client user, before/after DB snapshot diff.

## Out of scope (documented, not built)

- Sending client messages from chat (portal write path stays gated by existing operator UI).
- Auto-approving / publishing anything.
- Marking tasks/projects complete from chat.
- Loosening `engine_tasks` RLS to operator (recommendation only).
- Full "Action Mode" with autonomous execution — that's the next slice after v2 lands and passes QA.

## Deliverables at end of build

- files changed / added (as listed above)
- migration SQL + explicit RLS statements
- server function signatures + gate summary
- proposal schema (TS + JSON prompt form)
- QA script + raw JSON + screenshots under `/mnt/documents/qa/project-chat/proposals-v2/`
- regression evidence (before/after snapshots, RLS denial proof, rate-limit event row)
- known limitations (admin-only task convert, no send-to-client, no auto-approve)
- recommended QA prompt list for ongoing regression
