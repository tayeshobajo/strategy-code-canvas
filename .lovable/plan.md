
## Goal

Replace the current portal roadmap overview strip with a premium **RoadmapOverviewMiniMap** — a dark-glass command mini-map that matches the mockup: deep navy panel, colored phase route segments, Point A mountain vignette, Point B summit/flag vignette, selected-phase glow, milestone dots with priority-based clustering, and right-side expand/fit controls.

## Deliverables

### 1. Two generated art assets

- `src/assets/minimap/point-a-mountains.png` — small painterly cluster of snow-capped mountains, dark navy background, edge-vignetted so it blends into the panel. Transparent-bg PNG, ~256×128.
- `src/assets/minimap/point-b-summit.png` — single tall summit peak with a small red flag on top, matching lighting, transparent PNG.

Both registered via `lovable-assets create` → `.asset.json` pointers, imported into the component.

### 2. New component: `src/components/portal/roadmap/RoadmapOverviewMiniMap.tsx`

Reusable, dynamic, no hardcoded phase count.

**Props**
```ts
{
  journey: RoadmapJourney;         // existing model
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  onJump: (target: "pointA" | "pointB" | PhaseKey) => void;
  viewMode?: RoadmapViewMode;
  matchingSlugs?: Set<string> | null;
}
```

**Layout (single row)**

```text
┌──────────────────────────────────────────────────────────────────────┐
│ [ROADMAP OVERVIEW]  │  ⛰  ● ● ●   ═══   ● ● ●   ═══   ● ● ● ⛰🚩 │ ⤢ │
│  Click a phase       │  Point A  Phase 1   Phase 2   Phase 3  B     │ ⌄ │
│  Current: Phase 1    │                                                    │
│  Viewing: Phase 2    │                                                    │
└──────────────────────────────────────────────────────────────────────┘
```

- **Left block (fixed ~150px):** eyebrow "ROADMAP OVERVIEW", helper "Click a phase to navigate", `Current: Phase N` (dot in phase color), and `Viewing: Phase N` shown only when it differs from current.
- **Main mini-map (flex-1):** an inline SVG that draws:
  - Point A vignette (left, ~72px) — mountains PNG anchored at bottom with a soft radial gradient behind it.
  - N phase segments (flex-1 each by default; optionally weighted by `phase.milestones.length` when the toggle prop is set later). Each segment is a rounded lane with:
    - phase color fill at low alpha, colored route stroke through the middle, glowing on hover,
    - phase label + subtitle above the lane,
    - milestone dots placed by sequence, colored by kind (milestone blue / decision purple / deliverable gold / meeting teal / deadline red),
    - a compact cluster chip (`+N`) when >6 dots after priority filtering.
  - Point B vignette (right, ~72px) — summit + flag PNG.
  - Continuous route line stitched across all segments (SVG path scaled to container width via `ResizeObserver`).
- **Selected phase highlight:** a `2F7DFF` bordered rounded-rect with `rgba(47,125,255,0.18)` fill + soft outer glow around the active segment, animated with 240ms transition.
- **Current phase marker:** small blue dot label ("● Current") in the phase title area — distinct from the large selected glow.
- **Selected marker indicator:** a small pulsing ring on the specific dot when `selectedSlug` matches.
- **Right controls:** Fit-to-field (`Maximize2`) and expand/collapse (`ChevronDown`/`ChevronUp`) — 28px square, `bg-white/[0.06]` on the dark panel.

**Dot priority filtering per phase** (so it stays readable for 5+ phases or dense phases):

1. selected item, 2. current milestone, 3. blocked decision, 4. deadline, 5. critical-path, 6. deliverable, 7. meeting. Take top `maxDotsPerPhase` (6 default; drops to 4 when `phases.length > 4`). Remaining go into a `+N` cluster chip anchored to the phase.

**Phase width logic:** default `flex: 1` per phase; Point A / Point B fixed at 72px. If `phases.length > 4`, reduce label size (`text-[9px]` eyebrow) and cap dots per phase at 4.

**Interactions**

- Click Point A / Point B → `onJump("pointA" | "pointB")`, clears selected phase.
- Click a phase → sets `selectedPhaseKey`, calls `onJump(key)`, opens drawer for representative milestone (active > next upcoming > first) via `onSelect`.
- Hover a phase → brightens segment + shows tooltip (phase title, completion %, item count, primary next item).
- Click a dot → `onSelect(slug)` (parent updates `?m=` and pans main canvas).
- Keyboard: phases and dots are `<button>` with focus-visible ring; Enter/Space triggers click.

**Sync rules**
- `currentPhaseKey` = `canvas.currentPhaseKey ?? journey.currentPhaseKey` — small blue dot.
- `selectedPhaseKey` = `canvas.selectedPhaseKey ?? canvas.viewportPhaseKey` — big glow highlight.
- Selecting a marker in Phase 2 while Phase 1 is current: current dot stays on Phase 1, glow moves to Phase 2, drawer opens — driven entirely from existing canvas context, no state duplication.

**Visual tokens (inline, dark panel only)**
- panel `bg: rgba(3,10,24,0.88)`, `backdrop-blur-xl`, `border: rgba(140,170,220,0.24)`, inner top hairline `rgba(255,255,255,0.06)`, radius `1rem`, shadow `0 20px 60px -20px rgba(0,0,0,0.8)`.
- selected border `#2F7DFF`, fill `rgba(47,125,255,0.18)`, glow `0 0 24px rgba(47,125,255,0.35)`.
- phase palette: Phase 1 `#2F7DFF`, Phase 2 `#F59D2A`, Phase 3 `#7DCA54`; if a 4th/5th phase exists, cycle through `#8B5CF6`, `#0EA5A4`.
- transitions: 160ms hover, 240ms selected/viewport slide, no spinners.

### 3. Wire-up

- `src/routes/portal.roadmap.tsx`: swap the existing `<RoadmapOverviewStrip variant="floating" …/>` render at the sticky bottom overlay for `<RoadmapOverviewMiniMap …/>` with the same props (`journey`, `selectedSlug`, `onSelect`, `onJump`, `viewMode`, `matchingSlugs`). The non-floating (card) usage of `RoadmapOverviewStrip` elsewhere stays untouched.
- Keep `RoadmapOverviewStrip.tsx` in the repo for the card variant; the new component is additive.

### 4. Accessibility

- Every phase / dot is a real `<button>` with `aria-label` (`"Phase 2, 40% complete, 6 items"`), `aria-pressed` for selected, and visible focus ring (`ring-2 ring-[#2F7DFF] ring-offset-2 ring-offset-[#030A18]`).
- Tooltip content lives in `title` + a visually-hidden span so screen readers get it.
- Contrast: white/85 on `#030A18` for labels; phase-color chips use ≥ 4.5:1 tuned tints.

### 5. Acceptance check

Reload `/portal/roadmap`; sticky bottom overlay shows the dark-glass mini-map matching the mockup, with Point A mountains, three colored phase segments (blue/orange/green), highlighted Phase 1, Point B summit + flag, and right-side expand/fit controls. Clicking Phase 2 pans the canvas and moves the glow to Phase 2 while the "Current" dot stays on Phase 1.
