# Project Spine Proof Pass — Plan

Scope: fix small clarity gaps, seed realistic Jotaye data, re-run authenticated QA. No new features, no per-step generators, no Chat, no Spine redesign.

## 1. Source counter labeling (Spine "Project Direction" / sources card)

File: `src/routes/engine.projects.$projectId.spine.tsx` (and the derivation in `getProjectSpine` in `src/lib/engine.functions.ts` if the aggregation happens server-side).

- Replace the current `total / processing / processed` display with 5 buckets: `total`, `queued`, `processing`, `processed`, `failed`.
- Compact form when space-constrained: `N total · N queued · N processed` (only expand to include processing/failed when > 0).
- Ensure `queued` rows from `engine_sources.status = 'queued'` are NOT summed into processing.

## 2. Seed realistic QA data for Jotaye Ventures

Deliver as a new SQL migration under `supabase/migrations/` scoped to `project_id = 'bbbbbbb1-...-0002'` (Jotaye). Idempotent (guard with `ON CONFLICT` / `WHERE NOT EXISTS`). This is seed data, but a migration is the only supported channel; script is safe to re-run.

Contents:
- **Phases**: three logical phases used as `engine_milestones.phase` and `engine_tasks.phase` values — `foundation`, `build_system`, `launch_optimize` (labels rendered in UI).
- **Milestones (6)** across the phases with `title`, `phase`, `status`, `priority`, `summary`/`client_safe_md`, `acceptance_criteria`, source evidence fields where the column exists.
- **Tasks (10)** linked to milestones/phases, covering the full matrix:
  - 2 `ai_generated = true`
  - 1 `status = 'blocked'` (+ blocking reason)
  - 2 `status = 'in_progress'`
  - 2 `status = 'completed'`
  - 1 with `dependency_notes`
  - 1 with `risks` jsonb
  - 1 with `qa_checklist` jsonb
  - 1 with `expected_artifact`
  - `acceptance_criteria` populated wherever supported
- **Signals**:
  - 1 `engine_review_items` row (`status='pending'`)
  - 1 `engine_activity` row (recent, severity `warning`)
  - 1 `operator_notifications` row linked to Jotaye (kind `task_blocked` or similar, with href into task board)
- Post-seed: call `public.recompute_engine_project_state('<jotaye>')` at the end of the migration and confirm via `SELECT * FROM compute_engine_next_best_action(...)` that NBA reflects blocked/review state.

Before writing: read `engine_milestones`, `engine_tasks`, `engine_review_items`, `engine_activity`, `operator_notifications` schemas to use only columns that exist.

## 3. QA gate next-action links

File: `computeGates` inside `src/routes/engine.projects.$projectId.spine.tsx`.

For every warn/fail gate, add `nextLabel` + `nextHref`:

| Gate | Next href |
|---|---|
| Approval | `/engine/projects/$id/reviews` |
| Backend readiness | `/engine/projects/$id/blueprint` |
| Portal safety | `/engine/projects/$id/delivery` |
| Data integrity | `/engine/projects/$id/signal-room` |
| Blocked tasks | `/engine/projects/$id/agent/tasks` |
| Delivery readiness | `/engine/projects/$id/delivery` |

Info-status rows: link only when useful; otherwise omit.

## 4. Rename mobile gate

Same file. Rename `Mobile responsive` → `Responsive readiness`.
- Status: `manual_review` (falls back to `info` styling).
- Reason: "Mobile and tablet review has not been captured for this project yet."
- Next action: label "Run responsive QA", href `/engine/projects/$id/spine` anchor or a stubbed responsive-QA route if it exists; otherwise omit href and keep as manual reminder.

## 5. Re-run authenticated Spine QA

Playwright (headless Chromium, session-injected):
- Desktop 1440, tablet 768, mobile 390.
- Capture: full Spine, Project Direction + NBA, Roadmap Spine (grouped milestones), Task Spine (grouped phase+milestone), one AI-suggested task card, blocked task card, AI PM panel, QA Gates, Activity/Decisions.
- Plus: signed-out redirect proof.

Verify checklist (pass/fail table):
- Sources counter no longer conflates queued/processing
- Roadmap & Task Spine render non-empty for Jotaye
- Milestones group by phase; tasks group by phase→milestone
- `engine_tasks.phase` used correctly
- AI-generated tasks visually distinct (dashed/border/badge)
- Blocked task visually obvious
- Acceptance criteria, QA checklist, risks, dependencies, expected artifact all render
- AI PM panel reflects seeded state (differs from empty projects)
- NBA reflects blocked/review after seed
- QA gate next links resolve
- Activity/notification deep links resolve
- Portal isolated (grep re-run: no Spine payload usage in `src/routes/portal.*` or `src/components/portal/*`)

## Deliverables

Report: executive summary, screenshots, pass/fail table, source-counter fix evidence, seeded data summary, Roadmap/Task Spine verification, AI PM panel verification, QA gate verification, permission/safety regression, remaining gaps.

## Out of scope

Project Chat, per-step AI generators, Spine redesign, production data changes outside the Jotaye seed migration.
