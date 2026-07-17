## Reference read-out

The uploaded mockup differs from the current engine in five specific ways:

1. **Palette** — Page background is a cool cloud-blue-gray (`#F5F7FA` / `#EEF1F6`), not the warm cream `#FBF9F4` we use today. Borders are a cool neutral (`#E5E9F0`) instead of beige `#E8E1D6`. Ink and royal stay.
2. **Type system** — Headings, body, and labels are all sans-serif (a clean neo-grotesque like Inter/Söhne). The engine currently uses `Cormorant Garamond` (serif) for `font-display`, which reads as marketing/editorial. Only the engine should change — the public Trust Tai site keeps the serif.
3. **Global chrome** — Reference shows a **white top nav bar** (Command Center · Projects · Approvals · Operations · Strategic Sales · Settings, Ask Captain + bell + user chip on the right) instead of today's dark left sidebar. A second, lighter **left project rail** hosts the per-project navigation (already in place on the Spine page).
4. **Spine page structure** — Same section order as today (you confirmed the positioning is right), but visually tighter: 7-cell status strip on a single card, Next Best Action highlighted in soft royal-tinted card, Point A/B as equal cards with a connecting arrow, Project Foundation as 6 evenly-spaced tiles, Business Roadmap preview as a 5-node timeline (Point A → Phase 1/2/3 → Point B) with the current phase highlighted.
5. **Right rail** — Captain Brief, Approvals & Blockers, Material Changes, Active Agents — order preserved, spacing tightened, agent status uses colored dot + label (Working / Waiting for approval / Blocked).

## What this plan does

Scope is deliberately limited to the engine surface (`/engine/*`). The marketing site, portal, and intake flows are not touched.

### 1. Engine-scoped theme (new tokens, not a global swap)

- Add a `.engine-theme` class on the engine layout root (`src/routes/engine.tsx` line 207 wrapper).
- In `src/styles.css`, add a `.engine-theme` block that overrides `--paper`, `--paper-soft`, `--rule`, `--rule-soft`, and `--font-display` to the cool palette + sans-serif. Nothing outside `/engine` sees this.
- Load Inter (or agreed sans) via `<link>` in `src/routes/__root.tsx` so `--font-display` inside engine resolves properly.

New engine tokens:

```
--paper:        #F5F7FA   (page bg)
--paper-soft:   #EEF1F6   (card wells, inline surfaces)
--rule:         #E5E9F0   (borders, dividers)
--rule-soft:    #EEF1F6
--font-display: "Inter", system-ui, sans-serif
```

### 2. Global hex → token sweep inside engine files

There are ~226 literal `#FBF9F4` / `#E8E1D6` / `#FAF8F5` usages across engine files (spine, projects list, command center, ops, engine components). Each becomes the matching Tailwind token class:

- `bg-[#FBF9F4]` → `bg-paper-soft`
- `bg-[#FAF8F5]` → `bg-paper`
- `border-[#E8E1D6]` → `border-rule` (or `border-border`)
- `text-[#0A0F1F]` → `text-ink`
- `text-[#667085]` → `text-ink/60`

Because these all resolve through the `.engine-theme` overrides, the cream reads as cool blue-gray inside `/engine` and nothing changes elsewhere.

### 3. Engine top-nav chrome (matches reference)

Rework `src/routes/engine.tsx`:

- Replace the sticky dark left sidebar with a **white top bar** containing the 6 primary nav items, a right-aligned "Ask Captain" pill, notification bell, and user chip.
- The existing per-project left rail on the Spine page (already built) becomes the only vertical navigation; it stays scoped to project routes.
- Preserve the mobile Sheet drawer (same items, opens from a hamburger in the top bar).
- Keep all auth, breadcrumb, and role-check logic intact.

### 4. Project Spine visual pass

File: `src/routes/engine.projects.$projectId.spine.tsx`. No layout reordering (per your instruction); tighten what's there:

- **Status strip** — collapse the 7 cells onto a single card, uppercase micro-labels, single-value + one-line qualifier, small progress bar under "Spine Readiness".
- **Next Best Action** — soft royal tint background (`bg-royal/5` inside engine theme), compass/anchor icon on the right, meta chips row (`Impact · Unlocks · Owner · Due`).
- **Point A / Point B cards** — equal columns, small icon + label + subtitle header, 3-line summary, meta grid (Sources · Confidence · Approved By · Approved On or Last Updated · Needs Approval), links row (View details / Open intelligence room). Arrow between the two cards on desktop.
- **Project Foundation** — 6 evenly-spaced tiles in one horizontal row with an icon, label, and one metric line per tile; "View all foundation" link on the right.
- **Business Roadmap Preview** — 5 nodes (Point A · Phase 1 · Phase 2 · Phase 3 · Point B) with connector lines, current phase highlighted with royal ring; footer summary shows Current Phase, Target Completion, View full roadmap link.
- **Right rail** — same components as now; tighten padding, remove border weight, agent list uses colored dot + status label.

Preserved as-is per your note: card order, Ask Captain modal, Source Inspector, thread persistence, focus trap, deep-link validation.

### 5. Sanity check other engine pages

Because the sweep and the theme layer are engine-wide, the Command Center, Projects list, Approvals, Operations pages inherit the new palette + sans-serif automatically. I'll do a quick pass on those three to fix anything that visually breaks (e.g. white-on-cream badges that need re-tuning against blue-gray).

## Files to change

- `src/styles.css` — add `.engine-theme` block with engine tokens.
- `src/routes/__root.tsx` — add Inter `<link>` (public font, single stylesheet).
- `src/routes/engine.tsx` — swap dark left sidebar for white top nav, wrap with `.engine-theme`.
- `src/routes/engine.projects.$projectId.spine.tsx` — visual pass on status strip, NBA card, Point A/B, Foundation strip, Roadmap preview, right rail.
- 20 engine route/component files — mass replace hardcoded cream/beige hex values with tokens.

## Not in scope

- No changes to marketing site, portal, intake, auth pages.
- No new server functions, no schema changes.
- No changes to card ordering on the Spine page (you confirmed positioning is right).
- No changes to Ask Captain, Source Inspector, thread persistence, focus trap, or deep-link validation shipped last turn.

## Risks / assumptions

- **Font choice**: I'll use **Inter** unless you'd rather Söhne, Manrope, or another sans. Inter is free, close in feeling to the reference, and pairs cleanly with the geometric icons.
- **Top-nav swap** is the biggest structural change. If you'd rather keep the current dark left sidebar and only re-skin the palette/font, tell me and I'll drop step 3.
- Some engine pages have inline badge tones tuned for cream (soft green/red). Against cool blue-gray those may look chalky; I'll retune contrast on the pass in step 5.

## Verification

- Spine page at 1440px, 1024px, 375px against the reference — colors, spacing, card composition.
- Marketing home page unchanged (serif + cream preserved).
- Typecheck + preview walkthrough of Command Center, Projects list, Approvals to confirm nothing regressed visually.
