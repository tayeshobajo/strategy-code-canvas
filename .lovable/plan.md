# Phase 5 — Multi-Solution / Parent-Child Project Decomposition

New phase, not currently in `doctrine/ROADMAP_ENGINE_PHASE_MAP.md`. Adds project→sub-project hierarchy with **full governance parity**: children carry their own Spine, ceremonies, roadmap, approval gates, and portal boundary, and the parent aggregates them.

## Rationale

Some engagements are one distinct product; others fan into several workstreams that each need their own Point A/B, roadmap, and delivery, but roll up to a single client-visible engagement. Today `engine_projects` is flat and has no parent link, so multi-workstream engagements are modeled as either one over-stuffed project or several unrelated ones — neither preserves aggregation or shared context.

## Doctrine addition (written first)

Add **Phase 5D — Multi-Project Decomposition** to `doctrine/ROADMAP_ENGINE_PHASE_MAP.md` with:
- Definition, invariants (below), governance rules, out-of-scope items.
- Explicit statement that children inherit all G1/G2 gates, ceremonies, portal boundary from Phase 4 hardening.
- Note that this does not implement milestone-level or Spine-point decomposition (separate future phases).

## Invariants

1. A project is exactly one of: `standalone` (default), `parent`, or `child`.
2. A `child` MUST have `parent_project_id`; a `parent`/`standalone` MUST NOT.
3. Parent and its children share the same `client_id` — enforced by trigger.
4. Max depth = 1 (no grandchildren). Enforced by trigger.
5. Every child has its own Spine, ceremonies, roadmap, approval, portal boundary — Phase 4 gates apply unchanged per child.
6. Parent has NO Spine of its own (`point_a`/`point_b` locked empty). Parent status/readiness/publication is derived from children.
7. Parent approval requires all children approved. Parent completion requires all children complete. Enforced by trigger on parent transitions.
8. Portal: child publishes independently to its own portal row; parent publishes a rollup that references child portal rows (never bypasses child gates).
9. Deleting a parent is blocked while children exist; children may be reparented to standalone (admin only, audited).

## Data model changes (migration — pending Tai review, per project rule)

Written to `.orchestrator/PENDING_MIGRATIONS.md`, not applied.

- `engine_projects.parent_project_id uuid NULL REFERENCES engine_projects(id) ON DELETE RESTRICT`
- `engine_projects.project_kind engine_project_kind NOT NULL DEFAULT 'standalone'` (new enum: `standalone|parent|child`)
- Index on `parent_project_id`.
- Triggers:
  - `tg_engine_projects_kind_shape` — enforces kind↔parent_id consistency, same client_id, depth ≤ 1, parent Spine locked empty.
  - Extend existing `engine_projects` approval gate: if kind=`parent`, require `internal_all_children_approved(project_id)`; otherwise unchanged.
  - Extend existing completion gate similarly.
- Helpers (SECURITY DEFINER, service-only): `internal_all_children_approved(uuid)`, `internal_children_ready_summary(uuid)`.
- Portal-safe read view: `engine_project_family_summary` (parent + child readiness/status only, no truth data).
- Backfill: every existing project gets `project_kind='standalone'`. No data at risk.

## App changes (built after migration applies)

Server functions (all under `src/lib/`, use `requireSupabaseAuth` + `has_role` admin/operator check where appropriate):
- `createChildProject({ parentId, name })` — admin/operator only, inserts with kind=child, seeds Spine ceremony.
- `reparentProject({ projectId, newParentId | null })` — admin only, audited to `engine_activity`.
- `getProjectFamily(projectId)` — returns parent + siblings + children with rollup metrics.
- Extend `getWorkspaceProjectList` to include kind + parent_id, and group in UI.

UI:
- **Workspace project list** (`src/routes/engine.projects.tsx` or admin equivalent): tree/grouped rendering — parent row expandable to children strip. Standalone rows unchanged.
- **Project header** (`WorkspaceHeader`): if child, breadcrumb chip linking to parent; if parent, small "N children" badge linking to family view.
- **New route** `src/routes/engine/$projectId/family.tsx`: parent-only view showing each child's kind, current step, readiness, approval state, portal publish state, blockers — read-only aggregation.
- **Create-child CTA** on parent's family view; disabled for standalone/child.
- Spine/roadmap/delivery routes: no visual change, but hide "Spine" nav on parent (locked-empty) and show family view instead.

Chat / agent context:
- `engine-chat-context.server.ts`: when project is child, prepend one-line parent summary; when parent, list child summaries. No cross-project truth leakage — summaries use `engine_project_family_summary` only.

Governance smoke harness (extension of `supabase/tests/spine-gate-smoke.sql`):
- Case N: child approval works independently.
- Case O: parent approval blocked while any child un-approved.
- Case P: parent approval succeeds once all children approved.
- Case Q: reparent audited; standalone→child transition adds required ceremony.
- Case R: deleting parent with children fails; deleting child succeeds.

## Rollout order

1. Write doctrine Phase 5D entry.
2. Write migration to `.orchestrator/PENDING_MIGRATIONS.md` (do NOT apply). Include the 5 smoke cases (N–R) in the harness file.
3. Wait for Tai review + apply.
4. Run smoke harness; require SMOKE PASS.
5. Build server functions.
6. Build UI (list grouping → header chip → family route → create-child CTA).
7. Extend chat context.
8. Update `.orchestrator/BUILD_STATE.md` and write `.orchestrator/phase-5d-output.md`.

## Explicitly out of scope

- Milestone-level parent/child decomposition (would be Phase 5E).
- Solution-variant modeling on `engine_milestone_solutions` (would be Phase 5F).
- Cross-child dependency graphs (sequencing constraints between children) — future phase.
- Depth > 1 hierarchies.
- Automatic child creation by AI (parent creates children only via admin CTA in this phase; AI can propose via chat proposals but does not commit).

## Deliverables checklist

- [ ] Doctrine Phase 5D section committed.
- [ ] Migration + N–R smoke cases in `.orchestrator/PENDING_MIGRATIONS.md`.
- [ ] SMOKE PASS after apply.
- [ ] 3 server fns + list/header/family UI + create-child CTA.
- [ ] Chat context extended.
- [ ] BUILD_STATE + phase-5d-output written.
