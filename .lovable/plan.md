# Phase 5D — App Layer Build Plan

DB layer (parent_project_id, guards, `engine_project_family_summary` view) is applied. This plan builds the app on top.

## 1. Server functions — `src/lib/engine-project-family.functions.ts` (new)

All auth-gated via `requireSupabaseAuth` + `hasRoleForEmail` (staff only for mutations).

- **`createChildProject({ parentProjectId, name, clientId?, kind?, initialSpine? })`**
  - Verifies caller is staff and parent exists.
  - Inserts new row in `engine_projects` with `parent_project_id = parentProjectId`, inheriting `client_id` unless overridden.
  - Writes `engine_activity` entry `child_project.created` on both parent and child.
  - Returns `{ childId }`.

- **`reparentProject({ projectId, newParentId | null })`**
  - Staff only. Rejects if:
    - project is itself already `approved`/`completed` (frozen child-set on old parent),
    - move would create a cycle (walk ancestry of `newParentId`),
    - new parent is `approved`/`completed` (frozen child-set on new parent),
    - `client_id` mismatch with new parent (cross-client reparent forbidden).
  - Updates `parent_project_id`; logs `engine_activity` `child_project.reparented` with `{ from, to }` on old parent, new parent, and child.

- **`getProjectFamily({ projectId, includeArchived? })`**
  - Reads `engine_project_family_summary` for the root of `projectId`'s family (walk up to root, then fetch subtree).
  - Returns `{ root, nodes: [{ id, name, status, parent_project_id, child_count, approved_child_count, completed_child_count, client_id, updated_at }], edges }`.
  - Staff variant: full data. Called by workspace + staff chat context.

Splitting rule: keep helpers (cycle walk, subtree fetch) in `engine-project-family.server.ts` and import into the `.functions.ts` (per `tanstack-serverfn-splitting`).

## 2. Workspace UI — family grouping

- **`src/routes/engine.index.tsx`**: augment the project list to group by root family. Roots render as expandable rows; children indent underneath with status pills and progress (`approved_children/total`). Solo projects (no parent, no children) render flat. Query via `getProjectFamily` batched per root, or a new `listStaffFamilies` fn that returns all roots + subtrees for the current staff user.
- **`src/routes/engine.projects.$projectId.tsx`** (project shell): add a "Family" sidebar/nav item + breadcrumb showing ancestry (root › … › current) using `getProjectFamily`. "Add child project" button visible to staff; opens dialog wired to `createChildProject`.

## 3. Staff-only family route

- **New route `src/routes/engine.projects.$projectId.family.tsx`** (staff gate via `hasRoleForEmail` in loader).
  - Full family tree view: hierarchical list with per-node status, Spine completeness, completion counts.
  - Actions: create child (dialog), reparent (drag-select or move dialog calling `reparentProject`), open child.
  - Impact panel (see §5) inline.

## 4. Chat context — staff family surface

- **`src/lib/engine-chat-context.server.ts`**: extend the context builder so when the caller is staff, chat prompts include a `family` block summarizing the project's family (parent name/status, siblings, children with approval/completion counts). Trim to avoid prompt bloat (cap children to N, list rest as count).
- No changes to non-staff/client-facing chat context yet — see §5 for portal surface.

## 5. Portal-safe family surface

- **New `src/lib/portal-family.functions.ts`**: `getPortalProjectFamily({ portalProjectId })`.
  - Uses portal auth (existing `portal.functions.ts` pattern).
  - Reads only projects in the same family with `status IN ('approved','completed')` AND that have an active `client_portal_projects` publication row (client-safe filter).
  - Strips staff-only fields (drafts, internal notes, unpublished milestones). Returns a minimal `{ nodes: [{ id, name, status, completed_at, child_progress }] }`.
- **`src/routes/_authenticated/portal.tsx`** (and portal project detail): render a read-only family panel using this fn. Non-published or in-progress children appear only as an aggregate ("2 workstreams in progress") — never by name/status.

## 6. Cross-project dependencies + impact analysis

Small addition; no new tables required for v1 — reuse `engine_project_dates` / existing links where present. If a dedicated link table is required, it's a schema change and goes to `.orchestrator/PENDING_MIGRATIONS.md` (not applied here).

- **`src/lib/engine-project-impact.functions.ts`**:
  - `getFamilyImpact({ projectId })` — returns for each family node: blocking children (children not yet approved when parent is targeting completion), stale rollups (parent approved but new child added since), and Spine gaps that would block parent completion.
  - `getCrossProjectDependencies({ projectId })` — walks the family and any existing referenced links (e.g. milestone `depends_on`, if present) to surface cross-project blockers.
- Rendered in the family route (§3) as an "Impact" panel: "Approving parent X requires: child A (Spine incomplete), child B (not approved)."
- Wired into `createChildProject` result so the workspace warns "adding a child under an approved parent is blocked" before hitting the DB guard (UX only; DB is source of truth).

## Files touched

Created:
- `src/lib/engine-project-family.functions.ts`
- `src/lib/engine-project-family.server.ts`
- `src/lib/portal-family.functions.ts`
- `src/lib/engine-project-impact.functions.ts`
- `src/routes/engine.projects.$projectId.family.tsx`

Edited:
- `src/routes/engine.index.tsx` (grouping)
- `src/routes/engine.projects.$projectId.tsx` (breadcrumb + add-child)
- `src/routes/_authenticated/portal.tsx` (portal family panel)
- `src/lib/engine-chat-context.server.ts` (staff family block)

## Out of scope (deferred)

- Any new tables or column additions (would go to `PENDING_MIGRATIONS.md`).
- Reparenting across clients (explicitly forbidden).
- Bulk family operations / merges.
- `.orchestrator/phase-5D-app-output.md` written on completion per repo convention.

## Order of build

1. `engine-project-family.{server,functions}.ts` + smoke.
2. Staff family route (§3) — depends on 1.
3. Workspace grouping + breadcrumb (§2).
4. Chat context staff surface (§4).
5. Portal-safe surface (§5).
6. Impact analysis (§6) + wire into family route.

Commit per step: `feat(phase-5D-app): [step]`.
