## Goal

Bring the Spartan Security Services roadmap (built in the sibling Lovable project) into this project as a public, shareable page at **/clients/spartan** — wrapped in the standard Trust Tai `SiteHeader` and `SiteFooter`, served from the trusttai.com domain, and viewable without any Client Portal login.

This becomes the reference example of what a client-facing roadmap preview looks like.

## What gets built

1. **New route: `src/routes/clients.spartan.tsx`**
   - Publicly accessible (no auth guard).
   - `head()` sets a page-specific title / description / og tags / canonical to `https://trusttai.com/clients/spartan`. Indexable (no `noindex`).
   - Layout: `<SiteHeader />` → roadmap content → `<SiteFooter />`.
   - Content: the full Spartan roadmap page ported from the source project's `src/routes/index.tsx` (hero, Point A / current state, hidden opportunities, note from Tai, and the remaining sections in that file — ~1100 lines total).
   - Uses the existing Trust Tai design tokens where they cleanly map; keeps the Spartan-specific inline styles (navy `#06112A`, red `#E63946`, blue `#3B82F6`) so the roadmap keeps its own visual identity inside the Trust Tai chrome.

2. **Port the supporting components** into `src/components/clients/spartan/`:
   - `SectionSlider.tsx`, `SideNav.tsx`, `WaveCanvas.tsx` — copied from the source project. Kept scoped under `clients/spartan/` so they can't collide with future client roadmaps.
   - The slide-deck CSS helpers (`.slide-snap`, `.slide-stage`, `.slide-inner`, `.slide-deck`, `pointA-marquee`, `button-pulse` keyframes) get appended to `src/styles.css` in a clearly-labeled block. No changes to the existing Trust Tai tokens.

3. **Copy all Spartan assets** (56 files: hero images, Point A imagery, market-gap illustrations, build-path mockups, Tai portrait/signature, Spartan logo, etc.) into `src/assets/clients/spartan/` via `cross_project--copy_project_asset`, and rewrite the import paths in the ported route/components accordingly.

4. **Dependency add:** `react-calendly` (used by the "Book a call" CTA in the roadmap). Installed via `bun add react-calendly`.

5. **Discoverability:**
   - Add `/clients/spartan` to `src/routes/sitemap.xml.ts` (if it exists — otherwise skip).
   - No robots.txt change; page is indexable by default.
   - No entry added to `SiteHeader` nav — this is a direct-link page, not a top-level site section.

## Explicitly NOT changing

- Client Portal (`/portal/*`) code, auth, or RLS — this page bypasses the portal entirely by design.
- Existing routes, engine pages, or design tokens.
- No database rows or Supabase writes — the roadmap content is static React (matches the source project, which is fully static).

## Technical notes

- Route path: `src/routes/clients.spartan.tsx` → URL `/clients/spartan` (TanStack file-based routing; dots = slashes).
- Because it's a static content route on a public URL, no loader / server function is needed — SSR renders it directly, which also gives clean OG previews when someone shares the link.
- The source project's `src/routes/index.tsx` is the *entire* roadmap in one file; I'll port it wholesale rather than refactoring into sub-components, to minimize risk of visual drift from the approved client design.
- `og:image`: the source project doesn't set one; I'll wire `og:image` + `twitter:image` to the Spartan hero image asset URL so link previews look right.

## Verification

- `bun run build:dev` (auto by harness) must pass.
- Playwright screenshot of `/clients/spartan` at 1280×1800 to confirm: Trust Tai header renders on top, Spartan hero renders below it unaltered, footer sits at bottom, no console errors.
