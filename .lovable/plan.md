# Build My Roadmap intake — copy and logic update

All work scoped to `src/routes/build-my-roadmap.tsx`. No schema changes, no new packages, no server changes. Existing autosave, draft resume, reflection backend, consent, submit, and confirmation plumbing all stay; this rewires copy, step structure, validation, and a few small UI rules on top of them.

## 1. Step model: 9 steps + review + consent + confirmation

Today the intake is 8 questions then a combined review/contact panel. Split that into 9 explicit steps and keep review + consent + confirmation as their own screens after step 9.

- Steps 1–4 required (textarea questions).
- Steps 5–8 optional (textarea questions, Skip ↔ Continue toggle as today).
- Step 9 is a new "Reply details" form step (no reflection).
- Step 10 = review. Step 11 = consent + submit. Step 12 = confirmation.
- Step counter displayed as `01 of 09 … 09 of 09` on steps 1–9. Hidden on review/consent/confirmation.
- Journey path: keep 8 dots for the 8 question stops, plus the existing review marker. Step 9 (reply details) gets its own dot so the path advances all the way to 09 before review. Active-dot + connector-line logic from the existing implementation is reused unchanged.

Progress meter on the right keeps counting required-answered, but the denominator becomes 5 (4 required questions + reply details step considered "answered" once all required reply fields validate).

## 2. Rewrite all step copy verbatim

Replace the existing question content with the user-provided copy for steps 01–08. Each step renders:

- Eyebrow: `NN / TITLE` in the existing mono/uppercase/tracking style.
- Optional badge (steps 05–08 only): the existing `optional` chip.
- Question text: the question as one block, with the italic accent fragment wrapped in `<em>` for the italic serif treatment already used on reflections.
- Helper text: small muted line under the question.
- Large textarea (existing styling, character counter stays).
- Reflection card behavior unchanged for 01–08; on 05–08 it only appears once the user types past the existing minimum-length threshold.

Copy used per step matches the user's spec exactly (Where you are / The weight / Where you need to be / The first move / Why now / What did not hold / What you already have / If it could not fail).

Internal "Why this works" notes are not rendered on the surface.

## 3. Step 09 — Reply details

New form step replacing the old combined contact panel. No reflection card.

- Eyebrow: `09 / REPLY DETAILS`.
- Heading: "Where should we send the reply?"
- Subline: "A few details so a real person can read this in context and respond properly."
- Fields, in order:
  - Your name — required.
  - Email — required, validated quietly with the existing `EMAIL_RE`.
  - Business name — required.
  - Website — optional, placeholder `https://`. When non-empty, render the quiet line "You are welcome to look at our site before we talk." beneath the input.
  - Your role — optional, placeholder `Founder, CEO, Operator, Creative Director...`.
  - Timeline you are working toward — optional, placeholder `No rush, this quarter, next 90 days, before a launch...`.
  - Anyone else part of this decision? — optional, placeholder `Co-founder, spouse, partner, leadership team, no one else...`.
  - Best way to reply — optional segmented control with `Email`, `Schedule a call`, `Either is fine`.
- Buttons: primary `Review my note` (disabled until name + valid email + business name), secondary `Back`.
- Validation: quiet inline hint under each missing required field. No red banners.
- New fields (role / timeline / decision_makers / reply_preference) are kept in component state and included in the autosave + final submit payloads alongside the existing contact fields. Backend already accepts a JSON answers + contact bag, so they ride through as additional contact keys without schema changes.

## 4. Review screen

Heading "Review your Roadmap note." with body "Nothing has been sent yet. Read it once, adjust anything that needs adjusting, then send it when it feels true enough."

- Render all 8 question answers in step order. Skipped optional questions render the question label and a quiet `Skipped` chip in place of the answer.
- Render the Step 09 reply details below the answers, grouped under "Reply details", with each filled field shown and empty optional fields hidden.
- Each section has an "Edit" link that jumps back to that step (reusing the existing `goToStep`).
- Buttons: primary `Continue` (advances to consent), secondary `Back to questions` (returns to step 9).

## 5. Consent + submit

New screen between review and confirmation.

- Single checkbox with copy: "I understand this note will be read by a person at Trust Tai so they can decide whether a 30-minute conversation makes sense."
- Primary button `Send my Roadmap note` (disabled until checkbox is checked; existing submit handler runs unchanged, with the expanded contact payload).
- Quiet line beneath: "A real person will read this. Not a sequence."
- Secondary `Back` returns to review.
- Existing submit error state (retry + preserve answers) is reused as-is.

The current consent live on the review screen and the "send it" button copy are removed in favor of this dedicated screen.

## 6. Confirmation state

Replace the existing success screen content:

- Kicker: `YOUR MESSAGE ARRIVED`
- Headline: "We have it. Now you can put it down." with `put it down` wrapped in `<em>` italic serif.
- Body: "Your note is with a person, not a queue. Here is what happens next."
- Three numbered steps using the exact copy provided.
- Close line: "Nothing is needed from you right now. The next move is ours."
- Optional button: `Return to Trust Tai` linking to `/`.

Existing analytics `track("intake_submitted", …)` fires unchanged.

## 7. Save / resume + header rules

- Footer keeps the `Save and come back later` button with supporting line "We will save as you go. You will get a private link to return." (replace current supporting copy).
- Top-right of the header shows only the `All changes saved` indicator. Remove any duplicate save link / icon from that row.
- Existing autosave debounce, manual save toast, and resume-link email flow remain.

## 8. Tone + surface guards

A final pass over the new strings to enforce:
- Sentence case for headings and labels.
- No em dashes (use commas or periods).
- No exclamation points.
- No "AI" label anywhere on the surface. Reflection helper stays unnamed with the existing "A clearer version, if it helps" lead-in and `Use these words` button. Reflection rules (never auto-overwrite, preserve original, italic serif) are already enforced and stay.
- No "Spirit First" copy on the surface.

## Technical notes

- Single-file edit in `src/routes/build-my-roadmap.tsx`. The existing `STOPS` constant, `IntakeExperience` step machine, `QuestionPanel`, `ReviewAndContact`, and `Confirmation` components are refactored: split `ReviewAndContact` into three components (`ReplyDetailsStep`, `ReviewStep`, `ConsentStep`) and grow the step enum from `0..7 | "review"` to `0..8 | "review" | "consent"`.
- `JourneyPath` gets a 9th milestone so the line and labels track step 09 the same way they track step 01–08 today; the arc-length table and `lineProgress` math from `.lovable/plan.md` extend by one stop.
- `intake_drafts` / `intake_submissions` JSON columns absorb the new contact fields (`role`, `timeline`, `decision_makers`, `reply_preference`) without migrations; `saveDraft`, `loadDraft`, and `submitIntake` already pass through the full contact object.
- Analytics events keep their current names. New step indices flow into the existing `intake_step_view` / `intake_step_complete` payloads automatically.
- Existing Playwright suite (`tests/visual/build-my-roadmap-intake.spec.ts`) needs label updates (new button text, new eyebrows, new confirmation heading, extra step), but its overall shape — fill required, skip optional, submit, hydrate from `?draft=` — still applies.
