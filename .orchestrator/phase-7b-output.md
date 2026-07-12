# Phase 7B — Plan Depth and Completeness

**Status:** ✅ COMPLETE
**Completed:** 2026-07-12
**Commit:** Pre-existing files (engine-plan-depth.functions.ts + admin.plan-depth.tsx already committed in prior cycle; BUILD_STATE updated 2026-07-12 12:06 CDT)

## What was built

A cross-project plan depth auditing system that measures how ready each active project is before execution begins.

### Files
- `src/lib/engine-plan-depth.functions.ts` — Two server functions:
  - `getWorkspacePlanDepthReport()` — cross-project depth audit with batched queries
  - `getProjectPlanDepth({ projectId })` — single-project depth breakdown
- `src/routes/admin.plan-depth.tsx` — Full admin UI at `/admin/plan-depth`
- `src/routes/admin.tsx` — Nav entry: `{ to: "/admin/plan-depth", label: "Plan depth", icon: Layers }`

### Depth dimensions (7 total, weights sum to 100)

| Dimension | Weight | Measures |
|---|---|---|
| user_journey | 20 | Mockup/frame with user flow payload |
| sitemap | 15 | Blueprint node structure (screens, components, services) |
| data_model | 20 | Backend plan with schema/model payload |
| spec_depth | 20 | Implementation plans with acceptance criteria |
| qa_plan | 10 | QA plan attached to project |
| mockup_coverage | 10 | Ratio milestones:mockups |
| backend_plan | 5 | Backend plan present at all |

### Scoring
- `< 40` — shallow (execution should not begin)
- `40–69` — partial (proceed with caution)
- `≥ 70` — sufficient

### UI features
- Workspace summary bar (sufficient / partial / shallow / not exec-ready counts)
- Per-project expandable cards with dimension breakdown
- Shallow-only filter
- Depth score bar per project
- Artifact count grid (mockups, backend plans, QA plans, impl plans)
- Direct links to fix missing artifacts

### Migrations
None required.
