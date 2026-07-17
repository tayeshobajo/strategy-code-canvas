# Replace the old Project Spine page

The current `src/routes/engine.projects.$projectId.spine.tsx` is 3762 lines of accumulated waves. It still renders, but it is the "old" page: inconsistent variant flow, hand-derived counts, duplicated section chrome, and hard to change safely. We already have a clean server read model (`getProjectSpine` returns `view.variant`, `view.counts`, `view.sections`, `next_milestone`, `missing_for_client_ready`) and durable inputs (Point A/B status, milestone readiness, spine readiness). This plan swaps the route to a fresh, small implementation built on that read model.

## Goal

One Spine route, driven by the server `view`, that satisfies the five gate points:

1. Understand the project within 10 seconds (header + variant banner + snapshot).
2. Any conclusion traces to its source within 2 clicks (Inspect sources on every truth block).
3. Milestone context visible from acceptance criteria through QA (readiness matrix + next best action).
4. The blocker to the next stage is always named (variant-specific focus card).
5. Client roadmap generates entirely from approved Spine data (Export button preflighted against `missing_for_client_ready`).

## What renders

Header (always)
- Title, variant chip (Incomplete / Active / Client Ready), one-line description
- Actions: Approvals count, Ask Captain, Export Client Roadmap (disabled + reason when preflight fails)

Variant banner (always) — copy driven by `view.variant`

Body (switches on `view.variant`):

- Incomplete: Focus card ("Resolve understanding"), Point A / Point B truth cards, Spine Readiness list (blockers first)
- Active: Snapshot strip (counts), Next Best Action card, Point A / Point B truth cards, Milestone Readiness matrix, Spine Readiness (collapsed), Business Roadmap preview strip, Approvals inline
- Client Ready: Client Roadmap preview strip, Approved Milestones list, Point A / Point B truth cards, Publish status

Every truth card and matrix row keeps its existing "Inspect sources" link (unchanged provenance flow).

## Files

New (small, focused):
- `src/components/engine/spine/SpineHeader.tsx`
- `src/components/engine/spine/VariantBanner.tsx`
- `src/components/engine/spine/FocusCard.tsx`
- `src/components/engine/spine/SnapshotStrip.tsx`
- `src/components/engine/spine/NextBestAction.tsx`
- `src/components/engine/spine/TruthCard.tsx` (Point A / Point B, reused)
- `src/components/engine/spine/MilestoneReadinessMatrix.tsx` (extract existing 10-gate matrix as-is)
- `src/components/engine/spine/SpineReadinessList.tsx` (wrap existing `SpineReadinessPanel`)
- `src/components/engine/spine/RoadmapPreviewStrip.tsx` (Point A → phases → Point B, extract existing)
- `src/components/engine/spine/ApprovedMilestonesList.tsx`

Replaced:
- `src/routes/engine.projects.$projectId.spine.tsx` — reduced to route wiring + a ~150-line component that reads `spine.view.sections` and renders the right pieces per variant.

Untouched:
- `getProjectSpine` and every other server function
- `spine-variant.ts`, `spine-truth-status.ts`, `milestone-readiness-evaluator.ts`, `spine-readiness-evaluator.ts`
- Export Client Roadmap handler + preflight
- Source & Truth Inspector, propose-change flow, activity/audit trail
- Milestone workspace routes, ProjectTabs, WorkspaceHeader

## Non-goals

- No schema changes, no new server functions, no publishing changes.
- No new copy beyond what the existing sections already show.
- No visual system changes outside existing Trust Tai tokens.

## Verification

- Typecheck clean.
- Playwright screenshot pass across three real projects covering each variant (Incomplete, Active, Client Ready) — confirm variant banner, focus/NBA, truth cards, readiness matrix, and Export state each render.
- Existing unit tests (`spine-variant`, `spine-truth-status`, `milestone-readiness-evaluator`, `spine-readiness-evaluator`) still pass unchanged.

## Rollback

Keep the previous file at `src/routes/engine.projects.$projectId.spine.old.tsx.bak` (untracked by router since it doesn't match the route filename pattern) for one turn; delete after verification.
