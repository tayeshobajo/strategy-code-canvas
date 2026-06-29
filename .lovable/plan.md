## Build My Roadmap — immersive intake

Replace only the "Start the conversation" form block and the "Before you wonder" reassurance block in `src/routes/build-my-roadmap.tsx`. Trim "What the conversation is" to a single line above the intake. Hero, fit list, closing section, nav, footer untouched.

### One note on backend
The reference JSX calls Anthropic from the browser and references Supabase Edge Functions. This stack is TanStack Start on Cloudflare Workers — app-internal server logic uses `createServerFn`, not edge functions. I'll keep the secret name `ANTHROPIC_API_KEY` (server-only) and route both calls through server functions. No model key in the browser, same outcome.

### Changes

1. **Secret**: add `ANTHROPIC_API_KEY` via `add_secret` (server-only).

2. **DB migration** — `intake_submissions`:
   - `id uuid pk default gen_random_uuid()`, `source text default 'website/build-my-roadmap'`, `name`, `business`, `website`, `email`, `authorizes_scan bool default false`, `answers jsonb`, `status text default 'new'`, `created_at timestamptz default now()`
   - GRANT to `service_role` only; RLS enabled; no public policies (writes go through server fn using admin client).

3. **Server functions** in `src/lib/intake.functions.ts`:
   - `reflectAnswer({ question, answer })` → POSTs to `https://api.anthropic.com/v1/messages` with `claude-sonnet-4-5` (note: `claude-sonnet-4-6` doesn't exist; will use the current Sonnet id — flag below), `max_tokens: 1000`, the exact prompt from the spec. Returns `{ text }`. Reads `process.env.ANTHROPIC_API_KEY` inside handler.
   - `submitIntake({ contact, authorizes_scan, answers })` → zod-validates, loads `supabaseAdmin` inside handler, inserts one row, returns `{ ok: true }`.

4. **`src/routes/build-my-roadmap.tsx` edits**:
   - Keep `Hero`. Replace `ConversationSteps` with a single short line (`"One 30-minute conversation. We listen first, then tell you what we see."`) sitting above the intake.
   - Delete `StartConversation` + `Before you wonder` reassurance block. Build new `IntakeExperience` component in the same file (or `src/components/RoadmapIntake.tsx`) with:
     - 8 questions from spec (verbatim eyebrow / before / accent / after / placeholder).
     - One-at-a-time stepper (`step` -1 intro, 0–7 questions, 8 review, 9 sent).
     - SVG path Point A → Point B that draws with progress; respects `prefers-reduced-motion`.
     - 1.5s-debounced reflection call after ≥25 chars, via `useServerFn(reflectAnswer)`. Shows mono "reading that back…" then italic Fraunces reflected text in `rgba(10,15,31,0.42)` with mono "use these words" link.
     - Review screen lists all 8 answers with edit (back) affordance.
     - Contact block: Your name, Business name, Website, Email (underlined inputs). Name + Email required. Consent checkbox on by default → `authorizes_scan = consent && !!website.trim()`.
     - Submit via `useServerFn(submitIntake)`; on success show confirmation screen with eyebrow `received`, heading `We have it, {first}. A person reads this next, not a machine.`, and the folded reassurance line: `"One reply, from a person. If you go quiet, we leave you be. The first conversation has no pitch."`
     - Below intake: quiet mono blue link `prefer to talk first? book a 30-minute call` → existing `#availability`.
   - Use existing tokens (`text-ink`, `text-royal`, `font-display`, `font-mono`, paper bg) — no inline `@import` of Google fonts; Fraunces italic via existing `font-display` (Cormorant Garamond italic) since Fraunces isn't loaded. **Confirm below.**
   - Voice rules: no em-dashes, no exclamation points, sentence case; copy used verbatim from spec.

5. **Keep**: closing "Where you are is where you are", nav, footer, hero, fit list — unchanged.

### Two small flags before I build
- **Model id**: `claude-sonnet-4-6` is not a real Anthropic id. I'll use `claude-sonnet-4-5` (current). OK?
- **Italic accent font**: page currently loads Cormorant Garamond italic (used as italic display). Spec says "Fraunces italic". I'll use the existing Cormorant Garamond italic to match the rest of the page rather than loading a new font. OK?

### Definition of done
Old form gone; 8-question intake live with drawing path; reflection works via server fn with key server-side; review + edit; submit inserts one row; confirmation greets by first name; hero/fit/closing/nav/footer untouched; nothing labeled AI.