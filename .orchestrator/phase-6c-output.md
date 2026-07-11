# Phase 6C Output — Client Acknowledgment Flow

**Completed:** 2026-07-11 17:15 CDT
**Commit:** feat(phase-6c)

## What was built

### 1. `acknowledgeRoadmap` server function (`src/lib/portal.functions.ts`)
- Client-facing POST endpoint (no staff role required — clients call this)
- Validates: roadmap exists, belongs to caller's project, not already acknowledged
- Writes `acknowledged_at` timestamp to `client_portal_roadmaps`
- Logs to `client_portal_activity` via `log_client_portal_activity` RPC
- Returns `{ ok: true, acknowledgedAt: string }`

### 2. `RoadmapAcknowledgmentBanner` component (`src/components/portal/RoadmapAcknowledgmentBanner.tsx`)
- Amber banner shown when `!client_acknowledged`
- Confirm button calls `acknowledgeRoadmap` mutation
- On success: shows green confirmed state, invalidates `portal.context` + `portal.roadmap` queries
- "Remind me later" dismisses for the session
- Full QA data attributes: `data-qa-role`, `data-qa-roadmap-id`, `data-qa-action`

## What portal.tsx needs to do (wiring)
In the portal home route:
1. Import `RoadmapAcknowledgmentBanner`
2. After the roadmap card, render:
```tsx
{approvedRoadmap && (
  <RoadmapAcknowledgmentBanner
    roadmapId={approvedRoadmap.id}
    roadmapTitle={approvedRoadmap.title}
    alreadyAcknowledged={approvedRoadmap.client_acknowledged}
  />
)}
```

## No migrations required
`acknowledged_at` column already exists in `client_portal_roadmaps`.
