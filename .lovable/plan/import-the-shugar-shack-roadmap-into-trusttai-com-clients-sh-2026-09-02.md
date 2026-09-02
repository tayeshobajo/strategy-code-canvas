# Import the Shugar Shack roadmap into trusttai.com/clients/shugashack

Bring the Shugar Shack roadmap microsite into the Trust Tai website as a branded client page, exactly the way the Spartan, Rollick, PTT Anywhere and ePayPolicy roadmaps were imported.

## What gets built

A new page at `trusttai.com/clients/shugashack` containing the full Shugar Shack roadmap experience:

- Hero with the Shugar Shack branding and roadmap title
- The "where they stand today" / Point A section, verbatim from the source deck
- The milestone slider with each milestone's mockup, quote and what it unlocks
- The walkthrough call to action, booking through the existing Calendly popup
- A note from Tai, with portrait and signature
- Trust Tai site header and footer wrapped around it, plus the side section navigation

The deck keeps its own visual treatment inside, exactly as the other client roadmaps do, while the surrounding site stays Trust Tai.

## Approach

The source is an existing Lovable project ([Shugar shack Roadmap](/projects/0dd4fc0c-b359-468f-9616-6e19be8d885f), published at shugarshackroadmap.lovable.app). Its source is read and ported verbatim rather than rebuilt, so copy, numbers and layout arrive unchanged.

## Technical detail

- New route file `src/routes/clients.shugashack.tsx`, modelled on `src/routes/clients.epay.tsx`: `createFileRoute("/clients/shugashack")`, canonical `https://trusttai.com/clients/shugashack`, its own `head()` with Shugar Shack-specific title, description, og and twitter tags, `SiteHeader` / `<main id="main">` / `SiteFooter`, and `PopupModal` from `react-calendly`.
- Port the deck body plus its slider / side-nav helper components, namespaced under `src/components/clients/shugashack/` so nothing collides.
- Migrate the source images through `lovable-assets create` into `src/assets/clients/shugashack/` as `.asset.json` pointers (logo, hero, milestone mockups). Tai's portrait and signature already exist in this repo and get reused.
- Scope the deck's presentation CSS into `src/styles.css` under a `.shugashack-deck` prefix, matching the existing `.spartan-deck`, `.rollick-deck`, `.ptt-deck` and `.epay-deck` blocks, plus the same sticky-header clearance on the first section.
- Side nav items are matched to the sections that actually render (a known mismatch in the source decks).
- Fonts already loaded by the root route are reused; no new font requests.
- The route stays outside the intake and engine surfaces, so the public-surface test suite is unaffected.

## Verification

Typecheck, load `/clients/shugashack` in a browser at desktop and mobile widths, confirm the milestone slider, side nav and Calendly popup work, then publish.
