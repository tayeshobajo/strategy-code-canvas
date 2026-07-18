# RT-6 Execution Drift Monitor

Detects when execution (Work tasks, QA evidence, Delivery items) drifts from the approved strategic anchors: **strategic thesis**, **milestone rationale**, and **execution boundary / capability registry**. Complements RT-5, which watches *inbound* intelligence; RT-6 watches *outbound* execution.

## Anchors watched

1. **Thesis anchor** — approved `engine_strategic_thesis` (world entry, wow, destination vocabulary).
2. **Milestone rationale anchor** — approved milestone brief + phase rationale + qualification decision.
3. **Boundary anchor** — approved `engine_project_execution_boundary` + `engine_capability_registry` versions.

## Drift signals

- **Task drift** — new/edited `engine_tasks` whose title, description, or capability tag falls outside the approved capability set for its milestone.
- **Rationale drift** — tasks or evidence that don't map to the milestone's approved rationale bullets (LLM semantic match).
- **Thesis drift** — evidence, delivery items, or task outcomes that contradict the approved world entry / wow claims (LLM judge).
- **Boundary drift** — capability used in execution that isn't in the current approved boundary version.
- **Delivery drift** — `engine_delivery_items` (or `client_portal_*` publish events) whose scope exceeds the approved roadmap version.

## Deliverables

### Data
Migration `engine_execution_drift_signals`:
- id, project_id, milestone_id?, source_kind (task|evidence|delivery|publish), source_id
- anchor_kind (thesis|rationale|boundary|capability)
- severity (low|medium|high), classification (drift|out_of_scope|contradicts|missing_capability)
- summary, rationale_json, suggested_action
- status (open|acknowledged|resolved|dismissed), resolved_by, resolved_at, resolution_note
- created_at, detector_version, model
- unique(project_id, source_kind, source_id, anchor_kind) for dedup
- GRANTs + RLS (authenticated read; service_role all)
- Index on (project_id, status, severity)

### Server functions (`src/lib/engine-execution-drift.functions.ts`)
- `runExecutionDriftScan({ projectId, scopes? })` — orchestrates detectors, calls LLM judges (Lovable AI), upserts signals, dedups.
- `listExecutionDriftSignals({ projectId, status?, severity? })`
- `acknowledgeDriftSignal({ id, note })`
- `resolveDriftSignal({ id, note, action })` — action = amend_roadmap | update_boundary | reject_work | ignore
- `dismissDriftSignal({ id, note })`
- `getDriftSummary({ projectId })` — counts by severity/anchor for the rail.

### Detectors (`src/lib/execution-drift/`)
- `detect-boundary.ts` — pure SQL diff of task/evidence capabilities vs approved boundary.
- `detect-rationale.ts` — LLM semantic match of task titles/descriptions to milestone rationale bullets.
- `detect-thesis.ts` — LLM contradiction judge over evidence/delivery text vs thesis world/wow.
- `detect-delivery.ts` — diff delivery items vs approved roadmap version scope.
- Shared `judges.ts` using `callLovableAi` + `parseJsonOutput`.

### UI
- New route `src/routes/engine.projects.$projectId.drift.tsx` — **Execution Drift Monitor** room:
  - Header with "Run drift scan" button + last-scan timestamp
  - Filters: status, severity, anchor kind
  - Grouped list of signals with source deep-links (task/evidence/delivery), suggested action, and Acknowledge / Resolve / Dismiss actions
  - "Convert to roadmap amendment" quick-action → prefills RT-5 amendment proposal
- Right rail panel `DriftSummaryPanel.tsx` (drop-in for project rail, similar to `LatestAmendmentsPanel`) showing top 3 open high-severity signals.
- Add "Drift Monitor" to `LeftProjectRail` under Intelligence.

### Wiring
- Add drift scan step to `roadmap-synthesis` orchestrator as a post-execution audit step (non-blocking).
- Materiality changes to thesis/rationale/boundary trigger a targeted drift rescan of affected scopes.
- Route-level loader uses `getDriftSummary` for badge counts on nav.

### Notifications
- `notifyOperators` on new high-severity drift signals and on resolutions.

## Non-goals for this pass
- No automatic write-blocking of drifting tasks (advisory-only in RT-6).
- No client-portal exposure of drift signals.
- No historical drift analytics dashboard (deferred).

## Technical notes
- Reuse `callLovableAi` (Gemini default) with tight JSON schemas for judge outputs.
- All detectors idempotent; dedup via unique index; scans record a `detector_version` so we can invalidate old signals on prompt changes.
- Follow project rules: migration adds GRANTs; no self-approval — resolutions record `resolved_by` distinct from `created_by` when the signal was AI-authored.
