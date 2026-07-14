# Phase 5D App-Layer Follow-ups

Four scoped additions on top of the applied family server fns + staff family route. All app-layer only — no schema changes. Any DB requirement gets written to `.orchestrator/PENDING_MIGRATIONS.md` rather than applied.

## 1. Dependency graph on the staff family route

Enhance `src/routes/engine.projects.$projectId.family.tsx` with a visual DAG panel above the existing "Impact & blockers" list.

- New pure component `src/components/engine/FamilyDependencyGraph.tsx`
  - SVG layered layout (depth = column, siblings stacked vertically) built from the existing `getFamilyImpact` payload — no new server call.
  - Draws nodes for every family member with status pill color; edges = parent→child.
  - Impact preview modes driven by local state:
    - **Reparent preview**: pick a node + candidate new parent → recolor moved subtree amber, gray out old edge, draw dashed edge to new parent, and list "will change" nodes (the moved subtree + its old + new parent for rollup recompute).
    - **Complete preview**: pick a node → highlight every ancestor whose completion rollup would be affected, and every not-yet-approved/completed descendant marked as a blocker.
  - No mutations from the graph itself; buttons open the same create/reparent dialogs already in the route.
- Impact summary text stays; graph is the primary affordance.

## 2. Portal-safe family route + UI

Portal-side surface that reuses the existing `getPortalProjectFamily` server fn (already filters to `approved`/`completed` + published nodes and returns `hiddenInProgressCount`).

- New route: `src/routes/portal.projects.$portalProjectId.family.tsx`
  - Renders under portal shell (`PortalPage`) — read-only.
  - Tree of visible relatives (name, status pill, completed date, child progress bar).
  - Impact summary block: "N related workstreams in progress" (aggregated count, never names).
  - Link entry from the portal roadmap header ("View related projects") on portal project pages.
- Small nav addition in `src/components/portal/PortalPage.tsx` header when the portal project has family (probe via the same fn, cached by react-query).

## 3. Chat-context actions: create child / reparent from chat

Wire Captain chat proposals so operator can propose family mutations inline.

- Extend the proposal type union in `src/components/engine/chat/ProposalCard.tsx` (and its parent handler) to recognise two new `proposal_type` values written by the model:
  - `family_create_child` → payload `{ parent_project_id, name, project_kind?, delivery_mode? }`
  - `family_reparent` → payload `{ project_id, new_parent_id | null }`
- Approve action calls the existing `createChildProject` / `reparentProject` server fns; reject writes an `engine_project_chat_events` row like other proposal types.
- Expose those two actions to the model by adding entries to the chat action registry (already file-based per prior phases — extend `src/lib/engine-chat-actions.server.ts` or equivalent; if that file doesn't exist yet, add the mapping in `engine-chat-context.server.ts`'s `available_actions` block).
- No new tables. Proposals continue to live in `engine_project_chat_proposals`.

## 4. Audit log for create/reparent

Both server fns already insert `engine_activity` rows. Add a durable audit trail entry in `engine_audit_log` (the same table `buildProjectChatContext` reads).

- In `src/lib/engine-project-family.functions.ts`:
  - After successful insert/update, write one row per action to `engine_audit_log`:
    - `action`: `family.create_child` or `family.reparent`
    - `actor_email`: from `context.claims.email`
    - `project_id`: the mutated project (child for create, moved project for reparent)
    - `summary`: human-readable — includes parent name(s), the moved-subtree size (computed from `fetchFamilySubtree` before mutation for reparent), and old/new parent ids
    - `payload` (jsonb, if the column exists): `{ subtree_ids: [...], old_parent_id, new_parent_id }`
- If `engine_audit_log` lacks any required column (checked via `security--get_table_schema` before writing code), the missing column is added to `.orchestrator/PENDING_MIGRATIONS.md` — audit insert falls back to writing available columns only, never blocks the mutation.

## Verification

- `bunx tsgo` clean.
- Manual smoke via preview: create + reparent from workspace, view dependency graph highlights, load portal family route as a portal test user (LOVABLE_BROWSER_AUTH_STATUS permitting), confirm audit rows via a psql select.
- Update `.orchestrator/phase-5D-app-output.md` with what changed.

## Out of scope

- Schema changes (any needed column goes to `PENDING_MIGRATIONS.md`).
- Cross-client reparent / bulk moves.
- Portal write actions on the family route.
- Adding new chat model prompt copy — only the action registry + proposal handling.

## Technical notes

- Graph layout is hand-rolled SVG (no new deps); nodes positioned via `depth * COL_W`, siblings stacked by index.
- Portal route uses `useSuspenseQuery` + a `queryOptions` block, following the same pattern as the staff family route.
- All chat-action mutations go through the existing `requireSupabaseAuth` middleware — no new auth surface.
