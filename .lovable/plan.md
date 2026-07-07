# Phase 2 — the hidden objective model

Purpose: replace the current linear objective walk with a scored selection engine. The client never sees scores. The system tracks per-objective confidence, picks the weakest required objective still under the bar, asks its anchor question, and stops when the frame's "enough" set is met or the hard cap of 10 questions is hit.

## What already exists (do not rebuild)
- `src/lib/intake-frames.ts` — frame + objective library, `HARD_CAP_QUESTIONS = 10`, `required` flag on each objective.
- `src/routes/build-my-roadmap.write.tsx` — open → confirm-frame → objectives walk → contact → review. Currently steps by `objectiveIdx`.
- `intake_drafts.answers` autosaves through `saveDraft` / `loadDraft`.

## What Phase 2 adds

### 1. Scoring module (client-safe, pure)
New file `src/lib/intake-scoring.ts`:
- `scoreAnswer(objectiveKey, response): number` — 0–100 heuristic. Signals: length in words, presence of concrete nouns/dates/numbers, hedging words ("maybe", "not sure") reduce score, empty response = 0. Per-objective tuning: `deadline` and `event_date` reward parseable dates; `guest_count` / `volume` reward numeric tokens; `features` / `rsvp_fields` reward list-like structure (commas, bullets, newlines).
- Bar constant `OBJECTIVE_BAR = 60` — below the bar counts as "still open".
- `computeObjectiveScores(frame, answers)` → `Record<objectiveKey, number>`.
- `selectNextObjective(frame, scores, askedKeys)` → returns the weakest required objective under the bar that has not been asked in this session, or `null` when the frame's "enough set" is satisfied. Selection order: (a) required objectives under bar, weakest first; (b) if all required at or above bar → `null` (advance to review).

### 2. Optional LLM scoring server function
New file `src/lib/intake-score.functions.ts`:
- `scoreObjective` server fn, gated by valid `resume_token` (same pattern as `classifyIntakeFrame`).
- Uses Anthropic when `ANTHROPIC_API_KEY` is set. Prompt: given objective label + anchor + response, return `{ score: 0–100, covered: boolean }` in strict JSON. Voice rules included so it never leaks user-facing prose.
- Falls back to `scoreAnswer` heuristic silently on any failure.
- Result cached in `intake_drafts.answers` under key `_scores` as `JSON.stringify(Record<key, number>)` so it round-trips through the existing `saveDraft`/`loadDraft` path — no migration.

### 3. Route rewiring
Edit `src/routes/build-my-roadmap.write.tsx`:
- Replace `objectiveIdx` state with `currentObjective: IntakeObjective | null` and `askedKeys: Set<string>` (persisted in `_asked` answer row for resume).
- Replace `goNextObjective` with an async step:
  1. After an answer is committed, call `scoreObjective` (LLM, with heuristic fallback), merge into `scores`, persist to `_scores`.
  2. Call `selectNextObjective(frame, scores, askedKeys)`.
  3. If `null` → `setPhase("contact")`.
  4. If `askedKeys.size >= HARD_CAP_QUESTIONS` → `setPhase("contact")` regardless.
  5. Otherwise set `currentObjective` and stay on `objectives`.
- The objective question view renders `currentObjective.anchor` (unchanged look). Back button pops the last `askedKeys` entry.
- Resume path: rebuild `scores` from stored `_scores`, recompute `askedKeys` from answered objective keys, pick next.

### 4. Nothing shown to the client
- No progress bar, no percentage, no "X of Y". Header stays as-is.
- Scores are never rendered. `_scores`, `_asked` are internal keys, filtered out of review screen (extend the existing internal-key filter that already hides `_open`, `_frame`, `_frame_correction`).

### 5. Engine handoff unchanged
`submitIntake` still receives ordered answer list. Internal `_scores` / `_asked` rows are stripped before submit (already ignored by intake-bridge because keys are underscore-prefixed, but explicitly filter to be safe).

## Files
- create `src/lib/intake-scoring.ts`
- create `src/lib/intake-score.functions.ts`
- edit  `src/routes/build-my-roadmap.write.tsx`

## Out of scope
- Generative next-question phrasing (Phase 3).
- Real-time streaming scoring UI (never — scores stay hidden).
- Schema changes to `intake_drafts` (Phase 2 rides on existing `answers` JSON).
