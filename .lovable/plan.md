# Trust Tai Roadmap Engine — Phase 1 Plan

Private, admin-only internal SaaS at `/engine/*`. Reuses the existing navy sidebar + ivory workspace language from `/portal` and `/ops`, adds a dedicated engine shell, and seeds a demo project (Mental Dental Academy) so every screen has real content on first load.

Access is gated to the `admin` role via the existing `has_role_email` RPC and the `assertAdmin` pattern already used in `src/lib/roles.functions.ts`. No public routes, no client-facing surfaces in this phase.

---

## 1. Data model (one migration)

New tables in `public` (all with `GRANT` + RLS + admin-only policies via `has_role(auth.uid(), 'admin')`; `service_role` full access):

- `engine_clients` — company, primary contact, industry, status, owner_email, notes
- `engine_projects` — client_id, name, status (`active|draft|needs_review|approved|delivered|in_execution|blocked|archived`), current_step, roadmap_version, approved_version, agent_status, agent_budget_monthly_cents, agent_spend_month_cents, next_action, last_activity_at
- `engine_project_dates` — project_id, label, due_on, kind (`critical|milestone`)
- `engine_signals` — project_id, source, summary, received_at, triaged
- `engine_activity` — project_id (nullable), kind, title, body, created_at (feeds Command Center priority queue + alerts)

Seed rows for Mental Dental Academy in the same migration:
- Client: Mental Dental Academy, Owner: Tai Shobajo, Status: Active
- Project: roadmap v1.2 Draft, approved v1.0, agent active, $150/mo budget, $42.18 spent
- Two critical dates: Oct 1 2025 Pre-Test Ready, Jan 1 2026 First School Launch
- A handful of activity/signal rows so Command Center isn't empty

Later phases (Templates, Review & Approvals, Delivery, Execution, Ops, Intelligence) get their own tables when we build them — not now.

## 2. Server functions — `src/lib/engine.functions.ts`

All wrapped with `requireSupabaseAuth` + `assertAdmin` (reused helper):
- `getCommandCenter()` — returns counts for every metric card, priority queue (top 10), active project cards (top 6), agent alerts, upcoming deadlines (next 30d), review/delivery/execution previews, global spend rollup, system health flags
- `listProjects({ filter, q })` — table rows with client, status, step, version, agent status, last_updated, next critical date, open decisions count, agent spend, next action
- `getProject(id)` — overview payload (used by Overview stub route)

## 3. Engine app shell — `src/routes/engine/*`

- `src/routes/engine/route.tsx` — pathless layout. `beforeLoad` uses `supabase.auth.getUser()` + `has_role_email` RPC (admin). Redirect non-admins to `/portal/access-denied`. `ssr: false`.
- `src/components/engine/EngineShell.tsx`:
  - Dark navy fixed left sidebar (reuses `bg-ink`, royal accent rail) with logo + sections
  - Top bar: breadcrumbs (from route matches), search stub, primary action slot, profile menu
  - Content area on `bg-paper-soft`
- `src/components/engine/` primitives: `MetricCard`, `StatusBadge` (purple/blue/green/orange/red tokens), `SectionCard`, `DataTable`, `RightRail`, `Stepper`, `EmptyState`, `EngineDrawer`, `EngineModal`. Built on existing shadcn primitives; no new UI libs.

Sidebar items (global only):
Command Center · Projects · Templates · Review & Approvals · Delivery Room · Execution Tracker · Global Operations · Intelligence Memory

Only Command Center and Projects are wired this phase. The rest render a branded "Coming in the next build" empty state so navigation feels complete but nothing lies about being functional.

## 4. Command Center — `src/routes/engine/index.tsx`

Route: `/engine`. Sections in order, matching the spec:
1. Top metric cards row: Active Projects, New Signals, Roadmaps in Progress, Needs Review, Approved, Deliveries Pending, In Execution, Blocked Decisions, Agent Cost MTD, System Health
2. Priority Queue (table) — next best actions ranked by deadline + status
3. Active Project cards grid (3 wide) — cover Mental Dental Academy prominently
4. Agent Alerts panel
5. Upcoming Deadlines (14–30d)
6. Review Queue preview (top 3 → link to Review & Approvals)
7. Delivery Queue preview
8. Execution Tracker preview
9. Global spend summary card (budgeted vs spent across all projects)

Loaded via TanStack Query + `ensureQueryData` in the loader.

## 5. Projects — `src/routes/engine/projects.tsx`

Route: `/engine/projects`. Elements:
- Page header with "New Project" primary button (stub → toast for now)
- Filter chips row: Active · Needs Review · Draft · Approved · Delivered · In Execution · Blocked · Archived (URL-persisted via `validateSearch` + `fallback`)
- Search input (client name / company) — URL-persisted `q`
- Dense table columns: Client / Company · Status · Current Step · Version · Agent · Last Updated · Critical Deadline · Open Decisions · Agent Spend · Next Action · row action
- Row click → `/engine/projects/$projectId/overview`

## 6. Project Overview stub — `src/routes/engine/projects.$projectId.overview.tsx`

Route: `/engine/projects/$projectId/overview`. Minimal but real:
- Breadcrumb: Projects → Mental Dental Academy → Overview
- Header: client, owner, status pill, roadmap v1.2 Draft (v1.0 approved), agent status, monthly budget vs spend, critical dates
- Left column: signal → diagnosis → roadmap → review → delivery → execution stepper (current step highlighted)
- Right rail: critical dates, open decisions, agent activity summary
- Tabs shell (Overview active; Signals / Diagnosis / Roadmap / Review / Delivery / Execution rendered as empty states)

Confirms the "project-specific steps live inside the project workspace, not the sidebar" navigation rule.

## 7. Entry point

Add an "Engine" link in `src/routes/admin.tsx` sidebar (admin-only surface). No public nav changes.

---

## Technical notes

- Route filenames use TanStack dot convention: `engine.tsx` (layout), `engine.index.tsx`, `engine.projects.tsx`, `engine.projects.$projectId.overview.tsx`. `createFileRoute` strings match generated IDs.
- Loaders call server fns via `ensureQueryData`; `defaultPreloadStaleTime` already 0.
- All money stored as cents; formatted client-side.
- Status colors added as semantic tokens in `src/styles.css` if not already present (`--status-purple`, `--status-blue`, `--status-green`, `--status-orange`, `--status-red`) so `StatusBadge` stays token-driven.
- Serif page headings reuse existing `font-display` (Cormorant Garamond) — no new fonts.

## Out of scope this phase

Templates, Review & Approvals, Delivery Room, Execution Tracker, Global Operations, Intelligence Memory pages (shell links present, empty states only). New Project creation flow. Full project workspace tabs beyond Overview.
