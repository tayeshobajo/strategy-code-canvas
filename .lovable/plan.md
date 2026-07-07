# Roadmap Engine — Exhaustive Audit

## Scope

Everything under the `/engine` surface: routes, server functions, RLS policies, migrations, and the engine ↔ portal boundary.

- Security & RLS
- Data integrity & workflow (Steps 1–13, publish/approval, portal fan‑out, orphan cleanup)
- UX / product completeness (admin vs operator locks, empty states, error boundaries)

## Method

Read-only investigation, no code changes in this pass. Findings go into a single markdown report; fixes are proposed as a prioritized plan you approve separately.

### 1. Automated signals

- `supabase--linter` — RLS off, permissive policies, exposed columns
- `security--get_scan_results` (+ `run_security_scan` for a fresh pass) — cross-check with linter
- `code--dependency_scan` — vulnerable npm packages
- `bunx vitest run` — existing engine/portal test suite (many `__tests__` files already exist)
- `tsgo` typecheck across engine routes and server fns

### 2. Security & RLS (manual)

For every `engine_*`, `client_portal_*`, `roadmap_*`, `intake_*`, `operator_notifications`, `user_roles`, `orders`, `subscriptions` table:

- RLS enabled? Policies per role (`anon`, `authenticated`, `service_role`)?
- Matching GRANTs in migrations?
- Are SELECT/INSERT/UPDATE/DELETE audiences correct (owner-only vs operator vs admin vs public)?
- Owner-side read policies for any status-gated rows (draft/pending/hidden)
- Security definer functions: `search_path` set, caller checks present, no privilege escalation
- `has_role` / `has_role_email` / `client_portal_is_operator` usage consistent
- Every `createServerFn` under `src/lib/*.functions.ts` and `src/utils/*.functions.ts`:
  - `requireSupabaseAuth` where needed
  - Role check (not just "signed in") for privileged ops
  - `supabaseAdmin` only inside handlers, only after authorization
  - Input validated with Zod / narrow validator
- Route gates: everything under `/engine` requires admin/operator/team_member (currently in `src/routes/engine.tsx` `beforeLoad`)
- Sub-agent report on the roadmap approval workflow (agent `sub_xw76scw5`) fed into the boundary review

### 3. Data integrity & workflow

- Step state machine (`engine_projects.step_states`) — legal transitions, gate enforcement server-side (not just UI)
- `engine_roadmap_versions` lifecycle: `ai_generated` → approved → published; the `tg_client_portal_roadmaps_require_source_version` trigger blocks bad publishes — confirm every publish path goes through it
- Portal fan-out triggers (`tg_client_portal_files_fanout_engine`, `tg_client_portal_messages_notify_operators`) — failure modes, idempotency, missing engine project links
- Orphan cleanup: `engine_projects` deletion vs `client_portal_projects`, `engine_roadmap_versions`, `engine_review_items`, `engine_delivery_items`
- Intake pipeline: `intake_submissions` → `engine_project_intake_failures` durable log, alert idempotency (covered by existing tests — confirm still green)
- Source visibility: engine sources must never leak to portal (existing `portal-cannot-read-engine-sources.test.ts`)
- Client preview overrides (`project.client_preview`) — admin-only write enforced server-side, not just via `useEngineRole`
- Concurrent edit safety on `engine_projects` JSON columns (point_a/point_b/investment/blueprint) — last-write-wins vs optimistic version
- Operator notifications: read-state per user, no cross-user leakage

### 4. UX / product completeness

Walk every step page under `src/routes/engine.projects.$projectId.*`:

- Empty states (no data, first-time project)
- Loading + error boundaries on each route (per TanStack rules)
- Admin-only vs operator-visible sections use `OperatorLockNotice` consistently
- Step 13 (client preview) — presentation mode, PDF export, hidden-internal-notes verification
- Command Center, Projects list, Templates, Review & Approvals, Delivery Room, Execution Tracker, Global Operations, Intelligence Memory — each screen exists and renders with realistic data
- Breadcrumbs (`buildCrumbs`) cover all engine subroutes, not just `/projects`
- Sign-out + role revocation UX
- Hydration mismatch already visible in console (`ClientMarquee` `data-tsd-source` line drift) — flagged as a separate low-priority note

## Deliverable

`.lovable/engine-audit-2026-07.md` with:

1. Executive summary
2. Findings table — id, area, severity (Critical / High / Medium / Low), file:line, description, recommended fix
3. Prioritized fix plan — grouped by severity, with rough effort estimate and dependencies between fixes
4. Anything intentionally accepted (added to `security-memory` if security-related)

No code changes in this pass. After you review the report, I'll implement fixes in a follow-up per your priority.

## Out of scope

- Marketing site, portal client UI beyond the engine boundary, Stripe/payments internals, email queue internals (unless a finding touches the engine)
- Performance profiling beyond obvious N+1s
- Design polish
