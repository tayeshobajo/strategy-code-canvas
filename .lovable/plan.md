# Roadmap Portal Polish — Drawer, Sidebar, Instrumentation

Three focused, non-rebuilding passes over the roadmap portal.

## 1. Right detail drawer — premium strategic panel

File: `src/components/portal/roadmap/MilestoneSheet.tsx` (refine — no rebuild)

- Width and surface
  - Desktop width `w-[410px]` (in the 390–430 band), full height under the top bar, `bg-paper` surface with a warm off-white header wash, thin `border-l border-ink/10`, `shadow-[0_30px_80px_-30px_rgba(11,18,32,0.35)]`, rounded left corners.
  - Explicit `SheetClose` button pinned top-right (×, `h-8 w-8`, hover ring). Softer sheet overlay: `bg-black/8` so the map stays visible (no heavy dark scrim).
- Header hierarchy (top → down)
  1. Row of three chips: kind (Milestone / Decision / Deliverable / Meeting / Deadline — Deadline derived when `dueDate && kind === "milestone"`), phase (`Phase 1 · Foundation`), status pill.
  2. Title — `font-display text-[26px]/tight`.
  3. One-line summary — `text-ink/70 text-[14.5px]`.
  4. Fine hairline divider before body.
- Body — one column of labeled section blocks, `space-y-5`, section label in mono uppercase micro-caption with a leading icon glyph, body in `text-ink/85 leading-[1.65]`. Order per kind:
  - Milestone: Why it matters · What it unlocks · Status (label + slim progress bar for `in_progress`) · Target date · Client action needed (royal callout) · Latest update · Related files.
  - Decision: Decision needed · Options (list) · Recommended choice (highlighted row) · Why it matters · Due date · Related files.
  - Deliverable: Description · Related milestone · Version · Published date · Open / download.
  - Meeting: Purpose · When · Agenda · Location/link.
- CTA hierarchy — sticky footer, no floating
  - Primary (solid `bg-ink` full-width `h-10`): Acknowledge · Respond · Open, by kind.
  - Secondary (outline `h-9`, single line, no 2-col cramping): Request clarification.
  - Contextual row (ghost buttons): Related files · Book next call. Download only for deliverables with `fileUrl`.
- Map connection while open
  - Keep existing `SelectionConnector` gradient arc marker → drawer edge (already implemented, persists while open).
  - Selected marker stays highlighted; critical-path route segment keeps its glow; other markers get a subtle `opacity-70` (existing `mutedBySelection` path — no aggressive dimming).
  - No heavy dark overlay: `SheetContent overlayClassName="bg-black/8"`.
- URL state — already wired via `?m=<slug>` (resolved from `search.decision/deliverable/item/m` in `portal.roadmap.tsx` line 270). Verify only:
  - Deep link opens the drawer, highlights the marker, and `RoadmapCanvasStage` scrolls the marker into view (existing `useEffect`, line 302). No refactor.

## 2. Sidebar bottom — one clean account zone

File: `src/routes/portal.tsx` (refine `SidebarMissionCard` + `SidebarUserBlock` + `<aside>` container)

- Combined bottom zone
  - Single container `border-t border-white/8 bg-white/[0.02] px-4 py-3 space-y-3` — mission line + user row live in the *same* soft block, not two boxes.
- Mission — reduce weight
  - No card border, no background. Just:
    - 1px royal accent line (`h-px w-6 bg-royal/60`).
    - Line 1: `font-display text-[12.5px] text-white/90` — "Your success is our mission."
    - Line 2: `text-[11px] text-white/45 leading-snug` — condensed subline.
  - Total height ≈ 44px.
- User row
  - Compact 32px avatar (initials, `bg-royal/20 border-royal/35`), name (`text-[12.5px]`), role "Client" (`text-[10.5px] text-white/45`), collapse chevron (rotates when popover opens).
  - Popover reveals: email row + Sign out. No standalone sign-out link outside the popover.
- Sidebar responsive
  - Keep existing `lg:sticky lg:h-screen`, `overflow-x-hidden`, and `min-w-0` guards (from the earlier fix so logo/labels never clip).
  - Below `lg` the sidebar already stacks; keep as-is (no floating collapse pill this pass — deferred until we have a real collapsed state).

## 3. Runtime instrumentation — catch regressions early

New: `src/components/portal/roadmap/perf.ts` — tiny module (no deps).

- `measure(label, fn)` — wraps a sync/async block in `performance.mark` / `performance.measure`, dev-only (`import.meta.env.DEV`).
- `recordSample(label, ms)` — keeps a rolling 60-sample ring per label; exposes `window.__roadmapPerf` in dev with helpers `summary()` (p50/p95/max per label) and `reset()`.
- Warn-once thresholds (dev only, `console.warn` with the label + ms):
  - `markers:render` > 16 ms
  - `viewport:publish` > 8 ms (throttle regression signal)
  - `hover:setHighlighted` > 4 ms
  - `cluster:relayout` > 12 ms

Wire points:
- `MapCanvas.tsx`
  - Wrap the `rendered` `useMemo` (cluster + fan-out relayout) with `measure("cluster:relayout", …)`.
  - Wrap the `visibilities` `useMemo` with `measure("markers:visibility", …)`.
  - Wrap the scroll `publish()` body with `measure("viewport:publish", …)`.
- `MilestoneNode.tsx`
  - Time the `onMouseEnter` → `setHighlightedSlug` path with `measure("hover:setHighlighted", …)`.
- `SelectionConnector.tsx`
  - Time the `measure()` rAF callback with `measure("connector:measure", …)`.

Benchmark harness: `tests/perf/roadmap-perf.spec.ts` (Playwright, dev-only)
- Restore auth (existing `LOVABLE_BROWSER_SUPABASE_*` shape), open `/portal/roadmap`.
- Interactions: pan the canvas (drag 3 sweeps), select 5 markers in sequence, fan a cluster, collapse it.
- Read `window.__roadmapPerf.summary()`; assert p95 stays under the same thresholds. Emits a JSON report to `/tmp/browser/roadmap/perf.json` for CI review.

## Out of scope

- Terrain map, mini-map behavior, view-mode density rules, marker clustering algorithm.
- Sidebar collapse toggle behavior (chrome only; behavior deferred).
- Mobile stack drawer (`MobilePhaseStack` unchanged).
- Any backend, RLS, or data-model changes.

## Files touched

- `src/components/portal/roadmap/MilestoneSheet.tsx` — refine.
- `src/routes/portal.tsx` — refine sidebar bottom (`SidebarMissionCard`, `SidebarUserBlock`, container wrap).
- `src/components/portal/roadmap/MapCanvas.tsx` — instrumentation wrap.
- `src/components/portal/roadmap/MilestoneNode.tsx` — instrumentation wrap on hover setter.
- `src/components/portal/roadmap/SelectionConnector.tsx` — instrumentation wrap on measure.
- `src/components/portal/roadmap/perf.ts` — new.
- `tests/perf/roadmap-perf.spec.ts` — new.

## Acceptance checks (I'll verify)

- `tsgo --noEmit` clean.
- Drawer at 1480×1000 with a marker selected: chips row visible, sticky footer with primary + outlined secondary + ghost contextual buttons, map still visible behind soft overlay, connector arc present.
- Sidebar at 1480×1000: logo fully visible, mission line + user row read as one zone, no clipping.
- Perf harness runs and emits summary JSON; no warn-once threshold breaches in the recorded run.
