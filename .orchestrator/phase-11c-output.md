# Phase 11C Output — Drift Detection

**Status:** ✅ COMPLETE
**Completed:** 2026-07-12 08:43 CDT
**Commit:** 3ea3f6e5db4cfb8a88deab6d20b9a0dcfe676a99

---

## What Was Built

### Files committed (3)

1. **`src/lib/engine-drift-detection.functions.ts`**
   - `getWorkspaceDriftReport()` server function
   - Batches 3 queries: `engine_projects`, `engine_review_items`, `engine_project_build_packets`
   - 6 drift signal categories evaluated per project
   - Drift score (0-100) computed per project
   - Fully read-only — no mutations, no migrations

2. **`src/routes/admin.drift-detection.tsx`**
   - Admin page at `/admin/drift-detection`
   - Summary bar: projects scanned, drifting, critical signals, high signals, aligned
   - By-project accordion with worst severity + drift score
   - Per-signal cards showing: title, detail, resolution recommendation, action link
   - All-clear empty state with ShieldCheck icon
   - 2-minute stale time on query, refresh button

3. **`src/routes/admin.tsx`** (nav updated)
   - Added `GitMerge` icon import
   - Drift Detection added as second item in nav (below Exception board)
   - Route: `/admin/drift-detection`, match: `/admin/drift-detection`

---

## Drift Signal Categories

| Kind | Severity | Trigger |
|---|---|---|
| `deliverable_orphaned` | critical | Deliverables completed but no spine milestones defined |
| `milestone_count_exceeded` | critical / high | Project milestones >2× spine count (critical at 3×+) |
| `spine_changed_post_proposal` | high | Spine fields updated after approval during execution |
| `scope_ahead_of_spine` | medium | Delivered packets > spine milestones |
| `undecided_spine` | medium | Open decisions exist with no approved spine |
| `spine_stale` | low | Spine not updated in 14+ days while project remains active |

---

## Product Law
Drift is signal, not failure. The system surfaces it; humans decide whether to absorb the drift into the spine or revert the project state. This module never auto-corrects, auto-approves, or modifies any project state.

---

## No Migrations Required
All reads from existing tables: `engine_projects`, `engine_review_items`, `engine_project_build_packets`.

---

## Next Phase
**5B — Roadmap Intelligence Layer** — milestones explain themselves; each milestone carries context, reasoning, dependencies, and risk signals surfaced inline.
