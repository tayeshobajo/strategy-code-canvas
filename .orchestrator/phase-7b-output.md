# Phase 7B Output — Plan Depth and Completeness

**Status:** COMPLETE  
**Completed:** 2026-07-12 11:01 CDT  
**Commits:** `dd2233825af7839d06e8d8469f4d43b4fab51aaf` + `1b252d50bff5c91f796ad07fc7070f76e216e250`  
**No migrations required.**

---

## What Was Built

### 1. `src/lib/engine-plan-depth.functions.ts`
Server functions auditing planning depth for each project across 7 dimensions:

| Dimension | Weight | What it checks |
|---|---|---|
| User journeys | 20pts | Mockups with user flow / journey payload |
| Sitemap / architecture | 15pts | Blueprint JSONB contains node structure |
| Data model | 20pts | Backend plan payload has schema/entities |
| Spec depth | 20pts | Implementation plans have acceptance_criteria filled |
| QA plan | 10pts | engine_project_qa_plans record exists |
| Mockup coverage | 10pts | Mockup:milestone ratio ≥ 70% |
| Backend plan | 5pts | engine_project_backend_plans record exists |

**Depth levels:** Sufficient (≥70%), Partial (40–69%), Shallow (<40% — execution should not begin)

**Server functions exported:**
- `getWorkspacePlanDepthReport()` — cross-project workspace report (5 batched queries)
- `getProjectPlanDepth({ projectId })` — single project drill-down (6 parallel queries)

**Data sources used (no new tables):**
- `engine_projects.blueprint` (JSONB, node structure check)
- `engine_project_mockups` (user flow payload scan)
- `engine_project_backend_plans` (data model payload scan)
- `engine_project_qa_plans` (presence check)
- `engine_project_implementation_plans` (acceptance_criteria coverage)
- `engine_milestones` (count for mockup coverage ratio)

### 2. `src/routes/admin.plan-depth.tsx`
Admin UI at `/admin/plan-depth`:
- Workspace summary bar: Sufficient / Partial / Shallow / Not exec-ready counts + average score
- Depth scale legend: color-coded thresholds
- Per-project expandable cards with:
  - Depth level badge (sufficient/partial/shallow)
  - Score bar (green/yellow/red)
  - Artifact count grid (mockups, backend plans, QA plans, impl plans)
  - Per-dimension breakdown with status icon + detail text + action link to fix
  - Blocked reason alert when critical dimensions are missing
- "Shallow only" filter to focus on problem projects
- Refresh button

### 3. `src/routes/admin.tsx` (nav update)
- Added `Layers` icon import from lucide-react
- Added Plan Depth entry: `{ to: "/admin/plan-depth", label: "Plan depth", icon: Layers }`
- Positioned after Roadmap Intelligence in the nav order

---

## Product Law Applied

> A project with a shallow plan will generate a shallow product.

This view surfaces the depth deficit before execution begins — not after. A project with no user journeys, no data model, and no acceptance criteria has no business in an active development sprint. The engine now makes that visible.

---

## Next Phase
Phase 10C — Post-Delivery Learning Loop (outcome surveys, 30/60/90 day check-ins)
