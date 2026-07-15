## Goal

Make the sections below the hero on `/clients/spartan` feel consistent: a single shared max-width container and one typographic voice (Inter) across Point A, Market Gap, and Note from Tai.

## Current inconsistency

- **Widths differ per section:**
  - Point A: `max-w-[1400px]` with `px-5 → xl:px-28`
  - Market Gap: no max-width wrapper on the section body (grid stretches edge-to-edge inside a full-bleed navy band)
  - Note from Tai: `max-w-6xl` (1152px)
- **Fonts differ per section:** Inter is used for the hero and most headings, but decorative pull-quotes, the Market Gap Q&A body, and the CTA hook use `'Instrument Serif' / Playfair / Georgia`, plus one `'IBM Plex Mono'` inline label. (Georgia/Arial Black also appear inside the fake-SERP mocks — leave those, they're intentional brand mimicry.)

## Changes to `src/routes/clients.spartan.tsx`

1. **Shared container.** Standardize all three below-hero sections on the same inner wrapper: `mx-auto max-w-[1240px] px-5 sm:px-8 md:px-12 lg:px-16`.
   - Point A: change `max-w-[1400px] … xl:px-28` → shared wrapper.
   - Market Gap: wrap the grid in the shared container so it no longer bleeds full-width inside the navy band. Keep the navy background full-bleed; only constrain the content.
   - Note from Tai: change `max-w-6xl` → shared wrapper.

2. **Typography → Inter everywhere below the hero.** Remove serif/mono `fontFamily` overrides on:
   - Point A pull-quote (~line 350)
   - Market Gap red "Q." glyph (~line 842) and Q text (~line 848)
   - Market Gap inline mono tag (~line 895)
   - Note-from-Tai CTA hook line (~line 1048)
   Replace with `fontFamily: "Inter, system-ui, sans-serif"` and use weight/size/italic/tracking to preserve editorial emphasis (e.g. italic + lighter weight for the pull-quote).
   Leave the SERP mockup fonts (Georgia/Arial Black on lines 470, 493) untouched.

3. **Preserve everything else** — no copy, layout/section, image, or hero changes.

## Verification

- Playwright screenshots at 1440px and 390px confirming shared gutters and no serif/mono type outside the intentional SERP mocks.
- `bun run build:dev` clean.

## Out of scope

- Hero section, SERP mockup typography, content/imagery/CTA behavior.
