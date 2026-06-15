# Hero photo feather + Sand CTA background

Two scoped CSS/markup updates in `src/routes/what-we-build.tsx` and one token addition in `src/styles.css`. No copy, asset, or layout changes.

## 1. Hero photo: feathered left edge

Current `Hero()` has a 24-wide left-edge gradient overlay (`from-paper to-transparent`). The seam still reads as a hard photo edge because:
- The gradient is too narrow (`w-24`) and only `to-transparent` (no mid-stop).
- The image keeps its own crisp boundary even where the overlay fades.

Changes inside `Hero()` (lines 260-267):
- Apply a `mask-image` directly to the `<img>` so the photo itself fades on its left edge:
  `style={{ WebkitMaskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.15) 6%, rgba(0,0,0,0.6) 16%, #000 28%)", maskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.15) 6%, rgba(0,0,0,0.6) 16%, #000 28%)" }}`
- Widen + soften the paper-color overlay above the image so the photo's warm tones blend into `--paper` rather than meeting a hard edge: change `w-24 bg-gradient-to-r from-paper to-transparent` to `w-[38%] bg-[linear-gradient(to_right,var(--paper)_0%,color-mix(in_oklab,var(--paper)_75%,transparent)_35%,transparent_100%)]`.
- Keep `lg:block` so the feather only applies on the two-column desktop layout.

## 2. CTA section: full-width sand background with subtle texture

Current `BottomCTA()` uses `bg-paper` (off-white). The reference is a warmer sand tone with faint contour/paper texture and soft top-left light wash.

Changes:

a. Add a sand token + texture utility in `src/styles.css` (after the existing `hero-texture` utility):

```css
@utility sand-bg {
  background-color: oklch(0.93 0.022 78);
  background-image:
    radial-gradient(ellipse 60% 45% at 15% 0%, oklch(1 0 0 / 0.45), transparent 60%),
    radial-gradient(ellipse 50% 40% at 90% 100%, oklch(0.85 0.03 75 / 0.35), transparent 65%),
    repeating-radial-gradient(ellipse 70% 50% at 30% 40%, transparent 0, transparent 58px, oklch(0.35 0.04 70 / 0.04) 58px, oklch(0.35 0.04 70 / 0.04) 59px),
    url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.35  0 0 0 0 0.28  0 0 0 0 0.18  0 0 0 0.05 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
```

b. In `BottomCTA()` (line 673): swap `bg-paper` for `sand-bg`, and remove the border-top hairline (or keep a softer one) since the band now stands on its own color. The container stays full-width (it already is — `section` is block-level).

## Out of scope
- No copy, button, image, layout, or column-ratio changes.
- No changes to other sections, hero text, or footer.

## Validation
Playwright at 1280px + 375px: screenshot the hero seam and the CTA band; verify the photo fades smoothly into the cream and the CTA reads as a warm sand band with subtle texture matching the reference.
