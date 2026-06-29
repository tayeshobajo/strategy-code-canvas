## What's wrong today

1. **The reflection flickers.** The effect that fires `reflectAnswer` depends on `[step, answers, total]`, so every keystroke cancels the inflight request and resets the panel between `idle → loading → ready`. The "reading that back…" label and the italic mirror text appear, vanish, and reappear as the user types or pauses.
2. **The guide text is barely visible.** The mirror line is rendered at `rgba(10,15,31,0.42)` and the "reading that back…" / Point A / Point B labels at `text-ink/45` on a near-white surface. On a high-DPI screen this reads as a whisper, not a signal.
3. **Point A and Point B feel incidental.** They are small mono labels under a faint SVG, with no real visual anchor. The journey is the spine of the experience and it does not feel like one.
4. **The mirror itself is unframed.** A floating italic line below a textarea reads as a system message, not as a premium "a reader heard you say this" moment.

## What we'll change (visual + behavioral, no business logic)

### 1. Kill the flicker — stale-while-revalidating mirror

- Keep the previously rendered mirror text on screen while a new reflection is being computed. Never drop back to the empty "reading that back…" state once we have any text for this question.
- Bump the debounce from `1500ms` to `2200ms` so the mirror only updates when the founder actually pauses, not mid-sentence.
- Replace the "reading that back…" line with a small inline status (a 6px pulsing royal dot + `refining` micro-label) anchored to the top-right of the mirror card. The card body never empties; it just dims `~6%` while refining.
- Only show the mirror card after the founder has typed at least `REFLECT_MIN` characters AND has paused once. Until then, reserve the space with a soft placeholder ("A mirror appears once you pause.") so the layout never jumps and there is no pop-in.
- On error, keep the last good mirror visible and append a quiet `couldn't refine just now` note rather than replacing the card.

### 2. Frame the mirror as a premium artifact

- Wrap the reflection in a dedicated "Mirror" card directly under the textarea:
  - Ivory surface (`#FBFAF6` over the cool-white page), 1px hairline rule in `rgba(10,15,31,0.10)`, 16px radius, generous `28px / 24px` padding.
  - Eyebrow inside the card: mono `11px`, `0.28em` tracking, color `ROYAL`, text "A reader hears". Sits flush-left with a 1px x 14px royal tick to its left.
  - Body: `font-display` italic, `16.5px`, line-height `1.75`, color `rgba(10,15,31,0.78)` — readable, still clearly distinct from the founder's own input above.
  - Action row: "Use these words" becomes a small pill (`border border-ink/15, px-3.5 py-1.5, mono 10.5px, 0.24em tracking, ROYAL on hover fill ROYAL/8`) instead of a bare underlined link.
  - Reserved `min-height: 132px` so the card occupies its space from the moment the question appears.

### 3. Lift Point A / Point B and the journey

- Promote both labels from `text-ink/45` to `text-ink/70`, and increase to `12px` with `0.32em` tracking.
- Render each label with a small inline marker: filled royal 6px dot for Point A (active), hollow ink 6px ring for Point B (pending). When `reachedReview` flips, Point B fades to a filled ink dot and its label moves to `text-ink/90`.
- Add a subtle progress percentage above Point B (`mono 10.5px, ink/55`, e.g. `38%`) tied to required-answer progress. Quiet, but it makes Point B feel earned.
- Replace the dotted base path's `rgba(0.18)` stroke with `rgba(0.28)` so the unwalked path is legible without competing with the drawn royal line.
- Thicken the drawn royal stroke from `1.6` to `2`, and add a soft glow filter (`drop-shadow(0 0 6px rgba(37,99,255,0.18))`) on the drawn segment only. Premium without being loud.

### 4. Quiet typography contrast pass on the question chrome

- Eyebrow ("01 / Where you are") goes from `text-ink/55` to `text-ink/70`, and the index numeral (`01`) becomes `ROYAL` to anchor the eye.
- "Optional" pill becomes a real pill: `border border-ink/15, px-2 py-[3px], mono 10px, 0.22em tracking, text-ink/60`.
- "X of 08" footer counter promoted to `text-ink/65` and paired with a 1px x 24px rule on its right that fills proportionally with required progress — a second, quieter progress hint that matches the journey path.
- "Save and come back later" link gets a subtle royal underline on hover and `text-ink/70` resting color.

### 5. Reduced-motion + accessibility

- All new transitions respect `prefers-reduced-motion` (no glow pulse, instant state swaps).
- The pulsing "refining" dot is `aria-hidden`; the card itself carries `aria-live="polite"` so screen readers get the final mirror text once, not every interim state.
- Color contrast for all promoted labels verified against the cool-white background at WCAG AA for small text.

## Files touched

- `src/routes/build-my-roadmap.tsx` only. Changes are scoped to:
  - The reflection `useEffect` (debounce + stale-while-revalidating state machine).
  - `JourneyPath` (stroke, glow, markers, percentage label).
  - `QuestionPanel` (eyebrow contrast, optional pill, mirror card, footer counter).

No changes to server functions, schema, analytics events, or submit flow.

## Out of scope

- No copy rewrites beyond the two new micro-labels (`A reader hears`, `refining`, `A mirror appears once you pause.`).
- No layout reflow of the page outside the intake panel.
- No new dependencies.
