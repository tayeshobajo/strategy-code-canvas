# Phase H2 — Cross-Project Impact Automation

Closes gap **F7** from `.orchestrator/audit/capability-audit-2026-07-14b.md`.

## What shipped

- `src/lib/engine-family-impact.functions.ts`
  - `scanFamilyImpactForReviews({ projectId, dryRun? })` — walks the family via existing `fetchFamilySubtree` + `findFamilyRootId`, detects the four blocker classes already used by `getFamilyImpact` (`child_not_approved`, `child_not_completed`, `stale_rollup_child_added_after_approval`, `child_added_after_completion`), and inserts one `engine_review_items` row per new blocker with:
    - `item_type = 'family_impact'`
    - `source = 'family_impact_auto'`
    - `impact = 'high'` for stale-rollup / added-after-completion; `'medium'` for the approval/completion pending cases
    - deterministic `title` so re-runs are idempotent
  - `scanAllFamilyImpact()` — walks every family root in the workspace and runs the same emission. Cheap enough to run on cron later.
- `src/routes/admin.family-impact.tsx` — dry-run + live-emit UI per family, plus workspace-wide scan.
- `src/routes/admin.tsx` — nav entry (`Network` icon).

## Idempotency + loop protection

- Before inserting, the scan reads all pending `family_impact` rows for the affected project ids and dedupes by `${project_id}::${title}`.
- Emitted rows are tagged `source='family_impact_auto'`. Any downstream approval/rejection that changes family state will produce a *different* title, so re-scans emit new items rather than duplicating old ones.
- No trigger loop: emission is app-side and never runs from a DB trigger.

## Governance guarantees

- `assertStaff` on both server fns — admin/operator only.
- Every emitted item writes an `engine_activity` row (`kind='family.impact.emitted'`) with the staff email as `actor_email`.
- No writes to `engine_projects`, `engine_milestones`, or the family graph. Read-only w.r.t. the family surface; write-only into the governance queue.
- Nothing here reaches the client portal — `engine_review_items` is a staff surface.

## No schema changes

Uses existing tables only:
- `engine_projects` (read, via `fetchFamilySubtree`)
- `engine_review_items` (insert)
- `engine_activity` (insert)

## Verification

1. Pick any project with children whose approval state is pending.
2. `/admin/family-impact` → dry-run → observe blockers with counts matching `getFamilyImpact` for the same root.
3. Live emit → confirm `engine_review_items` rows appear with `item_type='family_impact'`, `source='family_impact_auto'`.
4. Re-run live emit → confirm 0 emitted, N skipped (dedup works).
5. `SELECT * FROM engine_activity WHERE kind='family.impact.emitted' ORDER BY created_at DESC LIMIT 10` shows one row per emission.

## Files

- created `src/lib/engine-family-impact.functions.ts`
- created `src/routes/admin.family-impact.tsx`
- edited `src/routes/admin.tsx` (nav + icon)

Typecheck: PASS (`bunx tsgo --noEmit` clean).
