# Phase 12F Output — Outcome Feedback Loop

**Status:** COMPLETE (retroactive — files confirmed already committed in prior cycles)
**Recorded:** 2026-07-12 13:10 CDT

---

## What Was Built

A cross-project Outcome Feedback Loop that automatically derives delivery outcome signals from existing data (milestones, activity records, project JSON) and synthesizes them into workspace-level patterns that inform future project estimates and intake decisions. No new Supabase tables required.

### Files

| File | Description |
|---|---|
| `src/lib/engine-outcome-feedback.functions.ts` | Server function module — 2 exported server fns |
| `src/routes/admin.outcome-feedback.tsx` | Admin UI — outcome signals + pattern synthesis view |
| `src/routes/admin.tsx` | Nav wired — BarChart3 icon + `/admin/outcome-feedback` |

### Server Functions

**`getWorkspaceOutcomeFeedbackReport()`**
- Batches 3 queries in parallel: `engine_projects`, `engine_milestones`, `engine_activity`
- Derives 4 automatic signals per project from existing data
- Overrides with manual signals from `engine_activity` (outcome_survey_submitted, outcome_feedback_signal, outcome_check_in_skipped)
- Synthesizes patterns across all projects per signal kind
- Returns `WorkspaceOutcomeFeedbackReport` with signals array + syntheses array

**`recordOutcomeFeedbackSignal({ projectId, signalKind, value, rawData })`**
- Admin-only mutation — writes `outcome_feedback_signal` to `engine_activity`
- Validates: UUID projectId, valid signalKind enum, value 0–100, rawData max 4000 chars

### Six Signal Kinds

| Signal | Source | How derived |
|---|---|---|
| `timeline_accuracy` | project dates | actual days / estimated days from investment JSON |
| `budget_accuracy` | manual/survey | from outcome_survey_submitted activity |
| `scope_drift` | roadmap vs milestones | planned milestone count vs actual count |
| `client_satisfaction` | manual/survey | from activity body or NPS score |
| `delivery_completeness` | milestones | % milestones reaching `complete` status |
| `evidence_quality` | milestones | avg `confidence` column across project milestones |

### Pattern Synthesis

- For each signal kind: computes average score, affected project count, recommendation
- Recommendations adapt to score band: healthy (≥80%), mixed (≥60%), weak (<60%)
- Sorted by lowest avg score first — worst patterns surface first

### UI Features

- Three summary stat cards: Avg Timeline Accuracy, Avg Delivery Completeness, Projects with Feedback
- Synthesized Patterns grid — 2-column card grid with score badge + recommendation
- Project Signals table — per-project, per-kind rows with confidence badge

### No Migrations Required

All data read from existing `engine_projects`, `engine_milestones`, `engine_activity` tables. Manual signals stored as `engine_activity` rows (existing table). Zero new schema changes.

---

## Design Decisions

- **Automatic signals preferred, manual overrides accepted** — the system extracts what it can from existing data, but allows operators to record manual observations that supersede the automatic calculation.
- **Latest manual wins** — when multiple manual activity records exist for the same project + signal kind, the most recent one wins.
- **Confidence propagation** — automatic signals carry `low` or `medium` confidence; manual submissions carry `high`. This prevents automatic noise from dominating the synthesis.

---

## Acceptance

- ✅ 6 signal kinds computed automatically from existing data
- ✅ Manual override path via `recordOutcomeFeedbackSignal`
- ✅ Pattern synthesis with adaptive recommendations
- ✅ Admin nav wired
- ✅ No migrations
- ✅ TypeScript valid
