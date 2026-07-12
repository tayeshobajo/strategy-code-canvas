# Phase 9B Output — Evidence Requirements Enforcement

**Status:** COMPLETE  
**Commit:** 58c69cb92c934e677bcc0729d725368b2960832d  
**Timestamp:** 2026-07-12 04:38 CDT  
**Build method:** Direct GitHub commit (no Lovable AI)

---

## What was built

### 1. `getWorkspaceEvidenceReport()` — new server function

Added to `src/lib/engine-evidence-gate.functions.ts`.

- Loads all projects from `engine_projects` in one query
- Loads all milestones from `engine_review_items` in one batched `IN` query
- Loads all sources from `engine_sources` in one batched `IN` query  
- Evaluates evidence gate per milestone per project (same logic as per-project fn)
- Prefers milestone-scoped sources; falls back to project-scoped
- Returns:
  - `projectsWithGaps` — projects with ≥1 milestone needing evidence
  - `projectsClear` — projects where all milestones have evidence or are complete
  - `projectsEmpty` — projects with no milestones yet
  - Aggregate: `totalProjects`, `totalMilestones`, `totalMilestonesWithGaps`, `totalSources`, `totalProcessedSources`
- Auth: operator or admin role required
- No new DB tables. Reads existing tables only.

### 2. `src/routes/admin.evidence-enforcement.tsx` — new admin route

Route: `/admin/evidence-enforcement`

- Stat strip: total projects / milestones with gaps / projects needing attention / sources processed
- Product law callout: "Evidence is not optional. A milestone is done when there is proof it is done."
- Projects with gaps section: amber-bordered cards with blocker count, source count, link to per-project Evidence & QA
- Evidence ready section: blue-bordered cards (milestones clear)
- No milestones yet section: minimal rows for empty projects
- All-clear state when zero gaps
- Report generated-at timestamp
- Refreshes on window focus; 60s stale time

### 3. `src/routes/admin.tsx` — nav updated

Added `{ to: "/admin/evidence-enforcement", label: "Evidence enforcement", icon: ShieldAlert, match: "/admin/evidence-enforcement" }` between Decision log and User roles.

---

## What was NOT built (already existed)

- `getMilestoneEvidenceGate()` — existed
- `getProjectEvidenceGateSummary()` — existed  
- `MilestoneEvidenceGate.tsx` component — existed
- `EvidenceGateSummaryPanel.tsx` component — existed
- `engine.projects.$projectId.evidence.tsx` route — existed

Phase 9B is about **enforcement visibility at the admin level**, which was missing. Now operators can see the full cross-project gap picture in one place.

---

## No migrations required

All reads from existing tables: `engine_projects`, `engine_review_items`, `engine_sources`.
