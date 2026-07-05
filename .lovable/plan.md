# Bridge Plan Verification Audit

Most of the Phase 0–4 bridge work already landed in earlier turns. This plan does a systematic top-to-bottom verification, runs the existing tests, and fixes anything that fails or is missing — without redesigning UI.

## Approach

For each phase, I will:
1. Read the current implementation.
2. Run the corresponding test(s).
3. Report status (green / gap / broken).
4. Patch gaps in the same pass.

## Phase 0 — Publish integrity

- **0.1 Publish column** — Confirm `publishVersionToPortal` writes `approved_roadmap_version_id` and that `tg_client_portal_roadmaps_require_source_version` reads the same column. Run `publish-column-integrity.test.ts` and `review-item-and-publish-gates.test.ts`. Verify draft (`status = 'ai_generated'`) cannot be published.
- **0.2 Source visibility** — Confirm DB default `engine_sources.visibility = 'internal_only'` and every insert path sets it explicitly (`createProjectFromSource`, `createSource`, `submitPortalOnboarding`, `reprocessSource`, Signal Room, transcript imports, notes, URLs). Run `source-visibility-*.test.ts` and `portal-cannot-read-engine-sources.test.ts`.
- **0.3 Review-item version_id** — Confirm `engine_review_items.version_id` FK exists, is populated on AI pipeline + `submitVersionForApproval`, and `decideReviewItem` approves by `version_id` (no `rows[0]` fallback). Run `review-item-version-fk.test.ts`.

## Phase 1 — Intake becomes intelligence

- **1.1 Onboarding → pipeline** — Confirm `submitPortalOnboarding` inserts source with `visibility='internal_only'` then calls `runIntelligencePipelineInternal`, transitions source/project/extraction_run statuses, creates draft version + review item, and never exposes draft to portal. Run `onboarding-triggers-extraction.test.ts`.
- **1.2 Extraction retry/failure** — Verify failed runs mark `engine_extraction_runs.status='failed'` with error, and expose a retry action (admin or `/engine/projects/:id/extraction`). Add a test for retry if missing.
- **1.3 Creation-time file upload** — Inspect `/engine/projects/new` upload tab. If it is a stub, disable/hide it (no fake path). If wired, add a smoke test.

## Phase 2 — Project creation integrity

- **2.1 `verifyProjectIntegrity` after `createProjectFromSource`** — Confirm it runs immediately, respects `delivery_mode`, and rolls back or hard-warns on missing siblings. Run `project-integrity-rollback.test.ts`.
- **2.2 delivery_mode enforcement** — Confirm `client_portal_required` blocks creation without `client_portal_project_id`.
- **2.3 Repair action** — Verify an admin surface exists to repair orphaned engine/portal projects. If absent, add a `repairProjectIntegrity` server fn + admin button.

## Phase 3 — Portal canvas fidelity

- **3.1 `client_safe_canvas` shape** — Read `buildClientSafeCanvas` in `roadmap-publish.ts`. Confirm it emits `{pointA, pointB, phases, milestones, decisions, deliverables, deadlines, clientActions}` with the required per-phase and per-milestone fields.
- **3.2 Portal reads canvas first** — Confirm `getPortalRoadmapDocs` reads `client_safe_canvas` first and only falls back to `sequence_30_60_90` when absent. Fix bridge so Point A/B resolves from canvas, never falls back to summary/diagnosis when approved values exist.
- **3.3 No direct engine reads** — Grep `/portal/*` code to confirm no route reads `engine_*` tables directly.

## Phase 4 — Feedback loop

- **4.1 Portal → engine_activity mirrors** — Confirm mirrors exist for `sendPortalMessage`, `recordPortalMilestoneReview`, important file view/download, onboarding submit. Verify `action_required=true` messages create a follow-up review item or task.
- **4.2 Canonical messages table** — Confirm `portal_messages` is dropped and `/portal/messages` reads/writes `client_portal_messages` with structured `related_*` fields.

## Deliverables

For every phase item above, one of:
- Green (test passes, no change needed) — noted in final report.
- Gap (missing test or code) — added in this pass.
- Broken (test fails) — fixed in this pass.

Final report enumerates status per item plus a list of any files changed.

## Notes

- No UI redesign.
- No schema changes unless a gap requires one (e.g. missing DB default). Schema changes go through the migration tool with GRANT + RLS.
- All new server fns follow `createServerFn` + `requireSupabaseAuth` conventions.
