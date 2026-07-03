# Portal Roadmap — Interactive Journey Canvas

Rebuild `/portal/roadmap` from a static markdown document into a premium, interactive strategic canvas inside the existing portal shell. Keep the current sidebar/layout, data source, acknowledgement flow, and access rules — only the presentation and interactions change.

## Scope

- Client-facing only: shows approved roadmap data already surfaced by `getPortalRoadmapDocs` / `getPortalContext`. No internal draft/ops data.
- Reuses existing portal shell in `src/routes/portal.tsx` (sidebar, header, sign-out).
- Preserves current server functions and acknowledgement/download event tracking (`recordPortalRoadmapEvent`).
- Desktop-first; graceful tablet/mobile fallback.

## Data mapping

The `client_portal_roadmaps` row already provides:
- `title`, `version_label`, `approved_at`, `executive_summary`
- `current_diagnosis`, `strategic_priorities[]`, `sequence_30_60_90` (Now/Next/Later), `risks_dependencies`, `recommended_next_move`

Derive canvas structure from that row (no schema changes):
- Point A = "Current state" (from `current_diagnosis` / project point_a if present)
- Point B = "Destination" (from project point_b or executive summary tagline)
- Phases (3): Now (0–30d), Next (31–60d), Later (61–90d) — from `sequence_30_60_90`
- Milestones: items inside each phase bucket; `strategic_priorities` map onto the most relevant phase (default: Now) as anchor milestones
- Status: first Now milestone = "in progress"; earlier ones = "completed" if `acknowledged_at`; upcoming otherwise. Blocked/optional only if item metadata flags it.
- Progress %: derived from completed vs total milestones
- When fields are missing, render a friendly empty-state milestone rather than mocking

## Page structure (in order)

1. **Header strip** (top of main content)
   - Eyebrow "Roadmap" • Title (from doc) • Status pill "Approved" • Current-phase pill • "Last updated {date}"
   - Actions: Book next call (links to `/portal/messages` for now, placeholder handler), Download PDF (only if a real `file_url` — otherwise hidden), Request clarification (opens Messages with milestone context prefilled via query param)

2. **Executive snapshot strip** (compact 4–5 stat row)
   - Current focus • Active milestone • Progress % (bar) • Next milestone • Next review date (from project data if available; hide otherwise)

3. **Phase jump nav** (sticky pills above canvas)
   - Point A · Phase 1 Now · Phase 2 Next · Phase 3 Later · Point B
   - Highlights currently-in-view phase; click smooth-scrolls the canvas horizontally

4. **Journey canvas** (hero, horizontally scrollable)
   - Wide container with `overflow-x-auto`, drag-to-pan (pointer events), shift+wheel and trackpad support
   - SVG route: single smooth cubic path from left (Point A flag) to right (Point B flag) with gentle curves; completed portion drawn in `royal`, upcoming in muted ink
   - Subtle terrain background (soft contour SVG lines / gradient washes) — no heavy imagery
   - Phase bands: three faint vertical zones with phase label + short "what happens here" line
   - Milestone nodes positioned along the path; each node has status-specific styling (completed = filled check, in-progress = pulsing ring, upcoming = outlined, blocked = amber warning, optional = dashed)
   - Load-in animation: path draws left→right (`stroke-dasharray`), nodes fade/scale in sequence, labels last. Respects `prefers-reduced-motion`.

5. **Milestone interaction**
   - Hover: node lifts + glow, route segment highlights, tooltip (Radix) with title/phase/status/one-liner + "View details" hint
   - Click: opens right-side Sheet (`components/ui/sheet.tsx`) with milestone detail; canvas dims behind; ESC / outside click / X closes; focus trapped
   - Sheet contents: title, phase, status badge, why it matters, what success looks like, key actions, dependencies, related files (from `client_portal_files` if linked, else hidden), Trust Tai notes, action buttons (Request clarification → `/portal/messages?milestone=<slug>`; Book next call; Open file)
   - Selection memory: selected milestone reflected in URL as `?m=<slug>`; deep-link opens the sheet on load

6. **Supporting context** (below canvas, existing card rhythm)
   - Executive summary • Strategic priorities • Risks & dependencies • Recommended next move
   - Existing **Acknowledge roadmap** block (unchanged behaviour + persistence fix already landed)

## Responsive

- ≥1024px: full canvas + right Sheet
- 640–1023px: canvas remains horizontal, Sheet becomes full-width overlay, jump pills scroll
- <640px: convert to a paged phased view (swipeable via native scroll-snap), milestone details open as full-screen Sheet

## Files

**New**
- `src/components/portal/roadmap/JourneyCanvas.tsx` — SVG canvas, path, terrain, nodes, drag/scroll
- `src/components/portal/roadmap/MilestoneNode.tsx` — status-aware node + hover tooltip
- `src/components/portal/roadmap/MilestoneSheet.tsx` — right slide-over detail panel
- `src/components/portal/roadmap/PhaseJumpNav.tsx` — sticky pills + in-view detection
- `src/components/portal/roadmap/RoadmapHeader.tsx` — title, status pills, primary CTAs
- `src/components/portal/roadmap/ExecutiveSnapshot.tsx`
- `src/lib/portal-roadmap-model.ts` — pure fn: `PortalRoadmapDoc` + project → `{ pointA, pointB, phases[], milestones[] }`; slug + status derivation; unit-tested

**Edited**
- `src/routes/portal.roadmap.tsx` — replace current single-card markdown view with the new composition; keep the empty-state and revoked-access branches; keep acknowledge block; consume `?m=` search param for deep link
- (optional) `src/lib/portal.functions.ts` — if snapshot needs `sequence_30_60_90` fields not already returned, extend the select list (they already are)

**Not touched**
- `src/routes/portal.tsx` shell, sidebar, auth
- All server functions and access checks
- Any ops/engine surfaces

## Interaction spec (verbatim for implementation)

- Node hover: scale 1.04, ring glow (royal 30% alpha), route segment stroke +2, tooltip after 150ms
- Node click: open Sheet from right, 240ms ease-out; backdrop 40% ink; ESC/outside/X close
- Phase pill click: `scrollTo({ left, behavior: 'smooth' })`
- Drag-to-pan: pointer down on canvas empty space sets `cursor-grabbing`, mousemove translates scrollLeft
- Load: 600ms path draw, 60ms stagger nodes, 200ms label fade; skipped if `prefers-reduced-motion: reduce`
- Selection memory via `search: { m }`; using TanStack `useSearch` + `navigate({ search })`

## QA checklist

- Canvas scrolls horizontally by trackpad, shift+wheel, and drag
- Hover, tooltip, click-to-open, ESC/outside close all work with keyboard
- Deep link `/portal/roadmap?m=<slug>` opens correct milestone sheet
- Empty state (no approved roadmap) and revoked branch still render
- Acknowledge flow still persists (verified previously)
- No internal ops fields exposed; no draft data leaks
- Reduced-motion honoured; contrast passes on ink/royal tokens
- Mobile: phase-paged view works and milestone sheet is full-screen

## Out of scope (call out for follow-up)

- Editing/managing phases from admin side (would require new schema)
- Real "related files" wiring beyond what `client_portal_files` already exposes (basic linkage only)
- New Book-a-call scheduler integration — CTA is a placeholder route/modal
