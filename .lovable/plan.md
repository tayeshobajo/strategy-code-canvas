# Phase 14 — Conversation Intelligence

Phase 13 proved the planner *runs*. Phase 14 proves it *thinks*. Two tracks:
a QA harness that measures conversation quality, and the minimal planner
upgrades needed to pass it.

## Track A — Conversation Intelligence QA (read-only)

New Playwright + vitest harness under `/tmp/browser/phase14/` producing
`/mnt/documents/phase-14-qa/REPORT.md`. Six checks, each scenario:

1. **No obvious questions.** After every answer, assert the next
   `question` text does not re-ask any field whose `known_facts[key].confidence ≥ 0.6`.
   Uses per-field keyword probes (event_date → /when|date|day/, etc.).
2. **Highest-value gap first.** Snapshot the ranked candidate list at each
   turn; assert the selected gap has the top `score` and that no lower-
   importance optional beat a higher-importance required.
3. **Consultant quality (human review).** For each of the 5 scenarios,
   dump the full transcript into REPORT.md with a manual pass/fail column
   ("would a senior consultant ask this next?").
4. **Multi-fact extraction.** Seed answer *"150 guests on Aug 30 in
   Nashville"*; assert `guest_count`, `event_date`, `location` all move
   above 0.6 from a single turn.
5. **Cross-turn memory.** Run each scenario twice with answers shuffled;
   assert the produced question sequence differs (Jaccard < 0.6 on the
   ordered question-key list).
6. **Early stopping.** Assert turn count varies by frame: event_site ≤ 8,
   crm 8–14, roadmap 10–18, and `enough_signal` fires on `confidence ≥
   threshold`, not on a fixed count.

Deliverables: `REPORT.md`, per-scenario `debug.json`, screenshots, and a
scoring table (6 checks × 5 scenarios = 30 cells).

## Track B — Planner upgrades (minimal, targeted)

Only the changes needed to pass Track A. All client-safe, pure, unit-tested.

### B1. Multi-fact heuristic extraction
`src/lib/intake/heuristic-extract.ts` today extracts per-field in isolation.
Extend the event_site / crm / internal_tool extractors so a single free-text
answer can populate multiple fields in one pass (dates, counts, locations,
tool names). Add vitest cases for the 150-guests example and 3 more.

### B2. Ranked candidate log
`gap-analyzer.ts` → return `{ selected, candidates: RankedGap[] }` from a
new `rankGaps()` helper, keep `analyzeGaps()` as a thin wrapper. Planner
attaches the full ranked list to its decision so `window.__intakeDebug`
exposes it for Track A check #2 and future tuning.

### B3. Score composition
Replace `score = importance * (1 - confidence)` with three named terms so
the debug panel matches the user's spec:

```text
information_gain  = 1 - confidence
confidence_impact = importance
flow_bonus        = dependency-satisfied ? 0.1 : 0 + recently-mentioned ? 0.1 : 0
score             = information_gain * confidence_impact + flow_bonus
```

Behavior stays close to today's ranking; the new fields are what the debug
panel and REPORT surface.

### B4. Confidence-based early stopping
Already partially wired (`DEFAULT_CONFIDENCE_THRESHOLD = 0.75`). Make the
threshold per-frame in `frame-profiles.ts` (event_site 0.7, crm 0.78,
internal_tool 0.78, roadmap 0.82) and drop the "must ask every required
field" implicit floor by letting `planNextTurn` return `done` as soon as
the threshold is crossed even with open low-importance requireds.

### B5. Acknowledgement preface
Extend `buildGeneratorPrompt` to emit an optional short acknowledgement
sentence before the question when `memory.answerHistory.length ≥ 1` and
the last answer added ≥1 high-confidence fact. Contract:

```json
{ "acknowledgement": "<optional one clause, ≤ 14 words>", "question": "<one line>" }
```

Renderer (`build-my-roadmap.write.tsx`) shows the acknowledgement as a
muted line above the question when present. `passesVoiceCheck` applies to
both fields; acknowledgement is dropped silently if it fails.

### B6. Route wiring
`planner-adapter.ts` returns the new `candidates` and `score_breakdown`
in `PlannerSnapshot`; the route dumps them into `window.__intakeDebug`.
No other route changes.

## Test coverage (added, all vitest)
- `heuristic-extract.multifact.test.ts` — the 4 multi-fact fixtures.
- `gap-analyzer.ranking.test.ts` — candidates array, score fields, tie-break.
- `planner.early-stop.test.ts` — per-frame thresholds, done-with-open-low-importance.
- `question-generator.ack.test.ts` — ack + question contract, voice-check on ack.

## Files touched
- edit `src/lib/intake/heuristic-extract.ts`
- edit `src/lib/intake/gap-analyzer.ts`
- edit `src/lib/intake/conversation-planner.ts`
- edit `src/lib/intake/frame-profiles.ts`
- edit `src/lib/intake/question-generator.ts`
- edit `src/lib/intake/planner-adapter.ts`
- edit `src/lib/intake-question.functions.ts` (parse new ack field)
- edit `src/routes/build-my-roadmap.write.tsx` (render ack, expose candidates)
- add 4 vitest files above
- add `/tmp/browser/phase14/run.py` + REPORT generator (QA only, not shipped)

## Out of scope
- Persisting acknowledgement text in `intake_drafts`.
- Rewriting frame profiles beyond adding `confidenceThreshold`.
- Any UI redesign of the intake shell.
- Changes to submission, roadmap generation, or downstream engine code.

## Done when
- Track A REPORT shows 30/30 green (or documented human-review pass on #3).
- All existing 234 tests + 4 new files pass.
- Manual walkthrough of the birthday scenario shows an acknowledgement line
  before ≥1 question and never re-asks event_date after it's been given.
