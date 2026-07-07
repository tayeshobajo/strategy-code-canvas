# Final Audit Report
## Date: 2026-07-06
## Auditor: Claude Fable 5
## Prior Reports: AUDIT_REPORT.md (V1), AUDIT_REPORT_V2.md (V2)
## Method: verification pass. Every V2 "Remaining Gap" (1–10) and "New Issue" (1–7) was re-checked against current source on branch `fixes/audit-critical-7`. All claims cite current file:line. Full test suite run: **28 files passed, 2 skipped (live-DB, no PGHOST); 188 tests passed, 4 skipped.**

## Executive Summary

Since V2 (written 2026-07-05), seven fix commits landed (`975f46a` → `d1368de`, all 2026-07-06), and they hit the targets they claim. Of V2's ten Remaining Gaps: **five are fully fixed** — the durable intake-failure log now writes through the service role with checked errors (#1), the `transitionDelivery` operator side door is closed including the null-project case (#2), the portal full-row leaks are replaced with explicit doctrine-commented projections (#3), the `decideReviewItem` guard ordering is corrected (#4), and the canvas truth gaps are fixed end to end — authored Point A/B labels, authored/fallback source tags, engine-wins precedence, real phase labels in all seven UI locations, and Point A/B on mobile (#7). **One is partial**: the rollback now cleans up `engine_clients` and the portal shell with correct "only if we created it" provenance flags, but the portal upsert clobber it sits next to is untouched and delete errors are still swallowed (#9). **Four are untouched**: the pipeline budget-cap pre-check (#5), behavioral role-rejection tests (#6 — every new gate test added this pass is a static source-regex scan), the extraction-path divergence (#8), and most of the hygiene tail (#10). Of V2's seven New Issues, three are fixed (unwritable failure log, ordering defect, multiplied demo phase names) and four remain (task CASCADE, warn-only milestone apply, upsert nulling contact fields, `severity: "warning"`).

The two items that should block deploy are not exotic: **(1) the portal upsert clobber** — creating a second project for an existing contact email silently resets a live client portal's `portal_status`/`payment_status`/`current_phase`, reassigns `owner_email`, and nulls `contact_name`/`company_name`; the damage persists even when the intake later rolls back, and a newly found edge also mutates revoked permission rows. This is client-visible data corruption reachable from a routine operator flow. **(2) Two migrations that the running environment depends on are still untracked in git** (`20260630150000_intake_project_init.sql`, `20260702163000_portal_boundary_hardening.sql`) — any environment built from the repo is missing the intake tables the ops queue INNER-JOINs against. Both fixes are small; neither has any excuse to miss the next commit.

Below CRITICAL, the highest-value work is finishing what the ordering fix started: `decideReviewItem`'s post-guard writes are unchecked, so an infrastructure failure mid-sequence can leave a version `approved` with no locked snapshot — and the already-approved guard then makes the decision unretryable; the milestone-diff apply after approval is still warn-only; and a review item whose linked version can't be resolved is silently marked approved with zero side effects. The safety story is otherwise strong and got stronger: every sacred transition (version approval, preview, publish, delivery send, execution start, and now delivery sent/execution) is admin-gated server-side, AI containment is intact, and the canvas finally shows clients their own truth. What still protects all of it is only the code itself — the "zero server-side behavioral role-rejection tests" finding survives its third audit.

---

## Verification of V2 Remaining Gaps

### Gap 1 — Durable intake-failure log unwritable and doubly silent → **FIXED** (`975f46a`)
- The write now goes through the service-role client via a dedicated helper: `src/lib/engine-project-intake.functions.ts:287-288` imports `supabaseAdmin` and calls `writeDurableIntakeFailure`.
- The returned supabase-js error is checked: `src/lib/engine-intake-failure-log.ts:39-44` (`if (error) return error.message …`), surfaced at the call site (`engine-project-intake.functions.ts:301-303`) and appended to the thrown integrity error (`:315-317`).
- The log survives rollback: written before `rollbackHalfBornProject` runs (`:288` vs `:318`); table has no FK to `engine_projects` (`20260706000143:4`); rollback never touches it (`:600-619`).
- New migration `20260706120000_intake_failures_insert_grant.sql:8-17` adds an INSERT grant + admin/operator INSERT policy as defense-in-depth.
- **Action needed: none.**

### Gap 2 — `transitionDelivery` operator side door → **FIXED** (`3637b6d`)
- `src/lib/engine-ops.functions.ts:133-155`: transitions to `sent`/`execution` now require `hasRoleForEmail(…, "admin")`, explicitly **block null `project_id`** ("delivery item has no linked project"), and require a non-empty `approved_snapshot` — all before any write (status update at `:164-166`).
- Operators retain non-sacred transitions (`ready`, `scheduled`, `viewed`, …) per design.
- Minor residual: the snapshot query at `:147-151` ignores its returned error — a query failure throws the misleading "no approved roadmap version" message. Fails closed; cosmetic only (see LOW).
- **Action needed: none (message polish optional).**

### Gap 3 — Portal full-row leaks → **FIXED** (`7caabaf`), one doctrine conflict remains
- `client_portal_projects`: explicit projection at `src/lib/portal.functions.ts:411-417` with doctrine comment (`:406-410`); `owner_email`, all Stripe IDs, `intake_submission_id`, `approved_roadmap_id`, `metadata` all gone.
- `client_portal_onboarding`: status-level projection (`:457-463`). `client_portal_billing`: no Stripe identifiers (`:484-491`).
- Roadmap projection (`:472-474`) excludes `supporting_notes`, and the weak `approved_at` filter is replaced with `.in("status", ["approved","delivered"])` (`:476-481`) with a comment explaining why.
- `submitPortalOnboarding` no longer returns `engineSourceId`: `return { ok: true }` with an intent comment (`:1979-1981`).
- UI compatibility verified: every field consumed by portal routes is present in the new projections.
- **Remaining:** the publish pipeline still treats `supporting_notes` as client-safe — it's in `CLIENT_SAFE_KEYS` (`src/lib/roadmap-publish.ts:591`) and written into `client_portal_roadmaps` at publish (`src/lib/engine-ops.functions.ts:1087`) — while both portal read paths' doctrine comments call it internal. No server read path selects it, but the column lives in a table clients have row-level RLS access to, so a direct PostgREST query could read it. Resolve the doctrine (see MEDIUM).
- **Action needed: decide whether `supporting_notes` is client-safe; if not, stop writing it to `client_portal_roadmaps`.**

### Gap 4 — `decideReviewItem` ordering defect → **FIXED** (`d1eff27`), residual unchecked writes
- All guards now run read-only before any write: admin-type gate (`engine-ops.functions.ts:274-283`), already-approved check (`:331-333`), self-approval (`:350-352`), open critical events (`:354-360`), investment confirmation (`:362-369`). Writes start at `:373-379` ("All guards passed: writes start here").
- **Residual (new finding):** the post-approval writes are non-transactional and unchecked — the `engine_projects` `approved_snapshot` update (`:394-400`), `engine_activity` (`:401-407`), and `roadmap_approvals` (`:408-415`) inserts never check `.error`. If the snapshot update fails, the version reads `approved` with no locked snapshot, and retry is blocked by the already-approved guard at `:331-333`. See HIGH #1.
- **Action needed: check errors on the post-guard writes (or move version-flip + snapshot-lock into one RPC).**

### Gap 5 — No budget-cap check before pipeline generation → **NOT FIXED**
- The only pre-generation gate in `runIntelligencePipelineInternal` is the permission check (`src/lib/engine-intelligence.functions.ts:873-903`); `agent_budget_monthly_cents` appears nowhere in the file except the post-hoc spend recording (`:1448-1461`).
- The agent-console path still has the pre-check for contrast (`src/lib/engine-agent.functions.ts:112-121`).
- An over-budget project still gets unbounded service-role AI runs from portal onboarding.
- **Action needed: replicate the agent-console budget pre-check at the top of the pipeline (~`:873`).**

### Gap 6 — Zero behavioral role-rejection tests → **NOT FIXED** (substantially)
- All seven test files added by the fix commits are static source-regex scans (readFileSync + pattern asserts) — including `delivery-transition-gate.test.ts:14-36`, which asserts the gate's source *text* exists but never invokes the function. The sole behavioral additions are two describe blocks in `roadmap-canvas-truth.test.ts:22-127` exercising the pure builders `buildClientSafePayload`/`buildRoadmapJourney`.
- No test file imports `engine-ops.functions` or `portal.functions` for execution. `ADMIN_APPROVAL_TYPES` appears in zero tests. `startExecutionEngagement` has zero test references. The DB fanout triggers (`20260706003002`) have zero coverage. Live tests still `describe.skipIf(!PGHOST)` (`portal-publish-e2e.test.ts:29,69`; `source-visibility-live.test.ts:16,29`), and the e2e still declares role paths out of scope (`:264-268`).
- One narrow qualification: `SourceVisibilityPanel.test.tsx:94-108` is a real UI-layer role-rejection test, but the server fn is mocked — so the precise state is **zero server-side behavioral role-rejection tests**.
- **Action needed: behavioral suite invoking the six sacred functions with non-admin context and asserting rejection (mocked Supabase is fine); wire PGHOST into CI.**

### Gap 7 — Canvas truth gaps → **FIXED** (`0a57c21`), minor residuals
- **Labels:** authored labels flow at both layers — publish `src/lib/roadmap-publish.ts:409-411, 422` (`pickString(canvas?.pointA?.label) ?? … ?? "Current state"`); model `src/lib/portal-roadmap-model.ts:542, 556`.
- **Fallback tagging:** `CanvasPointSource = "authored" | "fallback"` implemented at publish (`roadmap-publish.ts:59, 413-414, 424-425`) and model (`portal-roadmap-model.ts:57, 548-553, 562-567`).
- **Precedence:** engine field now beats payload canvas beats derived filler — `roadmap-publish.ts:408, 420` with matching comments (`:401-403, 480-484`); publish call site passes `project_point_a/b` (`engine-ops.functions.ts:1056-1057`).
- **Jump-to menu:** real journey data (`src/routes/portal.roadmap.tsx:1082-1093`).
- **All five components de-demoed:** `MapCanvas.tsx:669-670` (`const displayLabel = phase.label`), `StatusOverlayCard.tsx:66`, `MilestoneSheet.tsx:326-331`, `MarkerCluster.tsx:18-19, 84` (title passed from parent, `MapCanvas.tsx:793`), `RoadmapOverviewStrip.tsx:218-219, 232-233, 245-246`. Grep confirms no "Foundation / Core Platform Build / Scale Systems" strings outside the demo fixture. Unlabeled clients now see neutral "Now/Next/Later", not invented copy.
- **Mobile:** `MobilePhaseStack.tsx:105-115` (Point A) and `:259-269` (Point B) with test IDs. `CurrentPhasePill` still correct (`portal.roadmap.tsx:926-935`).
- **Residuals:** (a) nothing in the UI consumes `journey.pointA/pointB.source` — the authored/fallback distinction is data-only (grep: zero component reads); (b) pre-fix published rows are inferred `"authored"` even when their detail was derived filler (`portal-roadmap-model.ts:548-553`); (c) mobile hides a point entirely when `detail` is empty (`MobilePhaseStack.tsx:105`), while desktop always renders the marker; (d) cosmetic: empty label renders "Phase 1 · 1" (`portal-roadmap-model.ts:84`), and mobile section headers read "Phase Now" (`MobilePhaseStack.tsx:132-133`).
- **Action needed: surface the source tag in the UI (or an ops-side warning) — the rest is polish.**

### Gap 8 — Extraction path divergence → **NOT FIXED** (both halves verbatim)
- `processSingleSource` still uses its weak inline prompt (`engine-intelligence.functions.ts:303-307`) and writes only `engine_change_events` (`:336`) — never `engine_extracted_signals`. A source added via `createSource`/`reprocessSource` still yields zero categorized signals.
- The extraction UI still renders 12 category keys (`src/routes/engine.projects.$projectId.extraction.tsx:11-24`, "Not extracted yet." at `:45`) while the pipeline writes `extraction` as `{confidence, items: string[]}` (`engine-ai-providers.server.ts:44, 246`). AI-generated extraction still renders empty in every card.
- **Action needed: unify on the pipeline extraction path; align the UI schema with what the pipeline writes.**

### Gap 9 — Rollback orphans + portal upsert clobber → **PARTIAL** (`d1368de` fixed the orphans; the clobber remains)
- **Fixed:** creation now tracks provenance (`createdClientId`, `portalProjectCreated`, `portalPermissionCreated` — `engine-project-intake.functions.ts:87-90, 110, 218-222, 244, 251-267`), and `rollbackHalfBornProject` (`:594-653`) deletes the portal shell/permissions/`engine_clients` **only when this run created them** (`:629-648`), via `supabaseAdmin`. The gating logic is correct for the sequential case.
- **Not fixed:** every rollback delete still discards the returned `{error}` (`:607-648`) — PostgREST failures don't throw, so the catch blocks (`:608-619, 650-652`) never see them. Compounding chain: the `engine_projects` delete at `:616` runs through the user-scoped client; if RLS rejects it silently, the `engine_clients` delete (`:648`) then fails on the FK — also unchecked — leaving a silently orphaned project + client with only the durable failure log as evidence.
- **Not fixed:** the upsert clobber, unchanged in effect (`:223-238`) — see CRITICAL #1. New edges found: TOCTOU race on `preExistingPortal` (two concurrent intakes can both claim creation; a later rollback deletes a portal the other project is using, `:218-223` vs `:629-636`); the `preExistingPerm` lookup omits `.is("revoked_at", null)` (`:251-256` vs the integrity check's `:557`), so a revoked permission row gets its `role`/`granted_by` overwritten without clearing `revoked_at` → guaranteed integrity rollback that leaves pre-existing data mutated.
- **Action needed: fix the upsert (CRITICAL #1); check rollback delete errors and log failures to the durable table.**

### Gap 10 — Hygiene tail → **MOSTLY NOT FIXED**
- `?__visual=demo` auth bypass: unchanged, no env gate (`src/routes/portal.tsx:40-45`). Blast radius still fixture-only (`portal.roadmap.tsx:113-121` renders a static fixture, zero server calls) — but the unauthenticated prod surface stands.
- Demo-seed migrations still committed with no cleanup: `20260702053013` (Q-Bank blueprint), `20260702164527` (fictional review/delivery/agent rows). The nearest cleanup (`20260704172228:3-5`) removes only orphaned review items.
- Dead `src/lib/portal-state.ts` + its test: still dead (only its own test imports it), still untracked.
- **Two migrations still untracked** (`20260630150000_intake_project_init.sql`, `20260702163000_portal_boundary_hardening.sql`) — see CRITICAL #2. `package-lock.json` also untracked.
- Message bodies still preview-only to the engine (240-char truncation, `portal.functions.ts:1610-1617`); no engine/ops route reads `client_portal_messages` in full.
- `NotificationBell` still mounted only in the /ops shell (`src/routes/ops/route.tsx:131`); `src/routes/engine.tsx` has zero bell/notification references.
- `updateTaskStatus` still a free-string status write with no transition rules (`engine-execution.functions.ts:337-351`; `z.string()` at `:340`), admin-gated only.
- **Action needed: commit the migrations (CRITICAL), then work the rest as MEDIUM/LOW below.**

---

## Verification of V2 New Issues

| # | Issue | Status | Evidence |
|---|-------|--------|----------|
| 1 | Intake-failure log unwritable, doubly silent | **FIXED** | Same as Gap 1: service-role write + checked error (`engine-intake-failure-log.ts:39-44`; `engine-project-intake.functions.ts:287-303`); grant migration `20260706120000` |
| 2 | `decideReviewItem` approves item before its gates | **FIXED** | All guards read-only before first write (`engine-ops.functions.ts:319-371` precede `:373-379`); static ordering test added (`decide-review-item-ordering.test.ts`). Residual: unchecked post-guard writes (HIGH #1) |
| 3 | `engine_tasks.milestone_id` ON DELETE CASCADE | **NOT FIXED** | `20260706003158:11-14` still CASCADE; no newer migration touches it. Still latent — no app code deletes `engine_milestones` individually (pipeline comment `engine-intelligence.functions.ts:1266`; version-apply soft-drops, `engine-ops.functions.ts:474-482`) |
| 4 | Approve-then-fail milestone apply (warn-only, post-approval) | **NOT FIXED** | `engine-ops.functions.ts:421` (`try {`) → catch at `:510-512` (`console.warn`), running after the version flip at `:390-393`; success-only audit at `:486-508` |
| 5 | Demo phase names multiplied across six locations | **FIXED** | All six now consume `journey` data — see Gap 7 evidence (`MapCanvas.tsx:669-670`; `StatusOverlayCard.tsx:66`; `MilestoneSheet.tsx:326-331`; `MarkerCluster.tsx:84`; `RoadmapOverviewStrip.tsx:218-246`; jump menu `portal.roadmap.tsx:1082-1093`) |
| 6 | Existing-client upsert nulls contact fields | **NOT FIXED** | `engine-project-intake.functions.ts:227-228`: `contact_name: data.newClient?.primary_contact ?? null` — `data.newClient` undefined on the existing-client path → nulls written; no existing-vs-new branch (the `:218-222` lookup feeds only the rollback flag) |
| 7 | `severity: "warning"` vs `"warn"` convention | **NOT FIXED** | `engine-project-intake.functions.ts:337`; codebase census: 3× `"warn"`, 1× `"warning"` (this one); column is unconstrained text (`20260702045724:98`) — cosmetic |

Also verified (from V2 §7, not in the top-10 list): **the intake-bridge durable linkage is FIXED** (`45ad572`) — `intake_submission_id` persisted in the project's `signal_room` at creation (`engine-project-intake.functions.ts:148-155`), a `bridged_to_engine` audit row written via the service-role intake client (`:361-373`, action added to the `AuditAction` union at `ops/intake-types.ts:146`), and the ops route's "Previously bridged" state is now reachable (`ops/submissions.$id.tsx:143-145, 351-374`). Caveats: linkage is JSONB, not an FK'd column; the audit write is warn-only best-effort; the `engine_project_created` OR-leg still has no writer.

---

## New Issues Found

Found in this pass; none appear in V1 or V2.

1. **`decideReviewItem` post-approval writes are unchecked and unretryable on failure.** After the version flips to `approved` (`engine-ops.functions.ts:390-393`, error checked), the `engine_projects.approved_snapshot` update (`:394-400`), `engine_activity` (`:401-407`), and `roadmap_approvals` (`:408-415`) writes ignore `.error`. If the snapshot update fails, the version reads approved with no locked snapshot, and re-deciding is blocked by the already-approved guard (`:331-333`). Silent — not even a console.warn.
2. **Silent no-op approval when the linked version can't be resolved.** If `target` resolves null (or the project-name lookup at `:289-291` misses), the `if (target)` wrappers (`:347, :387-388`) skip guards AND side effects — the review item is marked `approved` with no version approved and no error raised.
3. **TOCTOU race on `preExistingPortal`.** Two concurrent intakes for the same contact email can both observe no portal (`engine-project-intake.functions.ts:218-222`), both set `portalProjectCreated = true`; if one rolls back, it deletes the shared portal and all its permission rows (`:629-636`) out from under the other, successful project.
4. **Revoked-permission mutation.** The `preExistingPerm` lookup (`:251-256`) doesn't filter `revoked_at IS NULL`, so a revoked row's `role`/`granted_by` get overwritten by the upsert (`:257-265`) without clearing `revoked_at`; the integrity gate then counts zero active owners → guaranteed rollback that leaves the pre-existing row mutated.
5. **Authored/fallback source tag has no consumer.** Computed at both layers (`roadmap-publish.ts:59, 413-414`; `portal-roadmap-model.ts:57, 548-553`) but no component or route reads `journey.pointA.source`/`pointB.source` — the distinction the fix built is invisible. Related: legacy pre-tag rows are inferred `"authored"` even when their detail was derived filler.
6. **`_tryAutoLinkPortalProject` uses `ilike` with a raw email** (`engine-ops.functions.ts:984`) — `_`/`%` in a contact email act as wildcards and could auto-link the wrong portal project. Admin-triggered, low likelihood.
7. **Minor:** `transitionDelivery` snapshot-query error yields a misleading "no approved roadmap version" message (`:147-151`, fails closed); `setPortalRoadmapStatus` has an unreachable `published_at` branch (`:1304` vs the throw at `:1299-1302`); mobile Point A/B hidden when `detail` is empty (`MobilePhaseStack.tsx:105`); empty phase label renders "Phase 1 · 1" (`portal-roadmap-model.ts:84`); `access_revoked_at` retained in the portal projection (`portal.functions.ts:414` — client's own row, low sensitivity).

---

## Definitive Fix List (Ranked)

### CRITICAL — fix before any deploy

1. **Portal upsert clobbers live client portals.** `engine-project-intake.functions.ts:223-238`: creating a project for an existing contact email resets `portal_status`/`payment_status`/`current_phase`, reassigns `owner_email`, and nulls `contact_name`/`company_name` (V2 New Issue 6). The damage persists after rollback (rollback deliberately never restores the live portal, `:638-639`), and the revoked-permission edge (`:251-265`) mutates pre-existing permission rows. **Fix:** branch on `preExistingPortal` — INSERT only when new; when existing, update nothing (or only the linkage), and filter the perm lookup with `.is("revoked_at", null)`. Restore or skip on rollback.
2. **Commit the two untracked migrations.** `supabase/migrations/20260630150000_intake_project_init.sql` and `20260702163000_portal_boundary_hardening.sql` exist only on this machine. Any environment built from git is missing the intake tables the ops queue INNER-JOINs (V1 evidence: `20260630150000:97-98`). This is a `git add` — also commit `package-lock.json`.

### HIGH — functional bugs that break the approval/creation flows

3. **`decideReviewItem` post-approval writes unchecked** (New Issue 1). Check `.error` on the snapshot/activity/approvals writes at `engine-ops.functions.ts:394-415`; on snapshot failure, either compensate (revert the version status) or surface a loud, durable error. Best: move version-flip + snapshot-lock into one `SECURITY DEFINER` RPC.
4. **Milestone-diff apply still warn-only after approval** (V2 New Issue 4, unfixed). `engine-ops.functions.ts:421-512`. Minimum: persist an `engine_activity`/review artifact on failure instead of `console.warn`, so an approved version with missing milestone changes is visible to ops.
5. **Silent no-op approval when the linked version resolves null** (New Issue 2). `engine-ops.functions.ts:347, 387-388`. A `roadmap_version` item whose target can't be found should throw, not flip to approved.
6. **No budget-cap pre-check in the pipeline** (Gap 5). Replicate `engine-agent.functions.ts:112-121` at the top of `runIntelligencePipelineInternal` (with the `:873-903` permission gate). The portal-onboarding service-role path can currently spend unbounded on a capped project.
7. **Rollback delete errors swallowed** (Gap 9 residual + New Issue 3's compounding chain). Check `{error}` on every delete in `rollbackHalfBornProject` (`engine-project-intake.functions.ts:607-648`) and record failures in `engine_project_intake_failures` — the table built for exactly this.
8. **Zero server-side behavioral role-rejection tests** (Gap 6, third audit in a row). Not a runtime bug, but every gate above — including all fixes in this list — is protected only by its own source text. One suite invoking `decideReviewItem`, `transitionDelivery`, `approvePreview`, `publishVersionToPortal`, `sendProjectDelivery`, `startExecutionEngagement` with a non-admin context and asserting the throw (mocked Supabase suffices) would convert seven regex tripwires into proofs. Wire `PGHOST` into CI so the two live suites stop silently skipping.

### MEDIUM — consistency, latent risks, ops experience

9. **Extraction divergence** (Gap 8): make `createSource`/`reprocessSource` write categorized `engine_extracted_signals` (or route through the pipeline extractor), and align `extraction.tsx:11-24` with the `{confidence, items}` shape the pipeline actually writes.
10. **`supporting_notes` doctrine conflict**: publish writes it to the client-RLS-readable `client_portal_roadmaps` (`engine-ops.functions.ts:1087`; `roadmap-publish.ts:591`) while both portal read doctrines call it internal. Pick one: remove it from `CLIENT_SAFE_KEYS` + the publish write, or update the doctrine comments.
11. **`?__visual=demo` auth bypass** (`portal.tsx:40-45`): gate on `import.meta.env.PROD` or equivalent. Fixture-only data, but a standing unauthenticated prod surface.
12. **TOCTOU on `preExistingPortal`** (New Issue 3): low likelihood, portal-destroying consequence. A unique-constraint-driven insert (INSERT … ON CONFLICT DO NOTHING + re-read) removes the race.
13. **Demo-seed migrations** (`20260702053013`, `20260702164527`): add a cleanup migration so fresh environments don't get fictional review/delivery/agent rows.
14. **Surface the authored/fallback source tag** (New Issue 5): at minimum an ops-side indicator; decide how to treat legacy rows mislabeled "authored".
15. **`engine_tasks` ON DELETE CASCADE** (V2 New Issue 3): still latent; either revert to SET NULL + explicit archive semantics, or document the intent next to the FK.
16. **Message bodies + engine-shell bell** (Gap 10 tail): full-body reader for `client_portal_messages` on the ops side (preview truncation at `portal.functions.ts:1610`); mount `NotificationBell` in `engine.tsx`.
17. **Pipeline `step_states` TOCTOU**: read at run start (`engine-intelligence.functions.ts:864-870`), checked at write time from the stale object (`:1346-1363`) — re-read before the module write, or use a conditional update.
18. **Memory-loop finishing work**: intra-batch dedup (`:1179-1183` — `seen` never updated during the run), and memory reads for the agent-console path (`engine-agent.functions.ts:129-146` selects no memory).
19. **Non-atomic project creation**: still ~10 sequential writes, zero `.rpc()` in the file. The compensation + durable log + admin sweep is a workable pattern now that both are real; a single-RPC transaction remains the long-term fix.

### LOW — hygiene

20. `severity: "warning"` → `"warn"` (`engine-project-intake.functions.ts:337`).
21. `updateTaskStatus` free-string status, no transition rules (`engine-execution.functions.ts:337-351`) — add an enum.
22. Delete or wire dead `portal-state.ts` + `portal-state.test.ts` (untracked, zero production imports).
23. Escape the email in `_tryAutoLinkPortalProject`'s `ilike` or use `eq` with normalized casing (`engine-ops.functions.ts:984`).
24. Cosmetics: misleading `transitionDelivery` error on query failure (`:147-151`); dead `published_at` branch (`:1304`); mobile "Phase Now" phrasing (`MobilePhaseStack.tsx:132-133`) and detail-gated markers (`:105`); "Phase 1 · 1" on empty label (`portal-roadmap-model.ts:84`); dead `engine_project_created` OR-leg (`ops/submissions.$id.tsx:143-145`); consider dropping `access_revoked_at` from the portal projection (`portal.functions.ts:414`).

---

## What's Solid

Do not touch these — they are correct, verified, and in several cases the best patterns in the codebase:

- **The publish gate chain** (unchanged since V1, still the strongest boundary): admin assert + version-approved + preview-approved + investment-confirmed gates, allowlist payload projection with runtime guard, DB trigger rejecting `ai_generated` and requiring approval linkage.
- **AI containment**: `send_delivery`/`move_project_to_execution` hard-blocked regardless of stored permissions (`engine-execution.functions.ts:30-33`); insert-only versioning with provenance; diff-not-mutate milestone re-runs; self-approval guards in both approval paths.
- **The admin approval boundary**: `ADMIN_APPROVAL_TYPES` gate (`engine-ops.functions.ts:268-283`) + operator queue filtering (`:224-229`) + the now-closed `transitionDelivery` side door (`:133-155`). Every sacred transition is admin-only server-side. (Remember: the static allowlist still makes all six emails admin — only DB-granted operators are actually restricted; that's a modeling choice, not a bug.)
- **The canvas truth pipeline**: engine-authored Point A/B with authored labels, engine-wins precedence, tagged fallbacks, real phase labels in all seven render locations, mobile parity. Verified end to end at both build layers and every component.
- **The portal read boundary**: explicit doctrine-commented projections on all four `getPortalContext` reads, status-based roadmap filtering matching `getPortalRoadmapDocs`, no engine identifiers returned to clients.
- **The durable intake-failure log**: service-role write, checked errors, no FK, written before rollback, ops reader — the design V2 asked for, now actually wired.
- **The DB-trigger fanout for client uploads/messages** (`20260706003002` + `20260706004808` hardening) and the realtime ops notification bell.
- **The intelligence-memory loop** (pipeline path): auto-promotion ≥80 confidence with dedupe and provenance, cross-project recall, prompt-injected as authoritative.
- **Task→milestone linkage** enforced at three layers; the investment gate enforced at all three approval/publish paths; the client-acknowledgment gate on execution start.
- **Source-room enforcement**: admin-only RLS + per-function asserts + `internal_only` on every insert + audit-or-rollback visibility changes.
- **Test suite health**: 188/188 running tests pass in 4s. The static tripwires are legitimate regression guards — the gap is what's *missing* (behavioral role tests), not what's there.
