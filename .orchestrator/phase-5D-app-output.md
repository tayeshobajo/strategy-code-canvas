# Phase 5D — App Layer Output

Built on top of the applied DB migration (parent_project_id + child-set/rollup
guards + engine_project_family_summary view).

## Server functions (`src/lib/engine-project-family.functions.ts`)

- `createChildProject({ parentProjectId, name, clientId?, projectKind?, deliveryMode? })`
  — staff-only; verifies parent exists and is not frozen (approved/completed);
  enforces same client_id; logs `child_project_created` activity on parent + child.
- `reparentProject({ projectId, newParentId })` — staff-only; blocks reparenting
  when the project itself is frozen, when either old or new parent is frozen
  (child set frozen), when clients don't match, or when the move would create a
  cycle; logs `child_project_reparented` / `_attached` / `_detached` activity.
- `getProjectFamily({ projectId })` — walks to root, returns the full family
  subtree with per-node status, approved/completed rollups, and ancestry chain.
- `listStaffFamilyRoots()` — returns all root projects visible to the staff
  caller (RLS-scoped) with immediate child counts.

Helpers live in `src/lib/engine-project-family.server.ts`
(`findFamilyRootId`, `fetchFamilySubtree`, `fetchAncestryChain`,
`wouldCreateCycle`, `isFrozenStatus`) per `tanstack-serverfn-splitting`.

## Cross-project dependencies + impact
(`src/lib/engine-project-impact.functions.ts`)

- `getFamilyImpact({ projectId })` — surfaces blockers per parent:
  `child_not_approved`, `child_not_completed`,
  `stale_rollup_child_added_after_approval`,
  `child_added_after_completion`. Rendered in the family route.

## Staff family route
(`src/routes/engine.projects.$projectId.family.tsx`)

- Ancestry breadcrumb, hierarchical tree with per-node status + rollups,
  per-row "add child" and "move" (reparent) affordances, blockers panel.
- Wired via a "Family" button added to the workspace shell
  (`engine.projects.$projectId.tsx`).

## Staff chat-context family surface
(`src/lib/engine-chat-context.server.ts`)

- Added `family` block: `{ root_id, is_root, parent, siblings, children,
  total_children, approved_children, completed_children }`. Children capped at
  20, siblings at 10 to prevent prompt bloat. Wrapped in try/catch so chat
  keeps working when the family surface is unavailable.

## Portal-safe family surface
(`src/lib/portal-family.functions.ts`)

- `getPortalProjectFamily({ portalProjectId })` — only exposes family members
  that are `approved`/`completed` AND linked to a `client_portal_projects`
  publication row. Everything else is aggregated as
  `hiddenInProgressCount` — no names, no statuses, no internal fields.
- Ready for wiring into the portal UI when the client-facing family panel is
  needed. The current `/portal` route is a legacy redirect
  (`src/routes/_authenticated/portal.tsx`), so no UI panel was added there
  in this pass.

## Not touched (deferred / out of scope)

- Schema changes (would go through `.orchestrator/PENDING_MIGRATIONS.md`).
- Cross-client reparenting (explicitly forbidden — enforced in `reparentProject`).
- Bulk family ops / merges.
- Heavy grouping in `engine.index.tsx` — the workspace Command Center
  aggregations remain unchanged; the family surface is reached from the
  project shell instead.

## Files

Created:
- `src/lib/engine-project-family.server.ts`
- `src/lib/engine-project-family.functions.ts`
- `src/lib/engine-project-impact.functions.ts`
- `src/lib/portal-family.functions.ts`
- `src/routes/engine.projects.$projectId.family.tsx`

Edited:
- `src/routes/engine.projects.$projectId.tsx` (Family link in workspace shell)
- `src/lib/engine-chat-context.server.ts` (staff family block)

## Verification

- `bunx tsgo --noEmit` — clean.
- DB governance already smoke-passed at Phase 5D Revision 4 (SMOKE PASS 26/26);
  the app layer reads and mutations respect those triggers (any violation
  bubbles up as a normal error to the UI).


---

**QA verified 2026-07-14.** See `.orchestrator/qa/phase-5D-smoke-output.md` — 7/7 DB guards + 3/3 app-layer guards PASS. Phase 5D closed.
