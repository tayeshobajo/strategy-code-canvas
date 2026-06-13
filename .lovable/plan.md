## Goal

Bring the walks chart up to the reference image: a refined walking figure, a route that stays dotted edge-to-edge, a stride-based walk (not a slide), and a satisfying arrival state. Visual + animation only in `src/routes/index.tsx`.

## What changes

### 1. The figure — better quality

Replace the stick-figure with a small editorial pictogram, still drawn in royal:

- New SVG, ~26×40, viewBox `0 0 26 40`, all paths `fill="currentColor"`, wrapper sets `text-royal`.
- Filled shapes (not strokes): rounded head, tapered torso, articulated arms and legs with hands and shoes. Reads as a person at small size, matches the reference's silhouette weight.
- Soft ground shadow under the feet: a small horizontal ellipse, `fill-royal/15`, `8px × 2px`, sits on the dotted line and travels with the figure. This is the soft blue smear visible behind each figure in the reference.
- Two stride frames (`Frame A`, `Frame B`) with mirrored leg/arm positions. Frame A = right leg forward + left arm forward; Frame B = the inverse. Toggled via `steps(1, end)` opacity keyframes at ~280 ms per frame (faster cadence for the fast walk, slower for steady — see #3).

### 2. Route stays dotted the whole way

Currently a solid royal bar overlays the dotted line as the figure advances — that's why it reads as a slider track. Fix:

- Remove the solid `bg-royal` "walked" bar entirely.
- Keep one dotted line at full route width, at full opacity (the reference shows uniform dotted opacity start to finish — not a fade).
- The only progression cue is the figure's position and the Point B marker filling on arrival. The path itself does not change as it is "walked."

### 3. It's a walk, not a slide

The figure should step, not glide:

- Cadence: stride-frame swap drives perceived speed. Fast walk ~240 ms/frame, Middle ~300 ms, Steady ~360 ms. Each walk's own pace, but they still all arrive in the same on-screen-pixels-per-second budget so Fast finishes first.
- Horizontal motion: micro-stepped, not linear. The `requestAnimationFrame` loop quantizes horizontal position to discrete step advances synced to the stride frame (each frame swap = one small forward hop of ~ stride-length px). Between swaps, position holds. This gives a real walking gait rather than CSS-transition slide.
- Vertical bob: small `translateY(-2px)` on the down-foot, synced to the stride keyframe so the head dips and rises with each step.
- Reduced motion: skip stride + bob, render arrived state.

### 4. The arrival — "what happens at the end?"

Right now the figure just stops next to the marker. Reference-grade ending:

- When the figure reaches Point B (progress = 1):
  1. Stride animation stops on Frame A (feet together, standing).
  2. Point B marker fills royal and plays a single pulse ring: an absolutely-positioned `border border-royal/50` ring that scales `1 → 2.2` and fades `0.6 → 0` over 700 ms (one shot, ease-out). One ring per walk, fires once.
  3. A small "Arrived" tag fades in above the marker — font-mono, `10.5px`, uppercase, tracking `0.12em`, `text-royal`, replacing the existing "POINT B" label after a 200 ms crossfade. Wording: `ARRIVED · MONTH 12` / `· MONTH 18` / `· MONTH 24` so each walk's arrival point is explicit.
  4. The figure's ground shadow softens (opacity 15% → 25%) to "settle."
- Sequence reads: Fast arrives → ring pulses → label flips. Middle arrives next, same ritual. Steady last. The staggered finish becomes the section's payoff.

### 5. Small polish to match the reference

- Route row height bumped to `h-12` to fit the new figure and its shadow without crowding the caption below.
- Caption (`w.body`) gets a subtle left indent equal to the Point A marker offset so captions visually start where the route starts, not at the column edge.
- Month axis tick labels: tighten tracking from `0.1em` to `0.12em`, color from `text-ink/70` to `text-ink/55` to match the reference's quieter axis.
- "POINT B" label: nudge from `-top-4` to `-top-5` so it clears the figure's head at full progress.

## Files

- `src/routes/index.tsx` only — rewrite `WalkFigure`, retune `AnimatedWalksChart` (drop solid bar, quantized stride loop, arrival ring + label flip, per-walk stride cadence), update keyframes.

## Out of scope

Copy, layout grid, pricing, Operating Map card, button row, mobile stacking — unchanged.
