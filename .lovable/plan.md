## Animate the About page

Pure CSS / SVG animations, scoped to `/about`. No new libraries, no copy or layout changes. All animations respect `prefers-reduced-motion` (existing global rule already disables anything `animation: none !important`).

### 1. The Pattern — dots converge and travel the Roadmap
File: `src/routes/about.tsx` `PatternDiagram` + new CSS in `src/styles.css`.

- Give each scatter particle a class `pattern-dot` with a per-dot `--i` index.
  - Animation: gentle inward drift (toward the start of the curve `~170,150`) on a 7–10s loop, with the dot fading from 0 → its base opacity, then easing back. Stagger by `--i`.
- The dotted curving `path` gets a `path-travel` class:
  - Use `stroke-dasharray` / `stroke-dashoffset` to "draw" the path on reveal (one-shot, 1.6s).
  - After the draw, run a continuous "marching ants" effect by animating `stroke-dashoffset` from 0 → `-9` on a 1.4s linear loop (matches the existing `2 7` dash so dots appear to flow along the path toward the target rings).
- Add a small "traveler" `<circle>` that follows the path using SVG `<animateMotion>` with the same path `d`, 4.5s loop, easing in-out, ending at the rings — reinforces "moving through the Roadmap." Hidden when reduced motion.
- Target rings: the outer ring already exists; add a slow `pulse-soft` (reuse existing keyframe) on the middle ring + glow circle so the destination breathes.

### 2. How We Think — stars twinkle (and the CTA constellation)
- The dark `HowWeThink` section currently uses `contour-bg` (no stars). Add a non-intrusive `<StarsField>` SVG layer absolutely positioned behind the content (low opacity, `pointer-events-none`, `aria-hidden`) so it does not affect layout or contrast of the principle cards.
  - 40–50 seeded stars sized 0.5–1.6px with class `twinkle-star` and a per-star `--d` delay + `--dur` (2.4s–5.5s).
  - Keyframe `star-twinkle`: opacity 0.25 ↔ 1, scale 0.9 ↔ 1.15, alternating infinite.
- The existing `ConstellationBG` in `CloseCTA` also gets the `twinkle-star` class on each star + the glow circle pulses slowly. Same keyframe, longer durations so the two sections feel related but not identical.

### 3. Close / CTA — paper plane flying
- Add a `<PaperPlane />` SVG (small, ~28px) inside `CloseCTA`, absolutely positioned, behind the text, above the constellation layer.
- A faint dotted royal/paper trail path (similar to the Pattern curve) arcs from lower-left up and across to upper-right, exiting offscreen.
- The plane uses SVG `<animateMotion>` along that path with `rotate="auto"` so it tilts with the curve. Duration 9s, loops, with a small pause at the end (use `keyTimes`/`keySplines` or restart after delay via `begin="0s;plane.end+1.2s"`).
- Trail draws in once on reveal (stroke-dashoffset), then stays. Plane and trail both `pointer-events-none` and `aria-hidden`.
- Hidden under reduced motion.

### 4. Light ambient touches (already partially present, keep minimal)
- The hero `drift` on "the Roadmap." italic stays as-is.
- No new animations on Hero, The Reality, The Conductor, Honest Fit — those sections rely on the existing `Reveal` scroll-in and should stay calm.

### Implementation surface
- `src/routes/about.tsx`: extend `PatternDiagram`, `ConstellationBG`, `HowWeThink`, `CloseCTA`. Add `StarsField` and `PaperPlane` helper components in the same file.
- `src/styles.css`: add keyframes `star-twinkle`, `path-march`, `pattern-converge`, `plane-trail-draw`; add a `prefers-reduced-motion` short-circuit for each.

### Out of scope
- No JS-driven animation libraries.
- No changes to copy, layout, colors, or the Roadmap panel on `/`.
- No changes to `Hero`, `OneMoment`, `TheConductor`, `HonestFit` aside from leaving their reveals intact.
