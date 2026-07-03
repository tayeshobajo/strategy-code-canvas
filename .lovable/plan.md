# Roadmap Canvas — Premium Polish Pass

Not a rebuild. Keep terrain, route, sidebar, top bar, status card, drawer, markers, and overview strip. Fix the rough edges and give the canvas real map logic.

## 1. Portal shell — stop the clip

`src/routes/portal.tsx`

- Sidebar becomes `fixed inset-y-0 left-0 w-64` (was `lg:w-64` in flex row, which is what's letting the map push it under the browser chrome at 100% zoom).
- `<main>` gets `lg:ml-64`, `min-h-screen`, and (for the roadmap route only) removes the outer vertical padding so the canvas can own the viewport.
- Roadmap route wraps content in a full-height shell: sidebar 100vh, top command bar fixed height, canvas `h-[calc(100vh-<topbar>)]`, overview strip pinned inside the canvas — no page-level scroll.
- Mobile keeps today's horizontal nav; only `lg:` gets the fixed shell.

## 2. Map cartography — attached, not sprinkled

`src/components/portal/roadmap/roadmap-layout.ts` + `src/lib/portal-roadmap-model.ts`

- Add a `RoutePath` (normalized polyline) per phase. Every marker resolves to `{ tAlong, offsetNormal, side }` and is projected onto the path at layout time so markers sit ON the road (milestones), at forks (decisions), just beside (deliverables), or slightly off-road (meetings).
- Deadlines render as flag glyphs planted on the route.
- Label collision pass: after projection, walk markers left→right, push labels to alternating sides, and demote to icon-only when a collision cannot be resolved within a min-gap.

## 3. Marker hierarchy — three real levels

`src/components/portal/roadmap/view-mode.ts`, `MilestoneNode.tsx`

- Level 1 (always full): Point A, Point B, current phase anchor, current milestone, next decision, next major deadline.
- Level 2 (full inside selected/current phase, short elsewhere): primary milestones, active deliverables, key dependencies.
- Level 3 (icon-only, hover to reveal): meetings, future deliverables, supporting milestones, minor decisions.
- Node already supports full / short / icon / muted / hidden — wire the classifier to the tier + active phase instead of the current flat rules.

## 4. View dropdown actually changes density

Extend `RoadmapViewMode` classifier so each mode has its own visibility contract:

- Full Journey: Level 1 only + phase titles.
- Current Phase: L1 + L2 in current phase, other phases dim to icon.
- Decisions: decisions + milestones they gate.
- Deliverables: deliverables + parent milestones.
- Deadlines: deadline flags + critical-path items feeding them.
- Critical Path (existing): keep, tightened to next major deadline.
- New: **What needs me** — only items with `clientActionRequired` (decisions awaiting response, requested files, upcoming meetings, approvals).

## 5. Interactive legend

`MapCanvas.tsx` legend row becomes toggle chips bound to `visibleKinds` in `canvas-context`. Defaults on: Milestone, Decision, Deadline. Defaults muted: Meeting, Deliverable. Off = hidden; muted = faint.

## 6. Selection + hover polish

`MilestoneNode.tsx`, `MapCanvas.tsx`

- Selected marker: stronger ring + outer glow, connected route segment highlights, phase territory tints subtly, others drop to ~0.6 opacity (still readable).
- Hover: 2px lift, glow bump, segment highlight, cursor pointer, existing HoverCard (title, kind, status, one-line summary, View details).
- Drawer-aware pan: when selected marker's screen X falls inside the drawer's rect, `panTo` shifts it left of the drawer edge with padding.

## 7. Clustering

`MarkerCluster.tsx` already exists — extend summary to show phase name and per-kind counts (complete / in-progress / decision / deadline). Click expands in place at `detail` zoom (already wired) or opens the compact popover on dense areas.

## 8. Drawer redesign

`MilestoneSheet.tsx`

- Width `w-[420px]`, generous padding, section dividers, soft border, subtle shadow, no flat white — use `bg-paper` with an accent header tinted by marker kind.
- Header block: kind label chip, status badge next to title, target date.
- Body per kind:
  - Milestone: Summary, Why it matters, What it unlocks, Status, Target date, Client action needed, Latest update, Related files. CTAs: Acknowledge (primary), Request clarification (secondary).
  - Decision: Summary, Options, Recommended, Why it matters, Due. CTAs: Respond (primary), Related files, Book next call.
  - Deliverable: Description, Related milestone, Version, Published date. CTA: Open / Download.
- Keep the selected marker visible; add a faint connector line from drawer edge to marker (SVG overlay in `MapCanvas`).

## 9. Left status card compact/expand

`StatusOverlayCard.tsx`

- Compact default: You are here, current phase, progress bar, next action.
- Expanded: upcoming meeting, key date, client responsibilities, Trust Tai responsibilities.
- Collapse to a vertical pill anchored top-left when dismissed.

## 10. Bottom overview → true mini-map

`RoadmapOverviewStrip.tsx`

- Render a miniature of the route with Point A, Phase 1/2/3, Point B markers.
- Overlay a viewport rectangle driven by `canvas.viewportPhaseKey` + pan/zoom (compute from canvas transform, throttled).
- Highlight active phase strongly; show selected-marker dot on the strip.
- Clicking any zone pans main canvas (already partially wired via `panTo`); extend to Point A / Point B and drag-to-scrub the viewport rect.

## 11. State model — current vs selected

`canvas-context.tsx`, `portal.roadmap.tsx`

- Split into `currentPhaseKey` (operational, from data) and `selectedPhaseKey` (viewing, from UI/URL). Top badge + status card read `currentPhaseKey`; map territory highlight + mini-map + drawer context read `selectedPhaseKey`.
- URL sync already exists for `view` + `phase`; add `marker` param for selected slug so deep links open the drawer at the right item.

## 12. Client-safe filter

`portal-roadmap-model.ts` mapper — strip AI confidence, agent cost, internal notes, review comments, draft versions, risk labels, version conflicts before the portal ever sees them. Status enum locked to: Planned, In preparation, In progress, Waiting on decision, Under review, Delivered, Completed, Paused.

## Technical notes

- Route projection lives in `roadmap-layout.ts` next to existing coord math; markers keep their `nx/ny` fallback for legacy fixtures.
- Throttle hover + viewport updates with `requestAnimationFrame` (memoization for markers already landed last turn).
- No schema changes required for step 12 — apply as a serializer on the portal read path.
- New Playwright coverage: sidebar not clipped at 1280×800, view-mode density diff, legend toggles hide markers, drawer connector renders, mini-map viewport rect follows pan.

## Out of scope

- No backend changes, no new tables.
- No changes to intake, admin, billing, messages routes.
- Marketing site untouched.
