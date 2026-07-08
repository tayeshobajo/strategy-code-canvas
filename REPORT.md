# Phase 14 — Conversation Intelligence QA Report

_Run via `python3 scripts/qa/phase14-conversation-qa.py`. Raw data at `/tmp/browser/phase14/results.json`, screenshots at `/tmp/browser/phase14/screenshots/`._

## Summary

**3 of 4 scenarios pass** end-to-end against the live intake at
`/build-my-roadmap/write`. The one failing scenario (`roadmap`) still
reaches `enough_signal` and lands the user in the contact phase — the
failures below are **quality signals**, not blocking regressions.

| Scenario | Result | Frame chosen | Turns | Final conf / thr | Enough signal |
|---|---|---|---|---|---|
| event_site | ✅ PASS | `project.event_site` | 0 (opener sufficient) | 0.76 / 0.70 | true |
| roadmap | ❌ 2 quality signals | `roadmap` | 4 | 0.85 / 0.82 | true |
| crm_automation | ✅ PASS | `project.crm` | 2 | 0.79 / 0.78 | true |
| internal_tool | ✅ PASS | `project.internal_tool` | 2 | 0.79 / 0.78 | true |

Every scenario:
- picked the correct frame from the opener
- never asked a field that was already at/above threshold (invariant A)
- never wandered into another frame's question set
- reached `enough_signal=true` in ≤ 4 turns

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

## Scenario detail

### event_site — ✅
Opener carried enough multi-fact signal (date, city, guest count, feature
list, honoree) that `enough_signal` fired before the first objective turn.
Frame classifier picked `project.event_site` on the first try.

### roadmap — ❌ (2 quality signals)
Planner reached `enough_signal` in 4 turns and confidence rose from 0.64
to 0.85, but re-picked `unbuilt_asset` three times in a row:

| # | field_key | reason | conf → | question |
|---|---|---|---|---|
| 0 | `unbuilt_asset` | top-ranked-required | 0.64 → 0.74 | What does the business already own or have that it has not built on yet. |
| 1 | `unbuilt_asset` | clarify-low-confidence | 0.74 → **0.70** | (same question) |
| 2 | `unbuilt_asset` | clarify-low-confidence | 0.70 → 0.70 | if you knew the onboarding system and team would work, what does the practice look like |
| 3 | `unbuilt_asset` | clarify-low-confidence | 0.70 → 0.85 | (same question) |

Two failures were flagged:
- **turn 1 & turn 2: overall confidence fell 0.74 → 0.70.** Confidence
  is recomputed from route-side `scores` (`computeObjectiveScores`), and
  a re-answered field can produce a lower score than the previous pass,
  which drags the mean down. Worth investigating whether merging should
  cap by prior confidence (matching the planner’s own `mergeFacts`
  “higher wins” rule).
- The verbatim re-ask on turn 3 is acceptable per Assertion E because
  the planner’s reason was `clarify-low-confidence`; nonetheless the
  quality signal is that we should rephrase harder or move on after two
  clarifications.

### crm_automation — ✅
Planner asked `deadline` twice (initial + one clarification) but never a
field already ≥ threshold. Enough_signal at conf 0.79.

### internal_tool — ✅
Two distinct questions (`deadline`, `assets`), both `top-ranked-required`,
enough_signal at conf 0.79.

## Automated invariant test

`src/lib/intake/__tests__/planner.no-repeat-when-known.test.ts` runs a
4-turn synthetic conversation for every intake frame and asserts:

> Across 3+ turn conversations, the planner MUST NOT pick a field as
> the next question if that field already sits at or above the frame's
> confidence threshold in `knownFacts`.

The test walks `planNextTurn → mergeFacts → recordQuestion → recordAnswer`
using each frame’s own heuristic extractors on scripted answers, then
checks the invariant on every turn. All 4 frames pass. Run with:

```
bunx vitest run src/lib/intake/__tests__/planner.no-repeat-when-known.test.ts
```

## Reproducing the Playwright QA

```
python3 scripts/qa/phase14-conversation-qa.py
# → writes /tmp/browser/phase14/REPORT.md and /tmp/browser/phase14/results.json
```

The runner expects the dev server on `http://localhost:8080` and drives
Chromium headlessly. It opens a fresh browser context per scenario so
`localStorage` drafts do not leak between runs.
