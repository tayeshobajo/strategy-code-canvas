## Goal

Smooth the walk cycle from 2 poses to 3 (pass-through frame) and tighten swing angles. No structural changes, no new deps.

## Changes (all in `src/routes/index.tsx`, `WalkFigure` + one keyframe)

### 1. Three-frame walk cycle

Replace the current 2-frame A/B opacity swap with a 3-frame cycle: A → MID → B → MID → A.

- Add a third `<g>` `frameMid` rendered alongside A and B.
- Replace `tt-step-a` / `tt-step-b` keyframes with `tt-step-3a` / `tt-step-3mid` / `tt-step-3b` using `steps(1, end)`, each visible for 25% of the cycle in the order A (0-25%) → MID (25-50%) → B (50-75%) → MID (75-100%). This makes the passing frame appear twice per stride, which is what makes the walk read smoothly.
- Each frame's animation uses the same `STRIDE_MS` duration (500ms) so cadence is unchanged.

### 2. Tighter swing angles

Reduce limb travel so the figure stops "marching":

- **Legs**: swing foot now lands at x≈7.2 / 12.8 (5.6px spread). Tighten to x≈8.0 / 12.0 (4px spread). Knee bend on the forward leg becomes subtler (knee at x≈8.6, foot at x≈8.0 instead of knee x≈8.4 / foot x≈7.2).
- **Arms**: lower-end x stays close to vertical — swing arm endpoint moves from ±0.8px off vertical to ±0.6px. Arms remain strictly below shoulder yoke (y=7), unchanged.
- **Hip pivot**: both legs in both frames originate at exactly `(9.4, 18)` and `(10.6, 18)` — no horizontal shift of the hip between frames (prevents body-shift artifact).

### 3. Passing mid-frame geometry

- Both legs nearly vertical and close: left from (9.4, 18) → (9.4, 29.8); right from (10.6, 18) → (10.6, 29.8). Feet caps centered on each.
- Arms hang vertically: left (8, 7.4) → (7.9, 17); right (12, 7.4) → (12.1, 17).
- This is essentially the existing neutral standing pose, reused as the pass-through frame.

### 4. Bob sync

Body bob keyframe currently dips at 50%. With a 3-frame cycle, the body should dip on each foot-plant — twice per cycle. Update `tt-walk-bob` to dip at 25% and 75% (the mid-frame moments) and rise at 0/50/100:

```
0%, 50%, 100% { transform: translate(-50%, 0); }
25%, 75%     { transform: translate(-50%, -1px); }
```

Same 1px amplitude, same `STRIDE_MS` duration.

## Out of scope

Arrival pose (already neutral), horizontal motion (already linear), markers, labels, copy, layout, colors.

## Files

- `src/routes/index.tsx` only — `WalkFigure` frames + the three keyframes in the `<style>` block.
