# Project Spine 2.0 — 7-Phase Build Plan

Freezes the product frame you defined before Strategic Sales is added. Each phase ends with a commit and a `.orchestrator/phase-X-output.md` note. Nothing is merged that leaves the app broken.

## Ground truth we're building on

The repo is already closer than it looks:
- `/engine/projects/$projectId/` **already redirects to `/spine`** (`engine.projects.$projectId.index.tsx`).
- `ProjectTabs.tsx` already renders exactly the five tabs you specified (Spine / Roadmap / Work / QA & Delivery / Client View).
- `WorkspaceStepper.tsx` exists but is **not mounted** anywhere.
- `WorkspaceToolbar` (in `WorkspaceHeader.tsx`) still renders a second, stage-derived primary nav (Overview / Intelligence / Understanding / Roadmap / Delivery / Chat) alongside a `More` menu with 30+ processing rooms. This is the visible "14-step" surface today.
- `engine.projects.$projectId.overview.tsx` (738 lines) is still reachable as its own tab.
- `spine.tsx` (2919 lines) already has ~90% of Spine 2.0's regions; missing pieces are Foundation strip, Milestone Readiness matrix polish, Captain Brief real content, and Client Export readiness.
- `getProjectSpine` in `src/lib/engine.functions.ts` is the correct read-model to extend.

## Phase 1 — Freeze the Spine contract (doctrine only)

**Deliverable:** `doctrine/PROJECT_SPINE_CONTRACT.md`. No code.

Sections written:
1. Canonical Spine sections (Header, NBA, Point A, Point B, Foundation {Business Context, Constraints & Risks, Assets & Leverage, Approved Scope, Success Measures, Decisions Pending}, Roadmap, Milestone Readiness, Approvals & Blockers, Captain Brief, Collapsed Detail).
2. Per-field record shape: `status`, `source_refs[]`, `confidence`, `version`, `updated_by`, `approved_by`, `approved_at`, `change_reason`.
3. State machine: `draft → inferred → needs_confirmation → contradictory → accepted_assumption → verified → approved_truth → superseded`.
4. Spine Readiness gate — the 14 conditions you listed, expressed as booleans over the read model.
5. Client-safe field list (which Spine fields cross into Client Roadmap Studio, which never do).
6. Milestone Readiness row schema (Criteria / Mockups / Build / QA / Due + conditional-tab flags).
7. Explicit rule: subsystems produce drafts; only approved values populate Spine cards.

This doc is the reference every later phase points at. No DB or UI changes.

## Phase 2 — Simplify the project shell

**Deliverable:** the operator sees exactly one project nav.

- `WorkspaceToolbar` in `src/components/engine/WorkspaceHeader.tsx`: remove the stage-derived primary nav row (Overview/Intelligence/Understanding/Roadmap/Delivery/Chat). Keep the toolbar's persistent actions (Ask Captain, Approvals count, Export Client Roadmap, Project Actions).
- Collapse `MORE_SECTIONS` from four groups into the doctrine-defined single "Project Actions" menu: `Sources & Intelligence` (fronts the whole Intelligence group), `Decisions & History`, `AI Workspace`, `Costs`, `Project Family`, `Settings`. Deep routes stay reachable via `Sources & Intelligence` submenu.
- Confirm `ProjectTabs` (five tabs) is the only primary nav in `engine.projects.$projectId.tsx`.
- Route mapping (reuse existing routes; no new empty shells):
  - Spine → `spine.tsx` (existing)
  - Roadmap → `roadmap.tsx` / `builder.tsx` (pick `roadmap.tsx` as the tab target; keep `builder.tsx` as its detail)
  - Work → `sequencing.tsx` composed with `deadlines.tsx` links
  - QA & Delivery → `qa-delivery.tsx` (already exists)
  - Client View → `client-view.tsx` (already exists)
- **Overview page:** delete `engine.projects.$projectId.overview.tsx`, replace with a `beforeLoad` redirect file → `/spine`. Any inbound `/overview` link keeps working.
- Remove `WorkspaceStepper.tsx` (dead file).

## Phase 3 — Expand the Spine read model

**Deliverable:** `getProjectSpine` returns everything the Spine 2.0 page needs; no card renders placeholder data unless the underlying record truly doesn't exist.

Extend `ProjectSpinePayload` (`src/lib/engine.functions.ts`) with — all as approved-only projections:

- `foundation`: `{ business_context, constraints, risks, assets, scope, success_measures, decisions_pending }` each `{ summary, status, source_count, approved_by, approved_at, deep_link }`.
- `hidden_assets`, `gaps`, `blueprint`, `sequencing`, `deadlines`, `investment` — same envelope shape.
- `spine_readiness`: `{ ready: boolean, checks: Array<{ id, label, passed, blocker_ref? }> }` computed against Phase-1 gate rules.
- `milestone_readiness`: per-milestone `{ id, name, criteria, mockups, build, qa, due, deep_link, conditional_tabs }`.
- `client_export_readiness`: `{ ready, missing_items[] }`.
- `next_best_action`: replace current fallback with a computed choice from `engine_review_items` + readiness gate blockers.

Reuse existing tables: `engine_review_items`, `engine_milestones`, `engine_activity`, `engine_audit_log`, `engine_extraction_facts`, `engine_spine_field_truth`. **No schema migration in this phase.** If a field genuinely needs a new column (e.g. Point B `client_acknowledged_at` isn't already durable), it goes in `.orchestrator/PENDING_MIGRATIONS.md` for Tai, not applied.

Payload stays additive so existing consumers keep compiling.

## Phase 4 — Build Project Spine 2.0

**Deliverable:** `engine.projects.$projectId.spine.tsx` renders exactly the wireframe you specified.

- Header strip (existing) + persistent actions row (Ask Captain, Approvals(n), Export Client Roadmap, Project Actions).
- Next Best Action card — driven by `spine.next_best_action` from Phase 3.
- Point A / Point B two-column truth cards (existing, verify status + source count + approved-by chips).
- **Foundation strip** — new 2×3 grid of `Business Context / Constraints & Risks / Assets & Leverage / Approved Scope / Success Measures / Decisions Pending`, each a summary card with `View details` deep link.
- Business Roadmap horizontal strip — Point A → phases → Point B with current-phase marker and `Open Full Roadmap` link into Roadmap tab.
- Milestone Readiness matrix — real DESIGN/BUILD/QA gate values from `milestone_readiness`, row click routes into that milestone workspace.
- Approvals & Blockers card + Captain Brief card side-by-side, both from real data.
- Collapsed detail: Decisions & Version History | Sources & Evidence | Recent Activity accordions.

The current spine page is refactored, not rewritten from scratch — existing subcomponents (`ProjectSnapshotCard`, `FooterStatsBar`, truth cards) are kept where they already do the right thing.

## Phase 5 — Milestone Workspaces

**Deliverable:** clicking any milestone row opens a dedicated workspace.

New route tree under existing `engine.projects.$projectId.milestones.$milestoneId.*`:

- `.brief.tsx` (exists — extend to full doctrine shape)
- `.plan.tsx` — Plan & Acceptance
- `.mockups.tsx` — **conditional**, only rendered when milestone's `conditional_tabs.mockups === true`
- `.build.tsx` — Build & Execution (composes existing `build-execution` view scoped to milestone)
- `.qa.tsx` — QA & Evidence (composes existing `evidence` / `qa-factory` scoped to milestone)
- `.history.tsx` — scope/decision/version/drift audit

Layout route `.milestones.$milestoneId.tsx` renders the milestone tab bar, deciding which tabs to show from milestone type (website / analytics / brand / integration → different minimum-sufficient gate paths). Gates enforce ordering: no Mockups approval before Criteria; no Build packet before Mockups (when applicable); no Delivery ready before QA passed.

## Phase 6 — Client Roadmap Studio

**Deliverable:** header's `Export Client Roadmap` opens a studio, not a download.

- New route `engine.projects.$projectId.client-roadmap-studio.tsx`.
- Studio flow: pick client-safe sections (from Phase-1 whitelist) → generate strategic narrative via `callLovableAi` → branding controls → image selection → preview desktop + PDF → run `client_export_readiness` gate → publish to portal / PDF / present.
- Spartan template (`clients.spartan.tsx`) is refactored into a **renderer** that consumes the studio's output packet; it stops being a parallel data source.
- Portal publish continues to go through existing approval boundary (Phase 13B) — the studio produces the approved packet, doesn't bypass the gate.

## Phase 7 — Migration & cleanup

- Redirect all deprecated deep links (`/overview`, individual intelligence rooms if they're moved) with `beforeLoad` redirects; preserve URL history.
- Remove now-orphaned components after grepping references (`WorkspaceStepper`, stage-derived nav helper, any Overview-only subcomponents).
- Playwright pass on `/spine`, one milestone workspace, and Client Roadmap Studio end-to-end.
- Migrate one real project (Trust Tai's own) through the full flow to prove parity before broad rollout.
- Update `.orchestrator/BUILD_STATE.md` marking Spine 2.0 frame frozen.

## Guardrails carried through every phase

- No schema migrations applied. Anything new goes to `.orchestrator/PENDING_MIGRATIONS.md`.
- Existing subsystem routes stay reachable via `Sources & Intelligence` — nothing is deleted unless it has zero inbound references.
- After each phase: `tsgo` clean, commit `feat(spine2-phaseN): …`, write `.orchestrator/phase-spine2-N-output.md`.
- Client portal remains downstream-only of approved Spine state — Phase 6 does not weaken that boundary.

## Technical notes

- Extending `getProjectSpine` is preferred over a new server function so the whole Spine page stays one query — matches the existing loader pattern with TanStack Query (`ensureQueryData` + `useSuspenseQuery`).
- Milestone workspace routes will use TanStack Start's file-based nested routing (`milestones.$milestoneId.tsx` as layout with `<Outlet />`).
- Foundation and Milestone Readiness sections need `engine_spine_field_truth` generalized beyond Point A/B — Phase 3 reads whatever's there today and marks the rest `needs_confirmation`; a follow-up migration to persist truth for the other sections is queued in Phase 3's PENDING_MIGRATIONS entry.
- Client Roadmap Studio's AI generation calls `callLovableAi` from `@/lib/engine-ai.server` — no new provider connectors.
