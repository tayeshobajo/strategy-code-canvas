## Goal

The "Care more than anyone expects you to" section (`CloseCTA` on `/about`) has the animated treatment the user wants — twinkling stars, looping paper plane along an arc trail, soft ring glow on the left, and a navy gradient background. Move that visual layer into the shared `SiteFooter` so every page's footer carries it, and delete the section from About.

## Changes

### 1. `src/components/SiteFooter.tsx`
- Replace the current flat `#0A0F1F` background + faint contour div with:
  - A navy gradient wrapper (`linear-gradient(to right, oklch(0.18 0.05 262) 0%, oklch(0.14 0.05 262) 60%, oklch(0.13 0.05 262) 100%)`).
  - `ConstellationBG` (twinkling stars + ring-breathe glow on the left ~55% of the footer).
  - `PaperPlane` (animated SVG arc trail with looping plane along the path).
  - Right-edge gradient overlay (`linear-gradient(to left, oklch(0.14 0.05 262) 30%, transparent 100%)`) so the headline stays readable.
- Wrap the footer in a ref using a local `useInViewPause` so animations pause when the footer is offscreen (`data-anim-paused`), matching the existing pattern.
- Inline copies of `ConstellationBG`, `PaperPlane`, `useIsSmallViewport`, and `useInViewPause` inside `SiteFooter.tsx` (these are small, self-contained helpers; importing from a route file would create coupling).
- Keep everything else: arrival dotted route + pulsing marker, headline, supporting line, three proof columns, CTA button, deep footer columns, bottom bar.

### 2. `src/routes/about.tsx`
- Remove `<CloseCTA />` from the page composition (line 236).
- Delete the `CloseCTA`, `ConstellationBG`, and `PaperPlane` function definitions (lines ~813–962). Keep `useInViewPause` and `useIsSmallViewport` — other sections still use them.

### 3. CSS
No changes. `twinkle-star`, `ring-breathe`, `plane-trail`, and the `data-anim-paused` selectors already live globally in `src/styles.css`.

## Verification
- Type-check.
- Visit `/about` to confirm the section is gone and the footer now shows stars + paper plane + glow.
- Spot-check `/`, `/insights`, `/walks`, `/investment`, `/what-we-build` — the same animated footer should appear (single shared component).
- Confirm `prefers-reduced-motion` still kills the animations (already handled in `styles.css`).