## Goal

Reshape the active-variant Project Spine (`src/routes/engine.projects.$projectId.spine.tsx`) to match the uploaded cockpit reference. Presentation only — no schema, no server-function shape changes, no changes to Incomplete/Client-Ready variants beyond reusing the new header/status strip.

## Reference layout (top → bottom, main + right rail)

```text
┌───────────────────────── Header ─────────────────────────┐  ┌── right rail ──┐
│ Project Spine  [Needs Review]     Approvals · Project    │  │ CAPTAIN BRIEF  │
│ subtitle                          Actions · Export       │  │ (moved from    │
├── Status strip (7 cells) ────────────────────────────────┤  │  lower row)    │
│ STATUS│HEALTH│PHASE│CAPTAIN│LAST UPD│VERSION│READINESS  │  │                │
├── NEXT BEST ACTION (2fr) ── PROJECT SNAPSHOT (1fr) ─────┤  │ APPROVALS &    │
│                                                          │  │  BLOCKERS      │
├── POINT A ─────────────── POINT B ──────────────────────┤  │                │
├── PROJECT FOUNDATION (6 tiles) ─────────────────────────┤  │ MATERIAL       │
├── BUSINESS ROADMAP (PREVIEW) ───────────────────────────┤  │  CHANGES       │
│  Milestone matrix, footer stats, working focus,          │  │                │
│  history, modules details keep rendering below           │  │ ACTIVE AGENTS  │
└──────────────────────────────────────────────────────────┘  └────────────────┘
```

Layout wrapper (active only): `grid xl:grid-cols-[minmax(0,1fr)_320px] gap-6`. Right rail is `sticky top-4` and stacks the four cards. Below `xl`, rail collapses under the main column.

## Changes

1. **New `SpineStatusStrip` component** — one card, 7 stat cells separated by dividers. Data:
   - Project Status: `spine.project.status` + step label (`current_step`).
   - Health: `spine.project.health_score` → "Healthy / Needs Attention / At Risk" + blockers count from `blockedItemsCount`.
   - Current Phase: derived from `spine.project.current_step` / current milestone `phase` (`Phase N of M`).
   - Captain: static "Captain AI" + `Active` chip (no new data).
   - Last Updated: `spine.project.updated_at` (relative + absolute).
   - Roadmap Version: `spine.version?.label ?? "Draft"` + published/not-published.
   - Spine Readiness: reuse existing `useSpineReadiness` query already wired in this file — show `passed/total` + percent.

2. **Redesign `HeroNextBestActionCard`** to match the compass-icon card style (small eyebrow, big title, description, meta chips `Impact / Unlocks / Owner / Due`, primary CTA). Keep existing NBA data props.

3. **Redesign `ProjectSnapshotCard`** as a 2-column key/value grid: Client, Project Type, Parent Project, Target Date | Open Approvals, Blocked Items, Active Milestones, Client Portal. Use existing props already passed in.

4. **Redesign `ProjectFoundationCard`** to a horizontal 6-tile strip (icon + label + one-line status): Business Context, Constraints & Risks, Assets & Leverage, Approved Scope, Success Measures, Decisions Pending. Derive counts from existing `modules` / `pointA` / `pointB` / `milestones` props already passed. Add "View all foundation →" link (keeps current `Link` target).

5. **Right rail** (`SpineRightRail`) — new component composing:
   - Existing `CaptainBriefCard` (moved out of lower row).
   - New `ApprovalsBlockersRail` — top 2–3 items from `spine.reviews` + blocked milestones (`m.status === "blocked" || approval_status === "rejected"`), with existing review-action link.
   - New `MaterialChangesRail` — top 3 items from `spine.activity` filtered to version/truth changes; date on right.
   - New `ActiveAgentsRail` — from `spine.modules` (fallback list if absent): Product Manager / Project Manager / Design / Developer, status chip derived from module `status`/`readiness` fields already present; if a field is missing render `—`, never fabricated. "View all →" links to existing Agent Workspace room if present, otherwise omitted.

6. **Reorganize main column** to the order above. Remove `ApprovalsInlineCard` + `CaptainBriefCard` from the lower 3-col row (they now live in the rail / are represented by the new foundation strip). Keep `MilestoneReadinessMatrix`, `FooterStatsBar`, `WorkingFocusStrip`, `MilestoneApprovalHistoryCard`, and the "Modules & readiness" details block untouched below the roadmap preview.

7. **Header polish** — `SpinePageHeader` gets `Approvals` pill button + `Project Actions` dropdown (reusing existing menu if present, otherwise a simple `DetailsMenu`) alongside the existing Export button; underline the status chip beside the title using existing variant colors.

8. **Incomplete / Client-Ready bodies** — wrap in the same 2-col shell so the rail is consistent, but inside the rail only render `CaptainBriefCard` + `ApprovalsBlockersRail` (skip Material Changes / Active Agents when the data isn't meaningful yet).

## Non-goals

- No changes to server functions, queries, or DB.
- No changes to Incomplete "Resolve these first" card behavior.
- No changes to Export logic, milestone workspace, or client portal.
- No new mock data — any missing field renders "—" or "Not configured".

## Files touched

- `src/routes/engine.projects.$projectId.spine.tsx` — new inline components (`SpineStatusStrip`, `SpineRightRail`, `ApprovalsBlockersRail`, `MaterialChangesRail`, `ActiveAgentsRail`) + reworked `HeroNextBestActionCard`, `ProjectSnapshotCard`, `ProjectFoundationCard`, `SpinePageHeader`, and active-body JSX.

## Verification

- `tsgo` typecheck.
- Existing vitest suites (`spine-variant.test.ts`, `spine-readiness-evaluator.test.ts`, `milestone-readiness-evaluator.test.ts`) must still pass — pure modules aren't touched.
- Playwright screenshot of `/engine/projects/1c0aaa36-…/spine` at 1480px viewport; compare structure against reference (7-cell strip, NBA+snapshot row, right rail with 4 stacked cards).

## Risks & rollback

- Risk: right rail crowds narrow viewports — mitigated by `xl:` breakpoint collapse.
- Risk: Active Agents / Material Changes data thinner than reference — mitigated by honest empty labels, no fabrication.
- Rollback: single-file change; revert `spine.tsx` to restore previous cockpit.
