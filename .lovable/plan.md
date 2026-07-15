
# Project Spine 2.0 — Phase 1 & 2

Scope frozen to **Phase 1 (contract)** and **Phase 2 (shell simplification)**. Spine 2.0 UI (Phase 4), read-model expansion (Phase 3), Milestone Workspaces (5), Client Roadmap Studio (6) and cleanup (7) are explicitly out of scope for this plan and will each get their own plan after this ships.

## Outcomes

1. A single, versioned contract file defines what the Project Spine is — its sections, statuses, and readiness rules — before we touch any UI beyond navigation.
2. Opening a project lands on the Spine, not the Overview. The 14-step stepper stops dominating every page.
3. Project-level navigation collapses from 14 workflow rooms to **5 primary tabs** plus a **More** menu. Every existing route keeps working.
4. Readiness is **advisory only** in this phase — displayed, never blocking.

## Phase 1 — Freeze the Project Spine Contract

Deliverable: one authoritative TypeScript module + one doctrine doc. No UI changes in this phase.

### 1a. Contract module — `src/lib/spine-contract.ts`

Exports (types + const arrays, no runtime behaviour):

- `SPINE_SECTIONS` — canonical section list with `key`, `label`, `required`, `client_safe`, `deep_link_pattern`:
  - `point_a`, `point_b`, `business_context`, `constraints_risks`, `assets_leverage`, `approved_scope`, `success_measures`, `decisions_pending`, `roadmap`, `milestone_readiness`, `investment`, `client_acknowledgment`.
- `SpineFieldStatus` union: `"draft" | "inferred" | "needs_confirmation" | "contradictory" | "accepted_assumption" | "verified" | "approved_truth" | "superseded"`.
- `SpineFieldProvenance` type: `{ status, source_refs[], confidence, version, updated_by, updated_at, approved_by?, approved_at?, change_reason? }`.
- `SPINE_READINESS_CHECKS` — the 14-item checklist from the frame, each `{ id, label, section_key, evaluator_id }`. Evaluator wiring lands in Phase 3.
- `CLIENT_SAFE_SECTION_KEYS` — subset of `SPINE_SECTIONS` marked `client_safe: true`.

### 1b. Doctrine doc — `doctrine/PROJECT_SPINE_CONTRACT.md`

Human-readable mirror of the module: section definitions, state machine, readiness gate rules, "advisory vs blocking" policy for this release, and the rule that raw AI drafts never auto-promote into the Spine.

### 1c. Section-key allowlist extension

`src/lib/engine-spine-fields.ts` currently allowlists only Point A / Point B keys. Add sibling allowlists for the new sections (`business_context`, `constraints_risks`, `assets_leverage`, `approved_scope`, `success_measures`, `investment`) so future writes into `engine_spine_field_truth` can be validated. **No DB migration** — this is a TS-level guard only.

Nothing in Phase 1 changes existing behaviour; it locks the vocabulary before UI work.

## Phase 2 — Simplify the Project Shell

### 2a. Land on Spine

- `src/routes/engine.projects.$projectId.index.tsx` (new): `beforeLoad` redirects to `/engine/projects/$projectId/spine`.
- `src/routes/engine.projects.$projectId.overview.tsx`: keep the file so deep links still resolve, but its component renders a small banner ("Overview has moved to Spine — [Go to Spine]") plus the existing content collapsed below. No content deletion in this phase.

### 2b. Replace WorkspaceStepper with 5-tab navigation

New component `src/components/engine/ProjectTabs.tsx` renders 5 tabs, each a TanStack `<Link>` with `activeProps`:

| Tab            | Route slug         | Notes                                  |
| -------------- | ------------------ | -------------------------------------- |
| Spine          | `/spine`           | Landing tab                            |
| Roadmap        | `/roadmap`         | New thin route — see 2c                |
| Work           | `/work`            | New thin route — see 2c                |
| QA & Delivery  | `/qa-delivery`     | New thin route — see 2c                |
| Client View    | `/client-view`     | New thin route — see 2c                |

In `src/routes/engine.projects.$projectId.tsx`:
- Remove `<WorkspaceStepper />` from the layout render.
- Insert `<ProjectTabs projectId={projectId} />` under `<ProjectHeaderStrip />`.
- Keep `WorkspaceStepper.tsx` and `WORKSPACE_STEPS` in the codebase (still used by Sources & Intelligence hub — 2d).

### 2c. Thin landing routes for the four new tabs

Each is a placeholder page that composes what already exists so the tab is never dead:

- `roadmap.tsx` → renders the existing Roadmap Builder summary (`builder`) preview + link to full builder.
- `work.tsx` → milestone list (from existing workspace data) with links to `milestones/$milestoneId/brief`.
- `qa-delivery.tsx` → composes `evidence` + `delivery` summaries in read-only tiles.
- `client-view.tsx` → composes `preview` + `publish-history` summaries with an "Open Client Portal" link.

These are intentionally thin in Phase 2. Rich versions come in Phases 4–6.

### 2d. Sources & Intelligence hub

New route `src/routes/engine.projects.$projectId.sources.tsx`:
- Grid of 14 cards, one per existing `WORKSPACE_STEPS` entry, each linking to its current route unchanged.
- Groups: **Intelligence** (steps 1–3), **Diagnosis** (4–8), **Roadmap Construction** (9–12), **Delivery Prep** (13–14).
- Reachable from a **More** menu button in the header (`src/components/engine/WorkspaceHeader.tsx` — `WorkspaceToolbar`).

### 2e. More menu

Extend `WorkspaceToolbar` with a dropdown "More" containing: Sources & Intelligence, Decisions & History (existing versions/publish-history routes), AI Workspace (`/ai-workspace`), Costs (`/agent/costs`), Project Family (`/family`), Settings.

### 2f. Persistent actions in header

Already partially present; ensure header shows: **Ask Captain** (existing chat entry), **Approvals** button with pending count (existing review-item count from workspace query), **Export Client Roadmap** (links to `/client-view` in this phase — Studio comes in Phase 6), **Project Actions** (existing toolbar).

### 2g. Spine page — read-only augmentation only

`src/routes/engine.projects.$projectId.spine.tsx` already exists. In this phase we do **not** rebuild it. We only:
- Add a `<SpineReadinessPanel />` component showing the 14 checks from `SPINE_READINESS_CHECKS` as advisory (all items rendered "Not yet evaluated" placeholders until Phase 3 wires evaluators). This proves the contract is visible without pretending we've computed it.
- Add a top banner if `pathname === '/overview'` referrer, guiding operators to Spine.

Full Spine 2.0 layout (Next Best Action hero, Foundation grid, Milestone Readiness table, Captain Brief) is Phase 4.

## Out of scope for this plan (explicitly deferred)

- Extending `getProjectSpine` payload with hidden_assets/gaps/blueprint/etc. → **Phase 3**.
- Building the new Spine 2.0 page layout described in the frame's wireframe → **Phase 4**.
- Milestone workspace tabs (Brief / Plan & Acceptance / Mockups / Build / QA / History) → **Phase 5**.
- Client Roadmap Studio and Spartan renderer → **Phase 6**.
- Route redirects, deprecation, migration, data backfill → **Phase 7**.
- Any DB migration. Phase 1+2 is TS + routes + components only.
- Any change to `WORKSPACE_STEPS` values, approval ceremonies, or provenance in `engine_spine_field_truth`.

## Verification

- `tsgo` clean.
- Manual: open a project → lands on `/spine`. Header shows 5 tabs; stepper is gone. `/overview` still resolves and shows the "moved" banner. Every URL in `WORKSPACE_STEPS` still 200s from the Sources & Intelligence hub. Readiness panel renders the 14 advisory rows.
- Playwright smoke: navigate to `/engine/projects/:id`, assert redirect to `/spine`, assert 5 tab links present, assert stepper absent, assert `/engine/projects/:id/intelligence-layer` still renders.

## Technical Notes

- No changes to `src/routeTree.gen.ts` by hand — the Vite plugin regenerates from the new route files.
- No changes to auto-generated Supabase clients or auth middleware.
- Existing `WORKSPACE_STEPS` array stays put; only its rendering surface (`WorkspaceStepper` on the layout) is removed. Sources hub imports it as-is.
- `ProjectTabs` uses `<Link activeProps={{ 'data-active': 'true' }}>` so styling reads `data-status="active"` without pathname math.
- Contract module has zero runtime imports from server code — safe to import from both client and server surfaces later.
