# Project Roadmap Tab — Implementation Plan

Replaces the placeholder `src/routes/engine.projects.$projectId.roadmap.tsx` with the living strategic map described in the brief. Continues the locked Trust Tai Spine visual baseline (warm-white, navy, electric blue accent, Instrument Serif headings, Inter body, engine-theme cloud-blue chrome). Persistent project shell (`LeftProjectRail`, `ProjectHeaderStrip`, `WorkspaceToolbar`) is already in place — the Roadmap slots into it as a peer of Spine.

## Architecture at a glance

```text
Approved Point A/B (engine_spine_field_truth)
        │
        ▼
Roadmap read model  ── getProjectRoadmap (server fn)
        │           ── composed from: engine_projects, engine_milestones,
        │              engine_project_dates, engine_project_frames/mockups/
        │              build_packets/qa_*, engine_roadmap_versions,
        │              engine_review_items, engine_activity, family links
        ▼
Roadmap view model  ── deriveRoadmapView (pure)
        │           ── phases, critical path, health, gaps, captain brief
        ▼
Roadmap route  ─── Header ─ Summary strip ─ Journey band
               ─── View switch (Timeline / Table / Journey)
               ─── Right rail (Captain, Critical Path, Approvals, Health)
```

Every visible state is backed by durable records. Drafts render as drafts; only the approved baseline (`engine_roadmap_versions.status = 'approved'` and latest) unlocks operational readiness.

## Data model decisions

- **No new tables in this sprint.** Phases are a derived concept: `engine_milestones.phase` (existing string) groups milestones; phase order, outcome, and rationale live inside the current approved `engine_roadmap_versions.payload.phases[]`. If a project has no version payload, phases fall back to distinct `phase` values sorted by earliest milestone start.
- **Phase metadata (outcome, rationale, health, client-safe summary)** is read from the version payload where present, and left blank / "Not configured" otherwise — never inferred.
- **Dependencies** read from `engine_milestones.dependencies` (jsonb array of milestone ids) plus family links (`engine_projects.parent_project_id`) for cross-project edges.
- **Critical path** is computed in the pure view module using longest-duration path through the milestone DAG on due dates.
- **A `phases` table + `roadmap_change_requests` table are deferred** to `.orchestrator/PENDING_MIGRATIONS.md` (see §Pending migrations). This sprint uses payload-embedded phase metadata and reuses `engine_review_items` for change requests so nothing ships blocked on schema.

## Files to add

Server / read model
- `src/lib/roadmap-view.ts` — pure module: `deriveRoadmapView(inputs) -> RoadmapView` (phases, milestones, dependencies, criticalPath, health, missingForApproval, captainBrief scaffold, changeSummary vs prior version). Fully unit-testable.
- `src/lib/roadmap-view.test.ts` — covers: phase grouping fallback, gate ordering, blocked-upstream propagation, critical path selection, draft vs approved separation, parent/child aggregation, version diff (added/modified/removed/resequenced/date/dep/outcome).
- `src/lib/engine-roadmap.functions.ts`
  - `getProjectRoadmap({ projectId, versionId? })` — auth via `requireSupabaseAuth`, role-gated with `hasRoleForEmail`. Returns `{ project, version, phases, milestones, dependencies, criticalPath, health, captainBrief, changeSummary, family, permissions }`.
  - `listRoadmapVersions({ projectId })`.
  - `compareRoadmapVersions({ projectId, fromId, toId })` — diff via `roadmap-view` helpers.
  - `submitRoadmapChangeRequest({ projectId, payload })` — writes an `engine_review_items` row typed `roadmap_change_request` with impact snapshot; uses `insertEngineActivity`.
  - `askCaptainRoadmap({ projectId, question })` — thin wrapper over `callLovableAi` seeded with the read-model summary and the canonical questions from §6.
- `src/lib/engine-roadmap-captain.server.ts` — prompt assembly + JSON parsing.

Route + UI (roadmap tab lives under project shell, so header identity/toolbar are already provided)
- `src/routes/engine.projects.$projectId.roadmap.tsx` — replaces the current placeholder. Loads roadmap via `useServerFn` + `useQuery`; renders states: `no-truth` (empty guided), `draft`, `approved`, `error`, `stale-version`.
- `src/components/engine/roadmap/RoadmapHeader.tsx` — left: title, tagline, version chip (`Baseline v1.2 · Approved`), current phase, last change; right: Add Milestone, Ask Captain, Compare Versions, Filters, More menu (Edit phases, Sequencing, Manage dates, Investment, Generate brief, Publish client-safe, Archive version).
- `src/components/engine/roadmap/RoadmapSummaryStrip.tsx` — 8 restrained cells per §7.
- `src/components/engine/roadmap/StrategicJourneyBand.tsx` — Point A → phases → Point B, selecting a phase filters the active view.
- `src/components/engine/roadmap/RoadmapViewSwitch.tsx` — Timeline / Table / Journey; default rule: Journey if no active work yet, Timeline once phases have active milestones.
- `src/components/engine/roadmap/RoadmapTimeline.tsx` — phase rows, milestone cards, today marker, week/month/quarter zoom, fit / jump-to-today, subtle SVG dependency connectors, subtle critical-path highlight. Drag only when `permissions.can_edit_dates`.
- `src/components/engine/roadmap/RoadmapTable.tsx` — canonical columns from §24, row opens milestone workspace.
- `src/components/engine/roadmap/RoadmapJourney.tsx` — editorial phase-by-phase story (Instrument Serif headers).
- `src/components/engine/roadmap/MilestoneCard.tsx` — single card used by timeline; readiness chips (Criteria / Mockups / Build / QA) from `milestone-readiness-evaluator`. Quick actions menu per §12; actions respect `permissions` and readiness gates.
- `src/components/engine/roadmap/DependencyLayer.tsx` — SVG overlay, hover to reveal dependency detail popover.
- `src/components/engine/roadmap/CriticalPathPanel.tsx`, `RoadmapCaptainBrief.tsx`, `RoadmapHealthPanel.tsx`, `RoadmapApprovalsPanel.tsx` — right-rail cards; rail is sticky (same pattern as Spine right rail).
- `src/components/engine/roadmap/CompareVersionsDialog.tsx` — diff list (Added / Modified / Removed / Resequenced / Date changed / Dependency changed / Outcome changed) with rationale + approver.
- `src/components/engine/roadmap/ChangeRequestDialog.tsx` — request form (reason, urgency, scope/date/cost impact, affected milestones, Captain recommendation preview).
- `src/components/engine/roadmap/RoadmapFilters.tsx` — restrained filter menu per §22.
- `src/components/engine/roadmap/RoadmapEmptyStates.tsx` — no-truth, draft-generating, error.
- `src/components/engine/roadmap/FamilyRoadmapTracks.tsx` — parent view with child tracks + cross-project dependency chips; child view shows parent objective banner.

Tokens
- Extend `src/styles.css` (engine-theme scope only) with roadmap-specific tokens: `--roadmap-critical`, `--roadmap-blocked`, `--roadmap-active`, `--roadmap-planned`, `--roadmap-complete`, `--roadmap-today`, `--roadmap-dependency` — all mapped to existing Trust Tai palette (navy, electric blue, quiet reds/ambers/greens). No new colors introduced globally.

## Files to change

- `src/routes/engine.projects.$projectId.roadmap.tsx` — replace placeholder body.
- `src/components/engine/WorkspaceHeader.tsx` — `More` menu dispatches new events (`roadmap:add-milestone`, `roadmap:compare-versions`, `roadmap:publish-client-safe`, etc.) so Roadmap-scoped actions surface from the persistent toolbar when the tab is active.
- `src/components/engine/LeftProjectRail.tsx` — no structural change; verify Roadmap remains selected across sub-states.
- `src/lib/engine-activity.ts` — reuse existing `insertEngineActivity`; add new event kinds: `roadmap.view_opened`, `roadmap.milestone_opened`, `roadmap.change_requested`, `roadmap.version_compared`, `roadmap.client_export_attempted`.

## Interconnection with the rest of the system

- **Spine → Roadmap**: `deriveRoadmapView` refuses to promote past `draft` unless `getProjectSpine` reports Point A and Point B as `approved_truth`. The no-truth empty state deep-links back to Spine (`#point-a`, `#point-b`).
- **Roadmap → Milestone workspace**: `MilestoneCard` and table rows link to `engine.projects.$projectId.milestones.$milestoneId` (already exists via `MilestoneTabs`). Readiness chips deep-link to Brief / Plan / Mockups / Build / QA / History tabs.
- **Roadmap → Work / QA & Delivery**: Only milestones under the approved baseline appear as actionable in Work and QA rooms — enforced in the read model, not the UI.
- **Roadmap → Client View**: `roadmap-publish.buildClientSafePayload` already exists; the Publish action opens `CompareVersionsDialog` first, then routes through the existing approval ceremony.
- **Roadmap ↔ Captain**: `askCaptainRoadmap` accepts the canonical §6 questions as one-tap chips inside `RoadmapCaptainBrief`; answers persist as chat events on the existing project chat thread so the Ask Captain modal already restores them.
- **Roadmap ↔ Family**: parent/child projects share the version diff and dependency layer via `FamilyRoadmapTracks`.

## Permissions

Server function returns a `permissions` object driven by `hasRoleForEmail`:
- Tai/Admin: `can_approve_baseline`, `can_edit_phases`, `can_publish_client_safe`, `can_override_dates`.
- Operator: `can_draft`, `can_add_milestone`, `can_adjust_dates_within_authority`, `can_submit_change_request`.
- Agent: read + propose only; UI hides mutation controls.
- Client: never sees this route (already gated by `_authenticated` + engine role).

## States covered (§29–30, §33 QA scenarios)

`no-truth`, `draft`, `draft-generating`, `approved`, `error`, `stale-version`, `dependency-conflict`, `client-export-blocked` — each rendered by dedicated components in `RoadmapEmptyStates.tsx` / inline banners. Reload prompt fires when `getProjectRoadmap` returns a `version.updated_at` newer than the one the client mounted with.

## Pending migrations (write to `.orchestrator/PENDING_MIGRATIONS.md`, do not apply)

1. `engine_roadmap_phases` — first-class phase records (id, project_id, order, name, outcome, rationale, status, health, client_safe_summary, date_range, owner). Migrates existing payload phases.
2. `engine_roadmap_change_requests` — dedicated table with impact snapshot, approvers, resolution; supersedes the `engine_review_items` overload.
3. `engine_milestone_dependencies` — normalized edges (from_milestone_id, to_milestone_id, type, status, risk) to replace the jsonb blob; enables efficient cycle detection.

## Voice + design guardrails

- Instrument Serif only on major headings and journey moments; Inter for everything else.
- Sentence case throughout, no em-dashes, no "leverage", no exclamation points, quiet status colors.
- No Gantt-chart chrome, no dense PM grids, no percentage-without-context, no cream (engine-theme cloud-blue only).
- Right rail sticky using the same pattern as Spine.

## Verification

- `vitest run src/lib/roadmap-view.test.ts` — pure logic (phases, gates, critical path, diff).
- `tsgo` typecheck on all new files.
- Playwright smoke against a real project (`cakepro`): opens `/engine/projects/:id/roadmap`, asserts Journey band renders phases from `engine_roadmap_versions`, Timeline shows milestones from `engine_milestones` with readiness chips matching `milestone-readiness-evaluator`, Compare Versions dialog opens with a real prior version, Ask Captain returns a Captain Brief. Screenshots at 1280×1800 for Journey, Timeline, Table, no-truth empty state, draft state, compare dialog.
- Manual pass through the 10 canonical QA scenarios in §33; capture proof in `.orchestrator/phase-spine2-roadmap-output.md`.

## Out of scope for this sprint (called out to user before build)

- The three schema migrations above (deferred, gated on Tai approval).
- Drag-to-reschedule with automatic version bump — read-only date edits via existing `Manage dates` route until phases table lands.
- Autonomous project-split execution — Captain will *recommend* a split, human confirms in Family view.
