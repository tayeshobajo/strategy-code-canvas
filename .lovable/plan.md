# Roadmap polish plan

## 1. Fix the hidden kind legend (Milestone / Decision / Deliverable / Meeting / Deadline)

**Root cause:** `MapLegend` is absolutely positioned at `bottom-24` (~96px), but the expanded `RoadmapOverviewMiniMap` occupies the bottom ~140px of the canvas. The legend gets covered.

**Fix:** Integrate the legend into the mini-map itself so it's always visible and never fights for space.

- Remove the free-floating `<MapLegend />` from `src/routes/portal.roadmap.tsx` (bottom-24 block).
- Add a compact, inline legend row inside `RoadmapOverviewMiniMap`:
  - Position: top-right of the panel (a thin bar above the phase strip, right of "Roadmap overview"), or a slim strip pinned along the top border of the panel.
  - Same 5 chips (Milestone / Decision / Deliverable / Meeting / Deadline) with the existing `KIND_COLOR` dots.
  - Chips remain click-to-toggle (mute/hide) — reuse the existing `visibleKinds` / `mutedKinds` state so filtering still works.
  - When collapsed (chevron down), keep the legend row visible — only the phase strip collapses.
- Ensure the panel's overall height doesn't grow noticeably: the legend row is ~22px tall, mono 10px chips.

## 2. Premium, dynamic, interactive polish (prioritized)

### A. Mini-map as a living "control surface"
- **Hover scrub**: hovering a phase segment previews that phase on the main canvas (soft pan/zoom without committing selection); clicking commits.
- **Milestone dot tooltips**: on hover, show a small floating card with title, status pill, and due date. Currently only the segment has a title-attribute tooltip.
- **Progress fill shimmer**: the traveled portion of each phase lane gets a very slow left-to-right sheen (2% opacity, 6s loop) so the "you are here" beacon feels alive without being noisy.
- **Micro-sparkline** under each phase: 6-tick bar showing on-track / at-risk / blocked distribution.

### B. Cinematic canvas moments
- **Selection cinematic**: when a milestone is picked, briefly dim the rest of the map (radial vignette), pulse the selected node twice, then settle. Currently the highlight is static.
- **Phase "arrival" pan**: switching phases from the mini-map does a short ease-in pan with a subtle parallax on the terrain layer (foreground slower than background).
- **Route reveal on scroll**: as the user scrolls horizontally across the field, the golden route is drawn (stroke-dashoffset) up to the current viewport — makes exploring feel like uncovering.
- **Ambient world**: slow drifting clouds, faint mist near the shoreline, and a very subtle day/twilight tint tied to overall completion %.

### C. High-ticket drawer refinements
- **Milestone sequence rail** at the drawer's left edge: 17 hairline ticks representing every milestone, current one highlighted — gives the user spatial context inside the drawer.
- **Prev/Next as swipe cards**: keep the footer nav, add left/right arrow keys and a subtle swipe hint icon.
- **"Related" strip**: dependencies + unlocks rendered as chips that scroll the canvas + open on click.
- **Reading progress bar** at the top of the drawer body for long milestones.

### D. Status, feedback, and delight
- **Beacon on the current milestone** on the main canvas (soft pulsing halo, matching the mini-map "you are here" beacon).
- **On-hover audio pings** (optional, opt-in via a small sound toggle in the header) — a single wooden "tick" on dot hover, a soft chime on phase complete.
- **Celebration upgrades**: when a phase hits 100%, in addition to confetti, briefly render a golden ribbon across that phase's lane on the mini-map and etch a small badge next to the phase title.
- **Empty/blocked states with personality**: for blocked items, render a small red compass pin on the canvas and pulse it every 8s until acknowledged.

### E. Command layer (power users, feels premium)
- **`⌘K` command palette**: jump to any milestone by name, toggle kinds, focus current phase, "take me to what needs my attention."
- **Keyboard shortcuts overlay** (press `?`): shows arrows for phase nav, `J/K` for milestone nav, `F` for fit-to-field, `esc` closes drawer.
- **Deep-linkable state**: `?m=content-import-structuring` opens the drawer and pans the canvas — makes shared links feel like a product, not a page.

### F. Presentation polish
- **Typography tightening**: the phase titles ("Foundation", "Core Platform Build") already use a serif; add ligatures + `ss01` and reduce tracking slightly at large sizes for that editorial look.
- **Consistent focus rings**: use a single warm gold focus ring (`#FFD37A`) app-wide on the roadmap — currently mixed royal-blue rings.
- **Subtle grain overlay** on the canvas (already partial): raise to 3% and mask out around the current phase so it feels lit.
- **Motion budget**: cap simultaneous animations to 2; respect `prefers-reduced-motion` (already partial) across all new effects.

## Recommended first slice to ship

If you approve, I'd start with the highest-impact, lowest-risk set:

1. **Fix the legend** (integrate into mini-map, remove the floating one).
2. **Milestone dot tooltips** in the mini-map.
3. **Beacon on the current milestone** on the main canvas.
4. **Selection cinematic** (dim + double-pulse) when a milestone is picked.
5. **`⌘K` command palette** for jumping between milestones.

Everything else is a follow-up slice. Confirm and I'll implement slice 1.

## Technical notes

- Legend integration: move `MapLegend` JSX (or its content) into `RoadmapOverviewMiniMap.tsx`, keep the same `useLegendState` hook so the canvas filtering logic in `view-mode.ts` continues to work unchanged.
- Tooltips: use existing shadcn `Tooltip` primitive so keyboard focus also triggers them (a11y).
- Beacon: add a new `<PulseHalo>` layer in `JourneyCanvas.tsx` bound to `journey.activeMilestone.slug`.
- Command palette: shadcn `Command` component with `cmdk`, opened via a `useHotkey` on `⌘+K` / `Ctrl+K`.
- Deep links: read `?m=` in the route's `useSearch`, sync to `selectedSlug`; write back on selection.
