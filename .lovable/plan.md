## What's actually going on

Two independent bugs, both showing the same "0" symptom.

**1. `tai@trust-tai.com` is `operator` in the DB, not `admin`.**
- `public.user_roles` has one row for you: `role = operator`.
- RLS on `engine_projects` only grants SELECT to `admin` or `team_member`. Operators get nothing.
- The Command Center server function uses your user-scoped Supabase client, so RLS filters everything to 0 rows → all the tiles read 0.
- The client-side gate in `src/lib/ops/access.ts` has `tai@trust-tai.com` hard-coded in `ADMIN_EMAILS`, which is why the UI lets you into `/engine` at all. The DB row disagrees with the allowlist.

**2. Mubo's project is in the database, but hidden by the same RLS gap.**
- Mubo Shobajo submitted yesterday (2026-07-08 02:05 UTC). It created:
  - `engine_clients` row "August 1" (contact `muboshobajo@gmail.com`)
  - `engine_projects` row "August 1 — intake", status `source_processing`
- It's real and intact — you just can't see it because of bug #1.

**3. The tables are polluted with E2E/QA test data.**
- 49 total projects: **42 are `e2e-*`**, 4 are QA/Synthetic, leaving ~3 real ones (Mubo's "August 1", "QA Test Co — intake", and one older draft).
- 47 total clients: **43 are `e2e-*`**.
- These are Playwright fixtures from the Phase 14 QA runs. They dominate every list view.

## Plan

### Step 1 — Grant tai the admin role in the database
Migration: insert `('fdd8e3c9-a8d9-46c0-91bb-47876399112c', 'admin')` into `public.user_roles` (idempotent `ON CONFLICT DO NOTHING`). This aligns the DB with the existing allowlist and unblocks RLS for every engine page.

### Step 2 — Purge demo / E2E / QA fixtures
Migration deletes, in order (FKs cascade from `engine_projects` and `engine_clients`):

- All `engine_projects` where `name ILIKE 'e2e-%'` OR `name ILIKE '%Synthetic%'` OR `name ILIKE 'QA Test Co%'`.
- All `engine_clients` where `company ILIKE 'e2e-%'` OR `company ILIKE '%Synthetic%'` OR `company = 'QA Test Co'` AND with no remaining projects.
- Matching `intake_submissions` rows (`Captain Synthetic Test`, `E2E Submitter`, QA operator submissions).
- Matching rows in `engine_project_intake_failures` referencing the deleted attempted names.

**Preserved:**
- `August 1` client + `August 1 — intake` project (Mubo's real submission).
- `hello@…` / `henry@…` accounts and any non-test client.

I will print the exact list of rows the migration will delete in the migration description before it runs so you can veto anything unexpected.

### Step 3 — Review every engine page with the fixed data
After 1 + 2, walk through each left-nav destination and confirm it loads with the real data only:

- `/engine` Command Center — tiles show real counts, priority queue / next best actions include August 1.
- `/engine/projects` — the list is down to real projects; August 1 is visible with status `source_processing`.
- `/engine/projects/{August 1 id}/overview` — workspace opens.
- `/engine/review` — Review & Approvals loads (no crashes on empty queues).
- `/engine/templates` — Templates page renders.
- `/engine/delivery` — Delivery Room renders.
- `/engine/execution` — Execution Tracker renders.
- `/engine/operations` — Global Operations renders.
- `/engine/intelligence` — Intelligence Memory renders.

For each page I'll confirm: no console errors, no "Forbidden" toasts, and demo rows are gone. If any page has residual hard-coded demo strings (e.g. seed fixtures leaking into UI), I'll flag them in the follow-up summary rather than silently editing unrelated code.

### Out of scope (call out, don't fix in this pass)
- Broader RLS redesign to let operators read projects — the allowlist/DB mismatch is the real bug; changing RLS would widen access beyond what the code assumes. Happy to do it as a separate change if you want operator-tier staff to also see the portfolio.
- Removing the `ADMIN_EMAILS` hard-coded allowlist. It's the reason you got into `/engine` at all today; I'd rather not touch it in the same change that reshuffles roles.

## Technical notes
- Role insert uses the same `app_role` enum already used by `has_role_email`.
- Deletes rely on existing `ON DELETE CASCADE` from `engine_projects` → `engine_activity`, `engine_agent_costs`, `engine_agent_permissions`, `engine_agent_tasks`, `engine_audit_log`, and from `engine_clients` → `engine_projects`. No new triggers needed.
- Nothing in this plan touches the client portal, roadmap versions, intake_drafts, or auth schema.
