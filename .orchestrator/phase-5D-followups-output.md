# Phase 5D — App-Layer Follow-ups

Delivered on top of the applied family DB migration + existing server fns / staff family route. No schema changes.

## 1. Dependency graph (staff family route)

New: `src/components/engine/FamilyDependencyGraph.tsx`
- SVG DAG (depth = column, DFS row layout).
- Impact preview modes:
  - **Reparent**: pick moved node + candidate parent → subtree recolored amber, old edge dashed grey, dashed royal edge to candidate parent, list of "will change" projects + ripple parents shown below.
  - **Complete**: pick node → ancestors highlighted (rollup recompute), blocking descendants recolored red.
- Node click navigates to that project's overview.
- Wired into `src/routes/engine.projects.$projectId.family.tsx` between the tree and blockers list.

## 2. Portal-safe family route

New: `src/routes/portal.family.tsx`
- Reuses existing `getPortalProjectFamily` (already filters to approved/completed + `client_portal_projects`-linked and aggregates the rest into `hiddenInProgressCount`).
- Renders visible related projects with status pill + sub-project progress bar.
- Aggregated impact summary ("N workstreams still in progress") — never names in-progress relatives.
- `noindex` head; route reachable at `/portal/family`.

## 3. Chat-context integration + family-surface actions

- `src/lib/engine-chat-context.server.ts` — extended `family` block with `shortcuts`:
  - `open_family_route` URL, create/reparent hints, and `available_actions` array (`family.create_child`, `family.reparent`) with surface labels the chat model can reference.
- `src/routes/engine.projects.$projectId.family.tsx` — added a per-row "chat" link so operators can pivot from any family node into that project's chat, closing the loop between family surface and Captain chat context.
- Kept existing `+ child` / `move` per-node dialogs; no new proposal type introduced (would require deeper changes to `ChatProposalRow`, `executeChatAction`, and the model prompt — out of the current scope).

## 4. Audit log for create/reparent

`src/lib/engine-project-family.functions.ts`:
- `createChildProject` now inserts two `engine_audit_log` rows (one on child, one on parent) with `action='family.create_child'`, `actor_email`, `target_id`, `affected_modules=['family','rollups']`, and metadata `{ old_parent_id, new_parent_id, subtree_ids, child_name, parent_name }`.
- `reparentProject` snapshots the subtree with `fetchFamilySubtree` **before** the move, then writes audit rows on the moved project, the old parent (if any), and the new parent (if any). Metadata includes `subtree_ids`, `subtree_size`, and both parent ids; `field_changed='parent_project_id'` with `old_value`/`new_value` populated.

## Verification

- `bunx tsgo` clean.
- Route tree regenerated (`src/routeTree.gen.ts`) picks up `portal.family` on next dev run.


---

**QA verified 2026-07-14.** See `.orchestrator/qa/phase-5D-smoke-output.md` — 7/7 DB guards + 3/3 app-layer guards PASS. Phase 5D closed.
