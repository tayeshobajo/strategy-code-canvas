## Goal

Make all three walks move at the same constant linear speed with a calm, two-pose walk cycle. Arrival is a neutral standing pose. No celebration, no bounce, no easing.

## Changes (all in `src/routes/index.tsx`, inside `WalkFigure` + `AnimatedWalksChart`)

### 1. Linear, constant-speed horizontal travel

- Remove the ease-out-over-last-10% block inside `tick`. Compute `p = Math.min(1, elapsed / d)` only — strictly linear.
- Per-walk `durations` already scale by `months / 24`, which yields the same pixel-per-second speed across walks (since each route's pixel width also scales with `months / 24` of the container). Keep that. Fast (12 mo) finishes first, Steady (24 mo) last — same speed, different distances.
- Slow the baseline so the pace feels like a walk: bump `STEADY_DURATION_MS` from 9000 → 14000.
- Optional "tiny settle" at arrival: a one-shot 120ms `transform: translateX(0)` micro-cushion on the figure wrapper when `arrived` flips true. Implemented via a keyframe `tt-arrive-settle` (translateX from -1px → 0) running once for 120ms. No effect on horizontal position calculation.

### 2. Calm two-pose walk cycle (kill the "dancing")

- Stride cadence: replace the per-walk `STRIDE_MS = [360, 420, 480]` array with a single constant `STRIDE_MS = 500` (≈2 steps/sec) used for all figures. Same cadence across all three.
- Keep the existing A/B frame swap via `tt-step-a` / `tt-step-b` `steps(1, end)` — this is already a clean two-pose toggle.
- Re-author the two stride frames so ONLY legs and arms change:
  - Frame A: left leg forward (knee bent forward), right leg back (straight, planted); right arm forward, left arm back. Arms swing from the shoulder pivot (top of arm path stays at y≈7.2, only the lower segment swings). Max forward/back arm angle ~20° from vertical — never above the shoulder yoke (y=7).
  - Frame B: mirror of A.
  - Remove any arm path whose endpoint has a y less than 7 (shoulder line). No raised arms.
- Torso, head, shoulder yoke: identical in both frames — no rotation, no translation.

### 3. Body bounce — barely perceptible

- Update `@keyframes tt-walk-bob` to a 1px rise at 50% only: `0%,100% { transform: translate(-50%, 0) } 50% { transform: translate(-50%, -1px) }`. Already close — confirm value is exactly `-1px` (not `-1.2px`).
- Bob duration = `STRIDE_MS` so it syncs to the stride.

### 4. Arrival = neutral standing pose (no celebration)

- Delete the entire `arrived` branch in `WalkFigure` that renders the V-arms, fists, and confetti.
- When `arrived` is true (and `walking` is false), render the same neutral standing figure currently in the final `else` branch: arms at sides, legs together, feet planted. That's the arrival state.
- Remove the `tt-confetti` keyframe from the `<style>` block (no longer referenced).
- Keep the Point B marker fill + one-shot `tt-marker-pulse` + `tt-ring` + "Arrived · Month N" label fade-in — those are the arrival signals. Stillness of the figure is intentional.

### 5. Prefers-reduced-motion

- Existing reduced-motion branch already sets `progress = 1` and `arrivedAt = now` for all walks, which renders each figure standing at its marker with solid trails and no animation. Keep as-is. Verify the figure wrapper does not apply `tt-walk-bob` when `walking` is false (it already gates on `walking`) and the arrival settle keyframe is skipped under reduced motion (guard the inline `animation` on the wrapper with the same `reduce` check, or simply gate it on `walking → arrived` transition which never fires in reduced mode since `walking` is never true).

## Out of scope

Route line, dotted style, markers, labels, axis, copy, layout, mobile stacking, colors, container styling.

## Files

- `src/routes/index.tsx` only.
