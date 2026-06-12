All changes happen in `src/routes/index.tsx`. No other section is touched.

## 1. Left column copy (`RoadmapSection`)

- Keep eyebrow `WHAT YOU GET` as-is.
- Headline → `A living plan. Specific. Sequenced. Yours.`
- Body → `The Operating Map turns strategy into a build order your team can follow. It shows what matters now, what can wait, what each milestone must unlock, and where the business is headed over the next 24 months.`
- Replace the `CHECKLIST` constant with the eight new items in the specified order. The existing `CheckCircle2` bullet styling stays.

## 2. Right panel header (`RoadmapPanel` top bar)

- `Business Operating Roadmap` → `Operating Map`.
- Trust Tai wordmark and the Point A / B / C strip unchanged.

## 3. Sidebar (dark tabs column)

- Replace the `TABS` constant with the 16 new items in the listed order.
- Set active item to `The Build Order` (index 7) instead of the current index 4.
- Tighten item padding: `px-5 py-2.5` → `px-4 py-[7px]`, font `text-[12px]`, and remove the top `py-5` on the column so all 16 fit cleanly within the panel height. Keep the `CircleDot` glyph.

## 4. Chart panel ("Build Order")

- Panel title `Initiatives & Milestones` → `The Build Order`.
- Replace the `ROWS` constant with six rows in order: Converting Website, Lead Engine, Client Portal, AI Support Assistant, Operating Dashboard, Workflow Automation.
- New `Status` type: `"mapped" | "build" | "live"` (rename from planning/progress/complete). Each row now carries three consecutive segments that together span Q1–Q8, transitioning Mapped → In build → Live. Earlier rows reach `live` by mid-chart; later rows are still `build` at Q8 (no row ever ends in `live` past mid-chart for the last two; none are forced to "complete" semantics).

  Suggested segmentation (start–end quarters):
  ```
  Converting Website   mapped 1–1  build 2–3  live 4–8
  Lead Engine          mapped 1–1  build 2–4  live 5–8
  Client Portal        mapped 1–2  build 3–5  live 6–8
  AI Support Assistant mapped 1–2  build 3–6  live 7–8
  Operating Dashboard  mapped 1–3  build 4–8
  Workflow Automation  mapped 1–4  build 5–8
  ```
- Bar colors: `mapped` = `bg-royal-soft/35` (light blue), `build` = `bg-royal/80` (medium blue), `live` = `bg-ink` (dark navy). Bars sit on the same track so they read as one progression.

## 5. Legend

- Replace the three legend chips with: `Mapped` (light blue), `In build` (medium blue), `Live` (dark navy). Remove the words Planning, In Progress, Complete from the file entirely.

## 6. Footer + caption

- Footer left text becomes a single line: `24 MONTH OPERATING MAP · 8 QUARTERS, SEQUENCED` (remove the "8 Quarters of Execution" sub-line).
- Below the panel card (still inside the right grid column), add a small caption line:
  `Your map arrives in this working shape. The order is a conversation, not a contract.`
  Styled as `mt-4 text-[12px] italic text-ink/55`.

## 7. Design refinements

- Lighten the vertical quarter gridlines: `border-dashed border-rule` → `border-dashed border-rule/40` so bars carry the eye.
- Q1–Q8 column headers stay.
- White panel card, overall two-column layout, and section background unchanged.
- No status dots, percentages, or PM-dashboard affordances added.

## Out of scope

Header, hero, FeatureStrip, What We Build, Pricing, CTA band, footer — untouched.
