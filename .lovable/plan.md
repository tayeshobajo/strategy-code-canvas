
## Scope
All edits in `src/routes/build-my-roadmap.tsx` (plus a touch of `JourneyPath`). No backend or routing changes.

## 1. Swap "TRUST TAI" wordmark for the logo
- In the overlay header (around line 770–774), replace the text `TRUST TAI` span with `<TrustTaiLogo variant="dark" />`.
- Import `TrustTaiLogo` from `@/components/TrustTaiLogo`.
- Keep the same row alignment; logo height stays at the component default (`h-6 sm:h-7`).

## 2. Update the write-door promise line
- Line 2158: replace `"Four questions, four more if you want"` with `"Four questions are enough to begin. Four more help us see deeper."`

## 3. What to learn from reference image 1 (and apply)
The reference is tighter and more legible than the current full-bleed layout. Apply only the things that improve craft without contradicting earlier decisions (background stays the chosen cool light blue, numbering "01 of 08" stays removed):

- Tighter journey band. Reduce the SVG horizontal scale so dots aren't stretched edge-to-edge — clamp `JourneyPath` to `max-w-[620px]` and reduce vertical height (`h-[60px]`) so the path reads as a compact arc, like the reference.
- Move "Point A / Point B" labels under each end of the curve (already there) and add a small percentage readout aligned to the right end, e.g. `25% · POINT B` in mono caps, driven by `progress`. This was in the reference and gives an at-a-glance status without re-introducing "01 of 08".
- Header right cluster: keep "All changes saved" + check, but show it on mobile too (drop the `hidden sm:inline-flex`, fall back to icon-only under `sm`).

These are the only reference cues that add value; the cream background, the "01 of 08" numbering, and the heavier shadowed card are intentionally not adopted.

## 4. Clickable, bigger active dots on the journey path
Update `JourneyPath` (lines 912–988):

- Replace each `<g>` dot with a `<g>` that contains a transparent hit-circle (`r=14`, `fill="transparent"`, `cursor: pointer`) plus the visible circle, and add `role="button"`, `tabIndex={0}`, `aria-label="Go to question N"`, `onClick`, and `onKeyDown` (Enter/Space).
- Make the active dot visibly bigger: current `r=5.5` → `r=7` for current, with a stronger glow ring (`r=12`, `strokeOpacity=0.28`). Reached non-current stays `r=4`. Hover state on any dot: scale ring fades in.
- A dot is **clickable only if it represents an already-visited milestone** (i.e. index ≤ furthestStep) so users can't jump ahead and skip required questions. Track a new `furthestStep` ref/state alongside `step`; bump it in `advance` and never decrement on `back`. Click on a clickable dot calls `setStep(i)` and emits `track("intake_dot_jump", { to: i })`.
- Pass `onJump` and `furthestStep` from the parent into `JourneyPath`.

## 5. Milestone state reflects skipped optional + review progress
Today: dot `i` is "reached" purely from `step >= i`. Change to:

- Build a `milestoneStates: ("answered" | "skipped" | "current" | "future")[]` of length 8 in the parent (where `answers` and `QUESTIONS` are in scope), and pass to `JourneyPath`.
  - `answered`: question has a non-empty `answers[key].response`.
  - `skipped`: question is optional AND `furthestStep > i` AND response is empty.
  - `current`: `step === i`.
  - `future`: otherwise.
- Dot styling:
  - answered → solid `ROYAL` fill, no stroke.
  - skipped → `ROYAL` outline, hollow fill (signals "passed but not answered").
  - current → bigger `r=7` filled with halo ring.
  - future → faint `rgba(10,15,31,0.35)` outline, hollow.
- Review screen (`step === total`, i.e. 8): all 8 dots render their natural state and the trailing line draws fully; add a 9th "review" marker at the very end of the path that fills when `step >= total`. Reuse the same milestone visual language.
- `progress` for the line stroke remains driven by required-answered ratio (already correct); on review/sent, force `progress = 1`.

## 6. Clear "All changes saved" indicator after each autosave
The state machine already exists (`saveState: idle | saving | saved | error`). Tighten the UX:

- After a successful `saveDraft`, set `saveState` to `"saved"` and timestamp it (`lastSavedAt`). Keep "All changes saved" persistent (do not auto-revert to idle) until the next keystroke flips it to `"saving"`. That way the indicator is always truthful.
- On keystroke in any answer field, immediately set `saveState = "saving"` (don't wait for the debounce), so the user sees the transition Saving… → All changes saved within ~1s of stopping.
- Show a relative timestamp tooltip on hover: `title={`Saved ${formatRelative(lastSavedAt)}`}` (e.g. "Saved just now", "Saved 2m ago"). Pure client-side helper, no deps.
- Make the indicator visible on mobile too (remove `hidden ... sm:inline-flex`), but at <sm collapse the label and keep only the green check + the saving spinner / red dot.
- `aria-live="polite"` already set — keep it.

## Technical notes
- All changes are presentational/state-local in `build-my-roadmap.tsx`. No new packages, no schema changes, no server-function edits.
- `furthestStep` is `Math.max(step, prevFurthest)`; persist it in the same `localStorage` blob used for answers so refresh keeps the dot navigation intact.
- Voice rules (sentence case, no em-dashes, no exclamation points) respected in all new strings.

## Out of scope
- Background color (stays the cool light blue chosen earlier).
- Re-introducing "01 of 08" numbering.
- Any change to the underlying 8-question flow, validation, autosave debounce, or submit pipeline.
