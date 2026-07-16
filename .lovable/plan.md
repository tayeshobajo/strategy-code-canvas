# Sprint 1 — Project Spine 2.0: eight wired frames

Real routes, using live spine data, styled in the existing Trust Tai token system (royal / paper / ink, font-display + font-mono, rounded-2xl cards). No throwaway mockups. Each frame consumes the same approved project truth so the operating model validates end-to-end.

## The eight frames

1. **Project Shell & Navigation** — global chrome + project chrome
2. **Project Spine — Incomplete** (state A)
3. **Project Spine — Active** (state B)
4. **Project Spine — Client Ready** (state C)
5. **Source & Truth Inspector** — global drawer
6. **Milestone Brief & Acceptance** — workspace tab
7. **Milestone Mockups & Design Review** — workspace tab
8. **Milestone Build + QA overview** — workspace tab

## Frame-by-frame

### 1 — Project Shell
- Global sidebar (`AppSidebar` under a `SidebarProvider` in `__root.tsx`): Command Center, Projects, Approvals, Operations, Strategic Sales, Settings. Collapsible to icons; persistent trigger in top bar.
- Project sub-nav (`ProjectTabs`) keeps the five tabs already in place; polish only.
- Persistent project actions in `SpinePageHeader` and reused on every project tab: **Ask Captain** (Link → `/chat`), **Pending Approvals** (count badge, anchor → `#spine-approvals` or global drawer), **Export Client Roadmap** (PDF), **Project Actions** menu with Sources & Intelligence, Decisions & History, AI Workspace, Project Family, Costs, Settings.
- States: active / needs review / blocked / client-ready / parent-with-children / read-only / admin. Status chip on the project chrome; `EngineRoleGate` hides admin-only actions.

### 2 — Spine Incomplete (state A)
- Chooses this variant when `spine_readiness.point_a.approved === false` OR `spine_readiness.point_b.approved === false`.
- Suppresses empty foundation cards. Instead:
  - Identity header (name / owner / captain / target).
  - "Understanding progress" bar: sources processed, signals extracted, confidence.
  - **What is known** vs **What remains missing** — driven by `SPINE_READINESS_CHECKS` (already exported from `src/lib/spine-contract.ts`) and the readiness helper in `src/lib/engine-spine-readiness.functions.ts`.
  - Point A / Point B readiness cards with **missing keys** list from `spine_points_approved` RPC.
  - Material contradictions surfaced from `spine.notifications` where severity=critical.
  - Single Captain recommendation → primary CTA **Resolve Understanding Gaps** deep-linking to the first blocking evaluator's `deep_link_pattern`.

### 3 — Spine Active (state B)
- Refines the existing `ProjectSpine` component. Same structural regions as today; tightened:
  - Header strip: client · phase · health · owner · captain · target · roadmap version · pending approval count.
  - Hero NBA card unchanged.
  - Point A / Point B as concise cards: approved statement, 3–5 material truths, success direction, source count, approval, deep link.
  - Foundation strip (2×3): Business Context, Approved Scope, Constraints, Risks, Assets & Leverage, Success Metrics + Important Decisions.
  - Business Roadmap Summary strip (phase list with health dots).
  - Milestone Readiness Matrix (already present) — add "Mockups" column between Criteria and Build, keep gate chips.
  - Approvals + Captain Brief cards.
  - Working Focus strip stays for progress + upcoming dates + deep links.

### 4 — Spine Client Ready (state C)
- Chooses this variant when `spine_readiness.ready === true` AND client-safe fields whitelist is complete.
- Replaces the Foundation strip with a **Client Export Readiness** panel:
  - Roadmap completeness ✓
  - Milestone rationale complete ✓
  - Investment ranges ✓
  - Timeline ✓
  - Client-safe summary ready ✓
  - Publication status (current published version, client acknowledgment)
- Primary CTA becomes **Export Client Roadmap** (already wired) + secondary **Open Roadmap Studio** (Sprint 3 placeholder route — stub link acceptable).

State selector: a small `deriveSpineVariant(readiness, publish)` helper returns `'incomplete' | 'active' | 'client_ready'`. Rendered variant swaps the two variable regions only — header, NBA, milestone matrix, evidence rail, footer are shared.

### 5 — Source & Truth Inspector
- Global drawer (`Sheet` from shadcn). Trigger: any approved Spine statement gets `role="button"` + `data-inspect-key`.
- Opens with: approved statement, truth status, confidence, source list, original excerpts, Captain interpretation, assumptions, contradictions, changed by, approved by, version history, related roadmap items, **Edit / Propose Change** action.
- New server function `getSourceInspection({ projectId, sectionKey, fieldKey })` in `src/lib/engine-source-inspection.functions.ts` — auth-gated via `requireSupabaseAuth`, reads from existing tables (sources, extraction, engine_activity, engine_review_items). No schema migration.
- Two-click rule: Spine statement → drawer → source excerpt jump.

### 6 — Milestone Brief & Acceptance
- Extends existing `engine.projects.$projectId.milestones.$milestoneId.brief.tsx`.
- Brief section: what was found, why it matters, what it unlocks, business outcome, scope, exclusions, dependencies, risks, owner, timeline, investment.
- Acceptance section: table of criteria (requirement · test method · evidence required · reviewer · approval authority · status). Row-level actions.
- Primary action: **Approve Criteria and Unlock Design** (only visible with admin/reviewer role).
- Reads from `engine_milestones` + a new `engine_milestone_criteria` shape — **schema addition needed**; written to `.orchestrator/PENDING_MIGRATIONS.md` and left unimplemented. Frontend renders a computed shim from milestone JSON in the meantime so the page is not blocked.

### 7 — Milestone Mockups & Design Review
- New tab route: `milestones.$milestoneId.mockups.tsx`.
- Only mounts when milestone `requires_design === true`; otherwise the tab is hidden.
- Current approved mockup, version list, desktop/mobile toggles, comments, requested changes, client feedback, approval history, brand references, related acceptance criteria, compare-versions view. Actions: Approve / Approve with conditions / Request revision.
- Reads from existing mockup builder tables where present; unknown fields shim to empty state.

### 8 — Milestone Build + QA overview
- New tab routes: `milestones.$milestoneId.build.tsx` and `milestones.$milestoneId.qa.tsx` (shared shell, split content).
- Build view: execution packets, human/agent assignments, approved inputs, do-not-touch boundaries, progress, dependencies, cost, agent runs, failed runs, returned work, next execution move. Packet opens a context-chain sheet (client statement → Point B → milestone → criterion → execution instruction).
- QA view: acceptance criteria results, required evidence, uploaded evidence, automated tests, human QA status, rejected evidence, revision requests, completion gate, delivery readiness. Guardrail line at top: *Output is not proof. Evidence is not acceptance. Review is not delivery.*

## Cross-cutting

- **Design tokens** — extend `src/styles.css` only where needed: new semantic tokens for `--color-gate-approved / pending / blocked / stale / rereview`, `--shadow-inspector`, one new `@utility` `scroll-strip` variant. No new palette, no new font.
- **Motion** — respect `use-reduced-motion`. Drawer open, hero NBA glow, gate chip transitions only.
- **Role gating** — every state-changing action wrapped in `hasRoleForEmail` check (existing `@/lib/ops/access`). Read-only viewers see a grey "read only" chip.
- **Data** — all frames read from `getProjectSpine`, `getSpineReadiness`, `getCeremonySummary`, `getIntelligentNextAction`, `listReviewQueue`, `listMilestoneApprovalHistory`, and the new `getSourceInspection`. No frame invents data.
- **Schema** — no migrations applied. Any new table/column proposed by these frames (milestone criteria, mockup versions, execution packets) is written to `.orchestrator/PENDING_MIGRATIONS.md` and the UI degrades to a shim until Tai approves.
- **Client Roadmap Studio, Completeness Gate, Spartan preview, Client Portal frames** — deferred to Sprint 3 as originally scoped. Sprint 1 lands the operating model only.

## Route map (files touched or created)

- **Edit** `src/routes/__root.tsx` — global sidebar + `SidebarProvider`.
- **Edit** `src/components/engine/WorkspaceHeader.tsx` — collapse "More" menu into Project Actions grouping matching the brief.
- **Edit** `src/routes/engine.projects.$projectId.spine.tsx` — add `deriveSpineVariant`; extract `<SpineIncomplete />`, `<SpineActive />`, `<SpineClientReady />`.
- **Create** `src/components/engine/SourceTruthInspector.tsx` (drawer) + `src/hooks/use-source-inspector.tsx` (context).
- **Create** `src/lib/engine-source-inspection.functions.ts` (auth-gated server fn).
- **Edit** `src/routes/engine.projects.$projectId.milestones.$milestoneId.brief.tsx` — full brief + acceptance table.
- **Create** `src/routes/engine.projects.$projectId.milestones.$milestoneId.mockups.tsx`.
- **Create** `src/routes/engine.projects.$projectId.milestones.$milestoneId.build.tsx`.
- **Create** `src/routes/engine.projects.$projectId.milestones.$milestoneId.qa.tsx`.
- **Create** `src/components/engine/MilestoneTabs.tsx` — sibling to `ProjectTabs`, mounted inside the milestone route.
- **Append** `.orchestrator/PENDING_MIGRATIONS.md` — schema proposals for milestone_criteria, mockup_versions, execution_packets.
- **Write** `.orchestrator/phase-spine2-sprint1-output.md` after each frame lands.

## Design gate (must pass before Sprint 2)

1. Operator understands the project in < 10 seconds on Spine Active.
2. Any approved Spine conclusion → source excerpt in ≤ 2 clicks (inspector).
3. A milestone moves Brief → Mockups → Build → QA without losing context chain.
4. Operator always sees what blocks the next stage (readiness checks + gate chips).
5. Client-Ready state confirms every input the Studio will need (even though the Studio itself is Sprint 3).

## Execution order

Wave 1 (foundation, blocks nothing else): Project Shell, Spine Active refactor, Source & Truth Inspector.
Wave 2 (branches on Wave 1): Spine Incomplete, Spine Client Ready.
Wave 3 (milestone workspace, independent): Milestone Brief, Mockups, Build, QA.

Each wave commits separately and lands with a `.orchestrator/phase-spine2-sprint1-*.md` output, per the CLAUDE.md doctrine.
