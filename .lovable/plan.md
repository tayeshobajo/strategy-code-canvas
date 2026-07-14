## Goal

The `/clients/spartan` page was seeded from source project `b6eb7494…` but only 12 of the 30+ images the original roadmap uses were copied, and the route was trimmed from 1102 lines to 963. Pull the remaining images and restore full parity so the page matches the source.

## Steps

1. **Copy missing asset pointers** from source project into `src/assets/clients/spartan/` (`.asset.json` files are tiny CDN pointers — no re-upload needed):
   - Hero variants: `spartan-hero.jpg`, `hero-suv.jpg`, `hero-officer.jpg`, `hero-officer-v2.jpg`, `hero-patch.jpg`, plus raw `hero-officer-skyline.jpg` and `hero-guard.jpg`
   - Point A extras: `pointA-texture.png`, `pointA-letter.png`, `pointA-shape-frame.png`
   - Hidden opportunities: `hidden-data.jpg`, `hidden-instructor.jpg`, `hidden-trainees.jpg`, `hidden-opportunities.jpg`, `hidden-opportunities-new.jpg`
   - Investment icons: `inv-sneaker.png`, `inv-runner.png`, `inv-rocket.png`
   - Destination: `destination-skyline.jpg`, `destination-pointc.jpg`
   - Levers: `lever-01-pages.jpg`, `lever-02-ai.jpg`, `lever-03-content.jpg`, `lever-04-trust.jpg`
   - Market-gap extras: `market-gap-google.png`, `market-gap-google-v2.png`, `market-gap-google-v3.png`, `website-security-feature.png`
   - Build-path (new subdir `src/assets/clients/spartan/build-path/`): `m01-website-spartan-v4.png`, `m02-seo-dashboard.png`, `m03-content-new.png`, `m04-assistant-new.png`, `m05-academy-new.png`
   - Raw `spartan-logo.png`

2. **Replace `src/routes/clients.spartan.tsx`** with the full source route body (all 1102 lines), rewriting every `@/assets/...` import to `@/assets/clients/spartan/...`. Keep the current wrapper additions (SiteHeader/SiteFooter, indexable head metadata, `.spartan-deck` scoping class).

3. **Verify** with `bun run build:dev` and a Playwright screenshot pass to confirm every section renders images (hero, Point A, market gaps, hidden opportunities, investment stones, destination, build path modules, levers).

## Out of scope

- No changes to shared components, `SiteHeader`/`SiteFooter`, styles.css tokens, or any other route.
- No content edits to the Spartan copy — pure asset + parity restore.
