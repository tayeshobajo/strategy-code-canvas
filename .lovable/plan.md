
## Goal

Use the booklet photo as a full-bleed background of the hero section instead of confining it to a right column. Headline, CTAs, and microcopy overlay the left half on a near-opaque cream wash so legibility stays editorial-crisp.

## Scope

Only the hero section in `src/routes/index.tsx`. Header above and every section below remain untouched.

## Changes

**1. Hero section structure**
- Remove the two-column grid (`grid-cols-[1.05fr_1.25fr]`).
- Hero `<section>` becomes `relative isolate overflow-hidden` and bleeds edge-to-edge (no `max-w-7xl` on the section itself).
- Set `min-h-[640px] lg:min-h-[760px]` so the background photo has room.

**2. Background image layer**
- `<img>` becomes `absolute inset-0 h-full w-full object-cover object-right -z-10`.
- Drop the `mask-image` CSS, `max-h-[460px]`, and the existing column wrapper.
- Keep the same asset (`trustTaiHero`).

**3. Solid paper wash overlay**
- Sibling `<div>` absolutely positioned, `inset-0 -z-10`, with a linear-gradient:
  - 0–45%: solid `hsl(var(--paper))` at ~96% opacity
  - 45–70%: fades to transparent
  - 70–100%: transparent (photo fully visible on the right)
- Mobile: gradient widens (~0–85% solid, fade 85–100%) via a second `lg:` variant so headline stays readable over the photo on narrow viewports.

**4. Text column**
- Wrap eyebrow, headline, body, CTAs, microcopy in a `relative z-10` container constrained to `max-w-7xl` with the existing horizontal padding, then an inner `max-w-xl lg:max-w-2xl` for the copy itself.
- Vertical centering: `flex min-h-[inherit] items-center`.
- Buttons keep their current stacking behavior (stack on mobile, row on `sm+`).

**5. Cleanup**
- Remove the `hero-photo-mask` CSS class from `src/styles.css` if it's no longer referenced anywhere else (verify before deleting).

## Out of scope

- Header, nav, logo.
- Feature strip, roadmap panel, pricing, CTA band, footer.
- Copy, button labels, microcopy.
- The hero asset itself (no re-crop, no new image).

## Technical notes

- Full-bleed works because the hero section is a direct child of the page wrapper; we just stop constraining its width and instead constrain the inner text container.
- `object-right` keeps the booklet in frame at every breakpoint; the cream wash hides the empty desk area on the left half.
- Gradient lives inline (Tailwind arbitrary value `bg-[linear-gradient(...)]`) or as a new utility in `styles.css` — will use a small utility class for readability and to keep the responsive variant clean.
