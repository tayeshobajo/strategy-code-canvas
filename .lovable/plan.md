# Project Spine v1 — Build Plan

Central living blueprint per project at `/engine/projects/$projectId/spine`. Internal-only; reuses existing operator gate on the parent workspace route.

## Route & Navigation

- New file: `src/routes/engine.projects.$projectId.spine.tsx` (child of existing workspace layout so `ProjectHeaderStrip`, `WorkspaceStepper`, and operator gate apply automatically).
- Add "Project Spine" entry to `WORKSPACE_STEPS` metadata or directly into `WorkspaceStepper` as a pinned non-numbered link (avoids renumbering the 14 steps). Preferred: add a small "Pinned" row above the numbered stepper in `WorkspaceStepper.tsx` with a single link to Spine.
- Access is inherited: parent `engine` layout already gates operators/admins. No new auth logic.

## Data Layer

One new server function: `getProjectSpine({ id })` in `src/lib/engine.functions.ts` (protected via `requireSupabaseAuth` + operator/admin role check, same pattern as `getProjectWorkspace`).

Returns a single payload assembled from existing tables (no schema changes):

```text
project        engine_projects (name, status, current_step, current_step_num,
               frame/type from settings jsonb, point_a, point_b, roadmap jsonb)
nba            compute_engine_next_best_action(project_id)
sources        engine_sources summary + last engine_extraction_runs
version        latest engine_roadmap_versions (status, label, payload)
milestones     engine_milestones grouped by phase (id, name, status, phase,
               review state)
tasks          engine_tasks (all cols incl. phase, milestone_id, ai_generated,
               purpose, expected_artifact, acceptance_criteria, qa_checklist,
               risks, dependencies, status, priority, owner)
reviews        engine_review_items where status='pending'
activity       engine_activity latest 20
notifications  operator_notifications for this project (latest 20)
audit          engine_audit_log latest 20
portal         client_portal_roadmaps (id, status) — for QA gate readout only
```

Loader uses `context.queryClient.ensureQueryData` + `useSuspenseQuery` (canonical pattern).

## Page Layout

Two-column at ≥lg, stacked on mobile:

```text
┌─────────────────────────────────────────┬──────────────────┐
│ 1. Project Direction                    │ 5. AI PM Panel   │
│ 2. Approved Scope                       │    (sticky)      │
│ 3. Roadmap Spine (phases → milestones)  │                  │
│ 4. Task Spine (grouped phase/milestone) │                  │
│ 6. QA Gates                             │                  │
│ 7. Activity & Decisions                 │                  │
└─────────────────────────────────────────┴──────────────────┘
```

### 1. Project Direction
Card with: name, frame/type, goal, Point A, Point B, current status badge, current step, live NBA (action + reason + severity + href button), intake source summary (count + last run status).

### 2. Approved Scope
Read from latest approved `engine_roadmap_versions.payload` (jsonb). Render: included, excluded, assumptions, constraints, open_questions, decisions[]. For any missing key, show a muted "Not yet captured — [link to relevant step]" line. No fabrication.

### 3. Roadmap Spine
Group `engine_milestones` by `phase`. Per phase: collapsible section with milestones showing name, status pill, review state, linked task count, blocked indicator when any child task is blocked.

### 4. Task Spine
Same phase grouping, nested milestone groups. Each task card shows all decomposition fields. Visual treatment:
- `status='suggested'` + `ai_generated=true` → dashed border, amber "AI suggested — needs approval" chip.
- `status in ('approved','in_progress','done')` → solid border, status color.
- `status='blocked'` → red left border + reason.
Empty state per milestone: "No tasks yet — [Decompose with AI]" button (calls existing `generateTasksForApprovedMilestones`).

### 5. AI Product Manager Panel (right rail)
New component `ProjectSpineAiPanel.tsx`. Computes each bucket from the payload (pure client-side derivation, no new AI calls):
- **What I know**: has approved version, milestone count, task count, phases present.
- **What is missing**: explicit list — no Point A, no approved version, no phases, no tasks in phase X, no acceptance criteria on task Y, etc.
- **What changed**: last 5 `engine_activity` entries (title + relative time).
- **What is blocked**: blocked tasks + failed runs + pending reviews > threshold.
- **What I recommend next**: mirrors NBA output.
- **What I can draft now**: enumerates available drafters (task decomposition for approved milestones without tasks, roadmap version generation, etc.) with action buttons that hit existing functions.
- **What needs approval**: count of `status='suggested'` tasks + pending review items + AI-draft roadmap versions.

### 6. QA Gates
Static gate definitions, each computed against real state:

| Gate | Pass condition |
|---|---|
| Role access | operator/admin gate present on route (always pass — informational) |
| Data integrity | no failed runs, no orphan tasks (task.milestone_id resolves) |
| Approval gates | no `ai_generated` roadmap version in `delivered` portal row |
| Client portal safety | `client_portal_roadmaps.status` != approved when engine version = ai_generated |
| Backend readiness | latest extraction run succeeded |
| Mobile responsive | informational only |
| Delivery readiness | approved version + portal linked + no blocked tasks |

Each row: status pill (pass/warn/fail), one-line reason, "Next action" link.

### 7. Activity & Decisions
Three stacked lists: recent activity (20), operator notifications (10), pending review items (link to /reviews). Compact rows, timestamps.

## Files

Create:
- `src/routes/engine.projects.$projectId.spine.tsx`
- `src/components/engine/spine/ProjectDirectionCard.tsx`
- `src/components/engine/spine/ApprovedScopeCard.tsx`
- `src/components/engine/spine/RoadmapSpine.tsx`
- `src/components/engine/spine/TaskSpine.tsx`
- `src/components/engine/spine/ProjectSpineAiPanel.tsx`
- `src/components/engine/spine/QaGates.tsx`
- `src/components/engine/spine/ActivityDecisions.tsx`

Edit:
- `src/lib/engine.functions.ts` — add `getProjectSpine`.
- `src/components/engine/WorkspaceStepper.tsx` — add pinned Spine link.

No migrations. No schema changes. No new secrets. No portal-facing changes.

## Acceptance Verification

After build, verify via `supabase--read_query` against August 1, Jotaye, INBDE:
- Spine loads and shows real NBA (matches `compute_engine_next_best_action`).
- Tasks group by phase; AI-generated visually distinct.
- QA gates reflect actual state (e.g., INBDE ai_generated version → approval gate warns).
- Missing data messages appear where fields absent.
- Route inaccessible to non-operator (confirmed via existing parent gate).

## Out of Scope (defer)
- New AI drafters for scope/decision fields.
- Editing tasks inline on Spine (link out to existing task page).
- Schema additions for scope fields (included/excluded/assumptions) — v2 once we confirm operators want them as first-class columns vs. staying in version payload.
