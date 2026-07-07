## Problem

- Public pages (portal login, and any page using `SiteHeader`) have a fixed floating header but `<main>` uses a static `py-16`, so on mobile the H1 sits directly under the browser chrome and reads as "cramped" (visible in the uploaded screenshot).
- `/admin/*` and `/engine/*` layouts render a fixed `w-60` sidebar with no mobile drawer — completely unusable below ~768px.
- Portal layout (`/portal/*`) already has a mobile sheet, but individual portal pages need a spacing/overflow pass.
- Several dense internal pages (roadmap builder, engine project sub-tabs, ops queue, review) were built desktop-first and likely need `min-w-0` / `overflow-x-auto` on tables and grids.

## Goals

1. Fix the immediate mobile top-spacing bug on every page that uses `SiteHeader`.
2. Ship a real mobile + tablet experience for Admin and Engine (top bar + drawer nav, stacked content).
3. Sweep the Client Portal pages for spacing, truncation, and horizontal-scroll issues.
4. Verify at 375 / 768 / 1440 with Playwright screenshots.

## Scope of Changes

### 1. Public site header spacing (root cause of the reported bug)

- Add a shared `pt-safe-header` utility (or apply `pt-24 sm:pt-28` on `<main>`) so content sits below the fixed floating header on every public page.
- Audit and update `main` wrappers in: `portal.login.tsx`, `portal.access-denied.tsx`, `index.tsx`, `about.tsx`, `investment.tsx`, `what-we-build.tsx`, `insights.tsx`, `insights_.$slug.tsx`, `walks.tsx`, `walks_.$slug.tsx`, `build-my-roadmap.index.tsx`, `checkout.roadmap.tsx`, `checkout.walk.$pace.tsx`, `checkout.return.tsx`, `unsubscribe.tsx`.
- Also tighten `SiteHeader` mobile paddings so the header itself doesn't feel jammed against the top edge on small screens.

### 2. Admin shell responsive (`src/routes/admin.tsx`)

- Collapse the `w-60` sidebar into a `Sheet` drawer behind a hamburger below `lg`.
- Add a mobile top bar with logo + hamburger + current section label.
- Ensure content uses `min-w-0` and admin sub-pages get horizontal scroll on their data tables (`admin.client-portals.tsx`, `admin.roles.tsx`, `admin.intake-alerts.tsx`, `admin.milestone-changes.tsx`, `admin.project-integrity.tsx`, `admin.config.tsx`).

### 3. Engine shell responsive (`src/routes/engine.tsx`)

- Same pattern: fixed sidebar becomes a `Sheet` drawer under `lg`, with a mobile top bar.
- Engine project sub-tabs (`engine.projects.$projectId.tsx`) currently render as a horizontal row — add `overflow-x-auto` + snap so all tabs remain reachable on mobile.
- Wrap wide tables/grids in the dense engine pages (`engine.review.tsx`, `engine.projects.index.tsx`, `engine.delivery.tsx`, `engine.execution.tsx`, `engine.operations.tsx`, `engine.intelligence.tsx`, and the busiest project sub-pages: `overview`, `blueprint`, `builder`, `signal-room`, `intelligence`, `agent.tasks`) in `overflow-x-auto` containers and apply the `min-w-0` + `shrink-0` header pattern.

### 4. Client Portal pages

- Portal shell (`portal.tsx`) already has mobile nav. Sweep the individual pages for:
  - Overflowing tables/cards: `portal.billing.tsx`, `portal.files.tsx`, `portal.messages.tsx`, `portal.activity.tsx`, `portal.roadmap.tsx`, `portal.home.tsx`, `portal.onboarding.tsx`, `portal.account.tsx`.
  - Header rows that mix text and buttons → apply the responsive grid+flex pattern.
  - Page-level top padding on mobile.

### 5. Ops queue (`src/routes/ops/*`)

- Confirm the queue table scrolls horizontally on mobile and detail panels stack instead of side-by-side below `md`.

## Verification

Playwright script that visits, at viewports 375 / 768 / 1440, each of:

- Public: `/`, `/portal/login`, `/build-my-roadmap`, `/investment`, `/about`, `/what-we-build`
- Portal (with restored session): `/portal/home`, `/portal/roadmap`, `/portal/files`, `/portal/messages`, `/portal/billing`, `/portal/activity`, `/portal/account`
- Admin: `/admin/client-portals`, `/admin/roles`, `/admin/intake-alerts`
- Engine: `/engine`, `/engine/projects`, `/engine/review`, one project's `/overview`
- Ops: `/ops/queue`

For each: screenshot to `/mnt/documents/responsive-audit/{route}-{viewport}.png`, then check console for horizontal-scroll warnings and confirm no element exceeds `document.documentElement.clientWidth`.

## Out of Scope

- No new visual redesign — colors, typography, and component chrome stay as-is.
- No functional or data changes; strictly layout, spacing, and container behavior.
- Marketing-page content edits.

## Technical Notes

- Use the codebase's existing responsive pattern: `grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap` for text+widget rows; `min-w-0` on text containers; `shrink-0` on icons; `truncate` on single-line headings.
- Reuse the existing `Sheet` component (already used in `portal.tsx`) for admin/engine drawers to keep interaction consistent.
- Add a small shared `<AppSafeMain>` (or a Tailwind class shortcut) so the header-offset padding is set once, not per-page.
