## Scope

All work in `src/routes/index.tsx`, in the CTA + footer region (currently `CTABand` and `Footer`, lines ~919–993). Replace the current generic CTA/footer markup with the route-arrival footer shown in the screenshot — same structure, same copy — then apply the listed refinements. No new files, no new deps.

Out of scope: hero, roadmap, walks chart, pricing, header.

## Structure (locked, matches screenshot)

1. Top dotted route drawing in from the left, ending at a glowing arrival marker centered above the headline.
2. Headline (centered, two lines):
   - "Where you are is where you are."
   - "Where you need to be is *what we map next*." (cream serif italic on the last phrase only)
3. Sub-line: "A 30-minute conversation. If the timing is right, we should talk. If it is not, the work is waiting when it is."
4. Three reason columns, each with its own small dotted route + marker motif above the heading:
   - We listen first — "You talk. We map. You leave with a clearer picture of your business either way."
   - Clarity you can keep — "Leave with insight you can use, even if we never build together."
   - The right fit, or none — "We will tell you plainly if we are not the right partner for your map."
5. Centered pill CTA: "Build My Map →"
6. Footer rule, then three-column footer block:
   - Wordmark "Trust Tai" + tagline "The system behind the system."
   - NAVIGATION list: The Map, Our Builds, Our Story, Insights, Investment
   - CONNECT line: Murfreesboro, Tennessee · hello@trusttai.com · LinkedIn
7. Bottom bar: © 2026 Trust Tai. All rights reserved. · Privacy Policy · Terms of Service.

## Refinements (the actual ask)

### Alignment
- Lower the incoming dotted route's vertical center by 4px so it lands exactly on the arrival marker's center (currently reads ~3–4px high). The marker sits on the headline's optical centerline, not floating above it.
- Arrival marker is centered horizontally on the headline block (use a centered absolutely-positioned wrapper above the `<h2>` rather than aligning to the page edge).

### Glow + motion
- Keep the soft halo on the arrival marker; it stays the single brightest point in the footer. Widen the glow falloff (larger `blur` radius, lower core opacity) so it reads as light, not a hard ring.
- Route draws left → right into the marker on scroll into view (IntersectionObserver, run-once flag). Linear easing, no bounce. After the draw completes, the marker plays exactly one soft pulse, then settles.
- `@media (prefers-reduced-motion: reduce)`: render the completed route and lit marker statically, skip both the draw and the pulse.
- Same treatment, scaled down, for the three small route-marks above each reason heading: they draw once on scroll-in, no pulse, reduced-motion shows the static lit state.

### Legibility
- Verify the topographic contour texture (`contour-bg`) sits low enough that footer text and the route stay fully legible. If anything competes, lower the texture opacity further (currently a background util — drop its alpha or layer a subtle dark overlay under the text band).

### Responsive
- Tablet (`sm`–`md`): three reason columns may collapse to a single centered column; each heading keeps its small route-mark motif above it.
- Mobile:
  - Arrival route + marker scale down proportionally and stay centered above the headline.
  - Three reasons stack vertically.
  - "Build My Map" becomes full-width with a comfortable tap height (min 48px).
  - Navigation and Connect blocks stack under the wordmark.
  - Headline stays readable; constrain the italic phrase "what we map next" so it does not wrap mid-phrase (apply `whitespace-nowrap` to that span, with a fallback line break before "what" at the smallest breakpoint if it would overflow).

### Locks (do not change)
- Headline text exactly as above; italic only on "what we map next".
- The dotted route + markers are the only iconographic motif. No calendar / lightning / person icons anywhere in this region.
- Navigation list is exactly: The Map, Our Builds, Our Story, Insights, Investment. No "The Roadmap", no "The Walks".

## Technical notes

- Route line: single horizontal SVG (`<line stroke-dasharray="1 6">` or repeated dots) inside a wrapper that uses `clip-path: inset(0 var(--draw) 0 0)` driven by a CSS custom property animated from `100%` to `0%` over ~900ms linear. IntersectionObserver toggles a `.is-in` class on first entry to start the animation.
- Marker: small filled circle + an outer `box-shadow`/`filter: blur()` halo. Pulse = single keyframe `scale(1) → scale(1.15) → scale(1)` with halo opacity matched, `animation-iteration-count: 1`, started on `animationend` of the draw.
- Reduced motion: a single `@media (prefers-reduced-motion: reduce)` block sets `--draw: 0%` immediately and disables the pulse keyframe.
- Use existing design tokens (`text-paper`, `border-paper/10`, royal/cream accents already in `styles.css`); no new colors.

## Files

- `src/routes/index.tsx` — replace `CTABand` body and `Footer` body with the structure above; add the route/marker subcomponent and its keyframes inside the existing `<style>` block already used by the walks animation.
