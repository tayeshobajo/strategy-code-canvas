# Roadmap Canvas — Reference-Match Polish Pass

Not a rebuild. Keep the route, portal shell, terrain map, markers, drawer, top controls, status card, legend, and overview strip. Tighten the three surfaces that read as rough vs. the approved reference: bottom overview, right drawer, and sidebar footer.

## 1. Bottom Roadmap Overview → command mini-map

`src/components/portal/roadmap/RoadmapOverviewStrip.tsx` (+ `canvas-context.tsx` for viewport math)

Structure — one glass panel with three regions:
```text
┌─ ROADMAP OVERVIEW ─────────────────────────────────────────────┐
│ Click a phase   │ Point A · Phase 1 · Phase 2 · Phase 3 · B  │ ⤢ ⛶ │
│  to navigate    │ ─○─○──●──○─○──○─○──○─○──○──▲               │      │
└────────────────────────────────────────────────────────────────┘
```

- Wrapper: `bg-slate-950/85 backdrop-blur-md border border-white/12 rounded-2xl shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)]`, ~104px tall, generous inner padding.
- Left column: "ROADMAP OVERVIEW" caption in mono uppercase + "Click a phase to navigate" helper.
- Center: continuous mini route line across the whole strip. Each of the 5 zones (A, P1, P2, P3, B) is a clickable cell containing a tiny mountain silhouette + label + small colored dots for the milestones in that phase (color by kind, filled if complete, ring if in-progress).
- Right controls: collapse chevron, "Fit to field" icon, optional fullscreen icon.

Active phase highlight:
- Selected/current phase cell gets `bg-royal/15`, `border border-royal/60`, inner blue glow, and a stronger label. Non-active cells stay muted white/60.
- Selected marker: render a small pulsing royal dot on the route line at that marker's normalized x.
- Viewport window: absolutely-positioned translucent rectangle spanning the visible x-range of the main canvas, updated on scroll (compute `left = scrollLeft/scrollWidth`, `width = clientWidth/scrollWidth`, throttled with rAF). Drag the rectangle to scrub the main canvas.

Interactivity (extend existing `onJump`):
- Clicking A / P1 / P2 / P3 / B cell → `onJump(key)` (already wired).
- Clicking anywhere on the route line pans main canvas to that normalized x via `canvas.panTo`.
- Selecting a marker on the main canvas → strip already re-derives active zone from `canvas.selectedPhaseKey`; add the pulsing marker dot bound to `selectedSlug`.

Sync contract:
- Reads: `canvas.selectedPhaseKey`, `canvas.currentPhaseKey`, `canvas.scrollState` (already published from `MapCanvas`), `selectedSlug` (thread through as prop).
- Writes: calls `onJump()` or `canvas.panTo()` — never sets phase state directly.

Positioning: keep pinned at the bottom of the canvas stage with `bottom-4 left-4 right-4` and enough bottom padding above the legend so Point A / route markers stay uncovered. Legend moves up ~16px if it currently sits below.

## 2. Right Detail Drawer → premium strategic panel

`src/components/portal/roadmap/MilestoneSheet.tsx`

Header block:
- Circular kind-tinted icon (28px) top-left, kind label "MILESTONE" in mono uppercase next to it.
- Close (×) top-right.
- Title `font-display text-2xl` on its own row, generous leading.
- One-line summary directly below in `text-ink/70`.

Body — labeled sections with icon glyphs, dividers, and consistent spacing (24px between sections, 8px gap between label and content):
- WHY IT MATTERS (lightbulb icon)
- WHAT IT UNLOCKS (unlock icon) — bulleted list
- STATUS — status pill + inline progress bar with % label
- TARGET DATE — calendar icon + formatted date
- CLIENT ACTION NEEDED — checkbox icon + action label + due date, on a subtle `bg-royal/5 border border-royal/15 rounded-md` callout
- LATEST UPDATE — dot + date on one line, body text below
- RELATED FILES — file rows with icon + name + type/date + download icon

CTA hierarchy sticky at bottom:
- Primary: full-width `Acknowledge` (kind = milestone) / `Respond` (kind = decision) / `Open` (deliverable) — solid `bg-ink text-white h-10`.
- Secondary: `Request clarification` outlined `border-ink/15 h-10`, full-width beneath.
- Drawer width `w-[440px]`, soft border `border-l border-ink/10`, `shadow-[0_20px_60px_-20px_rgba(0,0,0,0.4)]`, background `bg-paper` (not flat white).

Visual connection to marker:
- `MapCanvas` renders an SVG connector polyline from the selected marker's canvas position out to the drawer's left edge (fixed at `right: 440px`), stroke `rgba(47,93,246,0.4)`, 1.5px, dashed, animated dash offset. Only shown when drawer is open on desktop.
- Selected marker keeps its glow ring; opacity of others stays at current `0.85` — no darkening overlay.

Kind-specific bodies:
- Decision: OPTIONS (list of choice pills), RECOMMENDED, WHY, DUE. CTAs: Respond / Related files / Book next call.
- Deliverable: DESCRIPTION, RELATED MILESTONE (link), VERSION, PUBLISHED. CTA: Open or Download.

## 3. Sidebar footer polish

`src/routes/portal.tsx`

Match the reference's grounded user block:
- Above the sign-out row, add a slim mission card: `Your success is our mission.` + helper line, thin blue accent bar.
- User block becomes a row: 32px avatar circle with initials (from `contact_name` or email) on left, name + role stacked in the middle, small chevron on the right that opens a menu with "Sign out".
- Sign out link moves into that popover, so the sidebar bottom is one clean row, not two stacked.
- Add a floating collapse-chevron pill anchored to the sidebar's right edge (`absolute -right-3 top-24`) — non-functional in step 1 (opens a "coming soon" toast) unless the user wants real collapse now.

## 4. Marker hierarchy micro-fixes

`src/components/portal/roadmap/roadmap-layout.ts`, `MilestoneNode.tsx`

- After the existing anchor projection, run a one-pass horizontal declutter: markers within `< 60px` of each other on the same y-band get their labels alternated above/below the road; if still colliding, demote the lower-priority one to icon.
- Meetings render with a smaller off-road pin variant (already the kind, just reduce badge size to 20px).
- Deadlines already render as flags — bump their z-index above other markers so they stay visible when overlapping.

No layout math rewrite — this is just a pass on existing `layout.markers`.

## 5. Sync — one state model

`src/routes/portal.roadmap.tsx` + `canvas-context.tsx`

- Add `selectedSlug` to `canvas-context` so the mini-map dot can read it without prop drilling.
- URL params already carry `view` + `phase`; add `marker` param for deep-linking a selected item.
- Confirm on every marker select: `selectedPhaseKey` follows the marker's phase, mini-map re-derives, drawer opens, canvas pans keeping the marker outside the drawer (existing `scrollToXWithDrawer`).

## Technical notes

- Overview viewport rect: subscribe to `canvas.scrollState` (already published on every `MapCanvas` scroll via rAF-throttled `publish()`). No new listeners needed.
- Drawer connector: single `<svg>` positioned absolutely inside the canvas stage, updated only on marker change and window resize.
- No schema, no server, no new routes.

## Out of scope

- Terrain map artwork.
- View-mode density rules (already landed).
- Clustering behavior beyond what already exists.
- Mobile stack (`MobilePhaseStack.tsx`).
- Marketing site, admin, other portal routes.
- Full sidebar collapse behavior (adds the pill only; wiring can follow if you want it in a later turn).

## Acceptance

- Mini-map matches the reference: glass panel, phase cells with silhouettes + milestone dots, viewport rectangle scrubs the main canvas, active phase glows.
- Drawer matches the reference: circular kind icon header, labeled sections with icons, callout for client action, sticky primary/secondary CTA, subtle connector line to the selected marker.
- Sidebar bottom shows a user row with avatar + name + role and mission card above it; sign out lives in the popover.
- No sidebar clipping, no page-level horizontal scroll at 100% browser zoom.
