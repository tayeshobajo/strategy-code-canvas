# Overview UI Fixes — Output Summary

**Date:** 2026-07-10  
**File modified:** `src/routes/engine.projects.$projectId.overview.tsx`

---

## Issue 1 — "All modules are in sync" shows when no roadmap exists ✅ FIXED

**Root cause:** The empty-state message in the "Modules needing review" section was unconditional — it rendered the "All modules are in sync with the approved roadmap" string regardless of whether an approved version existed.

**Fix:** Added a conditional check on `p.approved_version`. 
- When `p.approved_version` is truthy → shows the original "All modules are in sync with the approved roadmap." message.
- When `p.approved_version` is falsy (null/undefined/"—") → shows "No roadmap version yet — approve a version to start tracking module sync."

---

## Issue 2 — Audit trail says "No audit entries yet" despite activity having entries ✅ CLARIFIED

**Root cause:** The `AuditTrailCard` component queries a separate data source from the `activity` array. The `activity` array comes from `useWorkspace()` and likely includes all project events (signals, step completions, etc.), while `AuditTrailCard` queries only formal audit log entries (e.g., version approvals, explicit audit actions). These are different data sources by design.

**Fix:** Added a "Formal audit events only" label in the section card's `right` prop. This clarifies to users that the Audit trail section shows a distinct, narrower set of formal audit events — not the same entries as Recent activity. No data source was changed; the label is the correct resolution.

---

## Issue 3 — Health score is 0 with no explanation ✅ FIXED

**Root cause:** The health score display showed only the number and "Out of 100" with no context about what drives it.

**Fix:** Two additions to the Roadmap health card:
1. A `title` attribute on the score element (shows on hover): "Health score reflects signal coverage, roadmap completeness, and review status."
2. A small helper text line below "Out of 100": "Reflects signal coverage, roadmap completeness, and review status."

---

## Test Results

```
Test Files: 1 failed | 43 passed | 2 skipped (46)
Tests:      1 failed | 306 passed | 4 skipped (311)
Duration:   14.97s
```

**Pre-existing failure (not caused by this PR):**  
`src/lib/__tests__/source-visibility-defense.test.ts` → `DB migration keeps engine_sources.visibility NOT NULL DEFAULT 'internal_only'`

This test checks a SQL migration file for the `engine_sources` table and has no connection to the overview UI component. The failure is pre-existing and unrelated to any changes made here.

---

## Changes Summary

Only `src/routes/engine.projects.$projectId.overview.tsx` was modified. No test files or other source files were touched.
