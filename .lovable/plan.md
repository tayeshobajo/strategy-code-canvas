# Phase 0 — Harden the intake → engine spine

Before any adaptive intake UI work, verify and close the four gaps you listed. Prior audit waves already landed most of this; this phase is a verification pass with targeted patches only where a gap remains. **No UI changes.**

## What's already in place (verified this pass)

- `engine_sources.visibility` column is `NOT NULL DEFAULT 'internal_only'` (migration `20260704152247`).
- `createSource` (engine-intelligence.functions.ts:138) explicitly sets `visibility: "internal_only"`.
- `submitPortalOnboarding` (portal.functions.ts:1937) explicitly sets `internal_only` and, on success, calls `runIntelligencePipelineInternal` via `supabaseAdmin` (line 1954).
- Publish gate: trigger `tg_client_portal_roadmaps_require_source_version` blocks publishing when `approved_roadmap_version_id` is null or the version is `ai_generated`.
- Portal read paths never expose `approved_roadmap_version_id` / internal columns (portal.functions.ts:665 guardrails + `publish-column-integrity` test).

## Work in this phase

### 1. Audit every source-creation path for explicit visibility

Sweep all writers to `engine_sources` and confirm each one **explicitly** passes `visibility: "internal_only"` (belt-and-braces even though the column defaults):

- `createSource` — ✅ already explicit
- `submitPortalOnboarding` — ✅ already explicit
- `submitProjectIntake` (engine-project-intake.functions.ts:454) — ✅ already explicit
- Signal Room uploads — locate writer in `engine-intelligence.functions.ts` / signal-room route and confirm
- Manual notes, URL adds, transcript imports — same

Patch any path missing the explicit field. Add a code comment on the column-level default explaining why every caller still sets it.

### 2. Confirm portal onboarding → pipeline wiring end-to-end

Trace:
```
submitPortalOnboarding
  → insert engine_sources (internal_only)
  → runIntelligencePipelineInternal(supabaseAdmin, …)
      → engine_extraction_runs
      → engine_extracted_signals
      → engine_roadmap_versions (status = 'ai_generated')
      → engine_review_items
      → engine_audit_log
```
Add one integration-style server-side check (script or existing test file) that asserts each of those rows exists after a synthetic onboarding submission, so regressions surface fast.

### 3. Publish integrity re-verification

Re-run / extend `portal-publish-e2e.test.ts` and `publish-column-integrity.test.ts` to lock in:

- Publishing an `ai_generated` version → rejected by the trigger.
- Publishing an `approved` version with `approved_roadmap_version_id` set → succeeds and `client_portal_roadmaps.status` moves to `approved`/`delivered`.
- `source_version_id` vs `approved_roadmap_version_id`: confirm the schema uses `approved_roadmap_version_id` exclusively on `client_portal_roadmaps` (the audit's `source_version_id` mention appears to be legacy naming — verify no code still references it).

### 4. Partial-record guard on project creation

Review `submitProjectIntake` rollback path (engine-project-intake.functions.ts:643/702 already log failures). Confirm: if any of `engine_projects` / `engine_project_dates` / `engine_sources` insert fails, the transaction rolls back cleanly and a row lands in `engine_project_intake_failures` for ops visibility. Add a targeted test if none exists.

## Deliverables

- Small patches to any source-writer missing explicit `visibility`.
- Extended tests: `portal-onboarding-pipeline.test.ts` (new), extensions to publish tests.
- One-paragraph note in `.lovable/engine-audit-2026-07.md` marking Phase 0 verified, with dated evidence.

## Explicitly out of scope (deferred)

- Adaptive intake UI, classifier (Roadmap / Scoped / Not a Fit), next-best-question logic.
- Wave 4 items (D5 dashboard, S18 webhook singleton, S8 typing, U4 empty states) — resume after Phase 0 signs off.

## Success criteria

- All four gaps you named are either already-closed (documented) or patched in this phase.
- Test suite proves: no source can be created without `internal_only`; no portal-visible roadmap can point at an `ai_generated` version; portal onboarding always kicks the intelligence pipeline.
