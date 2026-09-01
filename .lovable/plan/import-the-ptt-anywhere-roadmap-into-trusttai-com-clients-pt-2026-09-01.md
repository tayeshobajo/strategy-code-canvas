# Import the PTT Anywhere roadmap into trusttai.com/clients/pttanywhere

Bring the PTT Anywhere roadmap microsite into the Trust Tai website as a branded client page, exactly the way the Spartan and Rollick roadmaps were imported.

## What gets built

A new page at `trusttai.com/clients/pttanywhere` containing the full PTT Anywhere roadmap experience:

- Hero with the PTT Anywhere logo and roadmap title
- The "where they stand today" / Point A section, verbatim from the source deck
- The milestone slider with each milestone's mockup, quote and what it unlocks
- The walkthrough call to action, booking through the existing Calendly popup
- A note from Tai, with portrait and signature
- Trust Tai site header and footer wrapped around it, plus the side section navigation

The deck keeps its own visual treatment inside, exactly as Spartan and Rollick do, while the surrounding site stays Trust Tai.

## Approach

The source is an existing Lovable project (`Pttanywhere Road map.`, published at pttanywhereroadmap.lovable.app). Its source is read and ported rather than rebuilt, so copy, numbers and layout arrive verbatim.

## Technical detail

- New route file `src/routes/clients.pttanywhere.tsx`, modelled on `src/routes/clients.rollick.tsx`: `createFileRoute("/clients/pttanywhere")`, canonical `https://trusttai.com/clients/pttanywhere`, its own `head()` with PTT-specific title, description, og and twitter tags, `SiteHeader` / `<main id="main">` / `SiteFooter`, and `PopupModal` from `react-calendly`.
- Port the deck body plus its slider / side-nav helper components, namespaced under `src/components/clients/pttanywhere/` so nothing collides.
- Migrate the source images through `lovable-assets create` into `src/assets/clients/pttanywhere/` as `.asset.json` pointers (logo, hero, milestone mockups). Tai's portrait and signature already exist in this repo and get reused.
- Scope the deck's presentation CSS into `src/styles.css` under a `.ptt-deck` prefix, matching the existing `.spartan-deck` and `.rollick-deck` blocks, plus the same sticky-header clearance on the first section.
- Fonts already loaded by the root route are reused; no new font requests.
- The route stays outside the intake and engine surfaces, so the public-surface test suite is unaffected.

## Verification

Typecheck, run the test suite, load `/clients/pttanywhere` in a browser at desktop and mobile widths, confirm the milestone slider, side nav and Calendly popup work, then publish.
