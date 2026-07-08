# Phase 14 — Conversation Intelligence QA Report

_Latest run: `python3 scripts/qa/phase14-conversation-qa.py`._
_Raw data at `/tmp/browser/phase14/results.json`, screenshots at `/tmp/browser/phase14/screenshots/`._

## Summary

**4 of 4 scenarios green. 0 assertion failures.**

| Scenario | Result | Frame chosen | Turns | Final conf / thr | Enough signal |
|---|---|---|---|---|---|
| event_site | ✅ PASS | `project.event_site` | 0 (opener sufficient) | 0.76 / 0.70 | true |
| roadmap | ✅ PASS | `roadmap` | 3 | 0.80 / 0.82 | true |
| crm_automation | ✅ PASS | `project.crm` | 2 | 0.79 / 0.78 | true |
| internal_tool | ✅ PASS | `project.internal_tool` | 2 | 0.79 / 0.78 | true |

Every scenario:
- picked the correct frame from the opener
- never asked a field already at/above threshold
- never wandered into another frame's question set
- reached `enough_signal=true` in ≤ 3 turns
- overall `confidence_score` was monotonically non-decreasing

## Fixes shipped in this pass

The prior run flagged two roadmap quality signals — both are fixed.

### 1. Confidence could fall between turns (0.74 → 0.70)

**Root cause.** `advanceObjective` in `src/routes/build-my-roadmap.write.tsx`
computed the next scores from a stale `scores` closure and then wrote it
back with `setScores(nextScores)`. The async model-scoring update that
lands between renders was silently overwritten with the closure's
older-generation snapshot, dropping any field the model had bumped in
the meantime. Additionally, a re-answer that scored lower than the prior
pass would overwrite the field's earlier stronger score.

**Fix.**
- Introduced a `scoresRef` mirror of the `scores` state so the objective-advance
  and both async setState paths always merge against the freshest scores.
- Every write is now higher-wins per field (`Math.max(prior, candidate)`),
  matching the `mergeFacts` invariant the planner already relies on.
- Model-score async updates (`setScores((s) => …)`) and the media-summary
  bump keep `scoresRef.current` in sync so the next objective advance sees
  the update.

Files: `src/routes/build-my-roadmap.write.tsx` (three setScores call sites).

### 2. Planner re-asked the same anchor verbatim during clarify loops

**Root cause.** The generator server function
(`src/lib/intake-question.functions.ts`) had no signal that it was being
invoked for a re-ask, and the voice check whitelisted a verbatim
`objective_anchor` as valid output. Under `clarify-low-confidence`, the
route sent no previous-attempt context and the model happily returned
the same anchor question three times in a row.

**Fix.**
- Added `previous_attempt` and `is_reask` fields to the generator input schema.
- The prompt now includes a `RE-ASK` block that names back the founder's
  prior attempt and asks the model for a sharper, more concrete angle
  (concrete example, name, number, or story).
- `passesVoiceCheck` now rejects a verbatim anchor when `is_reask=true`,
  forcing the second retry to try again.
- Route wires `previous_attempt` (current-key prior answer) and
  `is_reask` (asked before + non-empty prior response) into the call.

Files: `src/lib/intake-question.functions.ts`,
`src/routes/build-my-roadmap.write.tsx` (generator call site).

### Downstream effect on the roadmap scenario

Before:

| # | field_key | reason | conf → | question |
|---|---|---|---|---|
| 0 | unbuilt_asset | top-ranked-required | 0.64 → 0.74 | (anchor) |
| 1 | unbuilt_asset | clarify-low-confidence | 0.74 → **0.70** | (anchor, verbatim) |
| 2 | unbuilt_asset | clarify-low-confidence | 0.70 → 0.70 | (anchor, verbatim) |
| 3 | unbuilt_asset | clarify-low-confidence | 0.70 → 0.85 | (anchor, verbatim) |

After:

| # | field_key | reason | conf → | question |
|---|---|---|---|---|
| 0 | unbuilt_asset | top-ranked-required | 0.64 → 0.74 | (anchor) |
| 1 | unbuilt_asset | clarify-low-confidence | 0.74 → **0.80** | (anchor) |
| 2 | point_c | optional-followup | 0.80 → 0.80 | if it could not fail, what would you build over the next ten years |

crm_automation also visibly improved: the clarify pass now rephrases
(`"When does this need to be working, and what makes that date matter
for you?"`) instead of returning the anchor verbatim.

## Assertions applied per turn

Applied by `scripts/qa/phase14-conversation-qa.py`, reading
`window.__intakeDebug` between clicks:

- **A. No obvious question.** Planner must not pick a field whose
  `known_facts[key].confidence` already meets the frame threshold.
- **B. No re-ask above threshold.** Same rule, over the running history.
- **C. Confidence monotonic.** Overall `confidence_score` must not fall.
- **D. Reason valid.** `selected_reason` must be one of the planner’s
  documented reasons.
- **E. No paraphrase collision.** Consecutive questions must not overlap
  a prior question by Jaccard ≥ 0.6, unless the planner’s reason is
  explicitly `clarify-low-confidence` (a legitimate re-ask of an
  under-signalled field).

## Automated invariant tests

### 1. 3+ turn no-repeat (baseline)

`src/lib/intake/__tests__/planner.no-repeat-when-known.test.ts` walks a
4-turn synthetic conversation for every frame and asserts:

> Across 3+ turn conversations, the planner MUST NOT pick a field as
> the next question if that field already sits at or above the frame's
> confidence threshold in `knownFacts`.

All 4 frames pass.

### 2. 5+ turn no-repeat (parametrized across lengths and seeds)

`src/lib/intake/__tests__/planner.no-repeat-5turn.test.ts` sweeps every
combination of `frame × length × seed`:

| Axis | Values |
|---|---|
| Frame | `project.event_site`, `roadmap`, `project.crm`, `project.internal_tool` |
| Turn length | 5, 6, 7 |
| Answer-order seed | 1, 2, 3 (deterministic LCG shuffle of the 7-answer bank) |

That's **36 walks per run** (4 × 3 × 3). Each walk asserts both invariants
per turn: the picked field must have prior confidence < threshold, and the
same key must never be re-picked once satisfied. All 36 pass. Seeds
permute answer order but not information content, so a regression in
ordering-sensitive gap ranking would surface as a failing seed.

### 3. 7+ turn roadmap regression — `unbuilt_asset` not re-selected

`src/lib/intake/__tests__/planner.roadmap-reask-unbuilt-asset-7turn.test.ts`
extends the roadmap-specific guard to long conversations:

- **Organic 7-turn walk.** With a strong `unbuilt_asset` answer seeded up
  front (12k newsletter list + referral network + content library), the
  planner never re-selects it across 7 follow-up turns covering
  bottleneck, 12-month vision, first-90-days, revenue, long-term
  position, and hiring deadline.
- **Forced confidence drop.** We defensively mutate `knownFacts.unbuilt_asset`
  below threshold (bypassing higher-wins `mergeFacts`) to simulate a bad
  model re-score. The planner is then allowed to re-ask **at most once**,
  and only under `selected_reason === "clarify-low-confidence"`; the
  prior strong answer must still be reachable through `answerHistory` so
  the route can wire `is_reask` + `previous_attempt` into the generator.

Both cases pass. Also covered by
`src/lib/intake/__tests__/planner.roadmap-reask-unbuilt-asset.test.ts`
for the short (single re-ask) path.

### Run all planner regressions

```
bunx vitest run src/lib/intake/__tests__/planner
```

## UI smoke — roadmap panel

`scripts/qa/roadmap-panel-smoke.py` drives `/portal/roadmap-mockup`
headless and asserts:

- Route is publicly viewable (`auth-open:mockup`) — mockup was added to
  `PUBLIC_PATHS` in `src/routes/portal.tsx` alongside `/portal/login` and
  `/portal/access-denied`.
- All three phase tabs render: **Foundation**, **Core Platform**,
  **Scale Systems**.
- Status legend renders all three labels: **Completed**, **In progress**,
  **Upcoming**.
- Tabs are interactive: clicking **Scale Systems** does not remove it
  from the DOM.
- Zero runtime `console.error` events fire during render.

Latest run: **9/9 assertions pass, 0 console errors.** Artifacts at
`/tmp/browser/roadmap-panel/` (`results.json` + `screenshots/`).

```
python3 scripts/qa/roadmap-panel-smoke.py
```

## Reproducing the intake Playwright QA

```
python3 scripts/qa/phase14-conversation-qa.py
# → writes /tmp/browser/phase14/REPORT.md and /tmp/browser/phase14/results.json
```

The runner expects the dev server on `http://localhost:8080` and drives
Chromium headlessly. It opens a fresh browser context per scenario so
`localStorage` drafts do not leak between runs.

