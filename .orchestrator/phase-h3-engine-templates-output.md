# Phase H3 — Business Engine Templates

Closes **M3–M6** from `.orchestrator/audit/capability-audit-2026-07-14b.md`:
Content Authority, Lead Follow-Up, Review & Reputation, Client Success.

## Design decision — templates live in code, not the DB

`engine_business_engines.project_id` is `NOT NULL`, so a "template" cannot
be a row in that table without either (a) a schema change to allow
NULL project_id + an `is_template` flag, or (b) a synthetic placeholder
project. Neither is worth the migration surface: templates are static,
version with the app, and cloning must produce a real project-scoped row
anyway. So the four templates are TypeScript constants
(`src/lib/engine-business-engine-templates.ts`) and cloning writes a
real `engine_business_engines` row tagged `metadata.template_id`.

**No schema changes.**

## What shipped

- `src/lib/engine-business-engine-templates.ts` — 4 canonical templates:
  - **Content Authority** (weekly, cron `0 14 * * 1`, 6-step publish loop, editorial-review gate)
  - **Lead Follow-Up** (every 15 min, T+0/24h/72h/7d cadence, 60-min first-response SLA)
  - **Review & Reputation** (weekly, post-delivery trigger, 48h response SLA, negative-review escalation)
  - **Client Success** (monthly on 1st, health-score deltas, at-risk exception surfacing)

  Each carries `workflow[]`, `triggers`, `approval_rules`, `metrics[]`,
  and `exception_rules[]` and maps directly to the existing
  `business_engine_kind` enum (`content_authority`, `lead_followup`,
  `review_reputation`, `client_success`).

- `src/lib/engine-business-engine-templates.functions.ts`:
  - `listEngineTemplates()` — returns the catalog plus every cloned
    instance already in `engine_business_engines`. Instances are matched
    by `metadata.template_id`, with fallback to `kind` for pre-H3 rows.
  - `proposeEngineFromTemplate({ templateId, projectId, ownerEmail? })`
    — inserts a **draft** engine with the full template payload,
    creates an `engine_review_items` row (`item_type='engine_template_clone'`,
    `source='engine_template_clone'`, `impact='high'`), and writes
    `engine_audit_log` + `engine_activity`. Duplicate check: refuses to
    clone the same `kind` twice into a project while any prior instance
    is not archived.
  - `approveEngineFromTemplate({ engineId, reviewItemId, ownerEmail,
    approverEmail })` — activates via existing `activate_business_engine`
    RPC. **Separate-approver enforced in code** (cloner ≠ approver, and
    signed-in email must match `approverEmail`); the DB trigger
    `engine_business_engines_no_self_approve` blocks any bypass.
  - `rejectEngineFromTemplate({ engineId, reviewItemId, reason })` —
    archives the draft, writes rejection reason to metadata + audit.

- `src/routes/admin.engine-templates.tsx` — full admin surface:
  catalog cards with expandable details (workflow, metrics, exception
  rules), clone form (project + optional owner), instance table per
  template, activate + reject forms.

- `src/routes/admin.tsx` — nav entry (`LayoutTemplate` icon).

## Governance guarantees

- No AI approves its own work: cloner is the staff email; activator must
  be a different signed-in staff email; DB trigger enforces at insert/update.
- Every propose/approve/reject writes `engine_audit_log` with
  `action='engine.template.proposed|approved|rejected'` and matching
  `engine_activity` row.
- Draft engines are inert — no cron, no `active` status, no writes to
  `engine_business_engine_runs` — until activation.
- Templates use the DB enum `business_engine_kind` values directly, so
  every existing consumer of `engine_business_engines.kind` handles them
  without any code change.

## Verification

1. `/admin/engine-templates` shows 4 template cards with correct
   cadence, cron, workflow count, metrics count, and exception count.
2. Paste a real `engine_projects.id`, click **Clone into project** on
   Content Authority → toast shows `engineId` + `reviewItemId`.
3. `SELECT id, kind, status, metadata->>'template_id' FROM
   engine_business_engines ORDER BY created_at DESC LIMIT 1;` shows the
   new draft.
4. `SELECT item_type, status, impact, source FROM engine_review_items
   WHERE project_id = '<projectId>' ORDER BY created_at DESC LIMIT 1;`
   shows `engine_template_clone` / `pending` / `high` / `engine_template_clone`.
5. From a different staff account (or with a mismatching approverEmail),
   attempt activate → rejected with self-approval error. Activate as a
   distinct staff email → engine flips to `active`, review item flips
   to `approved`, audit + activity rows written.
6. Clone same template into same project again → duplicate check blocks.
7. Reject a draft → engine `archived`, review item `rejected`, reason
   in `metadata.rejection_reason`.

## Files

- created `src/lib/engine-business-engine-templates.ts`
- created `src/lib/engine-business-engine-templates.functions.ts`
- created `src/routes/admin.engine-templates.tsx`
- edited `src/routes/admin.tsx` (nav + icon)

Typecheck: PASS (`bunx tsgo --noEmit` clean).
