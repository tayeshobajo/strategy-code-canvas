# Roadmap Canvas Refactor — Plan

Goal: make `/portal/roadmap` behave like a controlled app canvas inside the client portal shell, not a tall static page with pins. Fits at 100% browser zoom. All selection state (map, mini-map, drawer, top phase badge, Jump to) is driven by one source of truth.

## Scope guardrails
- No concept redesign. Keep terrain art, marker types, drawer content model.
- No backend/data changes. Demo fixture + real loader unchanged in shape.
- Visual regression snapshots will be re-baselined after layout lands.

## 1. Portal shell restored around the canvas
- `src/routes/portal.roadmap.tsx` renders inside the existing portal layout (`src/routes/portal.tsx` `<Outlet />`), not as a standalone full-bleed page.
- Confirm the dark Trust Tai sidebar (Home, Roadmap active, Files, Messages, Billing, Activity, account block) stays mounted. Remove any wrapper that escapes the portal layout.
- Roadmap page owns only the area right of the sidebar.

## 2. App-viewport sizing (fits at 100% zoom, no page scroll)
Layout tokens for the roadmap route:
```
sidebar         : fixed, h-screen (existing)
roadmap root    : h-[100dvh] flex flex-col, overflow-hidden
  ├─ top bar   : h-[72px] shrink-0  (title, phase pill, Fit/Jump/View, Download, Ask, Book)
  └─ canvas    : flex-1 min-h-0 relative  (map + overlays + sticky mini-map)
```
- No vertical scroll on the page. Only the canvas may pan horizontally.
- Status card (left) and drawer (right) are absolutely positioned inside the canvas, not stacked block elements.
- Mini-map is `absolute bottom-0` inside canvas with backdrop blur.

## 3. Canvas behavior
- Background terrain uses `object-fit: cover` inside a `rounded-2xl` canvas frame, with a controlled focal point so Point A, all phases, and Point B stay reachable.
- Marker coordinates stay in normalized `roadmap-layout.ts` percentages so they track the image on resize.
- Add `panToPhase(phaseId)` and `panToMarker(markerId)` that translate the map inside the canvas (CSS transform on the map layer, not scroll). "Fit to field" resets transform.

## 4. Bottom Roadmap Overview (sticky, integrated)
`RoadmapOverviewStrip` moves from below the map to a sticky overlay inside the canvas:
- Point A → Phase 1 → Phase 2 → Phase 3 → Point B, route line, phase markers.
- Shows active viewport highlight (rectangle over the current pan window).
- Shows currently selected phase in stronger stroke.
- Click a phase → `panToPhase` + updates selected phase.
- Click a marker on main map → strip highlights that marker's phase.
- Fullscreen toggle button preserved.

## 5. Single selection state
Introduce one hook `useRoadmapSelection` inside the roadmap route:
```
{ selectedPhaseId, selectedMarkerId, viewMode, setPhase, setMarker, clear }
```
Consumers:
- Main map markers (active/dim styling)
- Drawer (open when `selectedMarkerId`)
- Mini-map (highlight phase)
- Top "Current Phase" pill (reflects selected phase or default)
- Jump to dropdown (writes to selection)
- View filter (writes viewMode: full journey vs active phase)

Rules:
- Selecting a phase closes the drawer unless the selected marker belongs to that phase.
- Selecting a marker sets both marker + its phase.
- "Fit to field" clears marker selection, keeps phase.

## 6. Selected-marker overlay
Replace the heavy dim with a controlled treatment:
- Overlay layer: `bg-black/10` maximum (was ~50%).
- Selected marker: stronger ring + glow, scale 1.08.
- Unrelated markers: opacity 0.75, no blur.
- Route segment near selected marker gets a brighter stroke.
- Drawer sits alongside, canvas stays fully visible behind/next to it.

## 7. Drawer as detail panel
- Width `w-[380px]` desktop, aligned under top bar, full canvas height, `rounded-l-2xl`.
- Does not cover mini-map (mini-map layer sits above with `z-index`).
- Content variants by marker type: Milestone / Decision / Deliverable / Meeting / Deadline (fields as specified in message).
- Client-safe content only (rule 11/12): filter out `needs_review`, `ai_generated`, `confidence_*`, `draft_*`, `risk_*`, internal notes. Map any internal status to the allowed vocabulary (Planned, In preparation, In progress, Waiting on decision, Under review, Delivered, Completed, Paused).

## 8. Label hierarchy (reduce middle crowding)
Extend `MilestoneNode` with a `density` prop derived from selection + phase:
- Active marker: full card label.
- Current phase milestones: full labels.
- Other phase milestones: icon + short label.
- Secondary items: icon only, label on hover.
- Decisions: small purple pill.
- Deliverables: small gold/green pill.
- Deadlines: flag marker.

Hover: lift, glow, tooltip (title / type / status / one-line summary / "View details"), cursor pointer, nearby route segment brightens.

## 9. Header actions
Wire all to the selection hook:
- Fit to field → reset pan + zoom, clear marker selection, keep phase.
- Jump to → dropdown of phases + key markers; selects and pans.
- View → toggle Full journey vs Active phase only (viewMode).
- Download PDF → existing PDF export using same layout snapshot.
- Ask a question → opens message composer prefilled with roadmap context (route to `/portal/messages?context=roadmap:<phase>` — existing route).
- Book next call → opens scheduling flow (existing link).

All actions must leave the "unchanged sections" DOM untouched (visual regression stability test already covers this; snapshots will be regenerated once new layout is stable).

## 10. Files to touch
- `src/routes/portal.roadmap.tsx` — restructure into viewport shell, mount selection hook, wire header actions.
- `src/components/portal/roadmap/MapCanvas.tsx` — CSS transform pan, cover-fit background, lighter overlay, marker density prop, hover state.
- `src/components/portal/roadmap/MilestoneNode.tsx` — density variants, hover tooltip, pill/flag variants.
- `src/components/portal/roadmap/RoadmapOverviewStrip.tsx` — sticky inside canvas, viewport highlight, click-to-jump.
- `src/components/portal/roadmap/StatusOverlayCard.tsx` — absolute positioning inside canvas.
- `src/components/portal/roadmap/roadmap-layout.ts` — add phase pan targets, marker density levels.
- New: `src/components/portal/roadmap/useRoadmapSelection.ts` — single state hook.
- New: `src/components/portal/roadmap/RoadmapDrawer.tsx` — type-aware drawer, replaces existing inline drawer.
- `tests/visual/portal-roadmap.spec.ts` + snapshots — re-baseline all four viewports after layout lands.

## 11. Verification
- Manual: 1280×800, 1366×768, 1440×900, 1920×1080 at 100% zoom — no page scroll, mini-map visible, sidebar visible.
- Playwright: existing header-action stability hashes still pass; regenerate the four visual baselines.
- Console clean, no auth regressions (demo mode `?__visual=demo` still works).

## Open question before build
Nothing blocking — proceeding as specified. If you want the map to *scale down* rather than pan (so entire journey is visible without any panning at 1440px), say so and I'll drop pan/zoom in favor of a single fit-to-viewport render.
