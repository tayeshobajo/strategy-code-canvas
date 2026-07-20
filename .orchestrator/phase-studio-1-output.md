# Roadmap Studio — Sprint 1 output

Ship of Phases 1–2 (read-only + editing scaffold) per the approved plan.

## What shipped

**Route:** `/engine/projects/$id/roadmap/studio` (`src/routes/engine.projects.$projectId.roadmap.studio.tsx`)
- Full-viewport shell, own head() with `noindex`.
- Loads via existing `getProjectRoadmap` server fn — no new read fn required this sprint.
- Empty states for `no_truth` and `draft_generating` link back to Spine.

**Entry point:** Roadmap tab header now has `Open Studio` button (`src/routes/engine.projects.$projectId.roadmap.tsx` around header actions).

**Canvas (React Flow, `@xyflow/react`):**
- Custom Trust Tai nodes: `pointA`, `pointB`, `phaseHeader`, `milestone` — no default RF styling; every visual is Trust Tai tokens.
- Sequence edges (solid, phase-tinted) walk Point A → milestones → Point B.
- Dependency edges (dashed, red on blocked / amber on at-risk).
- Pan, zoom, fit-to-view, controls, minimap (in the left rail), background dots.
- Undo/redo ring buffer (client-side, capped 50).
- Drag milestones anywhere; cross-phase drop surfaces the amendment warning (in-memory this sprint).
- `onConnect` adds dependency edge locally; surfaces the "persistence pending" note.

**Chrome components (`src/components/engine/roadmap/studio/`):**
- `RoadmapStudioShell.tsx` — layout + state.
- `StudioTopBar.tsx` — back link, version pill, view switcher (Journey wired, others disabled with tooltip), fit / zoom / undo / redo / filters / compare / share / save / draft indicator.
- `StudioLeftRail.tsx` — Add-to-canvas primitives + Templates + Overview minimap. Primitives are visible but disabled with "unlocks after canvas migration" tooltip.
- `StudioInspector.tsx` — milestone / phase / point inspectors; milestone inspector shows strategic role, unlocks, execution table (gate, readiness, owner, due, health), dependencies, and `Open Milestone Workspace` CTA linking to the existing milestone brief route.
- `BottomOverviewStrip.tsx` — horizontal chip strip Point A → milestones → Point B, clickable to focus.
- `nodes.tsx` — three custom node types.

**Layout helper:** `src/lib/roadmap-studio-layout.ts` — pure structured-layout math + shared phase palette (6 colors), zero React or DB.

**Docs:**
- Migration written to `.orchestrator/PENDING_MIGRATIONS.md` under "Roadmap Studio — canvas position persistence (Studio Sprint 1)" — **not applied autonomously** per CLAUDE.md rule.
- Package: added `@xyflow/react@12.11.2`.

## Deferred to a follow-up sprint

Everything that requires the pending migration or a server write path:
- `saveRoadmapCanvasLayout`, `moveMilestone`, `createDependency`, `startDraftAmendment` server fns.
- Persistence of viewport / positions / notes / groups / freeform mode across reloads.
- Impact-confirmation modal wired to real amendment creation.
- Filters actually applying dim overlay (button rendered but disabled).
- Templates seeding structure (buttons rendered but disabled).
- Systems Map, Timeline, Client Preview views.

## Verification

- `bunx tsgo --noEmit` — clean.
- Existing Roadmap tab, portal roadmap, spine flows untouched.
- No changes to `engine_milestones`, `engine_roadmap_versions`, second-reviewer rule, or approval logic.
