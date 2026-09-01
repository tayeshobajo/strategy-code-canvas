# Import the Rollick roadmap into trusttai.com/clients/rollick

Bring the Rollick Revenue Intelligence Roadmap microsite into the Trust Tai website as a branded client page, exactly the way the Spartan roadmap was imported.

## What gets built

A new page at `trusttai.com/clients/rollick` that contains the full Rollick roadmap experience:

- Hero with the Rollick logo and roadmap title
- Section 01 — Where Rollick Stands (Point A: reach across 150+ OEMs and thousands of dealers, the SEMrush authority snapshot, keyword mix, the three journey gaps, and the strategic opportunity)
- Section 02 — The Milestones, the five-card interactive slider starting with the Dealer Revenue Leakage Diagnostic, each with its mockup image, quote and "What It Unlocks"
- The Walkthrough call-to-action, booking through the existing Calendly popup
- A note from Tai, with portrait and signature
- Trust Tai site header and footer wrapped around it, plus the side section navigation

The page keeps Rollick's own visual treatment inside the deck, exactly as Spartan's page does, so the client sees their roadmap while the surrounding site stays Trust Tai.

## Approach

The Rollick roadmap already exists as its own Lovable project. Its source is read and ported rather than rebuilt from scratch, so the copy, numbers and layout arrive verbatim.

## Technical detail

- New route file `src/routes/clients.rollick.tsx`, modelled on `src/routes/clients.spartan.tsx`: `createFileRoute("/clients/rollick")`, canonical `https://trusttai.com/clients/rollick`, own `head()` with Rollick-specific title, description, og and twitter tags, `SiteHeader` / `<main id="main">` / `SiteFooter`, and `PopupModal` from `react-calendly`.
- Port the deck body from the source project's `src/routes/index.tsx` (901 lines) plus its `SectionSlider`, `SideNav` and `WaveCanvas` components, namespaced under `src/components/clients/rollick/` so nothing collides with existing site components.
- Copy the raw image assets from the source snapshot into `src/assets/clients/rollick/`: `rollick-logo.png`, `rollick-logo-light.png`, `rollick-dealership.jpg`, and the five milestone mockups `rollick-m1-diagnostic.png` through `rollick-m5-dashboard.png`. Tai's portrait and signature already exist in this repo under `src/assets/clients/spartan/` and get reused.
- Scope the deck's presentation CSS (`slide-snap`, `market-gap-*`, `pointA-marquee`, `button-pulse`) into `src/styles.css` under a `.rollick-deck` prefix, matching how `.spartan-deck` is already scoped, so no global styles change.
- Fonts already loaded by the root route cover Inter and Cormorant Garamond; the deck's mono accents map to the existing JetBrains Mono rather than adding a new font request.
- The route stays outside the intake and engine surfaces, so the public-surface test suite is unaffected.

## Verification

Typecheck, run the test suite, load `/clients/rollick` in a browser at desktop and mobile widths, confirm the milestone slider, side nav and Calendly popup work, then publish.
