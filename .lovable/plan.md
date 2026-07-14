
# Hardening Sprint — H4 + H5 + Family-Impact Regression

Five user asks collapse into three build tracks because (1)+(5) are the same H4 work and (2)+(4) are the same H5 work. Track C hardens H2 (family-impact) with idempotency guards and tests.

## Track A — H4 Outcome Scheduler & Coverage (asks 1 + 5)

**Goal:** Broaden outcome feedback beyond delivered projects — cover milestone completions, engine activations, and cost-guard resumes on a scheduled cadence, all with evidence.

**New files**
- `src/lib/engine-outcome-scheduler.functions.ts`
  - `runOutcomeCheckins({ window })` — server fn (staff-gated). Scans:
    - `engine_projects` where `status='delivered'` at 30/60/90d windows
    - `engine_milestones` where `status='completed'` at 14/30d windows
    - `engine_business_engines` where `status='active'` at 30d cadence
    - `engine_projects` recently resumed from `cost_paused_at` (7d recheck)
  - Computes deltas vs baseline `engine_intelligence_memory` snapshot, writes an `engine_review_items` row per finding (`item_type='outcome_checkin'`, `source='outcome_scheduler'`) with `metadata.window`, `metadata.trigger_kind`, `metadata.evidence_refs`.
  - Idempotency: dedupe by `(subject_id, trigger_kind, window)` scoped to last 24h.
  - Writes `engine_activity` audit row per run summarizing counts.
- `src/routes/api/public/hooks/outcome-checkins.ts` — POST hook, verifies `apikey` header matches `SUPABASE_PUBLISHABLE_KEY`, invokes the server-only helper. No PII in response body.
- `src/routes/admin.outcome-scheduler.tsx` — admin surface: last run summary, per-trigger counts, manual "run now" button, open outcome review items list.

**PENDING_MIGRATIONS.md addition (not applied)**
- `pg_cron` schedule (daily 09:00 UTC) calling the public hook with `apikey` header. Documented as proposal only.

**Nav:** add "Outcome scheduler" entry to `src/routes/admin.tsx`.

## Track B — H5 Health Explainability (asks 2 + 4)

**Goal:** Every project/engine health verdict must be traceable to concrete drivers.

**New files**
- `src/lib/engine-health-explainer.functions.ts`
  - `explainProjectHealth({ projectId })` — returns:
    - current status label + score
    - ranked drivers (open review items by severity, business-engine exceptions, cost-pause state, family-impact blockers, stale evidence)
    - evidence refs (audit log ids, review item ids, exception ids) so admins can jump to source
  - `explainEngineHealth({ engineId })` — same shape scoped to a business engine.
- `src/components/HealthExplainerPanel.tsx` — reusable panel: driver list with severity chips, timestamps, deep links to source rows.
- `src/routes/admin.health-explainer.tsx` — picker for project or engine, renders the panel.

**Integration points**
- Mount `HealthExplainerPanel` on:
  - `src/routes/engine/$projectId/index.tsx` (project header)
  - existing portfolio health view (if present under `src/routes/admin.*`)
- No schema changes — reads existing `engine_review_items`, `engine_business_engine_exceptions`, `engine_audit_log`, `engine_projects.cost_paused_*`.

## Track C — Family-Impact Idempotency & Regression (ask 3)

**Goal:** H2's `emitFamilyImpactReviews` must not double-emit under repeat runs and must be covered by tests.

**Changes to `src/lib/engine-family-impact.functions.ts`**
- Add fingerprint helper: `hash(subject_id + affected_node_id + trigger_reason)`.
- Before insert, query `engine_review_items` where `source='family_impact_auto'` AND `metadata->>'fingerprint'` matches AND `status IN ('open','pending')` — skip if hit.
- Persist `fingerprint` into `metadata` on new rows.
- Return per-node result (`emitted` | `deduped` | `skipped_no_impact`) for observability.

**New file**
- `src/lib/engine-family-impact.test.ts` — vitest, mocks supabase admin client, covers:
  - single scan emits N rows
  - immediate re-scan emits 0 rows (dedupe by fingerprint)
  - closing an open review item allows re-emission
  - unrelated family changes do not trigger duplicates
- Add regression note to `src/routes/admin.family-impact.tsx` showing per-scan `emitted/deduped/skipped` counts.

## Guardrails (unchanged from prior sprints)

- All DDL proposals go to `.orchestrator/PENDING_MIGRATIONS.md` only. No auto-applied migrations.
- No AI approves its own work — outcome review items and family-impact items are `pending` until human review; existing separate-approver checks stay in force.
- Public hook uses `/api/public/*` prefix and validates the `apikey` header inside the handler.
- Every server fn touching state writes `engine_audit_log` + `engine_activity`.
- Typecheck (`bunx tsgo --noEmit`) must pass before commit.

## Deliverables per track

- `.orchestrator/phase-h4-outcome-scheduler-output.md`
- `.orchestrator/phase-h5-health-explainability-output.md`
- `.orchestrator/phase-h2b-family-impact-hardening-output.md`
- `.orchestrator/BUILD_STATE.md` appended
- `.orchestrator/PENDING_MIGRATIONS.md` appended with the pg_cron schedule proposal

## Sequencing

1. Track C first (small, unblocks confidence in H2 before layering more automation).
2. Track A (introduces new automation surface).
3. Track B (reads from A's new review items, so best last).

## Out of scope

- Applying any migration (pg_cron schedule stays in PENDING_MIGRATIONS.md).
- New tables or enum values.
- Portal-facing changes — everything stays internal admin.
