## Build My Roadmap — two doors, optional questions, draft persistence

### 1. New page structure (in `src/routes/build-my-roadmap.tsx`)

Insert two new sections between `<ConversationLead />` (the band) and `<IntakeExperience />`:

- **Band copy fix** (`ConversationLead`): replace line 129 with `"One 30-minute conversation. No slides, no pitch, no obligation."` Keep clock icon and layout.
- **`<TwoDoors />`**: cool-white background section per the screenshot.
  - Eyebrow ✦ "Two ways to begin." Sub: "Choose what feels easiest right now."
  - Left card (Recommended, untouched copy/behavior): "Start with a conversation." 3 bullets, `Book a 30-minute call →` button → `#availability`, mono "View availability and pick a time."
  - Right card (write door): heading `"Or write it first."` (statement). Sub: "Answer a few questions in your own words. You can keep it rough. A person will read it." Bullets:
    - "Four questions, four more if you want"
    - "Keep it rough, we read with care"
    - "Save and come back anytime"
    - Button `Leave a Roadmap note →` smooth-scrolls to `#intake`. Mono caption "We will read it with care."
  - Right rail "Before you wonder." with the 3 reassurance items (hounded / pitched / wrong fit in silence) from the screenshot.
- **`<IntakeExperience />`** wrapped in `<div id="intake">`, rendered collapsed-by-default behind a thin reveal: the write door button reveals it (state lifted to page) AND scrolls. Once revealed, it stays. Hero, fit list, closing section, footer unchanged.

### 2. Required vs optional questions

In `QUESTIONS`, add `optional?: boolean` and mark:
- Required: `current_state`, `the_weight`, `point_b`, `practical`
- Optional: `why_now`, `what_didnt_hold`, `unbuilt_asset`, `point_c`

Question card (`QuestionCard`):
- When optional, show muted `optional` next to the eyebrow.
- Primary button label: `Continue` when there's text, `Skip` when empty. Both call `onNext`. Last step (`practical`) keeps `Review`.
- Required + empty → button disabled (or shows existing min-length helper).

Progress path (`PATH_D` overlay + counter):
- `total` for progress math becomes `REQUIRED_COUNT = 4`.
- `progress = answeredRequiredCount / 4`. Point B reveal triggers at `progress === 1` (same as today, but tied to required).
- Counter chip stays "0X of 08" (overall position in the arc) — the path itself counts required only. This keeps the arc reading without rewriting copy/order.

### 3. Draft save / resume (server-side)

**Migration** — new table:
```
intake_drafts (
  resume_token uuid pk default gen_random_uuid(),
  answers jsonb default '[]',
  contact jsonb default '{}',
  updated_at timestamptz default now()
)
```
RLS enabled, no public policies; `GRANT ALL ... TO service_role` only. All access goes through server functions using `supabaseAdmin` (loaded inside handlers).

**Server functions** in `src/lib/intake.functions.ts` (per stack — the spec says "edge functions" but this project uses `createServerFn`; calling these out as `saveDraft`, `loadDraft`, and updating `submitIntake`):

- `saveDraft({ resume_token?, answers, contact })` → upserts row, returns `{ resume_token }`. Creates a new row when token missing.
- `loadDraft({ resume_token })` → returns `{ answers, contact } | null`.
- `submitIntake(...)` (existing) gains optional `resume_token`; after the insert into `intake_submissions` (status `new`), it deletes the matching `intake_drafts` row in the same handler.

**Client wiring** in `IntakeExperience`:
- On mount, parse `?draft=` from `window.location.search`. If present, call `loadDraft`; on success hydrate `answers` + `contact` and clear the old `localStorage` draft cache.
- Otherwise, on the first edit of question 1, call `saveDraft` to mint a token, write `?draft=<token>` via `history.replaceState`, and store **only the token** under `tt:intake:resume_token`.
- Debounced (1.5s) autosave of `{ answers, contact }` while `step >= 0` and `status !== "submitting"`. Failures are swallowed silently (mono "saved a moment ago" / "saving…" status under the textarea is out of scope unless trivial — the visible affordance is the link below).
- Quiet mono link beneath the question: `save and come back later`.
  - If `contact.email` matches `EMAIL_RE`: call a new `sendResumeLink({ resume_token, email })` server fn (uses existing `enqueue_email` RPC + a tiny template) and show inline "we sent a link to {email}".
  - Else: show "your progress is saved to this link" with the current URL (`?draft=…`) shown read-only, plus a Copy button.
- On successful `submitIntake`, clear localStorage token, strip `?draft=` from the URL, and render the existing confirmation screen.

### 4. Voice & scope

Sentence case. No em-dashes, no exclamation points. Avoid just/very/really/simply and help/deliver/provide/offer. Use the spec copy verbatim. Nothing labeled AI. Recommended card untouched. Hero / fit list / closing / footer untouched.

### Definition of done
- Write card heading reads "Or write it first." with the three new bullets.
- Band shows "One 30-minute conversation. No slides, no pitch, no obligation."
- 4 required / 4 optional with Skip↔Continue behavior; progress line tracks the 4 required.
- Draft autosaves server-side, `?draft=token` resumes it, submit promotes to `intake_submissions` (status `new`) and deletes the draft. No browser writes to either table.

### Two flags
- **Spec says "edge function"; this project is TanStack Start on Workers, not Supabase Edge Functions.** I'll implement `saveDraft` / `loadDraft` / `sendResumeLink` as `createServerFn`s (RPC over HTTPS, same result, secrets stay server-side). OK?
- **Resume email**: I'll queue it through the existing `enqueue_email` RPC + `tai@trusttai.com` infra, with subject "your Roadmap note, saved" and the resume URL. OK to author that copy, or do you want to provide it?
