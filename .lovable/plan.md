# Roadmap Canvas — Phase State Fix + Final Polish

Two related passes. Part 1 fixes a state-model bug where the top badge changes as the client browses. Part 2 is a scoped visual polish over the same canvas, without restructuring any surface.

---

## Part 1 — Current phase vs. selected phase

### Concept

- **Current phase** = operational truth from the journey model. Only changes when project progress changes. Source: `journey.currentPhaseKey` (mirrored into `canvas.currentPhaseKey`).
- **Selected phase** = what the client is viewing on the map. Changes on phase-stop click, marker click, jump-to, or URL. Source: `canvas.selectedPhaseKey`. When `null`, it *defaults to current phase* for display purposes only — the state itself stays `null` so we can still tell "user is browsing" apart from "user hasn't moved."

### Surface-by-surface behavior

```text
Surface                          Reads              Label
────────────────────────────────  ─────────────────  ───────────────────────────
Top dark pill (CurrentPhasePill)  current only       "Current Phase"
Left status card                  current only       "Your current status / You are here"
Focus current phase button        writes selected=current
Main map highlight                selected ?? current (band + route glow)
Bottom mini-map active stop       selected ?? viewport ?? current, label "Viewing"
Mini-map "current" dot indicator  current (unchanged, small dot on stop)
Marker click                      writes selected = marker.phase
Drawer close                      does NOT clear selected, does NOT touch current
```

### Files to change

**`src/routes/portal.roadmap.tsx`**
- `CurrentPhasePill` (~L726–760): stop reading `canvas.selectedPhaseKey`. Read only `canvas.currentPhaseKey ?? journey.currentPhaseKey`. Keep label "Current Phase". This is the bug fix — badge no longer moves when the client browses.
- Marker click flow: in the parent that calls `setSelected(slug)`, also call `canvas.setSelectedPhaseKey(milestone.phase)` so selection and viewing phase stay in sync. Skip when the marker is a Point A/B anchor.
- Drawer close: verify `onClose` does not call `setSelectedPhaseKey(null)` and does not touch `setCurrentPhaseKey`. It should only clear the `?m=` slug.

**`src/components/portal/roadmap/RoadmapOverviewStrip.tsx`**
- Header copy (`~L118`): change "Roadmap overview / Click a phase to navigate" secondary line so, when a selected phase exists, it reads `Viewing: Phase N — {name}`. Keep "Current phase" indicator (small dot) on the operational stop, driven by `journey.currentPhaseKey`.
- Keep `active = useDisplayPhaseKey() ?? journey.currentPhaseKey` — this is the correct source for "which stop is highlighted right now".
- Add a subtle secondary indicator on the *current* stop (small pulse dot) that is independent of the active/selected highlight, so both concepts are visible at once.

**`src/components/portal/roadmap/StatusOverlayCard.tsx`**
- Already correct (reads `canvas.currentPhaseKey ?? journey.currentPhaseKey`). No change beyond confirming label copy stays "Your current status / You are here".

**`src/components/portal/roadmap/canvas-context.tsx`**
- No API change. The auto-clear effect that resets `selectedPhaseKey` when the viewport drifts (in `RoadmapOverviewStrip`) already prevents stale selection lock-in.

### Acceptance criteria (Part 1)

- Clicking Phase 2 in the mini-map while operationally in Phase 1: top badge still says "Current Phase: Phase 1 — Foundation", left card still says "You are here: Phase 1", mini-map active stop is Phase 2, and its label reads "Viewing: Phase 2".
- Clicking a Phase 3 marker opens the drawer and sets viewing to Phase 3, but current stays Phase 1.
- Closing the drawer leaves viewing where it was; does not touch current.
- Refresh with `?phase=next` restores viewing = Phase 2 without changing current.

---

## Part 2 — Premium polish pass (no structural changes)

Scoped visual/motion refinements only. No surface added, moved, or removed.

### 1. Top command bar (`RoadmapHeader`)
- Normalize button heights to `h-9`, gap `gap-2`, wrap only when unavoidable.
- Give the dark `CurrentPhasePill` slightly stronger contrast (`bg-slate-900` → `bg-slate-950`, ring `ring-1 ring-white/10`) so it reads as the anchor of the row.
- Turn the icon-only buttons into `variant="ghost"` with `border border-ink/10` for a calmer treatment; keep primary "Book next call" as solid.

### 2. Terrain map (`MapCanvas`)
- Add horizontal safe-padding inside `computeMapLayout` so no L1 marker sits within ~4% of the crop edge (extend the existing inset used in `roadmap-layout.ts`).
- Route polyline: keep width, but split into a base stroke and an outer soft glow with `filter: blur(6px)` at 40% opacity so the selected segment reads dominantly without shouting.
- Selected segment: bump inner stroke opacity from ~0.75 → 0.9 and give it a slow 2s pulse via CSS `@keyframes` (respect `prefers-reduced-motion`).

### 3. Left status card (`StatusOverlayCard`)
- Tighten collapsed height: reduce `p-3` → `p-2.5` and internal `mt-2.5`/`mt-3.5` gaps by 2px each.
- Collapse toggle: fade the expanded content with `transition-[opacity,max-height]` 200ms instead of hard cut.
- Align "You are here" row so the pin icon aligns to the phrase's cap-height (already close; verify with a 1px baseline tweak).

### 4. Right drawer (`MilestoneSheet`)
- Increase side padding from `px-5` → `px-6`, section gap uniform `space-y-5`.
- Replace hard 1px dividers with `border-ink/[0.08]` and add subtle section labels in mono uppercase 9.5px to match status card.
- Button hierarchy: primary CTA (Acknowledge / Book / etc.) full-width solid; secondary as `variant="outline"`; tertiary as `variant="ghost"` — never two solid buttons stacked.
- Confirm Escape closes the sheet, click-outside closes, focus trap on open, focus returns to originating marker on close (already wired via `focusNode`; verify).

### 5. Bottom mini-map (`RoadmapOverviewStrip`)
- Selected phase stop: keep royal ring, add a 1px inner highlight `inset 0 0 0 1px rgba(255,255,255,0.15)` so it lifts off the dark panel.
- Route line contrast: raise base opacity 0.14 → 0.2, and thicken from 2px → 2.5px only inside the viewport-window area (drawn as a second overlaid segment clipped to the window rect).
- Add a subtle "Current: Phase 1" and "Viewing: Phase 2" caption pair in the strip header when the two differ (uses the new phase-state split from Part 1).

### 6. Markers (`MilestoneNode`)
- Reduce dark-pill density: only L1 (anchor / due-dated / selected) gets the filled dark pill. L2 short labels render as text on a translucent chip (`bg-slate-950/40`), L3 icons stay bare.
- Hover: 120ms lift `translateY(-2px)` + shadow bump; not a scale change (calmer).
- Selected: existing 1.12 scale + outer glow ring — keep, but soften ring color from solid royal to `rgba(47,93,246,0.55)` so the route glow stays king.
- Muted (view-mode dim): opacity 0.6 with `grayscale(20%)` so it feels "resting" not "broken".

### 7. Motion budget
Allowed: marker hover lift (120ms), tooltip fade (150ms), drawer slide (existing shadcn 200ms), phase-focus pan (smooth scroll 400–600ms), mini-map highlight color transitions (200ms), route selected pulse (2s, subtle). Everything else stays static. All motion behind `useReducedMotion`.

### 8. Accessibility sweep
- Verify every icon button in the header, status card, drawer, and cluster popover has `aria-label`.
- Verify `Escape` closes drawer, click-outside closes, focus trap while open (shadcn Sheet handles this — audit that we haven't opted out).
- Contrast: bump `text-white/60` → `text-white/70` in floating panels where used on `slate-950/85`.
- Focus rings: standard `focus-visible:ring-2 focus-visible:ring-royal ring-offset-2 ring-offset-background` on all interactive elements in the canvas overlays.

### Acceptance criteria (Part 2)

- At 100% browser zoom on 1480×1022: no clipped markers near map edges, header buttons align on one baseline, mini-map reads as a control (not decoration), drawer feels premium and traps focus, motion never distracts, and the map remains dominant with the drawer open.
- Client can immediately identify: where they are (current), what they're viewing (selected), what's active (glowing route + selected marker), what needs them (StatusOverlayCard's next action), and how to explore (mini-map + jump-to).

---

## Out of scope

- No changes to view-mode logic (`view-mode.ts`) — Part 6 of prompt already lives there.
- No changes to server functions, data model, or portal auth.
- No new tests are added; existing perf/visual specs should continue to pass.
