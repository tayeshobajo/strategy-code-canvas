All changes scoped to `src/routes/build-my-roadmap.tsx`.

## 1. Stop the overlay auto-opening

Today the page auto-opens the intake when `?write=open` or a draft token is present (in URL or localStorage). Refreshing the page or returning to it then immediately shows the popup.

- Remove the mount-time auto-open effect entirely.
- On mount, if `?write=open` is in the URL, strip it from the URL (replaceState) without opening.
- The overlay opens only when the user clicks a door (Write / Call), as before. Drafts are still resumed inside the overlay (via the existing `?draft=...` flow) once it's opened.

## 2. Popup must fit without scrolling

Goal: visible end-to-end at ~1062px viewport height. Adjustments inside `IntakeOverlay` and `IntakeExperience`:

- Overlay wrapper: switch from `my-5 sm:my-10` block layout to a flex centering shell (`min-h-screen flex items-center justify-center px-3 py-4`).
- Card padding: trim to `px-6 py-6 sm:px-10 sm:py-8 lg:px-14 lg:py-10` (was `py-8 / lg:py-16`).
- Reduce `pt-10 lg:pt-12` gap above JourneyPath to `pt-6 lg:pt-8`.
- Reduce `mt-12` above the question to `mt-8`, `mt-16` above the save link to `mt-10`, `mt-10` bottom note to `mt-6`.
- Header `pb-6` → `pb-4`.

Keep `overflow-y-auto` on the overlay shell so very short viewports still scroll gracefully.

## 3. "Exit and return home" in red

In the header exit button:
- Text and icon colors switch to a clear destructive red (`#B91C1C`) with hover deepening to `#7F1D1D`.
- Keep the existing mono / uppercase / tracking treatment so it still feels typographic, not alarming.
- Update the small separator dot before it to `bg-[#B91C1C]/30` for cohesion.

## 4. "Roadmap intake" eyebrow above the dots, not in the header

- Remove the "Roadmap intake" eyebrow (and the hairline divider before it) from the header row. Header becomes: logo (left) — `All changes saved` + Exit (right).
- Render a centered eyebrow `ROADMAP INTAKE` directly above `<JourneyPath />`, in the same mono/uppercase/tracking style currently used, with `mb-4` spacing to the dots.

## 5. Journey line tracks the active dot, starts at the first dot

The dashed progress line currently uses `progress = requiredAnsweredCount / 4`, so it extends past the first dot the moment any text is typed, and doesn't move when stepping between questions.

- Compute a separate `lineProgress = step <= 0 ? 0 : Math.min(1, step / (STOPS - 1))` (and `1` when `atReview`).
- Use `lineProgress` for the `strokeDashoffset` on both the glow path and the solid royal path. Result: at step 0 no line is drawn (active dot sits exactly on the first node), and the line advances exactly to the active dot as the user moves through questions.
- Keep the existing `progress` (required-answered percent) for the `25%` chip on the right — that meter is still useful and separate from the path animation.
- Active dot styling is already a concentric ring + filled core; verify it sits centered on the first node at step 0 (it already does — `pointOnPath(0)` = path start `M22,64`).

## 6. Small premium polish carried by the above

- Tighter vertical rhythm makes the card feel composed instead of sprawling.
- Red exit, centered eyebrow over dots, and a line that visibly tracks the current question give the header a clearer hierarchy: brand → intent (Roadmap intake) → progress (dots + line) → question.

## Technical notes

- No new packages, no schema changes, no server changes.
- All edits live in `src/routes/build-my-roadmap.tsx`:
  - `BuildMyRoadmapPage` mount effect (remove auto-open, strip `write` param).
  - `IntakeOverlay` (flex centering, padding).
  - `IntakeExperience` header (remove eyebrow, recolor exit, tighten spacing) and JourneyPath wrapper (add centered eyebrow, reduce gaps).
  - `JourneyPath` (introduce `lineProgress` prop OR derive internally from `step`/`atReview`/`STOPS`; use it only for the stroke offset).
