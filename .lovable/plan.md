## Scope
Visual polish only inside `src/routes/build-my-roadmap.tsx` (the `IntakeOverlay`, header, `QuestionPanel`, `JourneyPath`). No logic, no copy, no backend.

## 1. Fix the logo visibility (the actual reason it looks white)
The `TrustTaiLogo` auto-resolver walks up the DOM and may flip to the white asset if it can't read the card's inline background. On the cool blue card it's rendering near-white, hence "barely visible".

- Replace `<TrustTaiLogo variant="dark" />` in the overlay header with a direct `<img>` using the dark asset (`@/assets/trust-tai-logo.png.asset.json`), bypassing the auto-flip entirely.
- Render at `h-7 sm:h-8`, full opacity, with a subtle hover transition.
- Wrap in a small left-aligned cluster (logo + thin vertical divider + tiny mono caps label "ROADMAP INTAKE") so the header reads as a branded room, not a floating mark.

## 2. Header refinement (premium feel, same controls)
- Increase header bottom spacing and add a hairline divider under it (`border-b border-ink/8`) so the journey path sits in its own band.
- "All changes saved" indicator: tighten the green check chip (smaller radius, softer green `rgba(16,150,90,0.10)`), increase tracking, and add a 1px separator dot between it and the exit link.
- "Exit and return home": reduce tracking slightly, add a subtle right-arrow-out hover translate (2px).

## 3. Journey path polish
- Replace the dashed future-line look with a single hairline `rgba(10,15,31,0.10)` and keep the solid royal progress stroke; add a soft royal glow under the progress stroke (`filter: blur(6px)` duplicate) for depth.
- Active dot: keep `r=7`, add an outer breathing ring (subtle 1.6s ease pulse, respects reduced motion).
- "Point A / 25% · Point B" labels: switch to `text-ink/45`, tighten to `text-[10px]`, and right-align the percentage with a thin mono pill background so it reads as a status chip.

## 4. Question panel — editorial premium
- Eyebrow row: replace the all-caps `WHERE YOU ARE` with a centered cluster: thin 24px hairline · `WHERE YOU ARE` · thin 24px hairline. Looks like a chapter mark.
- Heading: reduce to `clamp(1.55rem, 2.4vw, 1.95rem)`, lift line-height to 1.3, and constrain to `max-w-[760px]` centered so long questions don't span edge to edge.
- Writing surface (textarea card):
  - Round to `rounded-[20px]`, swap the flat `border-ink/12` for `border-ink/8` plus a layered shadow: `0 1px 0 rgba(255,255,255,0.7) inset, 0 1px 2px rgba(10,15,31,0.04), 0 18px 40px -28px rgba(10,15,31,0.18)`.
  - Focus state: ring becomes a 2px soft royal outline at `rgba(37,99,255,0.35)` plus a faint royal glow shadow, not a hard 1px border swap.
  - Char counter: move to a tiny mono pill bottom-right, only appears after 200 chars typed (less noisy on empty state).
- Reflection card ("A clearer version, if it helps"):
  - Use a clearly distinct surface: ivory tint `rgba(255,253,247,0.85)` with a 1px royal-tinted top border accent (`border-t-2 border-t-[rgba(37,99,255,0.35)]`, other sides `border-ink/8`).
  - Add a small left-side italic quote-mark glyph (display serif, royal, opacity 0.35) as a visual anchor.
  - "Use these words" button: solid royal pill (`bg-[ROYAL] text-white`), slight shadow, replaces the current outlined variant — it's the primary affordance and should feel like one.
- Action row (Back / Continue):
  - Continue button: deepen to `bg-ink` with a subtle inner highlight + `0 12px 24px -12px rgba(10,15,31,0.45)` shadow; arrow icon translates 3px on hover.
  - Back: ghost pill, `text-ink/60`, hover `text-ink`.

## 5. Footer ("Save and come back later" / promise line)
- Add `mt-16` separation from the action row.
- Replace the full-width hairline with two short 80px hairlines flanking the bookmark icon + label (centered chapter-mark treatment, matching the eyebrow).
- Promise line: smaller (`text-[12px]`), `text-ink/45`, mono.

## 6. Overlay container
- Soften the backdrop from `rgba(10,15,31,0.55)` to `rgba(10,15,31,0.42)` and bump blur to `12px` — feels less like a modal, more like a private room.
- Card: increase max width to `1140px`, increase desktop padding to `px-20 py-16`, and add a faint top vignette (radial gradient from `rgba(255,255,255,0.5)` at top center, fading out) for depth.
- Border radius `rounded-[32px]`.

## Out of scope
- No changes to questions, validation, autosave, draft logic, submit pipeline, or analytics.
- No copy changes.
- No new packages.
