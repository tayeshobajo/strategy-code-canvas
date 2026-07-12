# Phase 12F — Outcome Feedback Loop

## Status
- COMPLETE

## What shipped
- Added `src/lib/engine-outcome-feedback.functions.ts`
  - `getWorkspaceOutcomeFeedbackReport()` batches `engine_projects`, `engine_milestones`, and `engine_activity`
  - Computes per-project outcome signals for timeline accuracy, delivery completeness, scope drift, and evidence quality
  - Reuses existing `engine_activity` rows for manual/survey-driven signals like client satisfaction and budget accuracy
  - Synthesizes cross-project patterns with recommendations and workspace summary stats
- Added `src/routes/admin.outcome-feedback.tsx`
  - New admin screen at `/admin/outcome-feedback`
  - Stat cards for timeline accuracy, delivery completeness, and projects with feedback
  - Synthesized pattern cards with recommendations
  - Project-signals table with color-coded score badges
- Updated `src/routes/admin.tsx`
  - Added the `Outcome Feedback` admin nav entry with `BarChart3`

## Notes
- The repo uses TanStack's flat route convention, so the route was implemented as `src/routes/admin.outcome-feedback.tsx` instead of a nested `src/routes/admin/admin.outcome-feedback.tsx`.
- `engine_activity.metadata` exists at runtime for this feature path, but the generated Supabase TypeScript types are stale, so the new server function narrows that table access locally.

## Verification
- `pnpm exec eslint src/lib/engine-outcome-feedback.functions.ts src/routes/admin.outcome-feedback.tsx src/routes/admin.tsx`
- `pnpm exec prettier --check src/lib/engine-outcome-feedback.functions.ts src/routes/admin.outcome-feedback.tsx src/routes/admin.tsx`
- Filtered TypeScript check for the touched files returned no matches after patching:
  - `pnpm exec tsc --noEmit --pretty false | rg 'src/lib/engine-outcome-feedback.functions.ts|src/routes/admin.outcome-feedback.tsx|src/routes/admin.tsx'`

## Commit
- Requested message: `feat(phase-12f): outcome feedback loop — delivery outcomes flow back into Captain understanding`
