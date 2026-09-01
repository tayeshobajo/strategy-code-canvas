# Import the ePayPolicy roadmap into trusttai.com/clients/epay

Bring the ePayPolicy roadmap microsite into the Trust Tai website as a branded client page, exactly the way the Spartan, Rollick and PTT Anywhere roadmaps were imported.

## What gets built

A new page at `trusttai.com/clients/epay` containing the full ePayPolicy roadmap experience:

- Hero with the ePayPolicy branding and roadmap title
- The "where they stand today" / Point A section, verbatim from the source deck
- The milestone slider with each milestone's mockup, quote and what it unlocks
- The walkthrough call to action, booking through the existing Calendly popup
- A note from Tai, with portrait and signature
- Trust Tai site header and footer wrapped around it, plus the side section navigation

The deck keeps its own visual treatment inside, exactly as the other client roadmaps do, while the surrounding site stays Trust Tai.

## Approach

The source is an existing Lovable project (`ePayPolicy Roadmap`, published at epaypolicyroadmap.lovable.app). Its source is read and ported verbatim rather than rebuilt, so copy, numbers and layout arrive unchanged.

## Technical detail

- New route file `src/routes/clients.epay.tsx`, modelled on `src/routes/clients.pttanywhere.tsx`: `createFileRoute("/clients/epay")`, canonical `https://trusttai.com/clients/epay`, its own `head()` with ePayPolicy-specific title, description, og and twitter tags, `SiteHeader` / `<main id="main">` / `SiteFooter`, and `PopupModal` from `react-calendly`.
- Port the deck body plus its slider / side-nav helper components, namespaced under `src/components/clients/epay/` so nothing collides.
- Migrate the source images through `lovable-assets create` into `src/assets/clients/epay/` as `.asset.json` pointers (logo, hero, milestone mockups). Tai's portrait and signature already exist in this repo and get reused.
- Scope the deck's presentation CSS into `src/styles.css` under an `.epay-deck` prefix, matching the existing `.spartan-deck`, `.rollick-deck` and `.ptt-deck` blocks, plus the same sticky-header clearance on the first section.
- Side nav items are matched to the sections that actually render (a known mismatch in the source decks).
- Fonts already loaded by the root route are reused; no new font requests.
- The route stays outside the intake and engine surfaces, so the public-surface test suite is unaffected.

## Verification

Typecheck, load `/clients/epay` in a browser at desktop and mobile widths, confirm the milestone slider, side nav and Calendly popup work, then publish.
