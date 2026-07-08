## Phase 14 — Conversation Intelligence upgrades

Phase 14 already landed the plumbing (per-frame confidence thresholds, ranked candidates, ack channel, planner adapter, `window.__intakeDebug`). This phase closes the remaining quality gaps the spec calls out: **richer multi-fact extraction, no re-asking, stronger acknowledgement in the live UI, tighter enough-signal, and the full 4-scenario Conversation Intelligence QA**.

Scope is limited to `src/lib/intake/*`, one server-fn prompt, the live intake route, and tests. Classifier, frames, submission, and roadmap code are untouched.

---

### 1. Multi-fact extraction (`heuristic-extract.ts`, `frame-profiles.ts`, `intake-memory.ts`)

Problem: a single opening like *"Augustina's 60th birthday on Aug 30 in Nashville with 120 guests"* currently only credits `event_date` + `guest_count`. `honoree_or_host`, `event_type`, `location` aren't modelled — and per the frame-profile rule we must not invent new objectives.

Fix: add a **`contextFacts` bag** on `IntakeMemory` (parallel to `knownFacts`) for side-facts that colour acknowledgements but are not gaps.

- Extend `IntakeMemory` with `contextFacts: Record<string, { value: string; evidence: string }>`.
- New `extractContextFacts(frame, text)` in `heuristic-extract.ts` that scans for:
  - `honoree_or_host` — `"my (mother|father|wife|husband|sister|brother|son|daughter|friend|boss) <Name>"` / possessive names
  - `event_type` — `"(60th|50th) birthday|wedding|gala|anniversary|fundraiser|baby shower|graduation"`
  - `location` — city/venue proper nouns after `"in "` / `"at "`
  - `founder_dependency` (roadmap) — `"runs through me|only I can|bottleneck"`
  - `lead_source_hint` (crm/automation) — `"website|referrals|linkedin|contact form|instagram"`
  - `manual_process_hint` — `"copy|paste|spreadsheet|by hand"`
- `heuristicExtract()` continues to populate `knownFacts` for objective keys; context facts flow into `contextFacts` on the same pass.
- Adapter merges both into the planner memory and forwards them to the question generator.

Also tighten existing extractors so one answer moves more objective needles at once:
- `guest_count`: also match `"about|around|roughly N (guests|people)"` and bare `"N guests"`.
- `event_date`: month-day without year (`"August 30"`), and `"on <date>"`.
- Roadmap `weight`: `"everything runs through me"`, `"I'm the bottleneck"`.
- CRM `sources` + `pipeline_today`: co-credit when phrases like "website leads into a spreadsheet" appear.

### 2. No obvious / no repeat questions (`gap-analyzer.ts`, `conversation-planner.ts`)

- Push any field with `confidence ≥ threshold` **out of the gap list entirely** (currently done for the required set; extend to the optional selector so we never surface a satisfied optional).
- Track `askedBefore` by both `fieldKey` and a normalised question hash; the planner will not re-emit a question whose target field is already ≥ threshold OR whose hash was previously asked in the last 3 turns, unless the last answer had `confidence < 0.4` (clarification loop, capped at 1 retry).
- Add `selected_reason` string on the returned decision: one of `"top-ranked-required"`, `"clarify-low-confidence"`, `"optional-followup"`, `"enough-signal"`.

### 3. Highest-value gap selection

Reweight `IMPORTANCE_BY_KEY` to match the spec's priority tiers:

- **event_site**: `event_date=5, rsvp_fields=5, guest_count=4, privacy=3, deadline=4, assets=3, extras=2`
- **roadmap**: `point_a=5, weight=5, point_b=5, practical=4, unbuilt_asset=3, point_c=2`
- **crm**: `sources=5, pipeline_today=5, follow_up_gap=4, systems=4, volume=3, audience=3`
- **automation**: `manual_today=5, trigger=5, systems=4, volume=3`
- **internal_tool**: `users=5, task=5, today=4, data=4`

Keep the existing `information_gain × confidence_impact + flow_bonus` scoring; only the weights change.

### 4. Acknowledgement in the live UI (`question-generator.ts`, `intake-question.functions.ts`, `build-my-roadmap.write.tsx`)

- Server-fn prompt already emits `{ acknowledgement, question }`. Extend the prompt with 3–4 few-shot examples in the Trust Tai voice (birthday, roadmap dependency, CRM manual copy, internal-tool standardisation) and pass in `contextFacts` so the ack can reference `honoree_or_host`, `event_type`, `location`.
- Guardrails: acknowledgement ≤ 18 words, no repeated facts verbatim, drop entirely when confidence has not moved in the last turn.
- Route: render the acknowledgement above the question with `data-testid="intake-ack"` (already scaffolded — confirm it displays and persists in the transcript, not just the current prompt).

### 5. Enough-signal + early stopping (`conversation-planner.ts`, `frame-profiles.ts`)

Replace the current "average confidence ≥ threshold" check with:

```
enough_signal =
  every requiredField.importance ≥ 4 has confidence ≥ threshold  (critical coverage)
  AND no blocker field is still open (blockers = event_date, point_a+weight, users+task, sources+pipeline_today, manual_today+trigger)
  AND overall confidence ≥ frame.confidenceThreshold
  AND at least one success-outcome field has confidence ≥ 0.6
      (goal | point_b | task | pipeline_today per frame)
```

Add `blockers: string[]` and `successOutcomeKeys: string[]` per `FrameProfile`.

### 6. Debug surface (`planner-adapter.ts`, route)

Ensure `window.__intakeDebug` snapshot on every turn contains:

```
{ frame, known_facts, context_facts, missing_fields,
  candidate_questions: RankedGap[],
  selected_question: { field_key, question, acknowledgement },
  selected_reason, confidence_score, enough_signal }
```

### 7. Tests (vitest, add-only)

- `heuristic-extract.multifact.test.ts` — extend with cases A (birthday multi-fact) + D (CRM manual copy) + E (internal tool standardisation).
- `gap-analyzer.ranking.test.ts` — case B (event highest-value gap when date/guest/location known → RSVP or assets next).
- `question-generator.ack.test.ts` — cases C (roadmap ack references dependency) and F (no repeat of event_date).
- New `planner.enough-signal.test.ts` — case G (critical coverage + blockers + success outcome).
- New `planner-adapter.debug.test.ts` — case H (debug snapshot shape).

All existing 245 tests must stay green.

### 8. Phase 14 Playwright QA (`/tmp/browser/phase14/`)

Reuse Phase 13 harness. For each of the 4 scenarios (Event site, Roadmap, CRM, Internal tool):

1. Type a rich opening statement (multi-fact).
2. Answer 3 follow-up turns.
3. After each turn capture `window.__intakeDebug`, a screenshot, and the transcript.
4. Assert: no repeated fields, `confidence_score` monotonically rising, `selected_reason` never `top-ranked-required` for an already-known key, `enough_signal` fires within `[4, 8]` turns for scoped project and `[6, 10]` for roadmap.

Produce `/mnt/documents/phase-14-qa/report.md` summarising per-scenario pass/fail with links to screenshots and JSON dumps.

---

### Out of scope

- Frame classification, `intake-frames.ts` objective sets, submission/roadmap/engine schemas.
- New DB migrations. `contextFacts` lives in the client planner memory and in draft JSON only.
- UI redesign beyond rendering the existing acknowledgement.

### Files touched

Edit: `src/lib/intake/heuristic-extract.ts`, `frame-profiles.ts`, `gap-analyzer.ts`, `conversation-planner.ts`, `intake-memory.ts`, `planner-adapter.ts`, `question-generator.ts`, `src/lib/intake-question.functions.ts`, `src/routes/build-my-roadmap.write.tsx`.
Add: 3 new vitest files + extensions to 2 existing ones; `/tmp/browser/phase14/run.py`.

### Done when

- All 245 existing tests + new ones pass.
- Playwright QA report shows 4/4 scenarios green against the acceptance checklist.
- Manual walkthrough confirms no obvious/repeat question, ack references prior answer, enough-signal fires when the brief is strong enough.
