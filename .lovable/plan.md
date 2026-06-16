# Bring the What We Build page alive

Quiet, editorial motion that fires as each section scrolls into view. No new libraries — pure CSS keyframes + a tiny IntersectionObserver hook. Respects `prefers-reduced-motion`.

## 1. Shared infrastructure

**New hook `src/hooks/use-reveal.ts`**
- `useReveal<T extends Element>(options?)` — returns a ref and an `inView` boolean. Uses `IntersectionObserver` with `threshold: 0.15`, `rootMargin: "0px 0px -10% 0px"`, fires once then disconnects.
- Reads `window.matchMedia('(prefers-reduced-motion: reduce)')` — if reduced, returns `inView: true` immediately so content is visible without motion.

**New `Reveal` component (in the same file)**
- Wraps children, applies a `data-revealed` attribute on the wrapper when in view. Optional `delay` prop (ms) sets `style={{ '--reveal-delay': ... }}`.
- Variants via prop: `"fade"` (default), `"fade-up"`, `"fade-right"`, `"rise"` (slightly larger translateY for headlines).

**New CSS in `src/styles.css`**
- `[data-reveal]` initial state: `opacity:0; transform:translateY(14px); transition: opacity 700ms cubic-bezier(.2,.6,.2,1) var(--reveal-delay,0ms), transform 700ms cubic-bezier(.2,.6,.2,1) var(--reveal-delay,0ms);`
- `[data-reveal][data-revealed="true"]`: `opacity:1; transform:none;`
- Variant overrides for `fade-right` (translateX), `rise` (translateY 24px).
- New keyframes used by section-specific motion below:
  - `@keyframes draw-line { from { stroke-dashoffset: var(--len); } to { stroke-dashoffset: 0; } }`
  - `@keyframes pulse-soft { 0%,100% { opacity:.55 } 50% { opacity:1 } }`
  - `@keyframes drift-y { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }`
- `@media (prefers-reduced-motion: reduce) { [data-reveal]{transition:none; opacity:1; transform:none } * { animation: none !important } }`

## 2. Per-section motion (`src/routes/what-we-build.tsx`)

### Hero
- Page-load (not scroll, since it's above the fold): wrap eyebrow, headline, body, button row, footnote in `Reveal` with staggered delays `0, 120, 240, 360, 480 ms`. Variant `rise` on the headline.
- Hero photo: add `data-reveal` with `fade-right` variant + 300ms delay so the image eases in from the right edge as the mask reveals.
- Subtle continuous "breathing" on the headline italic word `the map.`: 6s `drift-y` infinite, only above `prefers-reduced-motion: no-preference`.

### Feature Row (4 icons)
- Section heading: `Reveal rise`.
- Each of the four feature cards: `Reveal fade-up` with staggered delay `i * 90ms` (0/90/180/270).
- Icon stroke draw-in: give each inline SVG a `stroke-dasharray` of e.g. 200 and animate `stroke-dashoffset` from 200→0 over 900ms when the parent reveals (via `[data-revealed="true"] svg path, ... circle, ... rect` selector + the `draw-line` keyframe). Set `--len: 200` per icon group via inline style.

### Mapped Path (SVG timeline)
- Section heading + body: stagger reveal.
- `PathSVG`: when the section reveals, animate
  - the main horizontal line: stroke-dash draw from left to right (1.2s),
  - then the 6 points scale-in (0→1) with staggered 80ms each starting at 600ms,
  - then the "asset thread" curved bracket draws in,
  - "ASSET THREAD" label fades in last.
  - Implemented via a `revealed` boolean from `useReveal` passed into `PathSVG`, which toggles a class on the `<svg>`; CSS scopes `.is-revealed line { animation: draw-line 1.2s forwards } .is-revealed circle { animation: scale-pop .5s var(--d) forwards }` etc.

### Milestones list
- Heading column: `Reveal rise`.
- Each `<li>` milestone: `Reveal fade-up` with `delay = i * 60ms`. The royal dot scales from 0→1 with a tiny overshoot (`cubic-bezier(.34,1.4,.64,1)`).

### Intelligence Layer
- Heading + body + outcomes list: stagger reveal (fade-right for outcomes from the right column).
- `ILDiagram`: on reveal,
  - left and right pills: fade + translate inward from their respective edges, staggered by row,
  - connectors (`<path>`): `draw-line` animation 1s, starting after pills land,
  - core circle: scale-in with the radial glow opacity rising,
  - small continuous pulse on the glow (`pulse-soft` 4s infinite) — subtle, since the section is dark and a gentle pulse reads as "alive".
- Outcome dots: each adds a soft `pulse-soft 3s infinite` with staggered delays so they twinkle calmly.

### Standards Row (5 steps)
- Heading: `Reveal rise`.
- Dotted connector line between numbered circles: width grows from 0%→80% (left-to-right) over 1s when revealed.
- Each step (circle + icon + title + body): stagger `i * 110ms`, fade-up. Number circles get the same stroke-draw-in treatment as the feature icons.

### Before / After
- Heading column: rise reveal.
- "Before the map" card: fade-up. Its scatter dots fade in individually staggered (60ms each) — scattered, restless feel.
- "After the map" card: fade-up with 200ms delay. Then:
  - The trend line draws left-to-right via `draw-line` (1.2s).
  - Each dot scales in along the path as the line passes (delays computed from x position).
  - The arrow between cards (`ArrowRight`) translates from -8px to 0px and fades in once both cards are revealed.

### Bottom CTA
- Already has staggered fade-in animations — leave as-is, but flip from page-load to scroll-triggered by wrapping the column in `useReveal` and gating the existing keyframes on `data-revealed="true"`.

### Footer
- Single `Reveal fade-up` for the whole footer row, no stagger (calm closer).

## 3. Performance & accessibility

- All animations animate only `opacity` and `transform` (plus SVG `stroke-dashoffset`) — composited, no layout thrash.
- `IntersectionObserver` disconnects after first reveal per element.
- `prefers-reduced-motion: reduce` short-circuits everything: content visible, no transitions, no infinite pulses/drifts.
- No JS scroll listeners, no rAF loops, no parallax math — keeps the page light.

## Files touched

- New: `src/hooks/use-reveal.ts` (hook + `Reveal` wrapper component)
- Edit: `src/styles.css` (reveal base styles, new keyframes, reduced-motion guard)
- Edit: `src/routes/what-we-build.tsx` (wrap sections in `Reveal`, thread `revealed` flag into `PathSVG` / `ILDiagram` / `TrendChart` / `ScatterChart`, add scoped className hooks)

## Out of scope

- No copy, layout, color, or asset changes.
- No new dependencies (no Framer Motion / GSAP — CSS + IO is enough for this aesthetic).
- No changes to other routes.
