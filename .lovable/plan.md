## Match hero + Current Argument SVGs to reference

Only `src/routes/insights.tsx` is touched. No data/logic changes.

### 1. Hero trail — redraw shape, keep airplane

The current `HeroPath` is one continuous S-curve edge-to-edge. The reference has two distinct shapes with a clear gap under the headline:

- **Left accent** (lower-left): a short, low arc starting just off the left edge with an open-circle waypoint, ending before the headline column.
- **Right loop** (right ~45% of the band): a tall curling "S/almost-loop" that rises from the bottom-right area, sweeps left under the subhead, curls back up and to the right, and ends at the paper airplane in the upper-right. One open-circle waypoint sits on the descending part of the right curl (visible in the reference under the right arrow).
- **Trail behind plane**: a small curl just behind the plane's tail (already present — refine endpoint to land on the new loop's terminus).

Concrete updates to `HeroPath` (viewBox stays `0 0 1240 360`):
- Replace the single `<path d=...>` with two paths sharing the same gradient stroke (`url(#hero-path)`), `strokeWidth="1"`, `strokeDasharray="1.75 8"`, `strokeLinecap="round"`:
  - Left arc: `M -10 300 C 60 270, 130 260, 240 282` — short and low.
  - Right loop: starts low-right, sweeps up-left under subhead, curls back right-up to the plane, approximately:
    `M 620 320 C 760 320, 880 300, 980 250 S 1130 150, 1080 110 S 950 120, 990 170 S 1140 180, 1200 90`
    Tune by eye against the reference; the goal is the "hook" silhouette on the right.
- Open-circle waypoints: one at `~(60, 290)` on the left arc, one at `~(1070, 175)` on the descending right curl. Drop the middle waypoint at 760.
- Move the small trail curl to end at the new plane anchor, keep `1.25 6` dash and `0.9` stroke.
- Airplane glyph and rotation stay as-is (size already matches reference).
- Increase hero bottom padding so the right loop has vertical room: change the spacer below from `mt-16 sm:mt-20 lg:mt-24` to `mt-20 sm:mt-28 lg:mt-32`.

### 2. Current Argument — small refinements only

The `MilestonePath` matches the reference closely; only fine-tune to reference proportions:
- Container: the right column currently uses `lg:col-span-5` with `justify-center`. Reference shows the path nudged slightly down-right relative to the text column — change to `items-end justify-end` and add `pr-2` so Freedom sits near the upper-right corner of the column without overflowing.
- Tighten the active "Leverage" ring slightly to match reference scale: outer `r=12` at `0.3` opacity, inner `r=7` at `0.5`. Keep solid dot `r=4`.
- Move the `Freedom` label below-right (reference shows it below the dot, not vertically aligned): change to `x={s.x - 4} y={s.y + 22} textAnchor="end"` — appears just under-and-left of the dot like the reference.
- Inactive dot radius stays `r=3`; Clarity, Sequence, Leverage label `y+22` unchanged.

### 3. Visual regression baselines

After the SVG changes, regenerate the existing Playwright baselines so the hero and rows screenshots track the new design:
- `bun run test:visual:update` (existing script) — updates the 4 viewport snapshots in `tests/visual/insights-hero.spec.ts-snapshots/`.

### Out of scope

- No changes to data, sort/filter/search, infinite scroll, virtualization, article list rendering, or row hover/dot alignment (already correct per prior turn — 0.00px delta across viewports).
- No new dependencies or test files.

### Files touched

- `src/routes/insights.tsx` — `HeroPath`, `Hero` spacer, `MilestonePath`, `FeaturedArgument` right-column classes.
- `tests/visual/insights-hero.spec.ts-snapshots/*` — regenerated baselines.
