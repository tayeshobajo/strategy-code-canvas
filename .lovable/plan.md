## Problem

Two breadcrumb trails render on every project page:

1. Top page header (from `src/routes/engine.tsx`): `Roadmap Engine / Projects / Project / Overview`
   - "Project" is a hardcoded placeholder — never shows the real client name.
   - Subpage labels come from a hand-maintained slug map (`PROJECT_SUBPAGE_LABELS`).
   - Only "Roadmap Engine" and "Projects" are actual links; "Project" and the subpage are dead text with no `to`.
2. Workspace header (from `src/routes/engine.projects.$projectId.tsx` via `WorkspaceBreadcrumb`): `Projects / cakepro / Roadmap Workspace / Project Overview`
   - Invents a "Roadmap Workspace" hop that has no route.
   - Duplicates the trail already shown above.

Result: redundancy, an invented hop, and a "Project" crumb that never resolves to a name or link.

## Fix — single breadcrumb, real data, real links

Keep the global breadcrumb in the engine layout as the single source of truth. Remove the duplicate local one. Wire the project crumb to the actual client name via the React Query cache the workspace loader already populates.

### 1. `src/routes/engine.tsx` — enrich `buildCrumbs`

- Replace the hardcoded `{ label: "Project" }` crumb with the real client name from the React Query cache using the existing `["engine", "workspace", projectId]` key. Read via `useQueryClient().getQueryData(...)` inside `EngineLayout` and pass into `buildCrumbs`. Fallback to `"Project"` while the query is loading.
- Make the project crumb link to `/engine/projects/$projectId/overview`.
- Keep subpage crumbs as leaf text (no link), driven by `PROJECT_SUBPAGE_LABELS`.
- Drop the invented "Roadmap Workspace" concept entirely — it does not exist in the routing tree.

Resulting trail on the overview page: `Roadmap Engine / Projects / cakepro / Overview` (each of the first three is a link; last is text).

### 2. `src/routes/engine.projects.$projectId.tsx` — remove duplicate

- Delete the `<WorkspaceBreadcrumb ... />` render and the `WorkspaceBreadcrumb` import.
- Keep the `Family` link + `WorkspaceToolbar` on the same row where the local breadcrumb used to sit, right-aligned as today (the header row becomes toolbar-only).
- Do not delete the `WorkspaceBreadcrumb` component export from `WorkspaceHeader.tsx` in this pass (avoid touching unrelated call sites); it simply stops being used by the project layout.

### 3. Verify

- `tsgo` typecheck.
- Visit `/engine/projects/{id}/overview`, `/spine`, `/intelligence-layer`, `/milestones/{id}/brief` and confirm exactly one breadcrumb renders with: real client name, working links on `Roadmap Engine`, `Projects`, and the client name, and the correct leaf label.

## Out of scope

- Sidebar and top-of-page global nav visual changes.
- Refactoring the subpage label map or replacing it with route metadata.
- Removing `WorkspaceBreadcrumb` from `WorkspaceHeader.tsx` entirely.
