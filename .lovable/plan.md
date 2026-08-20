# Make the Roadmap invitation feel alive

Comparing what's live now to the reference card, the panel is correct but static. It appears instantly, sits flat, and nothing responds to the visitor. Three things are missing: motion, micro-signals of a real person on the other side, and the small proof row that gives the card its shape.

## What's missing

1. **Entrance and exit motion.** The panel currently pops in with no transition. It should rise and fade in from the pill (about 280ms, ease-out), and fade back down on close. The pill itself should settle in on first load rather than appear.
2. **A sense of presence.** The pill has a pulsing dot, but the open panel has none. Add a quiet "Tai reviews these personally" presence line with the live dot, so the card reads as a person waiting, not a form.
3. **The three signal tiles.** The reference card has a compact bordered row (Honest conversations / Clear next steps / Reviewed personally) with small outline icons. These were removed earlier; the reference restores them as one thin bordered strip, not three stacked cards.
4. **Interaction feedback.** CTA gets a press state, arrow nudges right on hover, close button gets a soft rotate. Content inside the panel fades up in a short stagger (60ms between eyebrow, headline, body, tiles, CTA).
5. **A single invitation cue.** After a short idle delay on first visit, the pill gives one gentle attention pulse — once per session only, never repeating.

## Scope

Visual and motion only in `src/components/RoadmapInvite.tsx` plus any tokens needed in `src/styles.css`. No change to copy contract, routing, attribution, session logic, or the intake flow.

## Technical notes

- Animate with CSS transitions on a mounted/visible state flag so the panel can animate out before unmounting; no new animation dependency.
- Every animation respects `prefers-reduced-motion: reduce` — reduced motion gets instant show/hide and no pulses.
- Stagger via inline `transition-delay` on child wrappers, not a library.
- Keep existing `data-testid` hooks and focus management intact so current tests keep passing.
