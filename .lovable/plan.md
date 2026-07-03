## Goal

Refine the existing Client Portal Roadmap canvas from "pins on a beautiful image" into a smart cartographic system. Keep the cinematic terrain, route, and layout — change what is shown, when, and how surfaces stay in sync.

No visual redesign. No new backend. All work is inside `src/components/portal/roadmap/*`, `src/routes/portal.roadmap.tsx`, and `src/lib/portal-roadmap-model.ts` (derived selectors only).

---

## 1. Single source of truth for current phase

Today `activePhaseKey` in `canvas-context.tsx` is user selection state, but the top command bar reads `journey.activeMilestone.phase` while the left status card reads a different fallback — that's the "Phase 2 / Phase 1" mismatch.

Introduce a derived `currentPhaseKey` on the journey model (in `portal-roadmap-model.ts`) computed as: first phase containing an `in_progress` milestone → else phase of `activeMilestone` → else first phase with any non-complete milestone → else first phase.

All surfaces read from that one value:
- Top command bar "Current Phase" pill
- Left `StatusOverlayCard` "You are here"
- `MapCanvas` active-territory highlight
- `RoadmapOverviewStrip` default active segment
- Selected marker drawer breadcrumb

`activePhaseKey` in canvas-context becomes strictly "user-selected phase override" and falls back to `currentPhaseKey` for display.

## 2. Progressive disclosure — three marker levels

Add a `visibilityLevel: 1 | 2 | 3` field derived per milestone in a new helper `computeMarkerLevels(journey, { currentPhaseKey, selectedPhaseKey, viewMode })`:

- Level 1 (always visible): Point A, Point B, current phase label, current milestone, next decision (first upcoming `kind: "decision"`), next major deadline (nearest `dueDate`).
- Level 2 (current or selected phase, or immediately adjacent phase): remaining primary milestones.
- Level 3 (hidden by default in Full Journey): deliverables, meetings, secondary decisions, future milestones, small dependencies.

`MilestoneNode` renders three visual states driven by level + hover/selected:
- Level 1 → full pill label + icon.
- Level 2 → short label + icon.
- Level 3 → icon-only dot, expands to tooltip on hover.

Label collision resolver: if two rendered labels' bounding boxes overlap, the lower-priority one collapses to icon-only until hover or the phase is focused.

## 3. View modes drive density

Extend `view-mode.ts` from filter-only to density-controlling. `RoadmapViewMode` stays the same enum but `matchesView` returns a `MarkerVisibility` (`"full" | "muted" | "hidden"`) instead of a boolean.

- Full Journey → only Level 1 full; others muted or hidden.
- Current Phase → all markers in current phase full; others muted.
- Decisions → decision markers + directly-affected milestones full; unrelated hidden.
- Deliverables → deliverable markers + parent milestones full; meetings/minor decisions hidden.
- Deadlines → deadline flags + critical-path milestones full.

Add two new toggles in the top command bar next to the view-mode dropdown:
- "Focus current phase" — sets viewMode to `current` and pans/zooms `MapCanvas` to the current-phase bounding box.
- "Show critical path" — overlays a highlighted route segment through the critical-path milestone chain (data derived: milestones with `unlocks` links leading to the nearest deadline).

Also add "Client action mode" — filters to only items with `clientActionNeeded`, decisions awaiting approval, and unread deliverables.

## 4. Marker clustering

New helper `clusterMarkers(markers, { zoom, viewport })` in `roadmap-layout.ts` that groups markers whose projected screen distance is under a threshold (e.g. 48px). Returns either a single marker or a cluster node with `{ phase, total, completed, inProgress, decisions, deadlines }`.

New `MarkerCluster` component renders a compact dark chip:
```
Phase 1
6 items · 2 done · 2 in progress · 1 decision · 1 deadline
```
Click expands the cluster in place (popover with the child markers) or, if space allows, splays them along the route.

Clustering thresholds ease as the user zooms in via the "Focus current phase" affordance or mini-map jumps.

## 5. Marker placement rules

Extend the layout data in `roadmap-layout.ts` so each marker declares an `attachment`:
- `milestone` → `on-road` (centered on the route path).
- `decision` → `fork` (offset perpendicular from the road at a branch point).
- `deliverable` → `beside` (paired to its parent milestone, offset).
- `deadline` → `flag` (on-road, with flag glyph).
- `meeting` → `off-road` (calendar glyph, away from the route).

`MilestoneNode` picks glyph + offset from `attachment`. This is a data/style change — positions still come from the existing layout coordinates but with a small perpendicular offset by kind.

## 6. Bottom Roadmap Overview becomes the map controller

`RoadmapOverviewStrip` is upgraded from footer to controller:

- Click Point A / Phase 1 / Phase 2 / Phase 3 / Point B → calls `canvas.panTo(target)` in `canvas-context`. Add `panTo(target: "pointA" | "pointB" | PhaseKey | { slug })` action that computes target viewport bounds and animates.
- Selecting a marker on the main map updates the strip's active segment (already partly wired — extend to always match).
- Panning the main map updates the strip's active zone: throttled listener on canvas viewport → derive which phase's bounding box contains the viewport center → set active segment.

Strip stays sticky inside the map canvas, not the page.

## 7. Interactive legend

Rebuild the bottom legend (currently decorative) as toggle chips wired to a new `visibleKinds: Set<MilestoneKind | "deadline">` in `canvas-context`.

Defaults on: Milestone, Decision, Deadline.
Defaults muted (rendered at low opacity, no labels): Meeting, Deliverable.
Click a chip → toggle between visible / muted / hidden (three states, cycle).

`MapCanvas` combines `visibleKinds` with `visibilityLevel` and `viewMode` to decide render state per marker.

## 8. Collapsible left status card

`StatusOverlayCard` gains a `collapsed` state, persisted in `localStorage` (`portal.roadmap.status.collapsed`). Default collapsed.

- Collapsed (compact, ~220px wide): Current phase, progress bar, next action.
- Expanded: adds upcoming meeting, key date, client responsibilities, Trust Tai responsibilities.
- Chevron toggle in the card header.

## 9. Selected-marker behavior refinements

Already close after the last pass — finalize:
- Overlay stays at 8–12% (`bg-black/10`, no blur) — verified.
- Selected marker: white pill + royal ring + soft glow.
- Unrelated markers: opacity 0.72.
- Related route segment: brightened stroke via a computed `activeSegmentIds` derived from `selectedSlug` + `dependencies`/`unlocks`.
- On selection, `MapCanvas` pans so the marker is centered in the visible area minus the drawer width (offset pan target by `drawerWidth / 2`).

## 10. Information zoom (not visual zoom)

Add a `zoomLevel: "strategic" | "phase" | "detail"` to `canvas-context`, controlled by:
- Zoom-out button or "Fit to field" → `strategic` (Level 1 only).
- Selecting a phase (via mini-map or Focus current phase) → `phase` (Level 1 + 2 of that phase).
- Clicking into a cluster or manual zoom-in control → `detail` (Level 1 + 2 + 3).

This is the umbrella rule that combines viewMode + visibleKinds + visibilityLevel.

---

## Technical section

### Files touched

- `src/lib/portal-roadmap-model.ts` — add `currentPhaseKey`, `criticalPath: string[]`, `computeMarkerLevels`, `deriveMarkerAttachment`. Pure functions, unit-testable.
- `src/components/portal/roadmap/view-mode.ts` — change `matchesView` to return `MarkerVisibility`; add view-mode → visibility mapping.
- `src/components/portal/roadmap/roadmap-layout.ts` — add `clusterMarkers` and `attachmentOffset` helpers.
- `src/components/portal/roadmap/canvas-context.tsx` — add `currentPhaseKey`, `selectedPhaseKey` (rename of `activePhaseKey` semantics), `zoomLevel`, `visibleKinds`, `panTo()`, `viewportPhaseKey`.
- `src/components/portal/roadmap/MapCanvas.tsx` — consume level/visibility/attachment; throttled viewport → mini-map sync; drawer-aware pan-to-selected.
- `src/components/portal/roadmap/MilestoneNode.tsx` — render three tiers (full / short / icon), attachment-aware glyph offsets.
- `src/components/portal/roadmap/MarkerCluster.tsx` — new component.
- `src/components/portal/roadmap/RoadmapOverviewStrip.tsx` — clickable segments driving `panTo`, active segment reflects `viewportPhaseKey || selectedPhaseKey || currentPhaseKey`.
- `src/components/portal/roadmap/StatusOverlayCard.tsx` — collapsible with persistence.
- `src/routes/portal.roadmap.tsx` — wire top command bar to single `currentPhaseKey`; add Focus current phase, Show critical path, Client action mode controls; interactive legend chips.

### Tests

Extend `tests/visual/portal-roadmap.spec.ts`:
- Current-phase consistency: top bar, status card, mini-map, and selected drawer all read the same phase label.
- Full Journey mode shows only Level 1 markers with visible labels; deliverables/meetings are icon-only or hidden.
- Legend toggle: turning off "Meeting" hides meeting markers; turning off "Deliverable" removes their labels.
- Cluster: seed a fixture where 4+ markers overlap; assert a single cluster chip renders with the correct counts, and clicking it expands.
- Mini-map click on Phase 3 pans the canvas so a Phase 3 marker (e.g. "First School Launch") is in the visible viewport bounds; scrolling the main map updates the mini-map's active segment.
- Focus current phase zooms to the current-phase bounding box; Fit to field returns to full view with Point A and Point B both visible.
- Selected-marker pan accounts for the drawer: the selected marker's center x is within `canvasWidth - drawerWidth` on desktop.
- Status card collapsed by default; expand toggle reveals responsibilities.

Add unit tests for `computeMarkerLevels`, `clusterMarkers`, and `currentPhaseKey` in `src/lib/portal-roadmap-model.test.ts`.

### Out of scope

- No changes to `client_portal_roadmaps` schema or server functions.
- No redesign of the terrain background, route path, or overall page composition.
- Mobile stack (`MobilePhaseStack`) reuses the same derived model but keeps its current layout; only the shared selectors change.
