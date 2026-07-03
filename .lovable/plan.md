
# Roadmap Canvas — Pass 2 (interactivity only)

This pass keeps the current battlefield-canvas visual direction and only adds
interaction, state, and productization. No redesign, no shell changes, no
schema changes.

## Scope guardrails

- Reuse existing files. No new routes, no new tables.
- `client_portal_roadmaps` fields already exposed by `getPortalRoadmapDocs`
  stay the source of truth. Client-safe select unchanged.
- Marker types (milestone / decision / deliverable / meeting) are **derived**
  from optional fields already accepted by the transformer
  (`raw.type`, `raw.due_date`, `raw.options`, `raw.file_url`,
  `raw.meeting_at`). No new columns, no internal fields exposed.

## 1. Canvas horizontal navigation (`JourneyCanvas.tsx`)

Enhance the existing scroll container:

- Trackpad + Shift-wheel horizontal scroll (translate `deltaY` → `scrollLeft`
  when the horizontal delta is smaller).
- Click-and-drag panning already exists — refine: ignore drag when
  `event.target.closest("button, a, [data-no-drag]")`; add momentum via a
  short `requestAnimationFrame` decel loop.
- Elegant edge padding: keep current `PADDING_X`; clamp `scrollLeft` so Point
  A / Point B keep breathing room.
- Cursor states `grab` / `grabbing` already present — verify.
- Add a small right-edge fade + "Drag to explore →" hint that fades after
  first user interaction.
- Publish current scroll position via a lightweight context (
  `RoadmapCanvasContext`) so the mini-map and phase pills can subscribe
  without prop drilling.

## 2. Phase jump controls (`PhaseJumpNav.tsx`)

Keep visual; wire behavior:

- Pills: **Point A · Phase 1 · Phase 2 · Phase 3 · Point B** (map from the
  existing `now / next / later` keys).
- Clicking smooth-scrolls to the phase band's `x0` in the canvas.
- Active pill is derived from live `scrollLeft` (subscribe to canvas ctx),
  not from click state alone.
- On click, briefly pulse the destination phase band (200 ms opacity bump on
  the SVG band rect).

## 3. Bottom mini-map (`MiniMap.tsx`, new)

Small horizontal strip (~72 px tall) rendered under the canvas.

- Scaled-down SVG of the same route path + node dots.
- A draggable viewport rectangle showing the visible slice; syncs both ways
  with the main canvas `scrollLeft`.
- Click anywhere on the mini-map to center the main canvas there.
- Phase separators shown as faint tick marks with `Phase 1/2/3` labels.
- Uses the canvas context; no independent data fetch.

## 4. Marker hover + tooltip

`MilestoneNode.tsx` already uses shadcn Tooltip. Enhance:

- 200 ms transition, `transform` + `box-shadow` only (no scale on the label).
- Tooltip content standardized:
  - title
  - phase name
  - status label
  - one-sentence summary (truncate to 140 chars)
  - target date if present
  - hint: `View details →`
- On hover, dispatch a `highlightSegment(slug)` to the canvas so the
  adjacent route segment gets a soft glow (SVG `<path>` with
  `pointer-events: none`, opacity toggled).
- Tooltip already keyboard-triggered by Radix on focus — verify.

## 5. Marker click → slide-over (`MilestoneSheet.tsx`)

The Sheet already exists. Refactor into a typed detail panel that switches
mode based on `marker.kind`:

- `milestone` (default) — current content plus "What it unlocks" and
  "Target date" fields.
- `decision` — Options list, Recommended option, Due date, related
  milestone; CTA: Respond (opens clarification modal in Decision mode).
- `deliverable` — file type, version, published date, related milestone;
  CTAs: Preview (opens shadcn Dialog with iframe/text preview),
  Download (records `downloaded` event), Ask a question.
- `meeting` — date/time, purpose, prep notes; CTAs: View meeting (external
  link if provided), Reschedule / Book next call → `/portal/messages`.

Common behavior (Radix Sheet handles most out of the box, verify + fill
gaps):

- Slide-in from right, canvas dim overlay at 30% opacity.
- Esc closes; outside click closes; X button closes.
- Focus trap while open (Radix default).
- Focus returns to the originating marker on close — store a
  `WeakRef` / id → button map in the canvas ctx.
- All internal fields hidden. Only client-safe fields render.

## 6. Decision / Deliverable / Meeting marker variants

Extend `RoadmapMilestone` type in `src/lib/portal-roadmap-model.ts`:

- `kind: "milestone" | "decision" | "deliverable" | "meeting"` (default
  `"milestone"`).
- Optional fields: `dueDate`, `targetDate`, `options[]`,
  `recommendedOption`, `fileUrl`, `fileType`, `version`, `publishedAt`,
  `meetingAt`, `meetingPurpose`, `unlocks[]`, `latestUpdate`,
  `clientActionNeeded`.
- Transformer reads them from `raw.kind` / `raw.type` and the matching
  fields. All optional; missing fields render nothing.

`MilestoneNode.tsx` renders a variant icon per kind (existing lucide
icons: `MapPin`/`Circle` for milestone, `GitBranch` for decision,
`FileText` for deliverable, `CalendarClock` for meeting). Node shape and
palette match current styling; no new colors.

## 7. Active phase + "You are here" (`JourneyCanvas.tsx`)

- Compute activePhase from `journey.activeMilestone.phase`.
- Add a soft glow rect behind that phase band and a "You are here" pill
  above the active milestone node.
- The active route segment gets a slow-pulse SVG animation (2 s ease
  in/out on stroke opacity) — disabled under `prefers-reduced-motion`.

## 8. Route segment states

Rebuild `layout.progressPathD` into per-segment paths so each segment can
be styled independently:

- `completed` — full-opacity royal stroke
- `active` — royal with soft glow + pulse
- `upcoming` — 25% opacity white
- `blocked` — muted amber (`#b78100` at 60% opacity), never red

Segment ↔ node highlight: on marker hover/focus, boost the adjacent
segment stroke width from 6 → 7 for 200 ms.

## 9. Deep-link query params

Extend the route's `validateSearch`:

```ts
z.object({
  m: fallback(z.string().optional(), undefined),         // milestone (existing)
  item: fallback(z.string().optional(), undefined),      // alias for any marker
  decision: fallback(z.string().optional(), undefined),
  deliverable: fallback(z.string().optional(), undefined),
})
```

Resolution precedence: `decision` → `deliverable` → `item` → `m`. Resolved
slug is normalized back to `?m=<slug>` via `navigate({ replace: true })` so
we keep one canonical URL shape.

On mount, if the slug matches a marker: open its sheet, smooth-scroll the
canvas to its x-position, briefly highlight it. If the slug is unknown,
show a toast: "This item is no longer available in the current roadmap
version." and clear the param.

## 10. Request clarification modal (`ClarificationModal.tsx`, new)

Small shadcn `Dialog` opened from any panel's "Request clarification" CTA
and from the header's existing button:

- Title: **Request clarification**
- Read-only context chip: marker title + phase
- Textarea: "What would you like us to clarify?"
- Buttons: **Send question** / Cancel
- On submit, insert a row into `client_portal_messages` via a new
  server fn `sendPortalClarification({ roadmapId, markerSlug, markerTitle,
  question })`. Uses `requireSupabaseAuth`; RLS + existing project
  membership check.
- Success state (inline in the dialog): "Your question was sent. We'll
  respond here so the context stays together." + link to
  `/portal/messages`.
- Roadmap state (selected marker, scroll position) preserved on close.

## 11. Acknowledge milestone modal

Replace inline "Mark reviewed" button flow with a confirm dialog:

- Title: **Acknowledge this milestone?**
- Body: "This lets us know you've reviewed this part of the roadmap."
- Actions: **Acknowledge** / Cancel
- Uses existing `recordPortalMilestoneReview`. Success shows an inline
  "Acknowledged ✓" state on the panel. No reload.

The page-level "Acknowledge roadmap" block stays as-is.

## 12. Keyboard & focus

- Canvas already has `role="region"` + arrow-key nav — verify Home/End,
  add PageUp/PageDown for phase jumps.
- Marker `<button>` elements: Enter/Space opens the panel (already), Esc
  from an unopened tooltip dismisses tooltip only.
- Sheet: Radix focus trap; on close, focus returns to the source marker
  via stored ref.
- All CTAs have `focus-visible:ring-2 ring-royal` classes (already the
  project default — audit and fix any misses).

## 13. `prefers-reduced-motion`

Add a `useReducedMotion` hook (matchMedia). Wrap:

- Route draw animation (`stroke-dashoffset`) → skip, render final path.
- Active segment pulse → static full-opacity stroke.
- Scroll momentum → snap to target instantly.
- Sheet transitions keep default (Radix respects OS setting already).

## 14. Loading, empty, error, not-found states

Route already handles: revoked, no docs. Add:

- **Loading**: existing skeleton stays.
- **Not published**: existing copy stays.
- **Load error**: wrap `RoadmapView` in an error boundary — copy: "We
  could not load the roadmap. Please refresh or contact Trust Tai."
- **Selected item missing**: toast + URL param cleared (see §9).

## 15. Mobile / tablet

- Desktop / tablet ≥ 768 px: canvas + hover tooltips + right slide-over.
- Tablet drag already works via pointer events.
- Mobile < 768 px: swap `<JourneyCanvas>` for a `<MobilePhaseStack>`
  component — one phase per swipeable card (existing shadcn `Carousel`),
  markers listed as tap targets, detail opens as full-screen `Sheet`
  `side="bottom"`. Phase pills remain as horizontal scroller.

## 16. Performance

- Marker positions memoized on `journey`.
- Canvas SVG paths memoized; only per-segment stroke opacity animates.
- Mini-map viewport rect uses CSS `transform: translateX()`, not width
  reflow.
- Scroll listener throttled with `requestAnimationFrame`.

## 17. QA checklist (must all pass)

Run through: horizontal scroll, drag pan, phase pills jump, mini-map
sync + drag, hover lift + tooltip, panel open on click, decision /
deliverable / meeting modes render, Esc + outside-click + X close,
`?item=` / `?decision=` / `?deliverable=` deep links open the right
panel, clarification modal preserves marker context, acknowledge shows
inline success without reload, no internal fields visible, keyboard-only
traversal works, reduced-motion setting disables animations, mobile
phase stack renders below 768 px.

---

## File-level change list

- `src/lib/portal-roadmap-model.ts` — extend types with `kind`, marker
  variants, `dueDate`, `unlocks`, etc. Transformer reads optional
  `raw.kind` and marker-specific fields.
- `src/components/portal/roadmap/JourneyCanvas.tsx` — refactor scroll into
  a context provider, add per-segment paths, active-phase glow, "You are
  here" pill, segment highlight on marker hover, momentum + edge clamp,
  scroll-hint gradient, reduced-motion gating.
- `src/components/portal/roadmap/MilestoneNode.tsx` — variant icon per
  `kind`, richer tooltip content, `data-marker-slug` + focus-return ref
  registration, `onMouseEnter` dispatches segment highlight.
- `src/components/portal/roadmap/MilestoneSheet.tsx` — mode switch
  (milestone/decision/deliverable/meeting), Preview dialog, Acknowledge +
  Request-clarification modal triggers, focus-return.
- `src/components/portal/roadmap/PhaseJumpNav.tsx` — active pill from live
  scroll, PageUp/Down keyboard, brief phase-band pulse on click.
- `src/components/portal/roadmap/MiniMap.tsx` (new) — miniature canvas +
  draggable viewport rect.
- `src/components/portal/roadmap/MobilePhaseStack.tsx` (new) — swipeable
  phase cards for < 768 px.
- `src/components/portal/roadmap/ClarificationModal.tsx` (new) — Dialog
  wrapping a textarea + submit.
- `src/components/portal/roadmap/AcknowledgeDialog.tsx` (new) — confirm
  dialog around `recordPortalMilestoneReview`.
- `src/components/portal/roadmap/canvas-context.tsx` (new) — React
  context for scroll state, active phase, focus-return refs, segment
  highlight, reduced-motion flag.
- `src/hooks/use-reduced-motion.ts` (new) — matchMedia hook.
- `src/routes/portal.roadmap.tsx` — extended `validateSearch`, mount
  clarification modal, wire mobile branch, error boundary, selected-item
  resolution + toast.
- `src/lib/portal.functions.ts` — new `sendPortalClarification` server fn
  (auth-required, inserts into `client_portal_messages`, logs activity).

No changes to migrations, RLS, or the roadmap select projection.

---

## Assumption

Decisions / deliverables / meetings are surfaced only when the roadmap
row's `sequence_30_60_90` items include an optional `type` /
`due_date` / `file_url` / `meeting_at` field. If none are present, every
marker renders as a plain milestone — same as today. This keeps the
change client-safe and avoids inventing internal state.
