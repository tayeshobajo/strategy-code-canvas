# Premium Strategic Field Map — Roadmap Canvas Refinement

This is a targeted refinement of the existing `/portal/roadmap` canvas, not a rebuild. We keep the route, data model, sheet, modals, and view-mode filters. We rework how the map is *composed* so markers feel anchored to a journey path and phase territories, replace the busy in-progress spinner with calm premium motion, make phases genuinely interactive, and fix text legibility — all while staying data-driven across projects.

## Files touched

- `src/components/portal/roadmap/roadmap-layout.ts` — new path-and-territory layout engine
- `src/components/portal/roadmap/MapCanvas.tsx` — three-layer canvas (terrain, geometry, markers) + phase interactivity
- `src/components/portal/roadmap/JourneyCanvas.tsx` — SVG spine path with phase segments and shimmer
- `src/components/portal/roadmap/MilestoneNode.tsx` — premium active/hover/selected motion, type-based hierarchy
- `src/components/portal/roadmap/MarkerCluster.tsx` — progressive disclosure for secondary markers
- `src/components/portal/roadmap/RoadmapOverviewStrip.tsx` — current-vs-viewing phase sync
- `src/components/portal/roadmap/StatusOverlayCard.tsx` — glass backing + readability
- `src/components/portal/roadmap/canvas-context.tsx` — `viewingPhase` state alongside `currentPhase`
- `src/routes/portal.roadmap.tsx` — wire viewing state, remove `Loader2` spinner usage on active markers
- `src/lib/portal-roadmap-model.ts` — expose `placement` + `priority` in normalized shape (already has phase/type/status/sequence)

No changes to: `MilestoneSheet`, `ClarificationModal`, `BookCallModal`, `MobilePhaseStack` shell, portal server functions, data schema at rest.

---

## A. Three-layer map composition

Reframe the canvas as three explicit layers rendered in one relative container so markers, path, and terrain always align:

```text
┌──────────────────────────────────────────────┐
│  Layer 1 — Terrain (background image, dim   │
│  scrim, phase territory tint overlays)       │
│  Layer 2 — Geometry (SVG spine path, phase   │
│  segment strokes, branch stubs, glow)        │
│  Layer 3 — Markers (HTML nodes anchored to   │
│  path-t values or offset from path normals)  │
└──────────────────────────────────────────────┘
```

The SVG in Layer 2 owns a single `<path id="spine">` that goes from Point A to Point B, subdivided into phase segments with per-segment stroke variables. Markers in Layer 3 don't get raw x/y from a lookup — they read a `t` value (0..1 along the spine) plus a signed `offset` (perpendicular to the tangent) computed at build time.

## B. Path-anchored placement engine

Extend `roadmap-layout.ts` with a `PlacementEngine`:

```text
placement:
  kind: "on-path" | "adjacent" | "branch"
  t: 0..1                 (position along spine)
  offset: -1..1           (perpendicular offset, in "lane" units)
  lane: number            (integer lane for collision)
```

Derivation rules (data-driven, no per-project hardcoding):

- `t` = phase segment start + `(sequence / phaseCount) * segmentLength`
- Major milestone → `on-path`, offset 0
- Deliverable → `adjacent`, offset ±0.4, lane = child of its parent milestone
- Decision → `branch`, offset ±0.9 with a connector stub back to the path
- Meeting → `adjacent`, smaller offset, low priority
- Deadline → flag anchored to its milestone, not standalone
- Priority + kind drive z-index and default visibility

Collision pass: after initial placement, run a 1-D sweep over `t` per lane; if two markers are within a minimum arc-length, push the lower-priority one to the next lane or collapse it into a cluster (see D).

The engine takes the existing normalized `PortalRoadmapDoc` shape — no schema migration needed. Fallback: if a project provides explicit `x/y` (legacy), respect it.

## C. Journey geometry (Layer 2)

`JourneyCanvas.tsx` becomes the spine renderer:

- One cubic Bézier per phase, joined C1-continuous, so tangents are smooth
- Path stroke uses a `stroke-dasharray` mask for phases already complete (solid) vs upcoming (subtly dashed)
- The segment of the **current phase** gets a slow shimmer via animated `stroke-dashoffset` on an overlaid stroke at low opacity — replaces the marker spinner as the "something is live" signal
- Selected milestone: its host segment brightens; a thin glow stroke fades in for ~400ms
- Branch stubs: short quadratic curves drawn from the spine to each `branch` marker

Export a `getPointAt(t)` and `getNormalAt(t)` so markers can position themselves reactively on resize.

## D. Marker hierarchy & progressive disclosure

`MilestoneNode.tsx` — visual tiers driven by `(kind, priority)`:

- **Primary milestone**: full node with title, status ring, filled body
- **Decision**: diamond-ish shape (rotated square with soft corners), muted until hovered
- **Deliverable**: small dot with icon, title on hover
- **Meeting**: 6px ring only, label on hover
- **Deadline**: tag/flag glyph, only shown when within a data-defined threshold or when its parent is selected

`MarkerCluster.tsx` — when the collision pass finds N secondary markers within a cluster radius, render a single cluster chip ("+3 deliverables") that expands on hover/click to fan out its children along the local path tangent.

Default view shows only primary + decisions + any items matching the active view-mode filter. Secondary markers fade in on phase focus or on `View: Full Journey`.

## E. Premium motion (replace spinner)

Remove `Loader2`/`animate-spin` from active-milestone treatment entirely. Replacements:

- **In-progress**: two concentric SVG rings — outer ring uses CSS `@keyframes` breathing (opacity 0.35→0.7, scale 1→1.08, 2.4s ease-in-out infinite). No rotation.
- **Path shimmer** on the connected segment (see C)
- **Hover**: `transform: translateY(-1px)` + shadow bump + 120ms ease-out
- **Selected**: solid halo ring, connected path segment glows, sheet opens
- Respect `prefers-reduced-motion` — swap breathing for a static ring

All motion tokens live in `src/styles.css` as CSS custom properties so they stay consistent.

## F. Phase interactivity

Add `viewingPhase` to `canvas-context.tsx` (distinct from the operational `currentPhase` already in the model).

Phase click behavior:

- Single click on phase label or territory → set `viewingPhase`, animate SVG viewBox toward the phase's bounding arc (~500ms cubic-bezier), dim other territories to ~35% opacity via a mask overlay, filter markers by phase (unless view-mode overrides)
- Click same phase again → expand phase summary tray inline below the map (or on mobile, above the sheet)
- Hover → territory tint brightens, phase-segment stroke gains 20% opacity, phase title contrast bumps
- Deselect → click background or a "Show full journey" chip that appears when `viewingPhase !== null`

Visual distinction between the two states:

- **Current phase** — gold accent border on its territory + `● LIVE` micro-pill
- **Viewing phase** — soft royal focus ring, camera framed on it, "Viewing" label above overview strip

Both can coexist and be different phases; when they match, the treatments merge cleanly.

## G. Text readability pass

Reading zones per phase title block — a reserved rectangle where the placement engine refuses to drop markers (collision pass treats it as an obstacle).

Contrast treatments applied uniformly:

- Phase title: display serif, `text-white` with a soft dark radial scrim behind it (SVG `<rect>` with gradient fill, ~24% opacity)
- Phase subtitle: 13px, `text-white/80` with 1px text-shadow
- Completion pill: solid ink background, gold text, sharper border — not translucent
- Point A / Point B labels: uppercase mono, on a thin glass chip (`backdrop-blur-md bg-ink/40 border border-white/10`)
- Milestone labels on the map itself stay hidden by default; appear on hover/selection to keep the field map calm

## H. Overview strip sync

`RoadmapOverviewStrip.tsx`:

- Two-row micro-legend: top row shows the phase sequence with the **current phase** highlighted in gold; bottom row (or same row with a second indicator) shows the **viewing phase** with royal outline
- Click a phase chip → drives `viewingPhase` (same handler as territory click)
- Point A and Point B chips are clickable and jump the camera to those extremes
- If more than ~7 phases exist, collapse mid-phases into a summary node (reuses the cluster logic from D)

## I. Data-adaptive guarantees

The engine already receives `PortalRoadmapDoc`. To confirm it stays project-agnostic:

- No literal Mental Dental strings or coordinates in `MapCanvas` or `JourneyCanvas`
- Phase count is read from `phases.length`; spine is subdivided accordingly
- Territory tints are derived from a per-phase color token (falls back to ink/royal/gold rotation)
- Empty phases render as short quiet segments — no crash, no visual dead zone
- Dense phases (>6 markers) automatically cluster secondary items via the collision pass

## J. Out of scope

- Rebuilding the sheet, modals, or view-mode filters (already good)
- Changing server functions or portal data schema
- Mobile phase stack redesign (keeps current behavior; only receives the current-vs-viewing distinction as a small badge)
- Persisting `viewingPhase` across reloads (session-only)

## Verification

- Type check + `bunx vitest run` for existing roadmap tests
- Playwright visual check at `/portal/roadmap?__visual=demo` (desktop 1280×1800): confirm no `animate-spin` on active markers, phase click pans the camera, phase titles remain legible, cluster fans out on hover
- Mobile 390-wide screenshot to confirm phase stack still works with the new viewing-phase badge

## Acceptance

- Markers visibly ride the spine or are tethered to it via branch stubs
- No spinning loader treatment anywhere on the map
- Clicking a phase pans/dims/filters with a single smooth transition
- Phase titles, subtitles, pills, and Point A/B labels are readable against any terrain
- Swapping the fixture for a different project shape (different phase count, different milestone density) renders correctly without code changes
