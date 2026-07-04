# Roadmap Canvas — Marker Intelligence & Drawer Navigation

Scope: refine only marker density, marker interaction, and drawer behavior. Keep layout, terrain, route spine, phase regions, mini-map, status panel, legend, and drawer chrome as-is.

## 1. Marker priority + display levels (`roadmap-layout.ts`)

Introduce a `displayLevel: "primary" | "compact" | "clustered"` on each `MarkerPos`, computed from a priority score:

```text
1 active milestone
2 blocked decision
3 next major deadline (nearest future dueDate)
4 next client decision
5 current phase milestones
6 future milestones
7 deliverables
8 meetings
```

- View mode `full`: primary = Point A, Point B, active, next decision, next deadline, + top 1–2 in selected phase. Everything else → compact, then clustered by proximity.
- View mode `phase`: primary = all milestones in current phase; other phases → compact/clustered and dimmed.
- View mode `needs-me`: primary = client decisions, approvals, requested files, upcoming client meetings, blocked items. Hide the rest.

Expose helpers `selectPrimaryMarkers(journey, viewMode, selectedPhase)` and `computeDisplayLevels(markers, viewMode, ctx)`.

## 2. Phase lanes (`roadmap-layout.ts`)

Replace the current single `attachmentOffset` with lane-based offsets around the spine:

```text
upper lane  (-0.055) → decisions, deadlines
main lane   ( 0.000) → primary milestones
lower lane  (+0.055) → deliverables, supporting
off-road    (+0.095) → meetings, secondary notes
```

Anchors for the spine still use the main-lane baseline so the road stays smooth. Keep the `PHASE_TITLE_BUFFER` clamp.

## 3. Collision detection + clustering (`roadmap-layout.ts` + `MapCanvas.tsx`)

After lane assignment, run a simple sweep in normalized space:
- If two labels overlap → downgrade lower-priority to compact.
- If ≥3 markers within `thresholdNx` (scaled to zoom) → cluster.
- Active marker and Level-1 primaries are never absorbed (extend existing `keepFull` set).

Reuse `clusterMarkers` and `MarkerCluster` component. Cluster click → popover listing members; clicking a member selects that milestone (same flow as marker click).

## 4. Marker rendering (`MilestoneNode.tsx`, `MapCanvas.tsx`)

- Primary: current full pill.
- Compact: small icon dot with status ring, no label.
- Hover on compact: scale up, show label + tooltip (title, kind, status, one-line summary), and highlight owning route segment.
- Selected marker: brighter ring/glow, connected segment glows (already partly implemented), unrelated markers get `opacity-60`. No heavy grey overlay.

## 5. Drawer navigation (`MilestoneSheet.tsx`)

Add prev/next controls in the drawer header:

```text
[←  Previous]                 [Next  →]
```

- Sequence = flattened visible markers in journey order: Point A → Phase 1 → Phase 2 → Phase 3 → Point B, filtered by current view mode.
- Buttons call `onSelect(prevSlug|nextSlug)`; disable at ends.
- On change: update selection, mini-map, segment glow, and pan via existing `scrollToXWithDrawer`.

## 6. Keyboard + outside-click (`MilestoneSheet.tsx`)

While drawer open:
- `Escape` → close (already via Radix).
- `ArrowLeft` / `ArrowRight` → prev/next (attach `keydown` on `window`, ignore when focus is in an input/textarea).
- Click outside drawer (canvas empty area) → close. Currently `onInteractOutside` is prevented on desktop; change to: allow close when the pointer target is not a marker/cluster/mini-map/phase label (detect via `closest('[data-roadmap-interactive]')`, add that attribute to those elements).

On close: clear `selectedSlug`, strip `?m=` from URL, keep pan/zoom/phase unchanged.

## 7. URL sync (`portal.roadmap.tsx` + `canvas-context.tsx`)

- On mount: if `?m=<slug>` present → set selection, open drawer, pan, highlight segment, sync mini-map.
- On selection change (marker click, cluster member, mini-map, prev/next): replace URL with `?m=<slug>` (history.replaceState, no scroll).
- On drawer close: remove `m` param.

## Acceptance

- Phase 1 no longer cramped in Full Journey view.
- Compact markers expand on hover with tooltip + segment highlight.
- Clusters appear where ≥3 markers collide; clicking opens popover.
- Drawer shows Prev/Next; arrow keys work; Esc + outside-click close it.
- Selected marker stays in sync with drawer, mini-map, URL, and route glow across view/phase changes and resize.

## Technical notes

- Files touched: `roadmap-layout.ts`, `MapCanvas.tsx`, `MilestoneNode.tsx`, `MarkerCluster.tsx`, `MilestoneSheet.tsx`, `RoadmapOverviewStrip.tsx`, `canvas-context.tsx`, `portal.roadmap.tsx`.
- No schema changes, no new deps.
- View-mode filtering lives in one helper so `MapCanvas`, `MiniMap`, and drawer prev/next iterate the same sequence.
- Tooltip uses existing `@/components/ui/tooltip`. Popover uses existing `@/components/ui/popover`.
