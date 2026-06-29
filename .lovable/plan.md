## Scope
Visual-only tweak to the `JourneyPath` SVG dots in `src/routes/build-my-roadmap.tsx`. No logic, no copy, no other components.

## Goal
Match the reference (image 2): the **current** milestone reads as a crisp concentric "target" — a solid royal inner dot inside a clean royal ring with a visible gap — clearly larger than the rest. Past dots are solid royal. Future dots are hollow with a light hairline. Skipped dots get the royal hairline ring to read as "visited but empty."

## Changes (single function: `JourneyPath`)

1. **Current dot — concentric ring + inner fill**
   - Replace the blurry glow ring (`r=12`, `strokeOpacity 0.28`, `strokeWidth 1.5`) with a crisp outer ring: `r=8`, `stroke=ROYAL`, `strokeOpacity=1`, `strokeWidth=1.75`, `fill="none"`.
   - Inner solid dot: `r=4`, `fill=ROYAL`, no stroke.
   - Drop the subtle motion-pulse on the active ring (kept distracting on a calm surface). Keep the 500ms transition for size/opacity.

2. **Answered dot** — solid royal: `r=4.5`, `fill=ROYAL`, no stroke. (Slightly larger than today's `r=4` so it doesn't look like a pin-prick next to the active target.)

3. **Future dot** — hollow: `r=4.5`, `fill=bg`, `stroke=rgba(10,15,31,0.22)`, `strokeWidth=1`.

4. **Skipped dot** — same geometry as future but `stroke=ROYAL`, `strokeOpacity=0.55`, `strokeWidth=1.25`. Reads as "visited, intentionally empty."

5. **Review marker (trailing)** — bump to `r=5.5` and match the active dot treatment when `atReview` is true (concentric ring + inner fill) so the end-of-journey state mirrors the in-flight active state.

6. **Hit target & a11y** — leave the `r=14` transparent hit circle, `role="button"`, keyboard handler, and `canJump` gating untouched.

## Out of scope
- Path stroke, dash pattern, progress animation, Point A / 25% / Point B chip.
- Question panel, reflection card, header, footer, overlay container.
- Milestone state derivation (`milestoneStates` memo) and click-to-jump logic.
- Copy, validation, autosave, submit pipeline, tests.

## Visual reference
Image 2 (the user's target): solid blue past dots, a bold concentric ring on the active step, faint hollow circles for future, a ringed end cap at Point B.
