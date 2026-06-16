# Animations for The Roadmap page

Style: **understated, editorial, intentional** — every motion earns its place by reinforcing meaning (a walk, a sequence, a destination). No decorative motion; nothing competes with reading. Reuses the existing `Reveal` / `useReveal` infrastructure and respects `prefers-reduced-motion`.

## Guiding rules
- Every animation maps to a concept on the page (route, sequence, arrival, compounding).
- One motion per moment — never two competing focal points.
- Slow cubic-bezier easings (≈600–900ms); short delays (60–120ms stagger).
- The existing `AnimatedWalksChart` and `WalkFigure` stay as the page's animation centerpiece — nothing new should compete with them.

## Section-by-section

**1. Hero ("from Point A to a position…")**
- Eyebrow → headline → body → CTA staggered fade-up (use `Reveal immediate`), matching What We Build hero rhythm.
- Hero image: gentle fade-right on load; subtle 8s `drift` on the headline accent word only.
- A faint hairline rule under the headline draws left→right (240ms after headline lands) — signals "a line is being mapped".

**2. Feature strip (Clarity / Strategy / Compounding / Ownership)**
- Staggered fade-up per card (110ms apart) on scroll-in.
- Icon stroke draw-in (reuse `iconStagger` pattern already in What We Build).

**3. Roadmap section + tabs (Consulting / Education / Healthcare)**
- Section header reveals first; tabs slide in as a single rail.
- **Tab switching:** rows cross-fade with a 40ms row-by-row stagger; the status segments (mapped / build / live) animate their width from 0 → final using `transform: scaleX` from the left, so the build order visibly "lays down" each switch. This makes the tab change feel like re-mapping, not just swapping content.
- Active tab underline slides between tabs (shared layout pill).

**4. Build-order chart rows**
- On first scroll-in, each row's segments draw left→right in sequence (top row first), 80ms stagger. Conveys "sequenced builds."
- Status legend dots do a single scale-pop as they enter.

**5. Animated Walks chart (already animated)**
- Leave the walking figures and arrival pulse exactly as-is.
- Add only: reveal-on-scroll for the surrounding card frame and a one-time fade-in for the heading/intro copy. No new motion inside the chart.

**6. Pricing**
- Section header rises in.
- Three plan cards fade-up staggered (120ms apart).
- The recommended/featured card lifts 2px with a soft shadow on enter (single, settled — not a hover loop).

**7. CTA band (contour background)**
- Headline, body, buttons stagger reveal.
- The contour SVG lines (already in the bg) get a slow 12s drift via transform — already-faint, ambient, never distracting.

## Cross-page consistency
- Reuse `Reveal` component, `useReveal` hook, and CSS tokens already defined in `src/styles.css` for What We Build (`[data-reveal]`, `drift`, `scale-pop`, `draw-stroke`). No new keyframe families unless needed (likely one: `seg-grow` for chart segments).
- Respect `prefers-reduced-motion` everywhere — fall back to plain opacity:1 final state.

## Technical notes
- Files to edit: `src/routes/index.tsx` (wrap sections/items in `Reveal`, add tab-change stagger state, segment grow transitions), `src/styles.css` (add `seg-grow` keyframe + `[data-roadmap-seg]` transition, reduced-motion overrides).
- No new dependencies.
- The tab-switch row stagger uses a `key` on the rows container tied to active tab so `Reveal`-style animation replays on each switch (or a simple CSS `animation-delay` ladder keyed on row index).

## Out of scope
- No parallax, no scrub-tied scroll animations, no Lottie.
- No changes to the walking-figure cadence or arrival logic.
