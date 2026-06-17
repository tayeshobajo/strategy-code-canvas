## Objective
Replace the current composed SVG hero artwork on The Walks page with the uploaded PNG image, since the SVG is not rendering properly.

## Changes

1. **Upload the PNG as a Lovable Asset**
   - Use `lovable-assets create` with the uploaded file at `/mnt/user-uploads/image-53.png`
   - Write the resulting `.asset.json` pointer to `src/assets/walks-hero-bg.png.asset.json`

2. **Update `src/routes/walks.tsx`**
   - Replace the `heroArt` import to point to the new PNG asset.
   - Keep the existing hero layout: live HTML copy on the left, artwork on the right.
   - The `<img>` tag already uses `object-contain` and `w-full flex-1`; no layout changes needed beyond swapping the `src`.
   - Retain the thesis line "No two walks are the same." as live text beneath the artwork.
   - Retain the mobile fallback thesis line.

3. **Cleanup (optional)**
   - Delete the old SVG asset pointer `src/assets/trust-tai-walks-hero-composed.svg.asset.json` and its CDN asset via `delete_asset` if confirmed no longer referenced elsewhere.

## Out of scope
- No changes to left-side copy, typography, spacing, or animations.
- No changes to the walk rows, filter, CTA, or footer.
