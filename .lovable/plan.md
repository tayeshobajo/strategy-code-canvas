
# Roadmap QA Pass — Focused Implementation Plan

The canvas architecture (path-anchored layout, spine, phase focus, breathing halos) already landed in the previous pass. This plan closes the remaining gaps from the QA checklist, grouped by the "must-pass before client use" items and the highest-impact fails. Non-must-pass polish is called out but deferred unless a must-pass touches the same file.

## 1. Viewport & layout fit (Section 2 — must pass at 100% zoom)

- `src/routes/portal.roadmap.tsx`: convert the page shell into a fixed-height app layout (`h-[100dvh] overflow-hidden`, `grid-rows-[auto_1fr_auto]`) so sidebar + top bar + canvas + bottom overview always fit without page scroll.
- `MapCanvas.tsx`: canvas becomes the only vertically-flexing region; internal pan/zoom stays but the outer frame no longer grows the document.
- `RoadmapOverviewStrip.tsx`: pin as the bottom row of the grid (not a scroll-in footer); reduce vertical padding so it holds at 100% zoom on 1280×800.
- Right drawer: keep as an overlay panel, cap width at ~410px, and shift canvas focus target left when open (already have `viewingPhase` — reuse to re-center) so the selected marker stays visible instead of being covered.

## 2. Phase interaction & state model (Section 8 — must pass)

- `canvas-context.tsx`: formalize two distinct fields — `currentPhaseId` (project truth, read-only from data) and `viewingPhaseId` (client exploration, user-controlled). Add `focusPhase(id)`, `clearPhaseFocus()`.
- Top status badge always reads `currentPhaseId`; left "Current Phase" card reads `currentPhaseId`; mini-map highlight and phase-region dimming read `viewingPhaseId`.
- `MapCanvas.tsx` phase labels: on click → `focusPhase`, pan+zoom to phase bbox, dim non-selected territories; second click on same phase → `clearPhaseFocus`.
- Mini-map + Jump-to nav both drive `viewingPhaseId`, not `currentPhaseId`.

## 3. Mini-map sync (Section 10 — must pass)

- `RoadmapOverviewStrip.tsx` + `MiniMap.tsx`: render Point A, three phases, Point B on the same normalized spine used by the main canvas (`spineD` scaled down). Show:
  - gold ring on **current** phase
  - royal-blue ring on **viewing** phase
  - dot for currently selected marker (projected onto spine)
- Wire click handlers for Point A / each phase / Point B to `focusPhase` (and pan camera).
- Subscribe to canvas pan/zoom so the mini-map viewport indicator moves live.

## 4. View modes actually filter (Section 12 — must pass)

- `view-mode.ts`: implement predicates for each of Full Journey / Current Phase / What needs me / Critical Path / Deliverables / Deadlines.
- `MapCanvas.tsx` marker render pass: apply predicate → hidden markers are removed (not just faded) except Level-1 anchors (Point A, Point B, current milestone, next decision, next deadline) which remain in Full Journey.
- Update the View dropdown to show active mode and a subtle "showing N of M" count.

## 5. Legend becomes controls (Section 13)

- Legend chips in `MapCanvas.tsx` become buttons with pressed/unpressed states backed by `visibleTypes` in `canvas-context`. Defaults: milestones/decisions/deadlines on; meetings/deliverables muted (opacity 0.35, icon-only) until toggled.

## 6. Motion cleanup (Section 7 — must pass "no spinning")

- Grep for `animate-spin` under `src/components/portal/roadmap/**` and `src/routes/portal.roadmap.tsx`; replace any remaining in-progress spinners with the existing `roadmap-node-breathe` halo or a static `Zap` icon. Loading states (data fetch only) may keep a spinner but not milestone status.

## 7. Drawer polish (Section 11 — must pass "feels premium and connected")

- `MilestoneSheet.tsx`: split into three type-specific bodies (Milestone / Decision / Deliverable) using the field lists in the checklist. Keep one shell (header, close, ESC, outside-click).
- Ensure selected marker retains its selection ring while drawer is open; remove any full-screen scrim (use a light right-edge shadow only).
- CTA hierarchy: primary (Acknowledge / Respond / Open file), secondary (Request clarification / Book next call).

## 8. Readability protection (Section 9)

- Phase titles, Point A/B labels, completion pills: wrap in the existing radial-scrim utility; add a `text-shadow` token for marker labels sitting over bright terrain.

## 9. Client-safe content sweep (Section 15 — must pass)

- Audit the roadmap fixture and any status strings; whitelist statuses to: Planned, In preparation, In progress, Waiting on decision, Under review, Delivered, Completed, Paused. Strip any `confidence`, `cost`, `draft`, `internal`, `ai-generated` fields from render paths.

## Explicitly deferred (not in this pass)

- Full clustering redesign beyond current `MarkerCluster.tsx` behavior.
- Deep adaptability refactor (Section 14) — the layout engine is already data-driven; a schema audit ships only if a must-pass item forces changes.
- Sidebar visual redesign (Section 3) beyond spacing tightening required to hit the 100%-zoom fit.

## Files expected to change

- `src/routes/portal.roadmap.tsx`
- `src/components/portal/roadmap/canvas-context.tsx`
- `src/components/portal/roadmap/MapCanvas.tsx`
- `src/components/portal/roadmap/MiniMap.tsx`
- `src/components/portal/roadmap/RoadmapOverviewStrip.tsx`
- `src/components/portal/roadmap/MilestoneSheet.tsx`
- `src/components/portal/roadmap/MilestoneNode.tsx`
- `src/components/portal/roadmap/view-mode.ts`
- `src/styles.css` (text-shadow + scrim tokens if missing)

## Verification

- Playwright at 1280×800: assert sidebar, top bar, canvas, bottom strip all visible with no page scroll; open drawer and confirm selected node still in view.
- Click each phase in main canvas and mini-map; assert `viewingPhaseId` updates and `currentPhaseId` does not.
- Switch through all six view modes; assert marker count changes per mode.
- Grep repo for `animate-spin` in roadmap files → expect zero matches on status markers.
