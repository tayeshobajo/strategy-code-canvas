## Goal

Rebuild the `/portal/roadmap` visual to match the reference exactly: a large photorealistic map canvas (Image 2 as background) with milestones/decisions plotted on the terrain paths, a left "Your current status" overlay card, phase headings floating on the map, a right MILESTONE detail drawer, a bottom "Roadmap overview" mini-map strip, and a top action bar (Current Phase pill · Fit to field · Jump to · View · Download PDF · Ask a question · Book next call).

Untouched (per your instruction): Executive summary, Strategic priorities, Risks & dependencies, Recommended next move, Acknowledge roadmap. These continue to render below the map exactly as they do today.

## Layout to build

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Title + Active + Last updated │ Current Phase pill │ Fit│Jump│View │ DL│Ask│Book│
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐          The journey from today…             ┌───────────┐  │
│  │ YOUR CURRENT│                                                │ MILESTONE │  │
│  │ STATUS card │       [ photorealistic map background ]        │ drawer    │  │
│  │ progress    │       phase labels · milestones · decisions    │ (right)   │  │
│  │ next action │       Point A tag                Point B tag   │           │  │
│  │ meeting     │       legend row                                │           │  │
│  │ key date    │                                                │           │  │
│  │ responsibs. │                                                │           │  │
│  └─────────────┘                                                └───────────┘  │
│                                                                              │
│  ┌──────────────────── ROADMAP OVERVIEW mini-map ────────────────────────┐  │
│  │ Point A · Phase 1 (active) · Phase 2 · Phase 3 · Point B │ fullscreen │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────────────┤
│ Executive summary · Strategic priorities · Risks · Next move (UNCHANGED)     │
│ Acknowledge roadmap (UNCHANGED)                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Assets

- Upload `user-uploads://Map_Background-2.png` via `lovable-assets` → `src/assets/roadmap-map-background.png.asset.json`. Use as the canvas backdrop (object-cover), no crop, at a fixed aspect ratio (~3:2). No other new assets required.

## Files

New:
- `src/components/portal/roadmap/MapCanvas.tsx` — replaces `JourneyCanvas` for desktop. Renders the background image, phase labels (PHASE 1/2/3 with subtitle + `% COMPLETE` chip), Point A / Point B tags, milestone/decision pill markers positioned by normalized (x, y) coords, "You are here" pill, drag/scroll/keyboard behavior preserved from `JourneyCanvas.tsx`, legend row (Milestone · Decision · Deliverable · Meeting · Deadline) pinned bottom-center.
- `src/components/portal/roadmap/StatusOverlayCard.tsx` — the left floating card: "YOUR CURRENT STATUS" (You are here + active phase + progress bar), NEXT ACTION, UPCOMING MEETING, KEY DATE, CLIENT RESPONSIBILITIES, TRUST TAI RESPONSIBILITIES, "View all responsibilities" button (expands inline).
- `src/components/portal/roadmap/RoadmapOverviewStrip.tsx` — bottom strip with the linear route across phases; click-to-scroll & fullscreen toggle (fullscreen expands the map canvas into a max-w viewport modal).
- `src/components/portal/roadmap/roadmap-layout.ts` — deterministic layout math: given `journey.milestones`, produce normalized `{x, y}` per marker, distributed across three phase bands with wave-offset, plus phase-band bounds. Reused by MapCanvas.

Edited:
- `src/routes/portal.roadmap.tsx`
  - Top-bar `RoadmapHeader` rebuilt to match reference: left title + Active pill + Last updated; centered "Current Phase" pill (dark, bound to `journey.activeMilestone.phase`); right actions: **Fit to field**, **Jump to** (dropdown → phases + Point A/B), **View** (existing filter dropdown moved here), **Download PDF**, **Ask a question**, **Book next call**.
  - Replace `PhaseJumpNav` + `JourneyCanvas` + `MiniMap` with `<MapCanvas />` + `<RoadmapOverviewStrip />`. `StatusOverlayCard` renders as an absolutely-positioned child inside the map region.
  - Keep the untouched sections rendered below the map exactly as-is.
  - Existing `MilestoneSheet` continues to serve as the right drawer, retitled `MILESTONE` and styled to match the reference (adds an inline "In progress · 45%" bar sourced from milestone data when available, plus the existing WHY IT MATTERS / WHAT IT UNLOCKS / STATUS / TARGET DATE / CLIENT ACTION NEEDED / LATEST UPDATE / RELATED FILES / Acknowledge / Request clarification).
- `src/components/portal/roadmap/MilestoneNode.tsx` — restyle to the reference pill: rounded chip with left icon dot, title on top and small "In progress / Planned / Due <date>" line below. Selected state ⇒ solid white pill with dark text; unselected ⇒ translucent dark pill with white text. Icon color per kind (milestone=royal, decision=violet, deliverable=amber, meeting=teal, deadline=red).
- `src/components/portal/roadmap/MilestoneSheet.tsx` — light restyle only (header label "MILESTONE", section spacing, progress bar in STATUS). No API changes.
- `src/components/portal/roadmap/MobilePhaseStack.tsx` — unchanged behavior; ensure the new header still works on mobile (mobile keeps the existing stack, hides the map).

Removed from render tree (kept as files but not imported):
- `PhaseJumpNav` (replaced by "Jump to" dropdown in header)
- `MiniMap` (replaced by `RoadmapOverviewStrip`)
- `JourneyCanvas` (replaced by `MapCanvas`) — file left in place so we don't break other imports if any; will delete once verified.

## Behavior details

- **Fit to field**: scrolls the map so all markers are visible (centers horizontally, zooms mini-map back to 100%).
- **Jump to**: dropdown with Point A, Phase 1, Phase 2, Phase 3, Point B → uses existing `jumpTo(key)` logic.
- **View**: keeps `viewMode` state and `computeMatchingSlugs`; hidden markers become faded (opacity 0.25) on the map, and the existing toast + focus-return on hidden-selection stays.
- **Current Phase pill**: reads `canvas.activePhaseKey` (already published by scroll observer) so it updates as the user pans.
- **Marker positioning**: normalized coordinates chosen so the current 3-phase model in `portal-roadmap-model.ts` fits the background terrain (Phase 1 lower-left valley, Phase 2 middle plateau, Phase 3 upper-right peak). No changes to the data model.
- **Phase % complete chip**: derive per-phase `% complete` from `phase.milestones` (`completed / total`).
- **Right drawer**: keeps Ask a question + Book next call context wiring already in place.

## Untouched (verified)

- `SupportingContext` (Executive summary, Strategic priorities, Risks & dependencies, Recommended next move) — same component, same position below the map.
- `AcknowledgeBlock` — same component, same position at the bottom.

## Verification

1. `tsgo` typecheck clean.
2. Playwright screenshot of `/portal/roadmap` at 1480×1022 to compare with the reference.
3. Click a marker → drawer opens with correct content.
4. Change **View** filter → non-matching markers dim; selecting a hidden one still triggers the existing toast + focus return.
5. **Jump to** dropdown scrolls the map; **Current Phase** pill updates.
6. **Download PDF** still opens the doc file / prints when absent.
