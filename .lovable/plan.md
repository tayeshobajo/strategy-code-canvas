## Project Roadmap Workspace — 14-step build

Build the per-project workspace at `/engine/projects/$projectId/overview` (existing route) plus 13 sibling step pages, all sharing a workspace layout with breadcrumb + horizontal stepper. Steps stay scoped to the project — not in the global sidebar.

### Route structure

Convert the current `engine.projects.$projectId.overview.tsx` into a nested layout with per-step children:

```
src/routes/
  engine.projects.$projectId.tsx              (workspace layout: header, breadcrumb, stepper, <Outlet/>)
  engine.projects.$projectId.overview.tsx     (Project Overview — step 0 / command center)
  engine.projects.$projectId.intelligence.tsx (1)
  engine.projects.$projectId.signal-room.tsx  (2)
  engine.projects.$projectId.extraction.tsx   (3)
  engine.projects.$projectId.point-a.tsx      (4)
  engine.projects.$projectId.point-b.tsx      (5)
  engine.projects.$projectId.hidden-assets.tsx(6)
  engine.projects.$projectId.gap-map.tsx      (7)
  engine.projects.$projectId.blueprint.tsx    (8)
  engine.projects.$projectId.builder.tsx      (9)
  engine.projects.$projectId.sequencing.tsx   (10)
  engine.projects.$projectId.deadlines.tsx    (11)
  engine.projects.$projectId.investment.tsx   (12)
  engine.projects.$projectId.preview.tsx      (13)
  engine.projects.$projectId.delivery.tsx     (14)
```

Layout renders: breadcrumb (`Projects / <Client> / Roadmap Workspace / <Step>`), project header strip (client, status, health, progress, signals count, Project Settings), and a horizontal 14-step stepper with checkmark / active / numbered states linking to each sibling route. Sticky on scroll.

### Data model (migration)

Add per-step JSONB storage on `engine_projects` so v1 works without 14 new tables:

- `signal_room jsonb`, `extraction jsonb`, `point_a jsonb`, `point_b jsonb`, `hidden_assets jsonb`, `gap_map jsonb`, `blueprint jsonb`, `roadmap jsonb`, `sequencing jsonb`, `deadlines jsonb`, `investment jsonb`, `client_preview jsonb`, `delivery jsonb`
- `current_step smallint default 1`, `progress_pct smallint default 0`
- Seed the Mental Dental Academy row with realistic content matching the reference screenshot (Point A: 12 diagnosis cards; deadlines Oct 1 2025 + Jan 1 2026; blueprint node list; 3 investment phases)

Admin-only RLS (reuse existing pattern on `engine_projects`).

### Server functions (`src/lib/engine.functions.ts`)

- `getProjectWorkspace({ projectId })` — returns project + all step JSON blobs + step completion booleans
- `updateProjectStep({ projectId, step, data })` — admin-gated writer per step
- `advanceProjectStep({ projectId, step })` — sets `current_step`, recomputes progress

### Page contents (all admin-gated, editable via forms; read-only when no data yet)

1. **Project Overview** — command-center grid matching spec: status, roadmap version, approved version, agent status, critical dates, health score, open decisions, modules needing review, latest source, next best action, recent activity feed, and 4 shortcut cards (Intelligence, Builder, Preview, Delivery).
2. **Signal Room** — tabbed input surfaces for Transcript / Brief / URL / Uploads / Notes / Screenshots / Research / Previous roadmap.
3. **Signal Extraction** — 10 extracted categories rendered as editable cards.
4. **Point A Diagnosis** — 6 lens cards on top row (Business Stage, Primary Model, Core Audience, Revenue Model, Current Tech, Active Students) + 9 current-state category cards + Key Diagnosis quote + Business Health Score sidebar (matches screenshot).
5. **Point B Definition** — 7 outcome sections.
6. **Hidden Asset Map** — 8 category columns.
7. **Gap Map** — 9 gap category cards.
8. **System Blueprint** — 13-node grid for Mental Dental with connection lines.
9. **Roadmap Builder** — milestone list with all 12 milestone fields per row (drawer editor).
10. **Sequencing View** — critical path + parallel tracks + dependency matrix.
11. **Deadline Plan** — Oct 1 + Jan 1 milestones with must-haves, owners, risks, fallbacks.
12. **Investment Builder** — 3 phase cards with outcome, systems, timeline, range, risks, exclusions.
13. **Client Preview** — clean render (Exec Summary → A→B Map → Phases → Blueprint → Investment) with "PDF" and "Presentation Mode" buttons; suppresses internal-only fields.
14. **Delivery Prep** — recipient form, channel, attachments, personal note, approval checklist, "Send approved roadmap" (stub for now, writes `engine_activity`).

### Shared primitives

Extend `src/components/engine/primitives.tsx`: add `WorkspaceStepper`, `WorkspaceBreadcrumb`, `ProjectHeaderStrip`, `CategoryCard`, `DiagnosisLensCard`, `HealthScoreDial`.

### Scope / non-goals for this pass

- v1 = full page structure, seeded Mental Dental data, read + edit for all 14 steps, working stepper navigation.
- PDF export and Presentation Mode ship as buttons that render an inline print-friendly view (no external PDF service).
- File uploads on Signal Room use existing Supabase storage bucket pattern; if none exists, stub with URL list and a follow-up plan.
- No new global sidebar entries.

### Technical section

- Convert `overview.tsx` filename → move current logic into new nested layout + `.overview` leaf. `routeTree.gen.ts` regenerates automatically.
- Server fns use `requireSupabaseAuth` + `has_role_email(..., 'admin')` check (same pattern as `getCommandCenter`).
- All writes go through one `updateProjectStep` fn with a `step` discriminator + Zod schemas per step.
- Stepper is a client component reading `current_step` and route match for active highlighting.
