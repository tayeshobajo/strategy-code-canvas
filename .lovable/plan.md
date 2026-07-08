## The problem

After the classifier picks a frame, `selectNextObjective` in `src/lib/intake-scoring.ts` walks that frame's objective list in author order and asks each anchor question in turn. Nothing reads the opening answer against the frame's other objectives, so a founder who names their event, honoree, and deliverable in one line is still asked the next author-ordered question — and if a stale roadmap anchor like "what feels heavier than it should" appears in an event flow, it's because the objective was never marked satisfied by evidence. The route (`src/routes/build-my-roadmap.write.tsx`) drives this from a static array, and the UI shows "Step N of M" against that array.

## The shift

Replace "next required objective in list order" with a Conversation Planner:

```text
answer → extract facts → merge into IntakeMemory
      → gap analyzer ranks remaining required fields
      → question generator writes the next question
      → confidence gate decides ask-again vs review
```

The classifier stays exactly as it is. The planner is a new layer that sits between classifier and question rendering. The frame catalog moves from an ordered anchor list to a `FrameProfile` describing the fields a strong brief needs.

## Files to create

All under `src/lib/intake/`:

1. **`frame-profiles.ts`** — client-safe. Exports `FRAME_PROFILES: Record<IntakeFrame, FrameProfile>` where each profile lists `requiredFields` and `optionalFields`. Each field has `{ key, label, importance (1–5), examples, dependsOn?, heuristicExtract(text, memory) → { value, confidence } }`. Ships profiles for the five frames the spec calls out:
   - `event_site`: event_type, honoree_or_host, event_date, venue_or_location, guest_count, RSVP_required, invitation_style, theme_or_mood, assets_available, deadline
   - `roadmap`: business_model, current_offer, customer_type, current_growth_stage, founder_bottleneck, operational_pain, current_tools, team_structure, revenue_or_volume_signal, desired_point_b
   - `automation_or_crm`: lead_source, current_manual_process, current_tools, follow_up_steps, team_owner, volume, pain_point, desired_automation, success_metric
   - `internal_tool`: team_using_it, process_to_standardize, current_workaround, data_inputs, approval_or_review_steps, reporting_needs, roles_permissions, success_metric
   - remaining existing frames (client_portal, redesign, lms, ecommerce, ai_assistant, content_engine, generic): profiles derived from today's `intake-frames.ts` objectives so nothing regresses.
   
   `not_a_fit` has no profile — planner short-circuits to redirect.

2. **`intake-memory.ts`** — client-safe. `IntakeMemory` type + pure reducers:
   ```
   { frame, knownFacts: Record<field, { value, confidence, source }>,
     missingFields: string[], confidence: number,
     questionHistory: { key, question, askedAt }[], answerHistory: {...}[] }
   ```
   `mergeFacts(memory, extracted)`, `recomputeMissing(memory, profile)`, `recomputeConfidence(memory, profile)`. Serializable to/from the existing `intake_drafts.answers` (via a new `_memory` internal answer key, mirroring today's `_scores`/`_asked`).

3. **`gap-analyzer.ts`** — client-safe. `analyzeGaps(memory, profile) → RankedGap[]`. Ranking: required-and-missing first, sorted by `importance × (1 − confidence)`, tie-break by `dependsOn` topological order (date before venue-detail, venue before guest count, etc.). Filters out anything already in `questionHistory`.

4. **`conversation-planner.ts`** — client-safe. Single decision point:
   ```
   planNextTurn(memory, profile, opts) →
     | { kind: "clarify_frame" }        // frame confidence low
     | { kind: "redirect_not_fit" }
     | { kind: "ask", gap, prompt }     // gap chosen + suggested prompt
     | { kind: "done" }                 // enough signal for review
   ```
   Confidence threshold defaults to 0.75; also honors `HARD_CAP_QUESTIONS` (10) as a ceiling. This is the ONLY place the app decides "what next." Route code stops indexing into an objective array.

5. **`question-generator.ts` + `question-generator.functions.ts`** — the client-safe file defines the prompt contract and voice rules; the `.functions.ts` file is the `createServerFn` that calls the model, gated on `intake_drafts.resume_token` (same pattern as `intake-question.functions.ts` today). Input: `{ frame, knownFacts, targetField, questionHistory, style }`. Output: `{ question, source: "generated" | "anchor" }`. Voice check unchanged; falls back to the field's anchor if generation fails or fails the voice check twice. Prompt explicitly forbids re-asking any `questionHistory` item and forbids cross-frame objectives (never ask "founder bottleneck" outside roadmap).

Also new:

6. **`intake-extract.functions.ts`** — server fn. Takes `(frame, profile, opening + answers)` and returns `{ [fieldKey]: { value, confidence, evidence } }`. LLM primary, with per-field `heuristicExtract` fallback so intake never stalls. Runs on the opening statement and after every answer.

## Files to change

- **`src/lib/intake-scoring.ts`** — keep the heuristic scorer; delete `selectNextObjective` (or leave a thin adapter that delegates to the planner). Existing callers move to the planner.
- **`src/lib/intake-frames.ts`** — keep for the classifier/label strings; mark objective arrays as deprecated in a comment. Do not delete yet — the review artifact reads from it.
- **`src/lib/intake.functions.ts`** — extend `saveDraft` to persist a new `_memory` internal answer holding `IntakeMemory` JSON. Read path unchanged for review.
- **`src/lib/intake-question.functions.ts`** — becomes a thin wrapper that delegates to `question-generator.functions.ts` (keep the export so nothing breaks mid-migration).
- **`src/routes/build-my-roadmap.write.tsx`** — rewrite the objective loop (the `advance`/`selectNextObjective` block around lines 420–620 and the phase machine):
   - After every `saveAnswer`, call the extractor server fn → merge into `IntakeMemory` → call `planNextTurn`.
   - On `ask`, call the question generator, render the returned prompt.
   - On `done`, jump to contact/review.
   - On `redirect_not_fit`, use the existing not-a-fit path.
   - Replace "Step N of M" with `Known: X facts · Missing: date, RSVP, guest count · Confidence 62%`. Phase labels: "Understanding the project", "Filling the gaps", "Enough signal to build the brief".

## Database

Migration `add_intake_memory_column`:
```sql
ALTER TABLE public.intake_drafts
  ADD COLUMN IF NOT EXISTS intake_memory jsonb NOT NULL DEFAULT '{}'::jsonb;
```
Mirrored in `answers._memory` for symmetry with today's `_scores`/`_asked`. Existing rows read fine because default is `{}`.

No RLS or grant changes (table already has policies).

## Technical notes

- Coverage / extraction schemas: small `Output` shapes with no `.min()/.max()` bounds — per `ai-sdk-agent-patterns`. Voice length limits enforced in code, not schema.
- Extractor cap: one call per user answer. Failure keeps prior memory + falls back to per-field heuristic; UI never stalls.
- Planner is deterministic and pure — trivial to unit-test.
- Route pulls the planner via a client-safe import; the extractor/generator are server fns invoked via `useServerFn`.
- Not-a-fit: planner returns `redirect_not_fit` immediately after the classifier so the adaptive loop is never entered — matches spec item 8/10.
- Question generator receives `questionHistory` and MUST not repeat; voice check rejects near-duplicates before returning.
- `HARD_CAP_QUESTIONS` (10) stays as a ceiling; confidence gate is the primary stop.

## Out of scope

- Classifier itself (already correct in the birthday example).
- Review screen, brief generation, ops dashboard — they still read `answers` + `contact` and now additionally see `intake_memory` if useful later.
- Adding new frames beyond the five profiles the spec calls out (existing frames get profiles derived from current objective lists so nothing regresses).

## Verification

New tests under `src/lib/intake/__tests__/`:
- `event_site` planner given the birthday opening → next gap is `event_date`/`venue_or_location`, never `founder_bottleneck`.
- `roadmap` planner given "everything runs through me" → next gap is customer-flow / founder-dependence, never `event_date`.
- `automation_or_crm` opening about copying leads → next gap is `lead_source` or `follow_up_steps`.
- `internal_tool` opening → next gap is `team_using_it` or `process_to_standardize`.
- No frame's planner returns a gap that isn't in its own profile.
- If an answer contains a date / location / RSVP signal, the extractor marks those fields known and the planner does not re-ask.
- `questionHistory` blocks repeat questions across turns.
- `not_a_fit` returns `redirect_not_fit` from the first turn.
- Confidence gate: planner returns `done` before hard cap once required-field mean confidence ≥ 0.75.

Existing intake tests (`src/lib/__tests__/objective-loop-continue-recovery.test.ts`, `intake-single-source-of-truth.test.ts`, `intake-portal-toctou.test.ts`, `intake-alert-idempotency.test.ts`, `intake-bridge-linkage.test.ts`, `intake-failure-durable-log.test.ts`) all continue to pass — they exercise persistence, alerts, and the review artifact, none of which change shape.

Manual: reproduce the birthday opening in a fresh draft and confirm question 2 targets event date/venue, not founder weight. Reproduce the roadmap opening and confirm question 2 targets customer flow / founder dependence.
