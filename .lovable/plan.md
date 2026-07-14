# Project Overview → Command Center

Presentation-only refactor of `src/routes/engine.projects.$projectId.overview.tsx`. No schema changes, no server-function changes, no governance changes. The top `WorkspaceStepper` strip (rendered by the workspace layout) is not touched here — only its label wording where it appears on Overview.

## Why

Inside a project the Overview shows two overlapping status models:
- **Roadmap Workflow** (14-step top strip) — actually a *navigation* control that also reads as progress
- **Project Progress** (7-stage card) — a phase rollup on the page

They conflict. A user cannot tell in 5 seconds where the project is, what is blocking it, or what happens next. Worst case: a "36% Project Progress" bar reads as delivery progress while the roadmap is still under review.

## Decision

Replace both progress models on the Overview page with **one** unified indicator: **Current Stage**. The 14-step strip stays where it lives today (workspace chrome, used as nav on sub-pages) but is re-labeled so it never reads as delivery progress.

## New Overview layout

```text
┌────────────────────────────────────────────────────────────────────┐
│ Header: project name · client / business type · status · stage    │
├──────────────────────────────────┬─────────────────────────────────┤
│ CURRENT STAGE (hero)             │ RIGHT RAIL                      │
│  Stage name + context sentence   │  Pending actions (0 or list)    │
│  Next required action + owner    │  Upcoming dates                 │
│  Primary CTA                     │  Health drivers                 │
│  Workflow position · Step X/14   │                                 │
│  Delivery progress (conditional) │                                 │
├──────────────────────────────────┤                                 │
│ Secondary metrics row            │                                 │
│  Health · Open decisions ·       │                                 │
│  Critical dates · Blockers       │                                 │
├──────────────────────────────────┴─────────────────────────────────┤
│ Recent activity │ Approved artifacts │ Drafts │ Spine summary     │
└────────────────────────────────────────────────────────────────────┘
```

## Copy rules (locked)

- "Workflow progress" — the 14-step chrome. Never "project progress".
- "Delivery progress" — only after roadmap approval. Milestone/evidence based after build starts.
- "Roadmap readiness" — pre-approval.
- "Current stage" and "Next required action" — the two hero phrases.
- No bare "% complete" without an explicit object.

## Behavior rules

Stage derivation reuses existing signals only (`status`, `roadmap_version`, `approved_version`, `step_states`, `signal_count`, `next_action`, review queue):

- Pre-roadmap-approval → hero shows **Roadmap readiness**; delivery block hidden.
- Roadmap drafted, not approved → stage = "Roadmap Review", CTA = "Review AI-drafted roadmap".
- Post-approval, pre-build → introduce delivery progress at 0% with "Begins after kickoff".
- In build → delivery progress = milestones/evidence rollup (already available via `p.step_states` + activity).
- Blocked → hero explains blocker + owner (derived from top pending `ReviewItem` with `impact = high`, else project `next_action`).
- Nothing pending → hero says what the system is waiting for.

CTA always matches the derived next required action (existing `getIntelligentNextAction` server fn already returns this — reuse; do not re-fetch).

## Files touched

- `src/routes/engine.projects.$projectId.overview.tsx` — rewrite page body:
  - Delete `computeStages` + `ProgressStepper` + the "Project Progress" `SectionCard`.
  - Delete the current "Next best action" and "Project Summary" cards (folded into the new Current Stage hero + secondary metrics + right rail).
  - Add `CurrentStageHero`, `SecondaryMetrics`, `RightRail`, `LowerSections` — all local components in the same file (kept small; extract later if reused).
  - Reuse existing queries: `useWorkspace`, `getIntelligentNextAction`, `listReviewQueue`, `getVersionCompareData`.
- `src/components/engine/WorkspaceStepper.tsx` — line 105 label: "Roadmap Workflow" → "Workflow navigation"; line 107 subline: "14 steps for this project" → "Step X of 14".

No other files change. No new server functions. No new tables. No new packages.

## Design direction

Quiet, premium SaaS. Dark theme retained. Denser than today but calm — one dominant hero, everything else supporting. Lucide icons, compact badges, tooltips on health drivers and blockers. Mobile: hero stacks above metrics; right rail moves below lower sections; no overlapping text (uses the grid + `min-w-0` + `shrink-0` pattern for the header row).

## Acceptance

- Project state readable in <5s.
- One primary status/progress concept above the fold.
- "Roadmap Review" never presented as "% delivered".
- Primary CTA always matches the next required action.
- Mobile clean at 375px.
- No governance/business-logic changes; no schema changes.

## Out of scope

- Sub-page redesigns (Blueprint, Plans, etc.).
- The 14-step strip's own structure (only its label).
- Client Portal overview (separate concern).
