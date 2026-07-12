# Phase 8F Output — Stage Transition Engine

**Status:** COMPLETE (retroactive — files confirmed already committed in prior cycles)
**Recorded:** 2026-07-12 13:10 CDT

---

## What Was Built

A workspace-wide Stage Transition Engine that gives operators clear visibility into where every project is in the 8-stage pipeline, what is blocking advancement, and who is the right actor to act next. No new Supabase tables required.

### Files

| File | Description |
|---|---|
| `src/lib/engine-stage-transitions.functions.ts` | Server function module — 2 exported server fns |
| `src/routes/admin.stage-transitions.tsx` | Admin UI — workspace-level transitions table |
| `src/routes/admin.tsx` | Nav wired — ArrowRightLeft icon + `/admin/stage-transitions` |

### Server Functions

**`getWorkspaceStageTransitions()`**
- Reads all `engine_projects` rows (no pagination — admin context)
- Resolves current stage per project from `current_step_num` → `current_step` → first incomplete stage fallback
- Computes `readyToAdvance`, `blockers`, `nextActor`, `actionRequired` per project
- Returns `WorkspaceStageTransitionReport` with workspace-level counts

**`getProjectStageTransitions({ projectId })`**
- Single-project variant of the above
- Returns `ProjectStageTransitionReport`

### Stage Pipeline (8 stages)

| # | Stage | Actor | Blocker signals |
|---|---|---|---|
| 1 | Signal Intake | operator | `signal_room` missing |
| 2 | Understanding | operator | `extraction` missing |
| 3 | Project Spine | operator | `point_a`, `point_b`, `approved_at` missing |
| 4 | Blueprint | operator | `blueprint` missing |
| 5 | Roadmap | operator | `roadmap` missing |
| 6 | Sequencing | operator | `sequencing` missing |
| 7 | Investment Sign-Off | client | `investment_confirmed_at` missing |
| 8 | Delivery | operator | `delivery` missing |

### UI Features

- Summary cards: Ready to Advance / Blocked / Completed counts
- Per-project row with mini stage progress bar (8 dots, coloured by status)
- Status badges: Ready to Advance (emerald), Blocked (red), In Progress (amber), Completed (sky)
- Blocker tags surfaced inline per project row
- Action required sentence — plain English, actor-aware

### No Migrations Required

All data derived from existing `engine_projects` columns. Zero new schema changes.

---

## Design Decisions

- **Read-only diagnostic only** — the UI never writes stage transitions directly. Human operators advance the project by filling the required artifacts, which the engine then detects.
- **Current stage resolution** — three-fallback chain: `current_step_num` (numeric) → `current_step` (string, normalized) → first stage with blockers. This handles projects in all states of completeness.
- **No `current_step` writes** — the engine does not auto-advance `current_step`. That column remains operator-controlled.

---

## Acceptance

- ✅ All 8 stages tracked
- ✅ Blockers surfaced per stage
- ✅ `readyToAdvance` flag computed correctly
- ✅ Admin nav wired
- ✅ No migrations
- ✅ TypeScript valid
