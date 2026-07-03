## Goal

Load the Mental Dental Academy roadmap as the approved roadmap for `shobajotaye@gmail.com`, using the exact client-facing copy you provided. Fill in only the small amount of demo data the copy doesn't cover (project record, a placeholder Q-Bank Schema PDF URL). Update a few state strings on `/portal/roadmap` so the loading / not-published / error / not-found copy matches the spec.

I will not redesign the canvas or add the sidebar mock, mini-map, or dropdown menus from the reference screenshot — that's a separate scope.

## What's already in place

- Client `shobajotaye@gmail.com` has an active `client_portal_permissions` row for project `aaaaaaa1-0000-4000-8000-000000000001`.
- That project already has one seeded roadmap row (`Jotaye Ventures — Strategy Sprint Roadmap`, status `delivered`). I'll replace it with Mental Dental.
- The portal page reads only from `client_portal_roadmaps` and maps `sequence_30_60_90` → three phases; each item's `kind` / `type` / `file_url` / `meeting_at` drives the marker variant already supported by `MilestoneNode`, `MilestoneSheet`, and `portal-roadmap-model.ts`.

## Step 1 — Migration: seed Mental Dental roadmap

New migration `seed_mental_dental_roadmap.sql`.

1. `UPDATE client_portal_roadmaps SET status='archived'` for any existing row on that project (keeps history intact, hides it from the portal — the query filters `status IN ('approved','delivered')`).
2. `INSERT INTO client_portal_roadmaps` a single row with:
   - `project_id = aaaaaaa1-0000-4000-8000-000000000001`
   - `title = 'Roadmap to Scale Dental Board Prep'`
   - `version_label = 'Version 1'`
   - `status = 'approved'`, `approved_at = 2025-06-20T09:30:00Z`
   - `current_focus = 'Phase 1: Pre-Test Readiness'`
   - `owner_name = 'Trust Tai'`
   - `next_meeting_at = 2025-06-27T14:00:00Z`
   - `executive_summary` = the "What this roadmap is designed to do" body (also drives Point B detail)
   - `current_diagnosis` = Point A summary from the copy (drives Point A detail)
   - `recommended_next_move` = "Confirm the question import format so the Q-Bank structure can move forward without rework."
   - `strategic_priorities` = JSON array of the 5 priorities you listed
   - `risks_dependencies` = JSON of the dependency notes captured across milestones
   - `share_url` = `/files/mental-dental-roadmap-v1.pdf` (placeholder for the Download PDF button)
   - `sequence_30_60_90` = a JSON object bucketed into `now` / `next` / `later` (see Data Structure below)
   - `metadata` = `{ "company": "Mental Dental Academy", "subtitle": "A clear view of the journey, the active work, and the decisions ahead." }` for future use — the portal ignores this today

## Step 2 — Copy tweaks on `/portal/roadmap`

Change only the strings; no layout changes. In `src/routes/portal.roadmap.tsx`:

- Page title in `<head>` → `Your Roadmap Canvas — Trust Tai portal`.
- `Loading`: headline `Loading your roadmap canvas…`, subline `Preparing the latest approved version.`
- `FailedToLoad`: headline `We could not load your roadmap.`, body `Please refresh the page. If this continues, contact Trust Tai and we will help.`, buttons `Refresh` (calls `reset`) and `Contact Trust Tai` (→ `/portal/messages`).
- No-docs state: headline `Your roadmap is being prepared.`, body `Once your approved roadmap is ready, it will appear here as a visual journey from current state to future state.`, CTA `Contact Trust Tai`. (I'll skip the 4-step status ladder — it's not driven by data we have.)
- No-milestones state: keep the current calm empty state, restated as `This roadmap does not yet have milestones on the canvas.`
- Selected-item-not-found toast → `This item is no longer available in the current roadmap version.` (matches spec exactly), and keep the query-param reset so the canvas stays usable.
- Header: `Your Roadmap Canvas` + subtitle `A clear view of the journey, the active work, and the decisions ahead.`

Nothing else in the page structure changes.

## Step 3 — Verify

- `supabase--read_query` on `client_portal_roadmaps` to confirm the new row is the only `approved`/`delivered` one for that project.
- Playwright: sign in as `shobajotaye@gmail.com` (via the injected session), visit `/portal/roadmap`, take screenshots of desktop + mobile confirming the Mental Dental milestones render.

## Data structure for `sequence_30_60_90`

Each phase bucket contains an ordered mix of milestones, decisions, deliverables, meetings, and deadlines — the model already accepts `kind: 'decision' | 'deliverable' | 'meeting'` (deadlines will use `kind: 'milestone'` with a `due_date` since the model doesn't have a distinct deadline kind — visually still distinct via status).

```text
now (Phase 1 — Foundation):
  - Discovery & Audit                (milestone · completed)
  - Content Import & Structuring     (milestone · in_progress · client_action_needed)
  - Q-Bank Engine                    (milestone · in_progress · target_date 2025-07-15)
  - Question Import Format           (decision  · due 2025-06-25 · options + recommended)
  - Q-Bank Schema v1.0               (deliverable · file_url · published 2025-06-18)
  - Strategy Alignment Call          (meeting · meeting_at 2025-06-27T14:00Z)
  - Pre-Test Ready                   (milestone · due 2025-10-01 · "deadline")

next (Phase 2 — Core Platform Build):
  - Pre-Test Experience              (milestone · upcoming)
  - Mock Exam Engine                 (milestone · upcoming)
  - Third-Party Integrations         (decision · due 2025-07-15)
  - Pre-Test Flow Outline            (deliverable)

later (Phase 3 — Scale Systems):
  - School Portal                    (milestone · upcoming)
  - Analytics Layer                  (milestone · upcoming)
  - AI Knowledge Layer               (milestone · upcoming)
  - School Portal Outline            (deliverable)
  - Go-To-Market Plan                (decision · due 2025-08-10)
  - First School Launch              (milestone · due 2026-01-01 · "deadline")
```

Each item carries the full drawer copy from your spec: `summary`, `detail` (Why it matters), `success_looks_like`, `unlocks`, `dependencies`, `client_action_needed`, `latest_update`, `owner_note` where provided.

## Out of scope for this pass

The reference screenshot shows features that aren't part of the current codebase — left status panel, "Fit to field / Jump / View" command bar, phase territory tooltips, legend chips, decision "Confirm recommendation" flow, PDF-hosted asset upload. Happy to plan those next; today's plan just gets your real Mental Dental content on screen with the correct state copy.
