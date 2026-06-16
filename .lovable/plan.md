## /about styling review — section-by-section polish

Reviewed the rendered page against the source. Hero, dark "How We Think" section, and footer are all on-style. Five sections need targeted fixes; nothing structural changes.

### 1. The Reality — `MiniBrowserCard`
The card on the left reads as a placeholder: empty browser chrome with a lone heart icon floating in a beige rectangle. Tighten it so it visually represents "the anniversary site, three days, made with care":
- Replace the centered heart with a small composed mock: a centered serif "ONE" wordmark, a thin royal hairline beneath, two faux lines of body, and a small dotted path in the corner (echoes the Roadmap motif).
- Keep the same dimensions, border, and shadow.
- Caption stays "Putting people first".

### 2. The Pattern — diagram labels
`PatternDiagram` labels currently sit at y=210–238 and visually crowd the curving path on smaller widths. Fix:
- Move the "Details & Systems / Solve real problems" label block down and left so it anchors under the scatter cluster (not under the path).
- Raise "The Roadmap" caption a touch and add a subtle 1px royal underline so it reads as a destination label, matching the target rings.
- Increase `viewBox` height from 240 → 260 so nothing is clipped.

### 3. The Conductor — column proportions
The 5 / 5 / 2 grid leaves the right "side note" card ~160px wide; text wraps every 2–3 words ("We do the hard / work so your / mindset…").
- Change grid to `lg:grid-cols-12` with portrait 5, body 4, aside 3.
- Aside: add a top hairline, increase padding to `p-5`, tighten line-height. Move the small Compass icon inline with the first line rather than stacked above.
- Also fix the awkward second line: "Business runs better, and character builds what lasts." (typo: "built" → "builds").

### 4. The Commitment — `FitCard` icons
Icons don't match titles:
- "Treatment of Light" → use `Sun` (lucide) instead of `Gauge`.
- "Discipline Without a Map" → keep `MapIcon` (reads correctly as the discipline of the map).
- "Price Alone" → swap `Tag` for `Scale` (value over price reads better than a price tag).
- Add `transition-shadow` and a subtle hover lift to match the dark principle cards' interaction register.

### 5. Close / CTA — micro-polish
- Final line reads "For the timing is right and we should talk." — change "For" → "If" (typo).
- Add 1px paper/15 hairline above the headline to echo the hero's accent rule and tie the section to the rest of the page.

### Out of scope
- No copy rewrites beyond the two typos called out (Conductor aside, CTA footnote).
- No changes to Hero, How We Think, or Footer.
- No changes to JSON-LD, head tags, or routing.

### Files touched
- `src/routes/about.tsx` only.