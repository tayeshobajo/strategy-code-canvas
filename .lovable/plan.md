
# UI & API Audit — 2026-07-14

Read-mostly audit of the running app. Drives the live preview at
`http://localhost:8080` with Playwright as two users, invokes every
publicly-exposed server function / api route, cross-checks rendered
values against Supabase, and lands findings in a single report. Trivial
display bugs get patched in a short follow-up pass; anything schema- or
governance-touching goes to `PENDING_MIGRATIONS.md` instead.

## Scope

1. **Admin Engine (operator)** — signed in as `tai@trust-tai.com`
   - `/engine/projects` list + filters
   - `/engine/projects/$projectId` overview
   - `/engine/projects/$projectId/chat` (Project Chat + proposals)
   - `/engine/projects/$projectId/roadmap`
   - `/engine/projects/$projectId/point-a` and `point-b` (ceremonies)
   - `/engine/projects/$projectId/implementation-plan`
   - `/engine/projects/$projectId/approvals`
   - `/ops/*` (approvals queue, notifications, health)
2. **Client Portal** — signed in as one seeded client user
   - `/portal/home`, `/portal/roadmap`, `/portal/onboarding`
   - Roadmap acknowledgment banner, decision/clarification modals
   - Verify RLS: client sees only their project, no operator-only fields
3. **Server functions & API routes**
   - Enumerate every `createServerFn` in `src/lib/**` and every
     `src/routes/api/**` file
   - Invoke each via `stack_modern--invoke-server-function` or direct
     Playwright-driven UI action, capturing status + response shape
   - Confirm `/api/public/*` webhook auth guards reject unsigned calls
   - Confirm `requireSupabaseAuth`-guarded fns 401 without a bearer

## Method

- Session for admin: reuse `LOVABLE_BROWSER_SUPABASE_*` env restore.
- Session for client: sign in via password using seeded QA client
  account (`qa-operator` or the portal seed user under
  `scripts/portal/seed_demo_workspace.sql`). Confirm the seeded email +
  password first with a `supabase--read_query`; if absent, ask before
  proceeding.
- Data correctness pass: for one live project, snapshot each rendered
  card (milestone counts, ceremony state badges, approvals queue
  counts, cost/pause banners) and run a matching
  `supabase--read_query` to diff.
- Write flows executed only in a QA project (`Jotaye Ventures` or the
  seeded QA project id already used by
  `scripts/qa/project-chat-action-mode-v3-qa.py`):
  - Create a Project Chat proposal, approve it, verify audit rows.
  - Record a ceremony decision on Point A, verify `truth.ceremony_id`.
  - Toggle Action Mode on/off; assert audit + activity rows.
  - Trigger cost-autopause hook via `/api/public/hooks/cost-autopause`
    with a signed test payload; verify pause + notification proposal.
- No schema changes. No migrations. No mutations against real client
  projects.

## Deliverables

1. `.orchestrator/audit/ui-api-audit-2026-07-14.md` — findings table
   with columns: Area · Route/Fn · Expected · Actual · Verdict
   (PASS / DISPLAY_BUG / DATA_MISMATCH / BROKEN / SECURITY_CONCERN) ·
   Evidence (screenshot path / query result / status code).
2. `/tmp/browser/ui-api-audit/screenshots/` — one screenshot per route
   per user context.
3. `/tmp/browser/ui-api-audit/api-results.json` — status + response
   shape for every server function / api route invoked.
4. Ranked top-10 gap list at the end of the report.

## Auto-fix pass (follow-up turn, only after report is complete)

Only these categories get patched in the same session, each a small
targeted edit:

- Empty-state text (`—`, `undefined`, `NaN`) in operator or portal
  cards.
- Broken internal links / 404s from stale route paths.
- Console warnings from the current `ClientMarquee` hydration mismatch
  (already visible in console logs today) if fix is one-line.
- Head metadata regressions on public routes (missing title / og tags).

Out of scope for auto-fix (logged only, escalated to Tai):

- Any RLS / grant change
- Any governed-column write path change
- Any schema migration
- Any change touching approval or ceremony rules
- Any AI prompt / model behavior change

## Non-goals

- No load / perf testing.
- No cross-browser matrix (Chromium headless only).
- No SEO scoring — head-tag presence check only.

## Risks

- Client portal seed user credentials may not exist; will confirm
  before running the client-context pass, otherwise fall back to
  admin-only view of `/portal/*` and flag the gap.
- Cost-autopause hook signature secret must be present in env; if
  missing, that single check is skipped and reported.
