## Goal

Replace the current walking-figure SVG with a new one I draw from scratch, rendered in the section's electric blue (royal). Polish the existing walk animation so figures clearly walk along their routes and arrive at Point B together-but-ordered (Fast → Middle → Steady).

Scope: visual + animation only in `src/routes/index.tsx`. No copy, layout, axis, or pricing changes.

## Walking figure (new, custom)

A compact pictogram-style walker, no photoreal anatomy:

- viewBox `0 0 24 36`, rendered at 22×32 on screen.
- Fill `currentColor`; the wrapper sets `text-royal` so the figure is electric blue (matches the dotted line and price typography). No navy. No drop shadow / ground puddle.
- Anatomy (simple geometric shapes, not the previous heavy paths):
  - Head: `<circle cx="12" cy="4" r="3"/>`
  - Torso: short rounded-rect from shoulders to hip
  - One forward arm (bent), one back arm — thin rounded strokes
  - Two legs in mid-stride: front leg planted, back leg lifted/bent
- Two stride frames (`Frame A` = right leg forward, `Frame B` = left leg forward) implemented as two `<g>` groups inside one SVG, toggled by a CSS step animation:
  - `@keyframes tt-walk-step { 0%,49% { opacity:1 } 50%,100% { opacity:0 } }` on Frame A, inverse on Frame B, `animation: tt-walk-step 360ms steps(1,end) infinite`.
  - Stride animation only runs while `walking` (figure has not arrived). On arrival, force Frame A visible and pause the animation.
- Subtle vertical bob preserved: `@keyframes tt-walk-bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-1px) } }` 360ms, paused on arrival.

## Animation refinements

Keep the existing structure (IntersectionObserver trigger at 0.35, `requestAnimationFrame` loop, proportional durations so on-screen pixel speed matches across the three routes, ease-out on last 8%, reduced-motion shortcut). Fix the rough edges:

1. Figure position: anchor the figure so its **feet** sit on the route line (`bottom: 0; transform: translateX(-50%)`), not centered vertically through the line. Route row height bumped slightly to fit the 32px-tall figure cleanly.
2. Solid walked trail (`bg-royal h-px`) renders behind the figure with `z-0`; figure is `z-10`; Point B marker `z-20` so the figure passes cleanly into the marker.
3. Point B marker: starts hollow (`border border-royal bg-cream`), on arrival fills (`bg-royal`) and plays `tt-marker-pulse` once (scale 1 → 1.3 → 1, 450ms ease-out). Already in place — verify timing is tied to `progress === 1`, not a separate timer.
4. On arrival, the figure: stops bobbing, stops stride toggle, stays at Point B (does not snap or disappear).
5. Reduced motion: render final state (progress = 1, marker filled, figure at Point B, stride frame A static).

## Files

- `src/routes/index.tsx` — replace `WalkFigure` SVG + its keyframes; minor tweaks to `AnimatedWalksChart` row height, z-index, and figure anchor. No other files.

## Out of scope

Copy, axis, pricing, Operating Map card, button row, mobile stacking — untouched.
