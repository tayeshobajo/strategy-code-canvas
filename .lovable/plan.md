## Goal

Use the footer that already exists on `/insights` as the single shared component across every page. Remove all other per-page footers.

## Step 1 — Extract `SiteFooter`

Lift the existing footer markup from `src/routes/insights.tsx` (currently the `<footer>` inside `FooterCTA`, ~line 875) into a new component `src/components/SiteFooter.tsx`.

- Keeps the starscape/constellation background exactly as-is.
- Uses `<TrustTaiLogo variant="white" />` alone (no duplicated "Trust Tai" / "MAP. BUILD. SCALE." text next to it).
- Nav list mirrors `SiteHeader`'s `NAV` exactly, same order and labels:
  The Roadmap, What We Build, Investment, About, Insights, The Walks — all real `<Link>`s.
  To keep them literally in sync, export `NAV` from `SiteHeader.tsx` and import it in `SiteFooter.tsx`.
- "© 2026 Trust Tai. All rights reserved." + Privacy Policy / Terms of Service links.

The pre-footer CTA on `/insights` stays where it is; only the `<footer>` block moves into the shared component, and `FooterCTA` then renders `<SiteFooter />` underneath.

## Step 2 — Replace every other page's footer

For each page below, delete the local footer function/JSX and render `<SiteFooter />` instead. Pre-footer CTA sections stay; only the bottom `<footer>` block is swapped.

- `src/routes/index.tsx` — inline footer (~line 1170)
- `src/routes/what-we-build.tsx` — local `Footer` (~line 945)
- `src/routes/investment.tsx` — `<footer>` inside `FooterCTA` (~line 580)
- `src/routes/about.tsx` — local `SiteFooter` (~line 963)
- `src/routes/walks.tsx` — local `SiteFooter` (~line 530)
- `src/routes/walks_.$slug.tsx` — local `SiteFooter` (~line 882)
- `src/routes/insights_.$slug.tsx` — replace any footer block there too

## Verification

- `rg -n "<footer" src/routes` returns zero matches.
- `rg -n "function (Site)?Footer\b|^function Footer\b" src/routes` returns nothing.
- Every route imports `SiteFooter` from `@/components/SiteFooter` and renders it once.
- Visual pass on `/`, `/what-we-build`, `/investment`, `/about`, `/insights`, `/walks`, an insight detail, and a walk detail: identical starscape footer, white logo mark alone, header and footer nav labels match exactly, "© 2026".
