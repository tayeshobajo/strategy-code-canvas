# Mobile Stack Order: Image First

## Problem
On mobile, hero and section layouts stack image **below** the headline + body copy. The image is the visual anchor — when stacked, it should land at the top so the eye gets the picture before the words.

## Change
On mobile (stacked) only: image renders first, text second. On desktop (side-by-side), order is unchanged.

Implementation pattern per section:
- Keep DOM order as-is (text first) for SEO/semantics where text is primary, OR put image first in DOM and use `lg:order-*` to restore desktop order.
- Use Tailwind `order-first lg:order-none` (or explicit `order-1 lg:order-2`) on the image wrapper, and the inverse on the text wrapper.
- For grid layouts, ensure the grid is `flex flex-col lg:grid` or uses `order-*` utilities that work in both flex and grid.

## Scope — pages to audit and update

Hero + any stacked image/text section in:
- `src/routes/index.tsx` (home)
- `src/routes/build-my-roadmap.tsx` (the page in the screenshot)
- `src/routes/about.tsx`
- `src/routes/investment.tsx`
- `src/routes/walks.tsx` and `src/routes/walks_.$slug.tsx`
- `src/routes/insights.tsx` and `src/routes/insights_.$slug.tsx`
- `src/routes/what-we-build.tsx`

For each: find image+text pair sections, add `order-first lg:order-none` to the image container (or equivalent ordering classes).

## Out of scope
- Inline icons, decorative backgrounds, full-bleed background images.
- Footer/header.
- Desktop layout — unchanged.
- Copy, imagery, spacing, typography.

## Verification
Playwright at 390px viewport on every listed route: confirm the first large image appears above the matching headline. Then 1280px: confirm desktop order is unchanged.
