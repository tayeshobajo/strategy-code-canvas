# RT-4 — Strategic Thesis + Full Qualification

Build the artifact that turns approved World Entry + Execution Boundary into a testable strategic thesis, then gate every milestone through a formal qualification ceremony (World fit + Wow fit + human approval).

## Scope

Three coupled surfaces, mirroring the RT-2 / RT-3 pattern already in the codebase.

### 1. Strategic Thesis artifact (project-level, versioned, second-reviewer approved)

New table `engine_project_strategic_thesis` (versioned like execution boundary) storing:
- `bet_statement` — the one-line thesis
- `why_now` — timing rationale
- `wedge` — the entry wedge tied to World Entry destination
- `proof_metrics[]` — how we'll know it's working (metric, target, horizon)
- `kill_criteria[]` — what would falsify the thesis
- `assumptions[]` — with confidence levels
- `linked_world_entry_version`, `linked_execution_boundary_version` (traceability)

Second-Reviewer trigger (creator ≠ approver), AI-draft server fn seeded from approved World Entry + Execution Boundary + intake.

Sidecar row in `engine_spine_field_truth` (`field_type='strategic-thesis'`) so Spine readiness picks it up. Register in `roadmap-synthesis/registry.ts` as an RT-4 step depending on RT-2 + RT-3.

### 2. Qualification judges (LLM World Judge + Wow Judge)

Server-side judges in `src/lib/engine-milestone-qualification.functions.ts`:
- **World Judge** — given a milestone brief + approved World Entry + Strategic Thesis, returns `{ verdict: 'passes'|'fails'|'unclear', rationale, cited_world_entry_sections[] }`. Checks the milestone advances the destination, uses correct vocabulary, doesn't contradict competitor positioning.
- **Wow Judge** — given the milestone brief + Strategic Thesis proof metrics + Execution Boundary, returns `{ verdict, rationale, wow_score 1–5, risks[] }`. Checks the milestone moves a proof metric materially and stays inside boundary.

Both judges use `callLovableAi` + `parseJsonOutput`, cite source rows, and persist a `engine_milestone_qualification_runs` row (immutable log).

### 3. Milestone Approval Ceremony

A per-milestone ceremony UI at `/engine/projects/$projectId/milestones/$milestoneId/qualify` and a modal entry from the roadmap view:
1. Show milestone brief + auto-run both judges (with re-run button)
2. Show judge verdicts side-by-side with rationale and cited sources
3. Require the human approver to (a) acknowledge each judge, (b) mark milestone as `qualified` or `rejected` with a note, (c) enforce Second-Reviewer (approver ≠ author of brief)
4. On approval: write `engine_milestones.qualified_at / qualified_by`, log to `engine_activity` + `engine_project_chat_events`, and mark the qualification gate green in the readiness matrix

New table `engine_milestone_qualification_runs` (judge, verdict, rationale, citations, model, tokens, created_at) — append-only, never edited.

## UI additions

- **Left rail**: add "Strategic Thesis" nav item under Execution Boundary.
- **Roadmap view**: per-milestone chip — `Not qualified` / `World: pass · Wow: pass` / `Rejected` with an "Open ceremony" action.
- **Milestone readiness matrix**: new "Qualified" gate column, red until ceremony passes.
- **Spine readiness**: add `strategic-thesis` and `milestones-qualified` checks (all approved milestones must be qualified before Spine hits 100%).

## Migrations (appended to `.orchestrator/PENDING_MIGRATIONS.md`, applied on approval)

1. `engine_project_strategic_thesis` (versioned + second-reviewer trigger + RLS)
2. `engine_milestone_qualification_runs` (append-only + RLS)
3. `engine_milestones` — add `qualified_at timestamptz`, `qualified_by uuid`, `qualification_status text`
4. Extend `engine_spine_field_truth.field_type` check to allow `strategic-thesis` and `milestones-qualified`
5. GRANTs on all new tables

## Files

Create:
- `src/lib/engine-strategic-thesis.functions.ts` (CRUD, propose, approve, AI-draft)
- `src/lib/engine-strategic-thesis-ai.functions.ts`
- `src/lib/engine-milestone-qualification.functions.ts` (World + Wow judges, ceremony fns)
- `src/routes/engine.projects.$projectId.strategic-thesis.tsx`
- `src/routes/engine.projects.$projectId.milestones.$milestoneId.qualify.tsx`
- `src/components/engine/QualificationCeremonyModal.tsx`
- `src/components/engine/JudgeVerdictCard.tsx`
- `src/lib/roadmap-synthesis/runners/strategic-thesis.ts`

Modify:
- `src/lib/roadmap-synthesis/registry.ts` — add RT-4 steps (thesis, qualify-milestones)
- `src/lib/roadmap-synthesis/gates.ts` — read thesis + qualification sidecars
- `src/lib/spine-readiness-evaluator.ts` — add two checks
- `src/lib/milestone-readiness-evaluator.ts` — add qualified gate
- `src/components/engine/LeftProjectRail.tsx` — add nav item
- `src/routes/engine.projects.$projectId.roadmap.tsx` — per-milestone qualification chip + ceremony launcher

## Out of scope (deferred)

- Client-visible thesis export (RT-2 pattern already covers export; will reuse in a later phase)
- Auto-re-run of judges when thesis version changes (manual re-run only in this phase)
- Wow-score trending / historical charts

## Approval / build order

1. Server-function scaffolding + migration file (surface migration for approval first)
2. AI drafting + judges
3. UI rooms + ceremony modal
4. Registry + readiness integration
5. Roadmap chip + rail nav
