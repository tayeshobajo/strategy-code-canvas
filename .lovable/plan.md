
# Project Spine — Narrative Recomposition

Recompose `src/routes/engine.projects.$projectId.spine.tsx` (currently ~4,966 lines) around the project's story. Keep all data wiring, routes, and server functions. No schema changes. No new backend logic. This is a hierarchy + composition change plus a few semantic-consistency guards.

## Guiding rule

The Spine is not "everything we know." It is: **current truth → destination → strategic route → readiness → next move → Captain's interpretation.** Everything else collapses into progressive disclosure.

## Page architecture (matches reference image)

```text
┌─────────────────────────────────────────────────────────────┐
│ A. Project Identity Strip (compact)                         │
├─────────────────────────────────────────────────────────────┤
│ B. Narrative Header + State Banner                          │
├──────────────────────────┬──────────────────────────────────┤
│ C1. Next Best Action     │ C3. Captain Intelligence         │
│ C2. Project Snapshot     │    (What changed / matters /     │
│                          │     recommendation / watch for)  │
├──────────────────────────┴──────────────────────────────────┤
│ D. Point A  |  Point B   (equal-height, mirrored IA)        │
├─────────────────────────────────────────────────────────────┤
│ E. Strategic Thesis + Trust Tai / Client execution boundary │
├─────────────────────────────────────────────────────────────┤
│ F. Business Roadmap (Point A → phases → Point B, horizontal)│
├──────────────────────────────────────┬──────────────────────┤
│ G. Milestone Readiness (Top 5)       │ I. Intelligence Rail │
│                                      │  Amendments / Drift  │
│                                      │  Active Agents       │
├───────────────┬──────────────┬───────┴──────────────────────┤
│ H1 Approvals  │ H2 Foundation│ H3 Recent Project Movement   │
├───────────────┴──────────────┴──────────────────────────────┤
│ J. Project Evidence & History (collapsed, counts only)      │
└─────────────────────────────────────────────────────────────┘
```

## Sections & sources

- **A. Identity strip** — reuse `ProjectHeaderStrip`, add compact chips: Status, Health, Current Phase, Roadmap version, Spine Readiness (x/14 from readiness evaluator), "Last meaningful change" from newest `engine_activity` event.
- **B. Narrative header** — Instrument Serif "Project Spine" title + subtitle + single state banner driven by existing `deriveSpineVariant` (Incomplete / Active / Client-Ready).
- **C1. Next Best Action** — one large card driven by existing NBA source (pending approval / gate). Show: why it matters, what it unlocks, owner, due, primary action button.
- **C2. Project Snapshot** — 9 compact rows (Client, Type, Current phase, Active milestones, Blocked, Open approvals, Client portal link, Parent project). Sourced from workspace payload; no new queries.
- **C3. Captain Intelligence** — single coherent panel with 4 blocks (What changed / What matters now / Recommendation / Watch for) + Ask Captain input + "Open full analysis" link. Consolidates today's fragmented Captain Brief + Amendments summary + Drift summary at the top level.
- **D. Point A / Point B** — mirrored cards, equal IA: one-line summary, 3–5 key truths (bulleted), status chip, sources count, confidence, approved-by, approved-on, "View details", "Open in Intelligence Room". Distill Point B from paragraph → structured bullets pulled from existing `point_b` fields (24-month destination, operating model summary, success measures).
- **E. Strategic Thesis** — new full-width card wrapping existing thesis data (`getStrategicThesis` / `engine_project_strategic_thesis`). Two sub-columns: **Trust Tai owns** vs **Client owns**, pulled from execution boundary (`engine_project_execution_boundary`).
- **F. Business Roadmap** — horizontal Point A → phase cards → Point B strip. Each phase: strategic name, one-line outcome, status pill (Complete / Current / Planned), milestone count. Current phase visually dominant. Actions: Open full roadmap, Ask Captain, Compare versions.
- **G. Milestone Readiness (Top 5)** — reduce table to 5 rows: current, next, blocked, ready-for-QA, recently completed. Columns: Milestone, Current Gate, Health, Owner, Due, Next Move. Link "View full readiness matrix" opens the full matrix in a drawer/dialog (existing component reused).
- **H1. Approvals & Decisions** — pending count, impact, urgency, "Review" action, plus 1 next roadmap-version decision.
- **H2. Project Foundation** — 2×3 grid of readable tiles: Business Context, Constraints, Assets, Scope, Success Measures, Key Decisions. Each shows small status chip + "View" link. Replaces the tiny-icon strip.
- **H3. Recent Project Movement** — 3–5 most consequential events (approvals, publishes, boundary changes). Not the full activity feed.
- **I. Intelligence Rail (sticky right column)** — Latest Amendments (existing `LatestAmendmentsPanel`), Drift Monitor (existing `DriftSummaryPanel`), Active Agents (existing agent status). Sticky on `xl+`.
- **J. Project Evidence & History** — one collapsed accordion section wrapping: Sources & published evidence, Recent activity, Audit trail, Task ledger, Version history, Readiness contract, Operator notifications. Closed by default, show counts only.

## Removed / demoted from default view

- Step-13-of-14 progress card, "0 recent decisions" full-width card, Modules & readiness full section, individually-open evidence/history rows, Readiness contract standalone row, Operator notifications standalone card, duplicate Captain Brief, unreadable tiny Foundation icons, long Point B paragraph, full "Not Configured" readiness matrix.

## Semantic-coherence guards

Add small derivation helpers (no schema changes) so contradictory states never render together:

- If Point A/B status is `approved` but the summary field is empty → render as `approved-but-empty` warning chip and show "Content missing — reopen in Intelligence Room" instead of blank body. Same rule both sides.
- Project progress % must be derived from milestone-gate completion, not a hardcoded 93%. If milestone readiness is entirely `Not Configured`, cap displayed progress at the readiness-derived floor and show a "Progress derived from milestone gates" tooltip.
- Roadmap version chip shows `AI Draft` / `Approved` / `Published` distinctly; the Identity strip cannot show project = Approved while roadmap = AI Draft without labeling roadmap explicitly as draft.
- NBA copy must name the specific decision (approval title, gate, or milestone) — never a generic "pending review".
- Active Agents shows real run states; when there is none, render "No active runs" instead of empty rows.

Guards live in a new `src/lib/spine-coherence.ts` (pure functions over the workspace payload). No DB writes.

## Variant behavior

Reuse existing `deriveSpineVariant`:
- **Incomplete** → C1 + C2 + Point A/B status chips + top 3 gaps + Strategic Thesis (if any) + collapsed J. Hide F, G, H2 when there is nothing meaningful.
- **Active** (default in reference) → full layout above.
- **Client-Ready** → surface publish state, acknowledgment, export, portal preview above F; keep the rest.

## File plan

- **Rewrite** `src/routes/engine.projects.$projectId.spine.tsx` to a thin orchestrator (~300 lines) that composes new section components.
- **New** section components under `src/components/engine/spine/`:
  - `IdentityStrip.tsx`, `NarrativeHeader.tsx`, `StateBanner.tsx`
  - `NextBestActionCard.tsx`, `ProjectSnapshotCard.tsx`, `CaptainIntelligencePanel.tsx`
  - `PointCard.tsx` (used for both A and B), `StrategicThesisSection.tsx`
  - `BusinessRoadmapStrip.tsx`, `MilestoneReadinessTop5.tsx`
  - `ApprovalsCard.tsx`, `FoundationGrid.tsx`, `RecentMovementCard.tsx`
  - `IntelligenceRail.tsx` (wraps existing Amendments / Drift / Agents panels)
  - `EvidenceHistoryAccordion.tsx` (collapses existing panels)
- **New** `src/lib/spine-coherence.ts` — derivation + guard helpers.
- **Reuse** all existing server functions, workspace query, `LatestAmendmentsPanel`, `DriftSummaryPanel`, `SourceTruthInspector`, `SpineVersionHistory`, `AuditTrail`, readiness/thesis/boundary loaders. No new server functions.
- **No** schema migrations. **No** route changes. **No** changes to other rooms.

## Technical notes

- Sticky intelligence rail via `xl:grid-cols-[minmax(0,1fr)_320px]` on the G/I row; other rows stay full-width.
- All new cards use existing `SectionCard` / primitives and locked Trust Tai engine tokens (cloud blue). Instrument Serif only for the narrative header, matching brand rules.
- Follow responsive-layout patterns: `grid-cols-[minmax(0,1fr)_auto]` on mobile → `flex` at `sm:` for header rows; `min-w-0` / `truncate` on all title cells.
- Progressive-disclosure sections use `<details>` or Radix Accordion; closed by default, deep-linkable via `#evidence`, `#history`, `#matrix` hashes.
- Old 4,966-line file's helper components either move into `src/components/engine/spine/` or get inlined into the new orchestrator; no orphaned exports.

## Acceptance

Meets the criteria in the brief: first viewport tells current state + next move; A/B mirrored with no "Approved but empty" contradictions; Thesis + execution boundary visible; roadmap connects A→B with obvious current phase; readiness concise with full matrix on demand; Captain unified; approvals name the exact decision; evidence/history collapsed; layout uses the full desktop canvas with a sticky intelligence rail.
