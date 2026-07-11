# Phase 13B Output — Portal as Downstream-Only

**Status:** ✅ COMPLETE  
**Committed:** 2026-07-11  
**Commit message:** feat(phase-13b): enforce approval boundary at data layer for client portal

---

## What Was Found

- `client_portal_roadmaps` already has both `approved_at` and `published_at`.
- Portal roadmap reads were gated by `status IN ('approved', 'delivered')`, but not by `published_at IS NOT NULL`.
- That meant a row could remain client-visible if it carried an approved/delivered status even when it had not been explicitly published.
- The leak boundary was enforced in app queries by status only, not by the stronger downstream-only publish check required for Phase 13B.

---

## What Was Built

### 1. Data-layer publish gate in `src/lib/portal.functions.ts`
- `getPortalRoadmapDocs` now requires:
  - `status IN ('approved', 'delivered')`
  - `published_at IS NOT NULL`
  - ordered by `published_at DESC`
- `getPortalContext` approved roadmap lookup now requires:
  - `status IN ('approved', 'delivered')`
  - `published_at IS NOT NULL`
  - ordered by `published_at DESC`
- `getPortalRoadmapContextOptions` now pulls context only from roadmaps with `published_at IS NOT NULL`

### 2. Server-side route guard in `src/routes/portal.roadmap.tsx`
- Added a route `loader` that calls `getPortalRoadmapDocs()` before the page renders.
- If access is revoked, it redirects to `/portal/access-denied`.
- If no published roadmap exists, it redirects to `/portal/home`.
- Result: `/portal/roadmap` no longer relies on client-side empty-state rendering to protect drafts or unpublished rows.

### 3. Guard tests updated
- `src/lib/__tests__/portal-context-leaks.test.ts`
  - now asserts the publish gate requires `published_at`
  - now asserts the roadmap route has a redirecting loader guard
- `src/lib/__tests__/publish-column-integrity.test.ts`
  - documentation updated to reflect the app-layer `published_at` boundary

---

## Verification

- Targeted tests passed:
  - `src/lib/__tests__/portal-context-leaks.test.ts`
  - `src/lib/__tests__/publish-column-integrity.test.ts`
- Full `tsc --noEmit` is currently red from pre-existing route-type and local acknowledgment-component issues outside Phase 13B scope.

---

## Guardrail Status

- ✅ No migration required
- ✅ No Supabase migration applied
- ✅ Approval boundary enforced in query layer, not React-only conditionals
- ✅ Portal route now blocks direct navigation when no published roadmap exists
