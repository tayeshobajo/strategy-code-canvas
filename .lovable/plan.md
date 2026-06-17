# Fix The Walks Hero Composition

The hero is currently dominated by a too-strong mountain image and a competing contour ellipse pattern. Restructure it so the mountain is a quiet, masked background landscape, the blue route is the confident gesture, and the headline keeps focus.

## Changes

### 1. Replace the mountain asset with the originally uploaded SVG
The current asset was modified (boosted opacities/strokes). Re-upload `user-uploads://trust-tai-mountain-range-with-summit-flag-header-tight_1-2.svg` unchanged via `lovable-assets create`, overwrite `src/assets/walks-mountain-range.svg.asset.json`, and delete the old asset.

### 2. `src/routes/walks.tsx` — Hero only
- **Remove `<ContourBg />`** and its component. It's the "heavy contour pattern" competing with the mountain.
- **Right-column container** becomes the masked landscape world: `relative overflow-hidden min-h-[460px] lg:min-h-[520px]`.
- **Mountain `<img>`**: position `absolute -right-16 bottom-4`, `w-[118%]`, `opacity-[0.28]`, `pointer-events-none`, `select-none`. Sits at z-index 1 (no class needed, behind route).
- **Route SVG wrapper**: keep absolute inset-0 but raise to `z-10` so it sits above the mountain. The route already climbs lower-left → upper-right ending at a summit flag — keep as is.
- **Thesis line**: move out from the visual center to sit below the route, above the mountain base — `absolute bottom-6 left-[34%] z-10` on lg, with the small rule beneath. Keep mobile fallback unchanged.
- Headline/copy column unchanged structurally; just ensure it has `relative z-10` so nothing layers over it.

### Out of scope
Filter row, walk rows, CTA, footer, other routes — untouched.

## Files touched
- `src/assets/walks-mountain-range.svg.asset.json` (re-uploaded, original SVG)
- `src/routes/walks.tsx` (Hero composition + remove ContourBg)
