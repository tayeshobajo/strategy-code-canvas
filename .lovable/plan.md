Yes — the current `EngravedMountains` is only a few ridge lines and light hatching, which is why it reads thin compared to the reference. I can build a much richer, fully hand-authored inline SVG that captures the engraved-illustration feel of the reference image. No raster, no external assets.

## What I'll build

A dense, multi-layer mountain range rendered as inline SVG inside the hero route artwork in `src/routes/walks.tsx`. The route + summit flag stay exactly as they are now; only the mountain backdrop becomes substantially more detailed.

### Visual layers (back to front)

1. Distant haze ridges — 2 very faint, low-frequency silhouettes at low opacity for atmospheric depth.
2. Mid-range ridges — 2 sharper polylines with subtle jagged peaks.
3. Foreground massif — the dominant right-hand peak cluster where the summit flag lands, drawn as a single bold ridge silhouette.
4. Engraved shading — dense diagonal hatch lines following each peak's shaded flank, varying:
   - stroke angle per peak (perpendicular to the slope)
   - stroke length (longer near the base, tapering toward the ridge)
   - stroke spacing (tighter in shadow valleys, looser on lit faces)
   - stroke weight (0.3 – 0.6) for a hand-etched cadence
5. Cross-hatching in the deepest shadow pockets (valleys between front peaks) for tonal weight.
6. Fine vertical "scree" flick marks near the base of the foreground massif for texture.
7. A few hairline contour curves echoing each peak's silhouette inward, suggesting snow-line breaks.

### Style rules

- Single ink color: navy (`oklch(0.32 0.06 262)`), opacity layered between 0.18 and 0.55 across the layers so depth comes from density, not color.
- All strokes: `strokeLinecap="round"`, `strokeLinejoin="round"`, `vectorEffect="non-scaling-stroke"` so lines stay crisp at any width.
- No fills anywhere — pure line work, true to the reference's engraved/etched look.
- Mountains sit only in the right ~65% of the hero viewBox so they don't fight the headline on the left.
- The dotted route still climbs over the range and the summit flag plants at the highest peak.

### Technical details

- File: `src/routes/walks.tsx`
- Function replaced: `EngravedMountains` (same viewBox `0 0 700 260`, same call site inside `HeroRoute`)
- Implementation: ~80–120 inline SVG elements, all hand-placed coordinates (no `Array.from` shortcuts for the hatching — each peak gets bespoke hatch sets so the strokes follow the real slope angle).
- No new dependencies, no new files, no asset uploads.
- Hero route animation, summit flag, row routes, stat blocks, filter, CTA, footer: all unchanged.

### Out of scope

- No changes to row SVGs, filter, copy, or layout.
- No raster image, no Lucide icon substitution, no external CDN assets.
