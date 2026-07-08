# Phase 13 QA — Adaptive Conversation Planner

Read-only QA pass. No product code changes. Deliverables: a Playwright driver, per-scenario screenshots, captured DB rows, debug log dumps, and a pass/fail report.

## Scope

- Drive `/build-my-roadmap` via headless Chromium against `http://localhost:8080`.
- For each of the 5 scenarios: submit opening + follow-up, screenshot each turn, dump the planner's internal state, then query the DB for the resulting rows.
- Re-run existing Phase 11/12 vitest suites to confirm no regressions.
- Produce a single markdown report at `/mnt/documents/phase-13-qa/REPORT.md`.

## Deliverables

```
/mnt/documents/phase-13-qa/
  REPORT.md                     # pass/fail per scenario + assertion matrix
  scenario-1-event/
    01-classification.png
    02-first-question.png
    03-second-question.png
    04-enough-signal.png
    05-review-panel.png
    debug.json                  # frame, known_facts, missing_fields, next_gap, question, confidence, enough_signal (per turn)
    db.json                     # intake_drafts / intake_submissions / engine_sources / engine_extraction_runs / roadmap draft / reviews
  scenario-2-roadmap/  ...
  scenario-3-crm/      ...
  scenario-4-internal/ ...
  scenario-5-not-fit/  ...      # no submission expected; capture redirect screen only
```

## Approach

### 1. Instrumentation harness (test-only)

Playwright will hook into planner state via `window.__intakeDebug` which the intake route already logs to. If that hook is not exposed, the driver will fall back to:
- reading `intake_drafts.answers._memory` from the DB after each turn (contains `knownFacts`, `questionHistory`, `answerHistory`);
- computing `missing_fields` and `confidence_score` client-side by importing the pure planner modules (`frame-profiles`, `intake-memory`, `gap-analyzer`) into a small Node script.

No source files change. If the debug hook is missing, the report notes it and uses the fallback.

### 2. Playwright driver

`/tmp/browser/phase13/run.py` — one script, one browser, sequential scenarios:

```text
for each scenario:
  new context (fresh session, no auth needed for public intake)
  goto /build-my-roadmap
  type opening -> submit -> screenshot 01, 02
  dump planner state (window.__intakeDebug or DB fallback) -> debug.json turn 1
  type follow-up -> submit -> screenshot 03
  dump planner state -> debug.json turn 2
  if enough_signal reached: screenshot 04, submit, screenshot 05
  capture draft_id from URL / localStorage
```

Uses `viewport=1280x1800`, `headless=True`, stable selectors (`getByRole`, `aria-label`, `data-testid` where present).

### 3. DB capture (per scenario)

After each scenario completes, run parameterized `psql` queries scoped by the captured `draft_id` / created_at window to fetch:
- `intake_drafts` row (frame, answers, attachments)
- `intake_submissions` row (if created)
- `engine_sources` rows linked to the submission
- `engine_extraction_runs` rows
- `engine_roadmap_versions` where `status = 'ai_generated'` (roadmap AI draft)
- `roadmap_intake_reviews` if the table/view exists (verify name first via `\dt`)

Writes results as JSON per scenario.

### 4. Assertion matrix

The report evaluates all 10 required assertions per scenario:

| # | Assertion | How verified |
|---|-----------|--------------|
| 1 | No `project.generic` fallback unless appropriate | `debug.json.frame` per turn |
| 2 | No static question leakage across frames | manual review + banned-key list per frame from `frame-profiles.ts` |
| 3 | `known_facts` updates after every answer | diff turn N vs N-1 |
| 4 | `missing_fields` shrinks | diff turn N vs N-1 |
| 5 | Question history prevents repeats | `questionHistory` distinct by `fieldKey` |
| 6 | Next question references prior answer | substring check for names/dates from user input |
| 7 | Confidence increases | `confidence_score` monotonic |
| 8 | Reaches enough-signal | `enough_signal === true` before hard cap |
| 9 | Phase 11/12 suites green | `bunx vitest run` filtered to those files |
| 10 | Screenshots captured at the 5 required moments | file presence check |

### 5. Regression suite

Runs `bunx vitest run` covering the existing intake, planner, portal, and engine suites (all 234 tests). Fails the report if any suite fails.

## Pass criteria

- Scenarios 1–4 each satisfy assertions 1–8 and produce all 5 screenshots plus a non-empty DB capture.
- Scenario 5 shows the not-fit redirect, no `intake_submissions` row created, `debug.json.frame === "not_a_fit"`.
- Vitest run is fully green.
- Report clearly marks any assertion that fails with the offending turn's `debug.json` excerpt.

## Out of scope

- No product code edits. If a scenario fails, the report enumerates the fix but does not apply it — that becomes a follow-up plan.
- No changes to `frame-profiles.ts`, planner, or route code.
- No new automated tests committed to the repo; the Playwright driver lives under `/tmp/browser/phase13/` and screenshots under `/mnt/documents/phase-13-qa/`.
