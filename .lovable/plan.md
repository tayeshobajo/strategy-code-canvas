
# Plan — Align Spine 2.0 to reference design

Scope: presentational rework of `src/routes/engine.projects.$projectId.spine.tsx` only. No server function or schema changes. Reuse existing `getProjectSpine` payload, milestone approval mutations, and history query already wired up. Deep links, filters/sort, search, mutations, PDF export, and skeleton/error handling all remain — they'll be re-homed inside the new layout (some behind "View all" affordances) so nothing regresses.

## 1. Page header row

- Left: `Back to Projects` chevron link → `/engine/projects`; title `Project Spine` + status badge (existing `EngineStatusBadge`); one-line tagline "The central nervous system of your project. Live truth. Approved direction. Next best move."
- Right cluster: `Pending Approvals (n) →` pill (scrolls to Approvals & Decisions), `Export Client Roadmap` (dark, wires to existing `exportSpinePdf`), `Project Actions ▾` (menu stub — Duplicate/Archive/Rename disabled placeholders), `More ▾` (stub).
- Remove the current single-line header/back link + inline Export button.

## 2. Hero row (2-column, 2fr / 1fr)

**Next Best Action card (left)**
- Keep existing NBA data + severity tone but restyle: title "Next Best Action" with sparkle icon, big headline = `nba.title`, description = `nba.body`, meta row of `Unlocks`, `Due`, `Owner`, primary CTA `Review Now →` linking to `nba.deep_link` (or Approvals section fallback). Decorative compass/arrow disc on the right.

**Project Snapshot card (right)**
- Grid of 3×3 label/value cells derived from spine payload:
  - Current Phase (from project.current_phase / stage), Health (with dot), Target Date (nearest milestone or project target)
  - Project Owner, Captain, Roadmap Version (`v{n}`)
  - Pending Approvals count, Blocked Items count (accent red if >0), Active Milestones (`x of y`)
- All values derived from existing payload; when unknown, show `—`.

## 3. Truth row (Point A / Point B)

- Two equal cards (existing data) restyled: header row = icon + `Point A|B` + `APPROVED|DRAFT|REVIEW` badge; subtitle "Where the business is today." / "…is going."; up to 3 bullet points with check dots; footer row `Sources: N · Approved: date · View details →` linking to `/engine/projects/$projectId/spine-a` and `.../spine-b` (existing routes).

## 4. Milestone Readiness matrix (replaces current RoadmapSummaryCard tile)

- Card titled `Milestone Readiness` with `View all →` (jumps to `/engine/projects/$projectId/roadmap`).
- Table columns: `MILESTONE`, `CRITERIA`, `DESIGN`, `BUILD`, `QA`, `DUE`.
- One row per milestone from `spine.roadmap.milestones` (cap to first 5, remainder behind View all).
- Cell renders a compact status chip derived from milestone gate/phase state: green check, `Review` (amber), `Blocked` (red), `In Progress` (blue), `Not Started` / `Not Ready` (grey), `—` when N/A.
- Row click → milestone detail deep link. Keep approve/reject buttons available inside expanded milestone drawer or under the existing Approvals & Decisions card below (moved out of this table to match reference).

## 5. Lower row (3 columns on xl, stacked below)

**Approvals & Decisions (left)**
- List of pending review items (existing data), each row: colored dot (severity), title, subtitle "Needs your approval / Awaiting decision", `Review` button that fires existing approve/reject mutations via a small inline drawer. `View all →` opens Approvals route.

**Project Foundation (middle)**
- 4×2 grid of foundation summary rows derived from aggregated modules already in payload:
  - Business Context (strength label), Assets & Leverage (`N Identified`), Approved Scope (`Defined/Draft`), Success Metrics (`N Defined`), Constraints (`N Active`), Key Decisions (`N Made`), Risks (`N High`), Team Alignment (`On Track/Watch`).
- Each row: icon + label + value; `View all →` jumps to the underlying module deep link (reuses existing `ModuleLink` mapping).

**Captain Brief (right)**
- Card with sparkle header + 4 labelled rows (`What changed`, `What matters now`, `Recommendation`, `Watch for`) sourced from `spine.captain_brief` if present; otherwise derived from NBA + last activity entry. `View all →` opens the full brief details panel.

## 6. Footer stats bar

- Full-width thin card with 5 stats: Sources Processed, Last Intelligence Run (`date · time`), Intelligence Confidence (`NN%`), Project Created, Last Updated (`date · time by owner`), plus right-aligned `● Auto-saved / Just now` indicator. Values from `spine.meta` (fallback `—`).

## 7. Re-home existing features (no functionality loss)

- Module Readiness Grid + filters/sort/contents: move into a collapsed `Modules & Readiness` section below the footer stats (kept for power users).
- Evidence search box + `SearchableBlock` panels (Sources, Activity, Audit, Task Ledger, Version History, Readiness Contract): keep as a collapsed `Reference & Evidence` section at the bottom.
- Milestone approval history: rendered inside the Approvals & Decisions "View all" drawer.
- PDF export helper unchanged; wired to the new header button.
- Error banners + skeletons: re-applied to each new card region.

## Technical notes

- All changes limited to `src/routes/engine.projects.$projectId.spine.tsx` plus small presentational sub-components colocated in the same file (or extracted to `src/components/engine/spine/` if the file grows past ~2500 lines).
- No new server functions. Where the reference shows fields not yet in the payload (e.g. Health, Intelligence Confidence, Captain Brief 4 fields), render best-effort from existing fields and fall back to `—`; a follow-up plan can extend `getProjectSpine`.
- Styling: existing Tailwind + design tokens (`ink`, `royal`, `border`, `card`, `paper-soft`). Chips use existing tone maps; add small `StatusChip` and `MetaCell` primitives inline.
- Verify with `tsgo` after implementation.

## Out of scope

- Left/global sidebar navigation ("Command Center / Projects / Approvals / Operations / Strategic Sales / Settings") shown in the reference — that is app chrome, not the Spine page.
- Extending `getProjectSpine` payload (Captain Brief, health, confidence, phase labels). Tracked as follow-up.
