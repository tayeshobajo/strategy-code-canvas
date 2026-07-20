# Roadmap Studio — Sprint 1 (Phases 1–2)

Ship the systems-thinking canvas as a full-screen mode launched from the existing Roadmap tab. React Flow drives interaction only; milestone truth, dependencies, phases, versions, and approvals stay in the Roadmap Engine's server-owned records. Design matches the reference screenshot and the locked Trust Tai tokens — no default React Flow styling.

## Scope this sprint

Phase 1 — Read-only journey canvas
- Point A / Point B nodes, phase lanes, milestone nodes, sequence + dependency edges, pan/zoom/fit, minimap, current-position marker, milestone inspector, connection inspector, phase inspector, left component/template rail, top toolbar.

Phase 2 — Editing
- Drag/reorder within and across phase lanes, connection creation, undo/redo, autosave of canvas state, keyboard multiselect/move, grouping, freeform vs structured layout toggle.
- Material moves (cross-phase, dependency-breaking, date-shifting) surface an impact confirmation and, if confirmed, create a draft `engine_roadmap_versions` amendment rather than mutating the approved baseline.

Explicitly out of scope for this sprint (later phases in the brief): dependency validation engine + circular detection (Phase 3), Captain intelligence layer (Phase 5), Systems Map / durable assets overlays (Phase 6), collaboration/comments/presence (Phase 7), client-safe Studio publish surface (Phase 8). Existing client-safe publish flow on the Roadmap tab stays unchanged.

## Route + entry

- Keep `/engine/projects/$projectId/roadmap` intact (list, approvals, export, compare).
- Add sub-route `src/routes/engine.projects.$projectId.roadmap.studio.tsx` → URL `/engine/projects/$id/roadmap/studio`.
- Add an **Open Studio** button in the Roadmap tab header that navigates to the sub-route.
- Studio renders full-viewport (hides the standard project chrome via a `chrome=false` layout flag on the left rail parent, or a dedicated shell wrapper).
- **Back to Project Spine** returns to `/engine/projects/$id/spine`.

## Canvas foundation

- Add dep: `@xyflow/react`.
- Custom node types: `pointA`, `pointB`, `phase` (container/lane), `milestone`, `decision`, `note`, `group`, `childProject`.
- Custom edge types: `sequence`, `dependency`, `optional` (styles per legend in reference).
- Controls: pan, zoom, fit-to-view, minimap, zoom slider, keyboard nudge/multiselect, undo/redo stack (client-side ring buffer of canvas states, capped).
- Structured mode auto-lays out milestones into phase lanes using sequence + phase_id. Freeform mode respects saved x/y and skips auto-layout on drag.
- All styling via Trust Tai tokens already in `src/styles.css` — no default `@xyflow/react` CSS beyond the base reset. Nodes rendered as existing shadcn/Trust Tai cards.

## Data model

React Flow owns viewport, selection, and transient positions. Server owns everything else.

New table `engine_project_roadmap_canvas` (one row per project, extensible per version later):
- `project_id uuid pk fk engine_projects`
- `version_id uuid null fk engine_roadmap_versions` (null = current working canvas)
- `layout_mode text default 'structured'` check in ('structured','freeform')
- `viewport jsonb default '{"x":0,"y":0,"zoom":1}'`
- `node_positions jsonb default '{}'` — map of `milestone_id | 'point_a' | 'point_b' | phase_id → {x,y,w,h}`
- `notes jsonb default '[]'`, `groups jsonb default '[]'`, `decisions jsonb default '[]'`
- `current_position_node_id text null`
- `updated_at timestamptz default now()`, `updated_by_email text`

Grants + RLS: `authenticated` select/insert/update where caller has operator/admin via `has_role`; `service_role` all.

No changes to `engine_milestones`, `engine_roadmap_versions`, phase_id, or dependency storage — the Studio reads them and only writes back through existing governed RPCs.

Migration goes to `.orchestrator/PENDING_MIGRATIONS.md` per repo rule; no autonomous schema apply.

## Server functions (new — `src/lib/engine-roadmap-studio.functions.ts`)

All `requireSupabaseAuth` + operator/admin check:
- `getRoadmapCanvas({ projectId, versionId? })` → returns `{ nodes, edges, viewport, layoutMode, canEdit }` composed from spine (Point A/B), phases, milestones (with phase_id, sequence, dependencies, status, health, owner, due_date, gate, unlocks), plus persisted `node_positions`, `notes`, `groups`. Falls back to computed positions when no saved position exists.
- `saveRoadmapCanvasLayout({ projectId, viewport?, layoutMode?, nodePositions?, notes?, groups? })` — upserts the canvas row; non-material only.
- `moveMilestone({ projectId, milestoneId, toPhaseId, newSequence })` — routes through existing `admin_edit_milestone_governed` RPC (same pattern used in `engine-milestone-ai-draft.functions.ts`) so the `engine_milestones_require_proposal` trigger doesn't silently drop the write. Records `engine_activity`.
- `createDependency({ projectId, fromMilestoneId, toMilestoneId, kind })` / `deleteDependency(...)` — governed writes to the existing dependency array on `engine_milestones`.
- `startDraftAmendment({ projectId, baseVersionId, reason })` — clones the current approved `engine_roadmap_versions` row into a draft; subsequent material moves in the Studio apply to that draft version. Reuses existing amendment logic in `engine-roadmap-amendments.functions.ts` where possible.

Materiality classifier (client + server):
- Non-material: reorder within a phase without changing dependencies, viewport, notes, layout mode, freeform position nudges.
- Material: cross-phase move, dependency add/remove, sequence change that affects critical path, due-date shift. Material actions open the **Impact confirmation** modal and create/append a draft amendment on confirm; approved baseline is never mutated.

## Components (new — `src/components/engine/roadmap/studio/`)

- `RoadmapStudioShell.tsx` — full-viewport layout (top toolbar, left rail, canvas, right inspector, bottom overview strip).
- `StudioTopBar.tsx` — Back, title, version pill + status, view switch (Journey / Timeline / Systems Map placeholders — Journey wired; others show "Coming next sprint"), Fit, zoom %, Undo/Redo, Filters, Compare, Share, Save Draft split-button, autosave indicator.
- `StudioLeftRail.tsx` — "Add to canvas" primitives (Milestone, Phase, Decision, Outcome, Connection, Note, Group, Child Project), Templates list, Overview minimap.
- `StudioCanvas.tsx` — React Flow wrapper; wires node/edge types, drag handlers, connect handler, undo/redo, autosave debounce (1s), keyboard shortcuts.
- Nodes: `PointNode.tsx` (A/B), `PhaseLaneNode.tsx`, `MilestoneNode.tsx` (collapsed card matching reference — title, outcome one-liner, status chip, owner avatars, dependency indicator, child-project indicator, gate dot), `DecisionNode.tsx`, `NoteNode.tsx`, `ChildProjectNode.tsx`.
- Edges: `SequenceEdge.tsx`, `DependencyEdge.tsx`, `OptionalEdge.tsx` — solid / dotted / dashed per legend, colored by phase lane.
- `StudioInspector.tsx` — right panel. Renders `MilestoneInspector`, `PhaseInspector`, `ConnectionInspector`, or default project-health summary when nothing is selected. Milestone inspector shows Strategic role, Outcome, Unlocks, Execution (gate, readiness, owner, due, health), Dependencies, Description, Artifacts, and CTA **Open Milestone Workspace** → existing milestone route.
- `ImpactConfirmModal.tsx` — lists affected milestones, dependency impact, date impact, recommends Cancel vs "Move anyway and create amendment".
- `BottomOverviewStrip.tsx` — the horizontal chip strip in the reference (Point A → phases/milestones → Point B), reflects current selection.

## Behavior details

- Autosave: debounce viewport + positions + notes/groups to `saveRoadmapCanvasLayout`. Toast on failure, retry.
- Undo/redo: local snapshot stack (max ~50 states). Cross-session persistence is out of scope.
- Freeform mode: disables auto-layout, keeps drag; toggling back to Structured re-runs layout and confirms before overwriting freeform positions.
- Filters: client-side visibility toggles (phase, status, health, owner, blocked-only, critical-path, client-visible). Filters dim non-matching nodes rather than removing them, preserving journey context.
- Empty states: no milestones → CTA to Approve Point A/B + Strategic Thesis and Run AI PM (link to Spine / Approvals rooms). Draft-generating state.
- Responsive: desktop primary. Tablet collapses inspector to drawer. Mobile shows read-only journey strip + inspector — editing disabled with hint.
- Accessibility: keyboard pan/zoom, arrow-key node move, focus rings via existing tokens, node aria-labels announce name + status.

## Files touched / added

Added:
- `src/routes/engine.projects.$projectId.roadmap.studio.tsx`
- `src/lib/engine-roadmap-studio.functions.ts`
- `src/lib/roadmap-studio-layout.ts` (pure helper: computes structured positions from phases + milestones + sequence)
- `src/components/engine/roadmap/studio/*` (files listed above)
- `.orchestrator/PENDING_MIGRATIONS.md` entry for `engine_project_roadmap_canvas`
- `.orchestrator/phase-studio-1-output.md` after ship

Modified:
- `src/routes/engine.projects.$projectId.roadmap.tsx` — add **Open Studio** button in the header; no other behavior change.
- `package.json` — add `@xyflow/react`.
- `src/styles.css` — add Studio-scoped tokens (lane background, edge colors per phase, node shadow) reusing existing Trust Tai variables.

Unchanged: existing approve/compare/publish/export flows on the Roadmap tab, `engine_milestones` schema, spine/readiness logic, portal.

## Acceptance criteria (this sprint)

- Opening `/engine/projects/$id/roadmap/studio` on cakepro renders Point A, Point B, all approved phases as lanes, all 21 milestones as nodes, and dependency edges — matching the reference visual language.
- Pan/zoom/fit/minimap/undo-redo/keyboard nudge all work; viewport and node positions persist across reloads.
- Dragging a milestone within its phase saves silently; dragging across a phase opens the Impact modal and, on confirm, writes to a draft amendment version — approved baseline unchanged.
- Creating a dependency edge between two milestones persists via governed RPC and shows immediately.
- Milestone inspector renders live data and links to the milestone workspace.
- Structured ↔ Freeform toggle works; freeform positions survive reload.
- No default React Flow theme visible; every visual element uses Trust Tai tokens.
- Existing Roadmap tab, portal roadmap, and approvals flows still pass their existing tests.

## Notes / constraints honored

- Schema migration is written to `.orchestrator/PENDING_MIGRATIONS.md` — not applied autonomously.
- Milestone writes go through `admin_edit_milestone_governed` (proven pattern in `engine-milestone-ai-draft.functions.ts`) to avoid the silent `engine_milestones_require_proposal` trigger drop.
- Second-reviewer rule already removed globally — Studio approve/amendment flow relies only on role checks.
- Post-ship: run existing vitest + `tests/e2e/self-approval-ceremony.spec.ts` and add a Playwright smoke that opens the Studio, drags a milestone across a phase, and asserts the amendment row appears.
