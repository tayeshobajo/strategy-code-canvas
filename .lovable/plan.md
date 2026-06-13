## Goal

Three targeted fixes to the walks chart in `src/routes/index.tsx`. No copy or layout changes elsewhere.

## 1. Breathing room above the figure

The `ARRIVED · MONTH N` label currently sits ~12 px above the route line and the figure's head pokes into it. Fix:

- Bump route row height from `h-14` to `h-20` so there is real space above the line for the figure + label.
- Move the label well clear of the figure: position it at `top: -38px` (instead of `-12px`), font-mono `10.5px`, tracking `0.14em`. Same position for the pre-arrival "POINT B" label so nothing jumps when the label flips.
- Add a thin vertical tick (1px × 14px, `bg-royal/40`) between the label and the marker as a subtle "drop line" — gives the label something to anchor to without crowding the figure.

## 2. Celebratory arrival pose (arms up)

Replace the current arrived stance (arms at sides, legs together) with a victory pose:

- Head unchanged.
- Both arms swung upward in a V — paths from shoulders (10,10) angling outward and up to (6,3) and (14,3).
- Legs planted shoulder-width apart, straight: (10,18)→(8.6,30.5) and (10,18)→(11.4,30.5).
- Add two small confetti-style dots above the head — three tiny `1.4px` royal circles at (5,1), (10,-1), (15,1) inside the SVG (with `overflow-visible`) — fade in over 350ms once arrived. These are part of the figure's arrived branch, not separate DOM.
- The pose swap is instantaneous on arrival (no in-between frame). The pulse ring + marker fill remain.

## 3. Slower animation

Pace the whole sequence so the walks feel deliberate:

- Bump `STEADY_DURATION_MS` from `5200` to `9000` (Fast = 4.5s, Middle = 6.75s, Steady = 9s).
- Slow the stride cadence accordingly: `STRIDE_MS` from `[260, 320, 380]` to `[360, 420, 480]` so legs swing at a walking pace, not a jog.
- Bob amplitude unchanged.

## Files

- `src/routes/index.tsx` only — `WalkFigure` arrived branch (V-arms + confetti), `AnimatedWalksChart` route-row height, label position + tick, and the two timing constants.

## Out of scope

Walking stride frames, dotted route, marker pulse, axis, copy, label rail, mobile stacking — unchanged.
