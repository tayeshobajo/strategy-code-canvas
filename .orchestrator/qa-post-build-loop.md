# QA Report — Roadmap Engine (post build loop)

Date: 2026-07-12
Scope: Read-only capability QA against dev preview + live DB. No writes, no migrations, no code changes.
Evidence bundle: `/tmp/browser/qa/` (screenshots, results.json, typecheck.txt).

---

## 1. Overall verdict: **PASS WITH ISSUES**

The build loop landed cleanly on its main targets — Phase 9C constraints, Phase 4B spine governance, and Phase 6C acknowledgment source-of-truth all check out. Two functional bugs surfaced outside those phases, plus one code-hygiene hazard. Nothing is a launch-blocking data or security regression.

## 2. Launch risk: **Low → Medium**

Low for the phases in scope. Medium because `/ops/insights` currently throws on bare navigation and there is a duplicate server-function export.

## 3. P0 blockers
None.

## 4. P1 issues

### P1-A — `/ops/insights` renders error boundary on bare navigation
- Route: `src/routes/ops/insights.tsx`
- Cause: `validateSearch` schema uses `fallback(z.string().regex(...).optional(), undefined)` for `from` and `to`. Under Zod v4 the outer type resolves to `nonoptional`, so a bare URL with no querystring throws `SearchParamError: expected nonoptional, received undefined` and the error card ("Something went wrong") fills the entire content area.
- Evidence: `/tmp/browser/qa/ops-insights.png`, browser console error captured in `results.json`.
- Impact: Analytics page is unusable unless the caller supplies `from`/`to`. Sidebar nav lands here with no params.

### P1-B — Duplicate `approveChatProposal` server-function export
- Files: `src/lib/engine-chat-proposal-approve.functions.ts:50` and `src/lib/engine-chat-proposals.functions.ts:547` both `export const approveChatProposal = createServerFn(...)`.
- Only the second is imported (`ProposalCard.tsx` → `@/lib/engine-chat-proposals.functions`). The first file has zero importers.
- Impact: dead code + name collision. TanStack routes each `createServerFn` to a distinct ID, so this isn't a runtime failure today, but any future import from the wrong module silently uses the wrong handler. Both handlers implement approval logic; drift between them is a real risk.
- Recommendation: delete `engine-chat-proposal-approve.functions.ts` after diffing the two implementations, OR make one re-export the other.

## 5. P2 polish / regression notes

- `/engine` desktop pass logged 7 `requestfailed` entries; all were dev-only HMR / preview-asset aborts (`__l5e/assets-v1/*`, `/@react-refresh`), not app errors. Harmless in production build.
- 22 unread operator notifications in the header bell — informational.
- No dead references to `engine_projects.acknowledged_*` or `engine_spine_versions` remain in `src/` — clean.

## 6. Capability matrix

| # | Capability | Expected | Observed | Status | Evidence |
|---|---|---|---|---|---|
| 1 | Admin navigation & access | Admin can reach new admin surfaces; no broken links / console errors | `/admin/roadmap-intelligence`, `/admin/plan-depth`, `/ops/insights` all reachable with admin session. Sidebar renders. | PASS (except 1-B below) | `admin-intel.png`, `admin-plan-depth.png`, `ops-insights.png` |
| 1-B | `/ops/insights` empty state | Renders with sensible default range | Throws SearchParamError | **FAIL — P1-A** | `ops-insights.png` |
| 2 | Proposal flow | Cards render, approve/reject writes audit, self-approval blocked | `approveChatProposal` used by `ProposalCard.tsx` checks author vs approver, writes `engine_audit_log` + `engine_activity`; DB test `decide-review-item-ordering.test.ts` covers ordering; chat proposal transitions gated by `tg_engine_chat_proposals_enforce_transition` | PASS | `engine-chat-proposals.functions.ts:547`, trigger listed in db-functions |
| 2-B | Single approval path | One canonical `approveChatProposal` | Two files export the same name | **FAIL — P1-B** | grep output |
| 3 | Platform configuration | Workspace/template pages render; empty states safe | `/admin/*` render without errors, empty-safe fallback verified in `/admin/plan-depth` | PASS | `admin-plan-depth.png` |
| 4 | Acknowledgment source-of-truth | Reads/writes go to `client_portal_roadmaps.acknowledged_at/_by_email`, no `engine_projects.acknowledged_*` | `src/lib/engine-roadmap-acknowledgment.functions.ts` writes only `client_portal_roadmaps` + `engine_delivery_items.client_acknowledged_*`. `portal.roadmap.tsx` / `portal.home.tsx` read `approvedRoadmap.acknowledged_at`. Grep for `engine_projects.acknowledged_` returned zero source hits. DB confirms no such columns exist. | PASS | grep output; `information_schema` check returned 0 rows |
| 4-B | Portal boundary | Portal only reads published/downstream data; unpublished not exposed | `portal.functions.ts:477` projection whitelists client-safe columns; `tg_client_portal_roadmaps_require_source_version` prevents publishing ai_generated versions; multi-tenant test file `portal-publish-e2e.test.ts` codifies isolation | PASS | trigger listed in db-functions; test file present |
| 5 | Project AI workspace | Per-project links visible, empty fallback safe | `/engine/projects/:id/overview` renders with status card + NBA + audit trail; empty-safe copy visible in session replay ("No audit entries yet.") | PASS | `project-overview.png` |
| 6 | Spine governance | Edits to point_a/point_b write `engine_audit_log`; `SpineVersionHistory` shows real diff | `updateProjectStep` in `engine.functions.ts` inserts audit rows with `action='spine_field_changed'`; `SpineVersionHistory.tsx` reads via `getSpineFieldHistory` (lines 1776+); route renders without console errors | PASS | grep output; `project-spine.png` |
| 6-B | No `engine_spine_versions` | Table does not exist | `to_regclass('public.engine_spine_versions')` returns empty | PASS | psql output |
| 7 | Decision log | Cross-project spine changes visible with actor/reason/impact | `engine_audit_log` inserts include `actor_email`, `reason`, `metadata`, `affected_modules[]`; readers exist in `engine.functions.ts:2000+` | PASS (functional; UI reader is per-project — cross-project aggregator not wired yet) | grep output |
| 8 | Delivery gates | Publish blocked until readiness/completeness pass | Triggers `tg_engine_delivery_readiness_reviews_enforce` and `tg_engine_qa_evidence_reviews_enforce` guard state machine; NBA function `compute_engine_next_best_action` gates delivery on `critical_qa` and `failed_packets` | PASS | db-functions listing |
| 9 | Evidence requirements | Milestones/tasks can't complete without evidence | `updateMilestone` / `updateTaskStatus` in `engine-execution.functions.ts` gate on evidence + backfill `approved_by_email`/`owner_email` so `no_ai_self_*` CHECKs never trip raw | PASS | file lines 123-160, 390-405, 818 |
| 10 | Exception / drift | Read-only; surfaces only pending items | Drift + exception panels read from `engine_activity` filtered by severity/status; no writers observed in read paths | PASS | code review |
| 11 | Roadmap intelligence | WHY/WHERE/WHAT/RISKS/WHO renders, low-intel filter works | `/admin/roadmap-intelligence` renders cleanly | PASS | `admin-intel.png` |
| 12 | Plan depth & completeness | Coverage + empty/partial/sufficient states | `/admin/plan-depth` renders cleanly | PASS | `admin-plan-depth.png` |
| 13 | Post-delivery / outcome | 30/60/90 logic, safe submit/skip | Feed derivation in `recompute_engine_project_state` and `compute_engine_next_best_action`. Not exercised in browser this pass. | PASS (static) | db-functions |
| 14 | Context inheritance | Build packets carry intake→understanding→mockup→spine→spec | Frames enforced via `tg_engine_project_frames_enforce`, backend plans via `tg_engine_project_backend_plans_enforce`, mockups via `tg_engine_project_mockups_enforce` — all block silent overwrite of approved payload | PASS | db-functions |
| 15 | Stage transitions | Prereqs enforced, actor notified, no bypass | Trigger set above + `tg_engine_openclaw_queue_items_enforce` for terminal-state immutability; `tg_task_notify_blocked` and `tg_engine_activity_notify_operators` handle notify | PASS | db-functions |
| 16 | AI self-assessment prevention | DB CHECKs block AI-created row self-approve/complete | `no_ai_self_approval` and `no_ai_self_complete` on `engine_milestones`, `no_ai_self_completion` on `engine_tasks` — all present in `pg_constraint`, table-qualified. App layer backfills acting admin so CHECK is never hit on legitimate paths. | PASS | psql pg_constraint output; `engine-execution.functions.ts:141-160,390-405` |

## 7. Security / RLS findings

- `pg_class` scan for `relrowsecurity = false` on `public` tables returned **zero rows** — every public table has RLS enabled.
- `has_role` / `has_role_email` / `is_engine_staff` / `client_portal_is_operator` are all `SECURITY DEFINER` with `search_path=public` and read from a separate `user_roles` table (no role storage on profile).
- `admin_grant_role` gates on `has_role(auth.uid(), 'admin')` before insert — safe.
- No client-side admin checks observed.

Result: **clean.**

## 8. DB / migration findings

- Phase 9C migration `20260712192438_e2d6ae61-*.sql` applied; all three CHECK constraints present with correct `conrelid` (`engine_milestones` ×2, `engine_tasks` ×1).
- `engine_spine_versions` — does not exist ✓ (rejected in favor of `engine_audit_log`).
- `engine_projects.acknowledged_*` — columns do not exist ✓ (rejected in favor of `client_portal_roadmaps.acknowledged_*`).
- `engine_audit_log` schema already carries `field_changed`, `old_value`, `new_value`, `reason`, `actor_email`, `metadata`, `affected_modules[]` — no schema change needed for Phase 4B.
- No duplicate/deprecated columns from recent migrations observed.

## 9. Cross-cutting

- **Typecheck (`tsgo --noEmit`)**: PASS, no output. Artifact: `/tmp/browser/qa/typecheck.txt`.
- **Browser smoke**: 7 of 8 sampled routes return 200 with zero app-level console errors. 1 route (`/ops/insights`) throws — see P1-A. The 8th path I tried (`/engine/projects/:id/reviews`) returned 404 because the actual review surfaces are `/engine/review` and `/engine/projects/:id/preview` — not a bug, just a wrong probe.
- **Network**: only dev-tooling asset aborts observed; no failing app fetches.

## Recommended next actions (priority order)

1. **Fix P1-A**: rewrite `ops/insights.tsx` `validateSearch` so `from`/`to` are truly optional under Zod v4. Two safe options:
   - Drop `fallback(...)` and use `z.string().regex(...).optional()` directly, then compute the default range in the component / loader when both are `undefined`.
   - Or provide non-undefined defaults inside `fallback` (e.g. compute the current-quarter bounds at parse time).
2. **Fix P1-B**: diff `engine-chat-proposal-approve.functions.ts` against the canonical `approveChatProposal` in `engine-chat-proposals.functions.ts`, then delete the unused file (or re-export). Add a lint rule / codeowner note to prevent future duplicate `createServerFn` exports.
3. Optional: add a public read-only cross-project "Decision log" aggregator over `engine_audit_log` filtered to `action='spine_field_changed'` — the data is there; only a UI reader is missing for Capability #7 to be a full-fat pass instead of "static-only".
4. Optional: cover `/portal/roadmap` and `/portal/messages` under the injected client session in a follow-up smoke pass (this run stayed on operator surfaces).

_No fixes applied. All findings are report-only per the QA request._
