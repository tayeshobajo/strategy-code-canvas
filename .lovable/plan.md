# Walks Hero Rebuild

Rebuild the hero in `src/routes/walks.tsx` using a three-layer composition. Keep everything below the hero (filter row, walk rows, CTA, footer) untouched.

## 1. Register the mountain SVG as a production asset

- Upload `user-uploads://trust-tai-mountain-range-with-summit-flag-header-tight_1.svg` via `lovable-assets create` and write the pointer to `src/assets/walks-mountain-range.svg.asset.json`.
- Import the pointer in `walks.tsx`: `import mountainAsset from "@/assets/walks-mountain-range.svg.asset.json"`.
- Render as `<img src={mountainAsset.url} alt="" aria-hidden />` so the file stays SVG (no rasterization) and can be styled with CSS opacity / positioning.
- Delete the now-unused inline `EngravedMountains` component and its `Peak`/`hatch`/`cross` helpers.

## 2. Hero layout

Replace the current hero JSX with a two-column grid:

```text
+-------------------------------+--------------------------------------+
| eyebrow: THE WALKS            |  [mountain SVG, opacity ~0.4]        |
| H1: Real businesses.          |  [blue dashed route SVG on top]      |
|     Real routes.              |                                      |
|     Real <em>ground</em>      |                                      |
|     covered.                  |                                      |
| body paragraph                |                                      |
| "A selection..." quiet line   |                                      |
| [Build My Roadmap] button     |  "No two walks are the same."        |
+-------------------------------+--------------------------------------+
```

- Desktop grid: `grid-cols-[0.9fr_1.4fr]`, min-height ~620px, generous padding.
- Mobile: single column; copy first, then a simplified landscape block beneath (mountain + route at reduced height).
- Background: existing cream (`bg-paper`). Text: navy (`text-ink`). Italic "ground" in `text-royal italic` using the serif italic.
- Button = existing pill CTA style ("Build My Roadmap" → `#cta`).

## 3. Mountain illustration layer

- `<img>` positioned absolutely inside the right column: `right: -40px`, `bottom: 40px`, `width: 105%`, `opacity: 0.42`, `pointer-events-none`, `select-none`.
- Wrapper `overflow: hidden` so the SVG crops cleanly into the hero.
- Color stays navy on cream — the asset already uses `#071b3f`; no recolor needed.

## 4. Blue route layer (separate inline SVG)

New `<HeroRoute />` inline SVG above the mountain `<img>`:
- `viewBox="0 0 900 360"`, absolutely positioned (`top: 80px`, `right: 20px`, `width: 92%`).
- Single path climbing lower-left → upper-right across the range, electric blue (`var(--royal)`), `stroke-dasharray` for dotted feel, `stroke-width: 2`, round caps.
- 5 milestone nodes along the path: alternating hollow (stroke only, fill cream) and filled (solid royal), `r=5–6`.
- Endpoint near summit: small filled royal dot with a tiny flag (pole + pennant triangle), matching the existing SummitFlag language.
- Reuse the existing in-view draw animation (intersection observer triggers `stroke-dashoffset` from full length → 0, freezes at end). Nodes fade in staggered as the path passes them — keep existing CSS animation hooks in `src/styles.css`; no new keyframes required.

## 5. Thesis line

- `<p class="thesis-line">No two walks are the same.</p>` rendered inside the right column, absolutely positioned centered beneath the lower segment of the route (`left: 35%`, `bottom: 40px`, translate-x to center).
- Serif italic-free, navy, with a short hairline underline beneath (existing serif token).

## 6. Mobile behavior

- Below `md`, switch grid to single column, hide the absolutely-positioned mountain `<img>` overflow, render a compact landscape block (mountain at `width: 130%`, `opacity: 0.35`, route SVG scaled down) sitting under the copy. Thesis line centers under it in normal flow (no absolute positioning at this breakpoint).

## Technical notes

- File touched: `src/routes/walks.tsx` (hero section + remove `EngravedMountains`), plus new `src/assets/walks-mountain-range.svg.asset.json` pointer.
- No new dependencies. No changes to header, filter, rows, CTA, footer, or `src/styles.css` route animation rules.
- Voice law preserved: no em-dashes, no exclamation points.

## Out of scope

- Walk row routes, filter logic, CTA band, footer.
- Any photographic imagery or new decorative elements.
