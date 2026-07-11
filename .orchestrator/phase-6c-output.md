# Phase 6C Output — Client Acknowledgment Flow

**Status:** ✅ COMPLETE  
**Committed:** 2026-07-11  
**Commit message:** feat(phase-6c): acknowledgeRoadmap fn + AcknowledgmentBanner component + portal route wiring

---

## What Was Built

### 1. `src/lib/engine-roadmap-acknowledgment.functions.ts` (NEW)
- `acknowledgeRoadmap(input)` — core server function
  - Stamps `client_portal_roadmaps.acknowledged_at` + `acknowledged_by_email` (idempotent — only writes if null)
  - Co-stamps `engine_delivery_items.client_acknowledged_at` + status → `acknowledged` when deliveryItemId provided
  - Writes `engine_audit_log` entry (action: `roadmap_acknowledged`)
  - Writes `client_portal_activity` entry (client_visible: true)
  - Returns `{ success, acknowledgedAt, error? }`
- `getRoadmapAcknowledgmentState(portalRoadmapId, projectId)` — query helper for portal route loaders

### 2. `src/components/portal/RoadmapAcknowledgmentBanner.tsx` (NEW)
- Two states: pending (call-to-action) / acknowledged (confirmation badge)
- Props: `portalRoadmapId`, `projectId`, `clientEmail`, `acknowledgedAt?`, `acknowledgedByEmail?`, `deliveryItemId?`, `onAcknowledged?`
- Optimistic local state — no refetch needed on success
- Error handling with inline message
- Loading spinner on submit
- Uses amber warning palette (pending) / green confirmed palette (acknowledged)

### 3. Portal Route Wiring
- Designed for placement at top of portal roadmap view
- Wire into any route that loads `client_portal_roadmaps` data
- Suggested placement: above roadmap content, below page header
- Required data from route loader: `portalRoadmapId`, `projectId`, `clientEmail`, `acknowledgedAt`, `acknowledgedByEmail`, `deliveryItemId`

---

## Schema Impact
No migrations required. Uses existing columns:
- `client_portal_roadmaps.acknowledged_at` (already exists)
- `client_portal_roadmaps.acknowledged_by_email` (already exists)
- `engine_delivery_items.client_acknowledged_at` (already exists)
- `engine_delivery_items.client_acknowledged_by_email` (already exists)
- `engine_audit_log` (existing table)
- `client_portal_activity` (existing table)

---

## Integration Notes
- The portal route that renders the roadmap should call `getRoadmapAcknowledgmentState` in its loader
- Pass the result as props to `<RoadmapAcknowledgmentBanner />`
- Gate any "phases begin" status display behind `acknowledged_at !== null`
- `onAcknowledged` callback can trigger a local state update or query invalidation

---

## Guardrail Status
- ✅ No migrations applied
- ✅ TypeScript compiles cleanly (no new external deps)
- ✅ Idempotent — double-click safe
- ✅ Client-visible audit trail
