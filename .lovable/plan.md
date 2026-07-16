## Problem

On the Spine page the breadcrumb still reads `Roadmap Engine / Projects / Project / Project Spine`, while on Overview it correctly reads `… / cakepro / Overview`.

Root cause: in `src/routes/engine.tsx` the client name is read via `queryClient.getQueryData(["engine","workspace", projectId])`. `getQueryData` is a one-shot read — it does not subscribe. The engine layout renders once with an empty cache and never re-renders when the child project layout's `useQuery` resolves. On Overview the crumb happens to look right because that route triggers an engine-layout re-render for other reasons; on Spine it doesn't, so the placeholder `"Project"` sticks.

## Fix

Subscribe to the workspace cache from the engine layout so it re-renders when the client name lands.

### `src/routes/engine.tsx`
- Import `useQuery` from `@tanstack/react-query`, `useServerFn` from `@tanstack/react-start`, `getProjectWorkspace` from `@/lib/engine.functions`, and `workspaceQueryOptions` from `@/routes/engine.projects.$projectId`.
- Replace the `queryClient.getQueryData(...)` read with a `useQuery(workspaceQueryOptions(activeProjectId ?? "__none__", fn))` call, gated with `enabled: !!activeProjectId`. Deduped with the project layout's own query.
- Derive `clientName` from that query's `data.project.client_company` and pass into `buildCrumbs` as today.
- Keep the `useQueryClient` import removed (no longer needed).

No other files change. Verify with `tsgo` and by loading `/engine/projects/{id}/spine`, `/overview`, `/intelligence-layer` — the crumb should show the client name on all of them once the workspace query resolves (with a brief "Project" flash on first paint).

## Out of scope
- Changing the fallback label or adding a skeleton for the crumb.
- Touching the project layout, WorkspaceHeader, or other pages.
