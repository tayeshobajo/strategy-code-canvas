# Phase H1.b + Impl-Plan Edit UI

## 1) Cost-overrun auto-pause notifications

### App-side (shipped this turn)

- `src/lib/email-templates/cost-overrun-autopause.tsx` — new React Email
  template with project name, spend/budget/overage, paused_at, reason, and a
  link to `/admin/cost-guard`.
- `src/lib/email-templates/registry.ts` — registered the template.
- `src/routes/api/public/hooks/cost-autopause.ts` — new public POST hook.
  - Verifies `apikey` header against `SUPABASE_PUBLISHABLE_KEY` (same pattern as
    the outcome-checkins hook, since `/api/public/*` bypasses edge auth).
  - Zod-validates `{project_id, project_name, spend_cents, budget_cents,
    reason, paused_at}`.
  - Posts a Slack message to `SLACK_WEBHOOK_URL` if the env var is set.
    Gracefully skips (and returns `slack_configured: false`) if not.
  - Enqueues one `cost-overrun-autopause` email per address in
    `OPERATOR_EMAILS ∪ ADMIN_EMAILS` via `enqueueTransactionalEmail`, using
    idempotency key `cost.autopause:<project_id>:<paused_at>:<recipient>` so
    a retried pg_net request never double-alerts.

### DB-side (NOT applied — awaiting Tai)

Migration proposal appended to `.orchestrator/PENDING_MIGRATIONS.md` under
**"Phase H1.b — Cost-Overrun Auto-Pause NOTIFICATIONS (trigger enhancement)"**.

- Enables `pg_net`.
- Replaces `tg_engine_agent_costs_cap_guard()` body: same auto-pause logic
  as H1 + a trailing `net.http_post` to the new hook. `PERFORM` swallows
  failures so alerting can never roll back the pause.
- Verification queries + rollback pointer included.

### Optional secret

`SLACK_WEBHOOK_URL` — set via workspace secrets to enable Slack alerts.
Without it, email-only alerts still ship.

## 2) Admin UI edit flow for implementation plans (H6·B12 governed)

- `src/routes/engine.projects.$projectId.implementation-plan.tsx`
  - Wired `saveProjectImplementationPlanDraft` (the only server fn that
    routes governed fields — `summary`, `payload` — through
    `admin_edit_impl_plan_governed`).
  - Added an "Edit draft" button in `HeaderCard` (visible only when
    `latest.status === 'draft'`).
  - Added new `<EditDraftDialog>` (shadcn Dialog) with title / summary / JSON
    payload editor. On save it validates the JSON, calls the server fn, toasts
    success, and invalidates the query. Non-draft plans render a locked
    banner so users know they need to create a new draft.

### Why this is safe

- Non-governed fields (`title`, `generated_by`) are direct updates via
  `supabaseAdmin` — as before.
- Governed fields (`summary`, `payload`) go **only** through
  `admin_edit_impl_plan_governed`. The
  `engine_impl_plans_require_proposal` trigger applied in Phase H6·B12
  blocks any other write path at the DB layer, so there is no bypass even
  if a future caller forgets the RPC.
- Route stays staff-gated (`assertStaff` inside `saveProjectImplementationPlanDraft`).

## Files

- created `src/lib/email-templates/cost-overrun-autopause.tsx`
- created `src/routes/api/public/hooks/cost-autopause.ts`
- created `.orchestrator/phase-h1b-cost-notifications-and-impl-edit-output.md`
- edited `src/lib/email-templates/registry.ts`
- edited `src/routes/engine.projects.$projectId.implementation-plan.tsx`
- edited `.orchestrator/PENDING_MIGRATIONS.md` (H1.b proposal appended)
