# Pixel-match The Walks hero against the reference

## What's wrong now

The `<img src={mountainAsset.url} />` layer is not rendering — the CDN URL in `src/assets/walks-mountain-range.svg.asset.json` returns the SPA HTML shell, not an SVG, so the hero right column is empty except for the blue dotted route. The route also drifts above where the ridgeline should be because there's no mountain to climb across.

We need to (a) stop depending on the broken external SVG asset, (b) author the engraved mountain range directly in code so we control composition pixel-for-pixel, and (c) verify alignment against the approved mockup with a side-by-side screenshot.

## Plan

### 1. Build an inline `<EngravedMountains />` SVG component in `src/routes/walks.tsx`

Hand-authored, no external asset. Single `<svg viewBox="0 0 900 360">` aligned with `HeroRoute`'s viewBox so the route and mountain share one coordinate system.

Layers, back → front (all strokes `var(--ink)` at low opacity, no fills, to match the engraved feel in the reference):

- **Back ridge** — soft, low-contrast ridgeline across the full width, low summit on the left, taller on the right. `opacity ~0.18`, `stroke-width 1`.
- **Mid ridge** — sharper jagged silhouette, peak roughly at `x≈760, y≈40` so the summit flag lands on it. `opacity ~0.32`.
- **Front ridge** — closer, smaller peaks on the right foreground. `opacity ~0.45`.
- **Engraving hatching** — short diagonal `<line>` strokes (generated in a loop) clipped to each ridge's silhouette path via `<clipPath>`, simulating the etched shading in the reference. Density highest on the front ridge, sparser on the back.
- **Summit flag pole base** — small triangular flag at the highest peak, matching the existing `SummitFlag` style but rendered as part of the mountain layer so the route's flag sits exactly on the summit.

All paths use cubic Béziers tuned so the mid ridge crests at `(760, 40)` — the same end point the route already targets `(860, 22)` — bringing the route's terminal flag onto the visible summit.

### 2. Wire it into `Hero()` and remove the broken asset

In `src/routes/walks.tsx`:
- Delete the `import mountainAsset from "@/assets/walks-mountain-range.svg.asset.json"` line.
- Replace the `<img …>` with `<EngravedMountains />` absolutely positioned to fill the right column (`absolute inset-0 z-[1]`).
- Keep `<HeroRoute />` at `z-[2]` and the "No two walks are the same" caption at `z-[3]`.
- Adjust the right column to `min-h-[460px]` (matches the reference proportion better than the current 560).
- Nudge `HeroRoute`'s start/end so the first node sits at the foothill base and the flag lands on the mid-ridge summit. Re-tune `points[]` and the Bézier `d` together so milestone dots track the ridge.

### 3. Delete the orphaned CDN asset

`assets--delete_asset` on `src/assets/walks-mountain-range.svg.asset.json` after the import is removed.

### 4. Pixel-match verification

Drive Playwright to:
1. Screenshot `/walks` hero at the reference width (1024 CSS px to match the upload).
2. Crop hero region from both the rendered screenshot and `user-uploads://image-52.png`.
3. Resize to identical dimensions and compute a per-pixel diff with PIL (mean absolute error + a side-by-side composite saved to `/tmp/browser/walks/diff.png`).
4. Iterate on mountain control points and route path until MAE on the hero region drops to a clearly-acceptable threshold (visual sign-off on the composite, MAE under ~12/255 on grayscale).

Out of scope: filter row, walk rows, CTA, footer. Hero only.

## Files touched

- `src/routes/walks.tsx` — add `EngravedMountains`, swap into `Hero`, remove `mountainAsset` import, retune route path.
- `src/assets/walks-mountain-range.svg.asset.json` — deleted via `assets--delete_asset`.
