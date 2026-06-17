# Match Hero Mountain to Reference

The current mountain asset reads too sparse and faint next to the reference, which shows a denser engraved range with strong directional hatching on the foreground right-hand peak cluster, layered mid ridges, and faded distant silhouettes on the left.

## Approach

Author a new richer engraved-mountain SVG and swap it in as the hero asset. Keep everything else (route, milestones, summit flag, copy, layout) untouched.

## Changes

1. **New SVG asset**: write a hand-authored `walks-mountain-range-v2.svg` with:
   - **Distant left silhouettes** — 2–3 faint low-frequency ridge lines at ~12–18% opacity to fade the left side toward the headline (so it doesn't fight the copy).
   - **Mid-range layer** — sharper polylines across the full width with subtle peak variance, ~25% opacity.
   - **Foreground massif (right side)** — dominant peak cluster with bold ridge silhouette, multiple sub-peaks, ~50% opacity stroke.
   - **Dense directional hatching** — every foreground/mid peak gets bespoke hatch sets perpendicular to its slope, with cross-hatching in the deepest shadow valleys. Stroke spacing tighter in shadows, looser on lit faces. This is what gives the reference its weight.
   - **Snow-line contour hairlines** wrapping each summit.
   - Single navy ink, layered opacity, no fills, `stroke-linecap="round"`, `vectorEffect="non-scaling-stroke"`.
   - viewBox tuned so the dense peaks sit on the right ~60% and softly fade left.

2. **Upload via `lovable-assets create`** and write the new `.asset.json` pointer at `src/assets/walks-mountain-range.svg.asset.json` (overwriting the existing pointer). Delete the previous asset with `delete_asset` afterward so CDN doesn't keep an orphan.

3. **Tune `<img>` styling in `src/routes/walks.tsx`** if needed — likely bump opacity from `0.42` to ~`0.5` and nudge positioning so the dense right side anchors near the summit flag of the blue route, matching the reference composition.

## Out of scope

- Blue route, milestones, summit flag, copy, filter, walk rows, CTA, footer — all unchanged.
- No raster image, no photographs, no new dependencies.

## Files touched

- `src/assets/walks-mountain-range.svg.asset.json` (replaced with new asset pointer)
- `src/routes/walks.tsx` (opacity / positioning tweaks on the mountain `<img>` only)
