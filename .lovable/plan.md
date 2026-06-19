# Plan: Unified Close + Footer ("arrival field")

## Goal

Turn the closing CTA section and footer on every page into one continuous deep-navy field (#0A0F1F) with a single scroll-triggered route animation, a per-page close slot, and one shared, sealed footer chrome.

## 1. New shared component: `SiteClosing`

Create `src/components/SiteClosing.tsx`. This is the ONLY way pages render the close + footer from now on.

Props:
```ts
type SiteClosingProps = {
  headline: ReactNode;        // serif, may contain <em> cream-italic phrase
  supporting: string;         // one line beneath headline
};
```

Layout (top → bottom, all on one navy field):
1. **Blend-in band** — a 160px-tall element that sits BEFORE the close, with `bg-gradient-to-b from-transparent to-[#0A0F1F]`. Pages render this above their existing last section's content by ending the page with `<SiteClosing …/>` directly after the previous section (no wrapper). The component itself starts with this gradient strip so the section above fades into navy with no seam.
2. **Close block** — centered, max-w-[760px]:
   - Serif headline (cream-italic phrase via `<em>` styled `text-[oklch(0.92_0.04_85)] italic font-serif`).
   - Supporting line, `text-white/70`.
   - **Constants** (hardcoded inside `SiteClosing`):
     - White pill button "Build My Roadmap" → `/#roadmap` (or `/` for now; confirm route).
     - Line: "A 30-minute conversation. If the timing is right, we should talk. If it is not, the work is waiting when it is."
3. **Route animation** — see §2.
4. **Footer chrome** — see §3.

Background: solid `#0A0F1F` from the close down. A single, very faint topographic contour SVG (low-opacity concentric ellipses) is the only texture. Remove starscape, center glow, diagonal arc.

## 2. The animation (one gesture, no loop)

Below the close text, a horizontal SVG band (~120px tall, full container width):

- Left: hollow circle + mono label `POINT A` (text-[10px] tracking-[0.25em] text-white/55).
- Right: filled destination marker (no label).
- A dotted electric-blue (#2563FF) path connects them with a slight organic curve.
- Three milestone dots along the path at **uneven** normalized positions: `[0.22, 0.48, 0.78]` (deliberately not 0.25/0.5/0.75).

Behavior:
- IntersectionObserver fires once when ≥40% visible.
- The dotted path animates `stroke-dashoffset` from full length → 0 over 2500ms with `cubic-bezier(0.22, 1, 0.36, 1)` easing.
- Each milestone dot fades from `fill-white/15` → electric blue + soft blur glow as the draw progress crosses its position (compute via `requestAnimationFrame` or staggered `setTimeout` at 22%/48%/78% of 2500ms).
- Destination marker glows (box-shadow / filter) at the very end.
- After arrival: state is frozen. No loop, no pulse, no drift.
- `@media (prefers-reduced-motion: reduce)`: render the finished state immediately — full path drawn, all milestones lit, destination glowing.

Implementation: a single self-contained `<RouteAnimation />` inside `SiteClosing`, using one `useEffect` + `useRef` on the SVG, no external lib.

## 3. Footer chrome (sealed, identical everywhere)

Replaces current `SiteFooter.tsx`. Same dark field continues — no border-top, no seam.

Container: `mx-auto max-w-[1240px] px-6 sm:px-8 lg:px-10 py-14`.

Top row (3 columns on `md+`, stacked on mobile):
- **Brand**: `<TrustTaiLogo variant="white" />` (white mark only, no wordmark text). Beneath: `The system behind the system.` (`text-white/55 text-[13px]`). Nothing else.
- **Navigation** (heading `Navigate`, `text-[11px] tracking-[0.2em] text-white/40 uppercase`): the locked six, in this order, via `<Link>`:
  1. The Roadmap → `/`
  2. What We Build → `/what-we-build`
  3. Investment → `/investment`
  4. About → `/about`
  5. Insights → `/insights`
  6. The Walks → `/walks`
  Source from `NAV` exported by `SiteHeader.tsx` (already exported) so header/footer stay in lockstep. If `NAV` order/labels don't match exactly, fix `NAV` once.
- **Connect** (heading `Connect`): `Murfreesboro, Tennessee` · `hello@trusttai.com` (mailto) · `LinkedIn` (placeholder `#` href, `target=_blank`).

Bottom bar (separated by `border-t border-white/8 mt-12 pt-6`, flex between):
- `© 2026 Trust Tai. All rights reserved.`
- `Privacy Policy · Terms of Service` (placeholder `#`).

All text white-on-navy with subdued opacity ladder (`white/45`–`white/70`). No starfield, no glow, no border at top of footer.

## 4. Page wiring

Replace existing close + footer per page with `<SiteClosing headline={…} supporting={…} />`. Remove the old per-page `FooterCTA` / `CTABand` and any `<SiteFooter />` invocation; `SiteClosing` renders both.

Per-page content:

| Page | Headline (with cream italic) | Supporting |
|---|---|---|
| `/` (Roadmap) | "The Roadmap is where the next two years stop being a guess." | "One conversation. One document. The distance from where you are to where you need to be, *drawn before the first build begins*." |
| `/what-we-build` | "The build is never the point. *The position it earns you is.*" | "Every system here is a milestone inside a larger map, built in the order your business needs them." |
| `/investment` | "The cost of building this is not the question. *The cost of staying where you are is.*" | "You are not buying software. You are buying back the part of the company that still runs through you." |
| `/about` | "*Care more than anyone expects you to.*" | "Your ambition matters. So does the partner you hand it to. If that is how you build, let us build your Roadmap. If it is not, we will point you toward someone who builds the way you need." |
| `/insights` | "Every piece here is *a truth we have walked with a founder*." | "If reading them made you want the version mapped for your business, that is where the Roadmap begins." |
| `/walks` | "Every walk here started *where you are now*." | "A first conversation. A map. Then the first milestone. Your walk begins the same way." |

(Italic phrasing is rendered via `<em>` in the headline node; per the brief, the cream-italic accent is the call-out within each headline. Where the user gave a single italic line as the whole headline — `/about` — the entire headline is italic.)

Detail routes `walks_.$slug.tsx` and `insights_.$slug.tsx` use the same close as their list page (`/walks`, `/insights` respectively).

Pre-existing pre-footer marketing sections (e.g. `CTABand` on `/`, `FooterCTA` on `/insights` and `/investment`) are **deleted** — `SiteClosing` is the single closing moment now. Other above-the-close page content stays as-is; the `SiteClosing` gradient handles the blend, the section above doesn't need changes.

## 5. Files touched

- **New**: `src/components/SiteClosing.tsx` (close slot + animation + chrome).
- **Rewrite**: `src/components/SiteFooter.tsx` → either delete and replace all imports with `SiteClosing`, OR keep `SiteFooter` as the chrome-only export consumed internally by `SiteClosing`. Plan: delete the file; export `SiteFooter` as an internal sub-component from `SiteClosing.tsx` only if needed.
- **Edit pages** (remove `FooterCTA`/`CTABand`/`SiteFooter` usage, add `<SiteClosing …/>`):
  - `src/routes/index.tsx`
  - `src/routes/what-we-build.tsx`
  - `src/routes/investment.tsx`
  - `src/routes/about.tsx`
  - `src/routes/insights.tsx`
  - `src/routes/walks.tsx`
  - `src/routes/walks_.$slug.tsx`
  - `src/routes/insights_.$slug.tsx`
- **Verify** `src/components/SiteHeader.tsx` `NAV` matches the locked six exactly; adjust if not.

## 6. Verification

- `rg -n "FooterCTA|CTABand|<SiteFooter" src/routes` returns nothing.
- Every route renders exactly one `<SiteClosing …/>` as its last element.
- Visual on `/`, `/what-we-build`, `/investment`, `/about`, `/insights`, `/walks`, one walk slug, one insight slug:
  - No horizontal seam between previous section and close — navy fades up.
  - No starfield, no center glow, no diagonal arc; only faint contour texture.
  - Headline + cream-italic accent + supporting line render correctly.
  - "Build My Roadmap" button + 30-minute line identical on every page.
  - Route animation draws once, milestones light at 22%/48%/78%, destination glows, then stillness. No loop.
  - Reduced-motion shows finished state instantly.
  - Footer: white logo mark only, "The system behind the system." beneath; nav is the locked six in order; Connect line correct; © 2026 + Privacy/Terms.

## Open question

The "Build My Roadmap" button needs a destination. Default to `/#contact` or to `/` until a contact/booking route exists — confirm or provide the URL.
