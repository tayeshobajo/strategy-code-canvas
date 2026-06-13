## Goal

Two focused fixes to `WalkFigure` and its anchor in `src/routes/index.tsx`. Nothing else changes.

## 1. Plant the feet on the line

Today the SVG is `viewBox="0 0 20 36"` but the feet end at y≈30.5, leaving ~6px of empty space below the figure. Combined with `bottom: calc(50% - 1px)` on the wrapper, the walker visibly floats above the dotted line.

Fix:
- Tighten the viewBox so feet sit on the bottom edge: `viewBox="0 -2 20 34"` and render at `width="24" height="34"` (slight size trim to match the line scale).
- Anchor the wrapper so the SVG's bottom edge is exactly on the route line: change `bottom: "calc(50% - 1px)"` to `bottom: "50%"` and add `marginBottom: "-1px"` so the figure overlaps the line by 1px (feet appear to stand on it, not hover).
- Move the ground shadow to `bottom: "-1px"` so it sits flush under the feet, not floating below.
- Keep the bob animation, but reduce amplitude slightly so the feet don't visibly lift off (`translateY(-1.2px)` instead of whatever's currently larger) — confirmed when editing the keyframe.

## 2. Higher-quality walking figure

Current figure reads as four straight sticks. Upgrade to a more refined pictogram while keeping it monochrome `text-royal`:

- **Head**: slightly smaller, with a 0.6-unit gap above the shoulders (cx=10, cy=3, r=2.4).
- **Torso**: replace the single fat line with a tapered shape — a `path` that's wider at the shoulders (3.6) and narrower at the waist (2.6), giving a subtle silhouette instead of a uniform bar.
- **Shoulders**: add a 1px-wide horizontal "yoke" stroke at y=7 so arms hinge from a real shoulder line, not from mid-torso.
- **Walking stride**: re-author both frames so the swing leg has a visible knee bend (two-segment path: hip → knee → foot) and the planted leg stays straight. Arms counter-swing (right arm forward when left leg forward). Stroke widths: arms 2.2, legs 2.8, with `strokeLinecap="round"` already in place.
- **Feet**: add tiny 1.2-unit foot caps (short horizontal strokes) at the end of each leg so the figure visibly "stands" rather than ending in points.
- **Arrived (victory) pose**: keep V-arms, but raise hands higher (to y=1 instead of y=3), add slight outward fist dots (r=0.9 circles at the hand tips), and plant legs slightly wider (8.0 / 12.0 at the feet) with foot caps. Confetti unchanged.

## Files

- `src/routes/index.tsx` only — `WalkFigure` (viewBox, head, torso path, shoulder yoke, stride paths with knees, foot caps, victory pose tweaks) and the figure wrapper's `bottom` + shadow offset in `AnimatedWalksChart`.

## Out of scope

Route line, dotted style, label position, timing constants, copy, mobile stacking, axis — all unchanged.
