# Roadmap Canvas — "10/10" Polish Pass

Goal: take the current roadmap from "very good" to a signature, high-ticket, cinematic experience that clients screenshot and share. Every change below is scoped to the roadmap surface (canvas + mini-map + drawer). No backend, no data-model changes.

---

## 1. Cinematic first impression

- **Intro sequence (once per session):** on first mount, camera pans from Point A → current phase over ~1.4s with easing (`easeInOutCubic`), route line "draws in" left-to-right using stroke-dashoffset, and the current-phase pin does a soft pulse-in. Respect `prefers-reduced-motion` (skip pan, fade route in).
- **Parallax depth:** background map image gets a subtle 2-layer parallax on pointer move (max 6px translate) so the map "breathes." Off on touch + reduced motion.
- **Ambient life:** slow twinkle on 3–4 distant "beacon" points near Point B, and a very faint glowing route pulse that travels A→B every ~8s. Purely decorative, pausable via reduced motion.

## 2. Route as a living story

- **Traveled vs. untraveled route:** everything from Point A up to the current milestone renders in a warm gold gradient with a soft glow; everything ahead renders as a cool, thinner dashed line. Instantly communicates progress without reading a number.
- **Segment highlight on selection:** when a phase or milestone is selected, only that segment brightens to full opacity; the rest dims to ~55%. Reinforces focus.
- **"You are here" pin:** upgrade the current-phase marker to an animated compass/beacon (soft ring pulse + tiny drifting particles). This is the emotional anchor of the whole map.

## 3. Marker intelligence, next level

- **Zoom-aware density:** at low zoom, only priority-1/2 markers show labels; at higher zoom, secondary markers reveal labels with a 120ms fade. Uses the existing priority function — no new data.
- **Collision-safe labels:** labels flip side (left/right of pin) automatically when they'd overlap the next marker in the same lane. Extends the existing lane logic.
- **Cluster hover peek:** hovering a `+N` cluster on the main canvas expands a small radial preview of the hidden markers (like Google Maps cluster expand), click-to-lock.
- **Blocked items breathe:** blocked decision pins get a slow red halo pulse so the client's eye is drawn to what needs their input.

## 4. Mini-map upgrades

- **Progress fill inside each phase lane:** the phase segment fills left-to-right based on `phaseCompletion` — a thin luminous bar behind the dots. Turns the mini-map into a progress dashboard at a glance.
- **Now-line indicator:** a vertical "today" marker across the mini-map so clients see where in time they are vs. the plan.
- **Drag-to-scrub:** clicking + dragging across the mini-map scrubs the main canvas viewport in real time, like a video timeline.
- **Mini-map keyboard nav:** ←/→ to move between phases, ↑/↓ to move between milestones in the selected phase, `Enter` to open drawer, `Esc` to close. Announces changes via `aria-live`.

## 5. Drawer polish

- **Contextual mini-map inside drawer:** the drawer header shows a tiny 3-dot strip: previous / current / next milestone, so the client always knows where they are in the sequence.
- **Momentum + spring transitions:** Previous/Next uses a spring animation (framer-motion) with directional slide (left/right), matching the camera pan direction on the canvas.
- **Rich content blocks:** structured sections — "Why this matters," "What we'll deliver," "What we need from you," "Linked decisions" — with iconography and subtle dividers. Empty sections are hidden.
- **Inline actions:** "Book working session," "Ask a question about this milestone," "Mark blocker resolved" (role-gated). Elevates from viewer → participant.

## 6. Ambient audio (opt-in, off by default)

- Small speaker toggle in the top toolbar. When on: faint wind/atmosphere loop on the canvas, soft "chime" on phase change, subtle "click" on marker select. Uses HTMLAudio, preloaded, ≤ 40KB total. Off, muted, and hidden by default for accessibility.

## 7. Shareable moments

- **"Share this view" button:** captures current viewport + selected milestone into a URL (already partly there via `?m=`) plus a generated OG image server-side. Clients love sending "look at where we are" screenshots.
- **Milestone celebration:** when a milestone flips to `completed`, trigger a one-time confetti burst + gold ring on that pin (respect reduced motion). Feels like a win.

## 8. Craft details that signal "premium"

- **Typography rhythm:** phase labels use tighter tracking + a hairline underline on hover. Milestone titles get a font-feature-settings `"ss01"` tweak for elegant numerals on dates.
- **Consistent shadow language:** one shadow token for elevated glass (`--shadow-glass`), one for floating pins (`--shadow-pin`). Removes inconsistent ad-hoc shadows.
- **Focus rings:** all interactive elements share one royal-blue ring token with a 2px offset against the dark map — currently mixed.
- **Loading skeleton:** the canvas gets a shimmering topographic-line skeleton instead of a blank state on first paint.
- **Empty phase state:** phases with 0 real milestones show a soft "Coming into focus" placeholder card instead of an empty lane.

## 9. Accessibility + performance guardrails

- All new animations gated behind `prefers-reduced-motion`.
- Route drawing uses one SVG `<path>` per phase, memoized — no per-frame React re-renders.
- Ambient loops and pulses use CSS animations or `requestAnimationFrame` with visibility-page pausing.
- Every new interactive element is a real `<button>` with `aria-label` and visible focus.

---

## Suggested build order (each is a shippable slice)

1. Traveled-vs-untraveled route + "you are here" beacon + segment-highlight-on-select. *(Biggest wow-per-effort.)*
2. Intro pan + route draw-in animation.
3. Mini-map progress-fill + now-line + drag-to-scrub.
4. Drawer redesign (mini-strip header, structured sections, spring transitions, inline actions).
5. Marker collision-safe labels + cluster hover peek + blocked-item halo.
6. Craft pass: shadow/focus/typography tokens, skeleton, empty states.
7. Celebration confetti + share-this-view.
8. Optional: ambient audio + parallax + beacon twinkle.

## Technical notes (for reference)

- Animations: reuse existing `framer-motion` dep; add no new libs. Confetti via `canvas-confetti` (~5KB) only if we ship #7.
- All new tokens go into `src/styles.css` under `@theme` — no hardcoded colors in components.
- Extend `useRoadmapCanvas` with `travelProgress` (0..1) derived from current milestone index, so the route-fill and now-line share one source of truth.
- No changes to `portal-roadmap-model.ts` or Supabase.

---

**Pick any subset.** I'd recommend starting with steps 1 + 2 + 4 for the largest perceived jump in quality, then layering the rest.
