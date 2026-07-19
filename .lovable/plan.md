# Project Spine — Path to 10/10

Goal: make every element on `/engine/projects/$id/spine` coherent, decision-oriented, and explainable. No new "cards for cards' sake" — fix the state contradictions first, then tighten the surfaces we keep.

## Scope

Frontend + read-model only. No schema migrations. Server functions extended read-side (derived state, explanations); no doctrine changes to existing tables.

## 1. Fix the state contradictions (highest priority)

**a. Project phase machine — single source of truth**
- Add `derivePhase(spine)` in `src/lib/spine-variant.ts` returning one of: `Understanding → Spine Review → Roadmap Draft → Roadmap Approval → Planning → Execution → QA → Client Preview → Delivery`.
- Rules: cannot be past `Roadmap Approval` while roadmap `version.status !== 'approved'`; cannot be `Client Preview` unless portal is published AND ≥1 milestone approved.
- Expose `phase`, `phase_reason` on `spine.view`; use it everywhere the page currently reads `status` / `current phase`.

**b. Progress % — explainable or gone**
- Replace the 93% pill with a computed `Spine readiness X/14` + `Milestones approved N/M` + `Roadmap: <state>`. Remove the opaque "Progress" and "Health 90" numbers unless they can be sourced from durable records; when Health is shown, it must open a "Why this score" popover listing contributing checks.

**c. Strategic Thesis gate**
- If `getStrategicThesis().current?.status !== 'approved'` AND roadmap has been activated, show a blocking banner: "Strategic Thesis Required — roadmap should not be operational until the project's strategic bet is approved." Link to the thesis room + "AI: Draft thesis" action (existing endpoint).
- Downgrade phase to `Roadmap Draft` in the derivation when thesis missing.

## 2. Rework the above-the-fold

Order (drop the rest below):
1. **Project title + one-sentence definition** (≤160 chars). Move today's long paragraph into an accordion "Project brief" below Point B.
2. **Identity strip** — trim to `Client · Phase · Roadmap vX · Portal · Last change`. Remove blank `Type`, remove duplicate `Project` cell.
3. **Next Best Action (explicit)** — replace "Review 1 pending item" with:
   - Title (e.g. "Approve Roadmap v0.1")
   - Why it matters / Blocks / Owner / Due / Impact
   - Derived from the highest-priority review item; fall back to a phase-appropriate default.
4. **Project Snapshot** (facts only, no scores): Phase, Roadmap state, Spine readiness N/14, Milestones ready N/M, Open approvals, Portal, Last meaningful change.
5. **Captain Intelligence** — rewrite prompt/derivation to output 4 fields: *What changed · What matters now · Recommendation · Watch for*. Must interpret, not restate queue counts. Add a "Regenerate" action.
6. **Point A / Point B** — enforce symmetrical schema: `Summary · Key truths · Success measures · Confidence · Sources · Approval · What changed`. Trim Point B rendering to the same shape as Point A; use `extractPointBullets` cap at 4.

## 3. Rename "intake" → real project identity

- Add `deriveProjectDisplayName(project)` that prefers `project.name` when it's not "intake"/"Untitled", else composes `${client_company} ${frame ?? "Transformation"}`.
- Show an inline "Rename project" affordance in the header for admins (calls existing update-project server fn if present; otherwise defer as follow-up).

## 4. Middle sections — make them decide-worthy

**Business Roadmap preview**: for each phase show *why it exists* (rationale from `version.payload`), *what it unlocks* (next phase name), *current-phase pill*, *health dot*, *next milestone that matters*. Keep the strip visual; add rationale line.

**Milestone Readiness (default view)**: switch default from full 21-row matrix to "Attention view" — top 5 milestones by (blocking × phase-proximity), columns `Milestone · Current gate · Health · Owner · Next move`. "View all" reveals the full matrix.

**Latest Amendments → Material Changes**: rename panel; broaden source to include *Point A/B approved, roadmap version created, milestones generated, phase transitions* (read from `engine_activity` with a curated kind filter) in addition to `roadmap_amendment` rows.

**Execution Drift**: when no milestone is in execution, render explicit "Not active yet — monitoring begins once the first milestone enters execution." Do not show the green "no drift" state pre-execution.

**Active Agents**: replace "runs in last window" with role coverage grid (Captain / AI PM / AI Proj Mgr / Designer / Developer / QA), each row: `assigned? · last run · required for phase`.

**Operator Notifications**: hide the card entirely when list is empty (only render header bell dot).

**Evidence & History accordion**: show real counts — Sources, Material Changes, Approvals, Agent Runs, Audit Events, Roadmap Versions.

## 5. Add missing narrative cards (compact)

- **World Entry summary card** — reads `getWorldEntry`: industry direction, category leaders reviewed count, key pattern (approved version only). Link to room.
- **Execution Boundary summary** — reads `getExecutionBoundary`: two columns "Trust Tai owns / Client owns" (top 5 each). Link to room.
- **Durable Assets** — derive from approved blueprint nodes + milestone deliverables; simple bulleted list.
- **Health explainer** — replaces raw score with `Health: <label>` + *Why* bullets + *What improves health* single action.

## 6. Files touched

New:
- `src/lib/spine-phase.ts` — `derivePhase`, `explainPhase`.
- `src/components/engine/spine/NextBestActionCard.tsx` (explicit variant)
- `src/components/engine/spine/ProjectSnapshotFacts.tsx`
- `src/components/engine/spine/AttentionMilestones.tsx`
- `src/components/engine/spine/WorldEntrySummaryCard.tsx`
- `src/components/engine/spine/ExecutionBoundarySummaryCard.tsx`
- `src/components/engine/spine/DurableAssetsCard.tsx`
- `src/components/engine/spine/HealthExplainerCard.tsx`
- `src/components/engine/spine/ThesisRequiredBanner.tsx`

Modified:
- `src/lib/spine-variant.ts` — export phase + counts on `spine.view`.
- `src/lib/engine.functions.ts` (`getProjectSpine`) — join thesis status, wire derived phase, expose `last_material_change`.
- `src/routes/engine.projects.$projectId.spine.tsx` — rewire ordering, replace pills, hide empty ops card.
- `src/components/engine/spine/CaptainIntelligencePanel.tsx` — 4-field interpretive output.
- `src/components/engine/spine/PointCard.tsx` — symmetrical schema (Point B trimmed).
- `src/components/engine/LatestAmendmentsPanel.tsx` — rename + broaden source.
- `src/components/engine/DriftSummaryPanel.tsx` — pre-execution empty state.

## 7. Out of scope (call out, don't build)

- Renaming a project persistently (needs update fn confirmation) — surfaced but deferred if endpoint missing.
- Health score algorithm changes — we only add explainability around whatever the existing score is.
- Any DB migration.

## 8. Verification

- Load current project (`cf21df7b…`): assert phase reads `Roadmap Review` (not Client Preview), thesis banner shown, NBA card names the specific pending approval, no green "no drift" state, no empty Operator Notifications card, Point A/B render identical structure.
- `bunx tsgo` clean.
