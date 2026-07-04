
## Goal
Make operator/admin login land in the Trust Tai Roadmap Engine (`/engine`) — not `/ops/queue` or `/admin/client-portals` — and fold the legacy submission queue into Review & Approvals.

## Current state (audit)
- `/engine` shell already exists with the correct sidebar (Command Center, Projects, Templates, Review & Approvals, Delivery Room, Execution Tracker, Global Operations, Intelligence Memory) — see `src/routes/engine.tsx`.
- `/engine` Command Center, Projects list, project workspace with the 14 steps, Review/Delivery/Execution/Operations/Intelligence pages, and admin sub-pages under project workspace all already exist.
- Login redirect in `src/routes/auth.tsx` sends everyone to `search.redirect || "/portal"`.
- `/portal/home` (`portal.home.tsx`) then redirects any admin/operator to `/admin/client-portals`. From there the sidebar links to `/ops/queue`, which is where the user ends up when clicking around.
- `/ops/queue` still owns its own separate console shell (`src/routes/ops/route.tsx`) with the "Roadmap Console" sidebar (Queue, In Review, Approved, Archived, History, Analytics, Access events, Email health).

## Changes

### 1. Route operators/admins to the Engine on login
- `src/routes/auth.tsx`: after successful sign-in, look up role (reuse the `has_role_email` RPC + `isAdminEmail`/`isOperatorEmail` pattern from `portal.home.tsx`). If admin/operator/team_member → `navigate({ to: "/engine" })`. Otherwise keep existing `/portal` behavior. Honor an explicit `search.redirect` only when it points to a surface the user is allowed to see.
- `src/routes/portal.home.tsx`: replace the `redirect({ to: "/admin/client-portals" })` for admin/operator with `redirect({ to: "/engine" })`. `/admin/*` remains reachable via direct URL but is no longer the default landing.
- `src/routes/index.tsx` (marketing home): if a session exists and the user is admin/operator/team_member, `redirect({ to: "/engine" })` from `beforeLoad` so refreshing lands them back in the Engine.

### 2. Fold the legacy queue under Review & Approvals
- Keep the existing `/ops/*` routes and their data intact — they still work as-is.
- `src/routes/engine.review.tsx`: add a "Submission Queue" section/tab that either embeds the ops queue list or links out to `/ops/queue` via an in-Engine iframe-free `<Link>`. The Engine sidebar's "Review & Approvals" item already points here.
- `src/routes/ops/route.tsx`: rename the sidebar title from "Roadmap Console" to "Trust Tai Roadmap Engine — Submission Queue" and add a top "← Back to Engine" link to `/engine/review` so it reads as a sub-page, not a parallel app. No behavior change for the sub-pages.

### 3. Permission gating (visible in UI only)
Operator role already exists via `useEngineRole`. Audit the following Engine surfaces to hide/disable — not remove — the restricted actions when `role === "operator"`, matching the brief:
- `engine.projects.$projectId.preview.tsx` / `versions.compare.tsx`: hide "Approve version" / "Publish to client portal".
- `engine.projects.$projectId.delivery.tsx`: hide "Send final delivery".
- `engine.projects.$projectId.investment.tsx`: make investment range read-only.
- `engine.projects.$projectId.agent.permissions.tsx` and `agent.costs.tsx`: read-only for operator.
- Show a small "Operator view — approval requires admin" hint next to the disabled control (reuse the `approvalDeniedReason` string from `useEngineRole`).

Admin-only sidebar extras (Settings, Integrations, Agent Permissions, Cost Controls) are **out of scope** for this pass unless you want them added now — the existing `/admin/*` routes already cover Runtime config, User roles, and Client portals.

### 4. Naming
- Anywhere the string "Roadmap Console" still appears (ops layout header + mobile header in `src/routes/ops/route.tsx`) → replace with "Trust Tai Roadmap Engine".

### 5. Client portal untouched
No changes to `/portal/*` routes or the client-facing shell. Only the operator/admin redirect out of `/portal/home` changes.

## Acceptance
- Signing in as an operator lands on `/engine` with the Engine sidebar.
- `/ops/queue` is still reachable but presents as "Submission Queue" under Review & Approvals with a Back-to-Engine link.
- Operator cannot see approve/publish/send-delivery/investment-edit/agent-permission actions in the Engine.
- Client portal routes and behavior are unchanged.
- No changes to route files under `src/routes/portal/*` besides `portal.home.tsx`'s redirect target.

## Out of scope (call out if you want them included)
- Building new admin-only sidebar sections (Settings, Integrations, Agent Permissions, Cost Controls) as top-level Engine nav.
- Rebuilding Command Center metric widgets — the page already renders the sections listed in the brief; content polish is a separate pass.
- Migrating ops queue data model into a new `engine.review` table.
