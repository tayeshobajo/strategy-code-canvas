
## Goal

Replace the current centered, card-framed hero with a true editorial split: left column of copy contained within the site grid, right column is a large image panel that bleeds to the right edge of the viewport. Header, nav, and everything below the hero stay untouched.

## Scope

Single file: `src/routes/index.tsx`, `Hero()` function only.

## Layout

- `<section>` becomes the full-bleed wrapper: `relative w-full bg-paper` with `min-h-[720px]` on desktop, `overflow-hidden` for the right bleed.
- Inside, a desktop grid: `lg:grid lg:grid-cols-[48fr_52fr]`. No `max-w-7xl` on the section — the right column must touch the browser edge.
- **Left column (text):**
  - Wrap content in a flex container that vertically centers it (`flex items-center min-h-[720px]`).
  - Inner block: `max-w-[620px]` with left padding that matches the site container — `pl-6 lg:pl-10 xl:pl-[max(2.5rem,calc((100vw-80rem)/2+2.5rem))]` so the copy stays aligned with the header's `max-w-7xl px-10` rhythm at wide widths.
  - Right padding `pr-8 lg:pr-12` for breathing room before the image.
  - Keep existing headline, body, CTA row, microcopy verbatim. No new copy, no eyebrow labels.
- **Right column (image panel):**
  - `relative` container, full height of the grid row, no rounded corners, no border, no shadow card.
  - `<img>` with `absolute inset-0 h-full w-full object-cover object-right` so the booklet stays in frame and the photo fills the panel edge-to-edge, all the way to the viewport's right edge.
  - Drop the existing `rounded-2xl border ... shadow-[...]` wrapper entirely.

## CTAs

Keep the existing two pill buttons. They already share `h-12` and matching padding — leave as-is, just confirm alignment inside the new column width.

## Mobile

- Below `lg`: single column. Text block first inside `px-6 py-14`, max width unconstrained but copy naturally caps via `max-w-[620px]`.
- Image second: render as a sibling block `h-[420px] w-full` with `object-cover object-right`, no card, no rounded corners, full-bleed width.

## Microcopy & buttons

Unchanged. Microcopy keeps the existing `font-mono text-[11.5px] uppercase tracking-[0.16em] text-ink/60` styling.

## Out of scope

- Header, nav, logo.
- FeatureStrip, RoadmapSection, Pricing, CTABand, Footer.
- Hero copy text content and the removed eyebrow labels (stay removed).

## Verification

Preview at 1477px (current viewport), 1024px, and 390px:
- Desktop: image touches the right browser edge, no white gutter; text aligns with header logo on the left.
- Tablet: split holds at `lg` breakpoint; below it, stacks cleanly.
- Mobile: text first, full-width image second, booklet visible.
