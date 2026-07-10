# SPA Navigation Fix — Summary

**Date:** 2026-07-10  
**File modified:** `src/routes/engine.projects.$projectId.agent.tsx`

---

## Root Cause Analysis

### Investigation Findings

All tab navigation links in `WorkspaceToolbar` (in `src/components/engine/WorkspaceHeader.tsx`) already use correct `<Link to="..." params={{ projectId }}>` components from `@tanstack/react-router`. The routes are all properly registered in the `routeTree.gen.ts`. TypeScript confirmed no type errors on any of the navigation links.

### Primary Bug: Missing `<Outlet />` in Agent Route

The `engine.projects.$projectId.agent.tsx` route has three nested child routes:
- `agent/tasks` (`engine.projects.$projectId.agent.tasks.tsx`)
- `agent/costs` (`engine.projects.$projectId.agent.costs.tsx`)
- `agent/permissions` (`engine.projects.$projectId.agent.permissions.tsx`)

In TanStack Router's file-based routing, these files are **children** of the `agent` route (`getParentRoute: () => EngineProjectsProjectIdAgentRoute` in the generated routeTree). When navigating to `/agent/tasks`, TanStack Router renders the `agent` parent component and expects to slot the child component into an `<Outlet />`.

**The `AgentConsolePage` component had no `<Outlet />`**, so the child components for Tasks, Costs, and Permissions were silently dropped — the view appeared to show the Agent Console (from the parent route) but the child content never appeared, and from the user's perspective the view appeared unchanged from the overview.

---

## Fix Applied

**File:** `src/routes/engine.projects.$projectId.agent.tsx`

Refactored `AgentConsolePage` into two components:

1. **`AgentConsolePage`** (router-aware wrapper) — checks the current pathname:
   - If at a child route (`/agent/tasks`, `/agent/costs`, `/agent/permissions`) → renders `<Outlet />` so the child page content displays
   - If at the exact `/agent` path → renders `<AgentConsoleContent />` (the full agent dashboard)

2. **`AgentConsoleContent`** (extracted from original `AgentConsolePage`) — contains all hooks and the full Agent Console UI. This avoids React's Rules of Hooks violation that would occur with an early return before hook calls.

The `Outlet` and `useRouterState` imports were added to the existing `@tanstack/react-router` import.

---

## Other Links Audited (No Change Needed)

| Tab | Route | Status |
|---|---|---|
| Project Spine | `/engine/projects/$projectId/spine` | ✓ Correct `<Link>` |
| Project Chat | `/engine/projects/$projectId/chat` | ✓ Correct `<Link>` |
| Frame Builder | `/engine/projects/$projectId/frame-builder` | ✓ Correct `<Link>` |
| Mockup Builder | `/engine/projects/$projectId/mockup-builder` | ✓ Correct `<Link>` |
| Backend Builder | `/engine/projects/$projectId/backend-builder` | ✓ Correct `<Link>` |
| QA Factory | `/engine/projects/$projectId/qa-factory` | ✓ Correct `<Link>` |
| Implementation Plan | `/engine/projects/$projectId/implementation-plan` | ✓ Correct `<Link>` |
| Build Execution | `/engine/projects/$projectId/build-execution` | ✓ Correct `<Link>` |
| Intelligence | `/engine/projects/$projectId/intelligence-layer` | ✓ Correct `<Link>` |
| Agent | `/engine/projects/$projectId/agent` | ✓ Correct `<Link>` |
| Tasks | `/engine/projects/$projectId/agent/tasks` | ✅ **Fixed** (child now renders via Outlet) |
| Costs | `/engine/projects/$projectId/agent/costs` | ✅ **Fixed** (child now renders via Outlet) |
| Compare | `/engine/projects/$projectId/versions/compare` | ✓ Correct `<Link>` (direct child of $projectId route) |
| Permissions | `/engine/projects/$projectId/agent/permissions` | ✅ **Fixed** (child now renders via Outlet) |
| Intake Review | `/engine/projects/$projectId/intake` | ✓ Correct `<Link>` |
| Add Signal | `/engine/projects/$projectId/signal-room` | ✓ Correct `<Link>` |

---

## Test Results

```
Test Files: 1 failed | 43 passed | 2 skipped (46)
Tests:      1 failed | 306 passed | 4 skipped (311)
```

The 1 failing test (`src/lib/__tests__/source-visibility-defense.test.ts`) is a **pre-existing failure** unrelated to navigation — it checks for `internal_only` references in database migration files. Confirmed identical result before and after my change.

No new test failures introduced.
