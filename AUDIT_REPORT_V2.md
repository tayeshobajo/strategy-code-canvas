# Roadmap Engine Re-Audit Report (V2)
## Date: 2026-07-05
## Auditor: Claude Fable 5
## Previous Audit: AUDIT_REPORT.md (same day)
## Method: every finding below was verified against current source; nothing is inferred from commit messages.

## Executive Summary

The remediation pass was substantive. Of the 10 critical issues: **3 are genuinely fixed** (operator version-approval gate, the pipeline workspace clobber, the intelligence-memory loop), **1 is fixed at the right layer** (client uploads/messages now fan out to the engine via DB triggers), **5 are partial**, and **1 is untouched** (extraction-path divergence). A bonus fix landed: **investment confirmation went from a display label to a real, admin-only gate** enforced at version approval (both paths) and portal publish.

Two findings dominate the remaining risk:

1. **The durable intake-failure log — the centerpiece of the rollback fix — can never be written by the code path it was built for.** The migration grants `authenticated` only SELECT with no INSERT policy, while `createProjectFromSource` inserts through the user-scoped client. Worse than the RLS gap alone: supabase-js returns `{ error }` rather than throwing, and the code never checks it, so even the `console.error` fallback never fires. The insert fails 100% silently, then the rollback wipes the `engine_activity` fallback — reproducing exactly the "rollback destroys its own audit trail" failure the table was created to prevent.
2. **The new admin gate in `decideReviewItem` has an ordering defect**: the review item is flipped to `approved` and its audit row written *before* the downstream guards (already-approved, self-approval, critical events, investment confirmation) run. Any of those throwing leaves an approved review item pointing at an unapproved version — inconsistent and unretryable.

The boundary the previous audit called BROKEN — operators approving sacred parts — is now mostly closed: version approval is admin-only in both paths, the queue hides version items from operators, and guards are mirrored between the two approval paths. The remaining side door is unchanged: `transitionDelivery` still lets a DB-granted operator move a delivery to `sent`/`execution`, and skips its only check entirely when the delivery item has no linked project. And the missing test category is still missing: zero behavioral tests assert an operator is rejected from any sacred action.

---

## Fix Verification

| # | Issue | Status | Evidence |
|---|-------|--------|----------|
| 1 | Operators can final-approve versions | **FIXED** (new ordering defect; delivery side door remains) | Admin gate `engine-ops.functions.ts:252-267`; queue filter `:190-213`; defect: item approved at `:269-278` before gates at `:316-355`; side door `:107-167` |
| 2 | Pipeline clobbers live workspace | **FIXED** (budget cap still unchecked) | Status guard `engine-intelligence.functions.ts:910-912, 945-955, 1066-1068, 1324-1326`; approved-step skip `:1333-1363`; permission gate `:873-903` |
| 3 | Portal context leaks internal fields | **PARTIAL** | Roadmap projection fixed but includes `supporting_notes` (`portal.functions.ts:459-461`); projects still `select("*")` `:406-410`; onboarding/billing full rows `:449, :468`; `engineSourceId` still returned `:1959` |
| 4 | Point A/B not rendered | **PARTIAL** | Detail renders on desktop `MapCanvas.tsx:753-777`; labels hardcoded at model (`portal-roadmap-model.ts:507-522`) and publish (`roadmap-publish.ts:366, 374`); mobile shows nothing (`MobilePhaseStack.tsx`); precedence bug unchanged (`roadmap-publish.ts:365-380` vs `:480-482`) |
| 5 | Hardcoded demo phase names | **PARTIAL** | `CurrentPhasePill` fixed `portal.roadmap.tsx:925-934`; jump menu still hardcoded `:1081-1085`; demo names hardcoded/remapped in **five more components** (see §5) |
| 6 | Non-atomic creation / leaky rollback | **PARTIAL — fix itself defective** | Durable log written before rollback `engine-project-intake.functions.ts:249-270` + migration `20260706000143`; but insert is grant-blocked AND error-unchecked (New Issues #1); rollback still orphans clients/portal rows `:493-515` |
| 7 | Public intake → engine bridge missing | **PARTIAL** | Manual prefilled bridge `ops/submissions.$id.tsx:132-148` → `engine.projects.new.tsx:14-64`; no durable linkage; dead audit check; review-row insert still warn-only `intake.functions.ts:366-371` |
| 8 | Uploads/messages invisible to engine | **FIXED** (bodies still preview-only; bell absent from engine shell) | Migration `20260706003002` triggers; reader `NotificationBell.tsx` in `ops/route.tsx:131`; hardening `20260706004808` |
| 9 | Intelligence Memory loop absent | **FIXED** (pipeline path only) | Auto-write `engine-intelligence.functions.ts:1145-1202`; read `:1014-1027` → prompt `engine-ai-providers.server.ts:198, 211-226, 269` |
| 10 | Production hygiene | **PARTIAL** | Q-Bank seeding removed from app code `engine-execution.functions.ts:72-90`; demo-seed **migrations remain committed**; `__visual=demo` bypass ungated `portal.tsx:40-45`; portal upsert clobber and dead `portal-state.ts` unchanged |
| — | Investment gate (bonus; was "MISSING as a gate") | **FIXED** | `engine-ops.functions.ts:347-355` (decide), `engine-intelligence.functions.ts:457-465` (approveVersion), `engine-ops.functions.ts:1001-1004` (publish); admin-only toggle `:1313`; migration `20260706001252` |

---

## Detailed Verification

### 1. Operator version approval — FIXED, with a new ordering defect

The fix is a type-scoped gate rather than the recommended blanket `assertOps → assertAdminEmail` swap, and the scoping is correct:

- `ADMIN_APPROVAL_TYPES = {roadmap_version, Roadmap Update, version_approval, Version Change}`; an `approved` action on any of these requires `hasRoleForEmail(email, "admin")` and throws "Forbidden: only Tai (admin) can approve a roadmap version" (`engine-ops.functions.ts:252-267`). The version-approval side effect (`:292` onward) triggers only on `roadmap_version`/`Roadmap Update` — both inside the admin set, so no side effect is reachable by an operator, including through the legacy label-match fallback (`:319-330`), which lives entirely inside the admin-gated block.
- Operators retain triage (`sent_back`/`rejected`) and non-sacred approvals — a better fit for the vision's operator role than a blanket gate.
- `listReviewQueue` now hides version-approval items from non-admin operators (`:190-213`), removing the false affordance.
- The side effect gained the guards `approveVersion` already had, plus new ones: already-approved check (`:316-318`), self-approval guard (`:334-338`), open-critical-events block (`:340-346`), investment-confirmation gate (`:347-355`).
- `hasRoleForEmail` (`ops/access.ts:41-60`) is fail-closed on the DB path (no email → false, RPC error → false, exception → false).

**New defect (ordering):** the review item's status update and audit insert (`:269-278`) execute *before* the side-effect guards. If the investment gate, self-approval guard, critical-events block, or already-approved check throws, the function aborts with `engine_review_items.status = 'approved'` and an "approved" audit row persisted while `engine_roadmap_versions` was never approved. The item can't be re-decided. Move the item update after the side effect, or wrap in compensation.

**Not fixed alongside it:**
- `transitionDelivery` is still `assertOps` (`:115`) and lets an operator move a delivery item to `sent`/`execution` with only an approved-snapshot check (`:128-139`) — and that check is **skipped entirely when `cur.project_id` is null** (`:130`): an unlinked delivery item can be moved to `execution` by an operator with zero gates. Named in the original issue; unchanged.
- `OPERATOR_EMAILS ⊆ ADMIN_EMAILS` persists (`ops/access.ts:9-24`, static allowlist short-circuit at `:48-49`): all six allowlisted emails are admins without a DB check, so "only Tai" is not modeled for allowlisted humans — only DB-granted operators are actually restricted.
- Zero behavioral tests assert operator rejection from any sacred action (verified across the whole test suite — see Remaining Gaps #6).

### 2. Pipeline clobber — FIXED at the root cause

Commit `a7a45a2` ("Fixed pipeline status clobber") does what it says:

- **Status:** `TRANSITIONAL_STATUSES = {intake, source_processing, draft}` gates every status write via `canMoveStatus` (`engine-intelligence.functions.ts:910-912`). Terminal/hold statuses survive the start-of-run flip (`:945-955`), the end-of-run `status: "draft"` (`:1324-1326`), **and the failure path** (`:1066-1068`).
- **Modules:** all 11 module columns are individually skipped when `step_states[stepKey].state === "approved"` (`:1333-1363`), with skipped steps logged. Approved Point A/B, investment, etc. can no longer be silently replaced by an AI run. (Small TOCTOU window: `step_states` is read at run start, so a step approved mid-run could still be overwritten.)
- **Permission gate:** the pipeline reads `engine_agent_permissions` and hard-stops with a `pipeline_blocked` activity row when `run_intelligence_pipeline` is `blocked` (`:873-903`). The portal fire-and-forget path catches `pipeline_blocked:` and writes a distinct "client submitted intake but pipeline blocked" activity instead of silently dropping (`portal.functions.ts:1885-1920`).
- **Human-edit layer:** `updateProjectStep` now refuses to overwrite approved `point-a`/`point-b` without an explicit reset (`engine.functions.ts:737-748`).

**Remaining:**
- **No budget-cap pre-check.** The pipeline records spend after the fact (`:1448-1461`) but never compares `agent_spend_month_cents` to `agent_budget_monthly_cents` before generating. The only pre-generation budget guard in the codebase is the agent-console path (`engine-agent.functions.ts:111-122`). An over-budget project still gets service-role AI runs from onboarding.
- `needs_approval`/`draft_only` are deliberately treated as allowed (`:889-891`) — only `blocked` is a real off-switch here; the three-state permission model is two-state for the pipeline.
- Human edits via `updateProjectStep` can still overwrite approved steps *other than* point-a/point-b (silently reset to draft, `engine.functions.ts:750-755`) — asymmetric with the pipeline, which protects all approved steps.

### 3. Portal context leak — PARTIAL

- The `client_portal_roadmaps` read is now an explicit projection (`portal.functions.ts:459-461`) excluding `published_by`, `metadata` (engine_project_id), `approved_roadmap_version_id`, and `acknowledged_by_email`. The worst of the leak (engine linkage UUIDs, operator email) is closed.
- **But the projection includes `supporting_notes`** — the very column the sibling `getPortalRoadmapDocs` doctrine comment names as internal (`:639`: "NEVER add internal-engine columns here (supporting_notes, …"). The codebase is internally inconsistent (`CLIENT_SAFE_KEYS` in `roadmap-publish.ts:528-539` treats it as client-safe); pick one doctrine and enforce it — as written, the stricter boundary is contradicted.
- **Still `select("*")` to the browser:** `client_portal_projects` (`:406-410`, returned at `:477`) ships `owner_email`, five Stripe identifiers, `intake_submission_id`, `approved_roadmap_id`, `metadata`, `access_revoked_at`. Also full-row: `client_portal_onboarding` (`:449`, returned `:478`) and `client_portal_billing` (`:468`, returned `:480`). The `portal_project_v` whitelist view built for this purpose is still bypassed.
- **`submitPortalOnboarding` still returns `engineSourceId`** to the client caller (`:1959`). Flagged explicitly last time; unchanged.
- **Weak filter:** the roadmap query gates on `.not("approved_at","is",null)` (`:463`) rather than `status IN ('approved','delivered')` like `getPortalRoadmapDocs` (`:648`). A row later archived/reverted keeps `approved_at` and can resurface through this path; RLS is the only backstop.

### 4. Roadmap Canvas Point A/B — PARTIAL; the headline renders, the truth layer doesn't

- **Point A/B detail now renders on desktop.** `MapCanvas.tsx:753-760` (Point A) and `:769-777` (Point B) render `journey.pointA/pointB.detail`; the 60-char JS truncation is gone, replaced by CSS `line-clamp-2` (visual clamp, full text in DOM).
- **Labels are still never real.** Both the model (`portal-roadmap-model.ts:507-522` — `label: "Current state"` / `"Destination"` hardcoded, `canvas.pointA.label` ignored) and the publish layer (`roadmap-publish.ts:366, 374`) hardcode the labels. Only `detail` carries client data; an operator-authored label can never reach the UI.
- **Silent fallback chains persist at both layers, untagged:** publish `engine point_a → current_diagnosis` (`roadmap-publish.ts:483-484`); model `canvas → project.point_a → current_diagnosis` (`portal-roadmap-model.ts:509-513`). The recommended `source: "authored" | "fallback"` tag was not implemented — downstream still cannot distinguish authored truth from derived filler.
- **The precedence bug is unchanged:** `buildClientSafeCanvas` prefers a payload-embedded canvas value over the engine field (`roadmap-publish.ts:365-380`), while the comments at `:433-435` and `:480-482` still claim the opposite. A stale pointA inside the version payload wins over the engine-authored field.
- **Mobile clients see no Point A/B at all** — `MobilePhaseStack.tsx` (rendered for mobile at `portal.roadmap.tsx:517-518`) contains zero references to pointA/pointB.

### 5. Demo phase names — PARTIAL; fixed in one place, alive in six

- **`CurrentPhasePill` is fixed** — resolves the real `journey.phases[].label` with a neutral fallback (`portal.roadmap.tsx:925-934`).
- **Jump-to menu is still fully hardcoded**: "Point A · Current State / Phase 1 · Foundation / Phase 2 · Core Platform Build / Phase 3 · Scale Systems / Point B · Scaled Impact" (`portal.roadmap.tsx:1081-1085`) — it receives `journey` as a prop and ignores it.
- **The demo names moved instead of dying — and multiplied.** Verified hardcodes shown to real clients:
  - `MapCanvas.tsx:668-675` — remaps default labels `Now`→"Foundation", `Next`→"Core Platform Build", `Later`→"Scale Systems". Since the model's defaults ARE Now/Next/Later (`portal-roadmap-model.ts:90-93, 295`), any client without authored phase labels sees the invented copy; an authored label legitimately equal to "Now" is silently rewritten.
  - `StatusOverlayCard.tsx:31-35` — `phaseTitle(key)` hardcodes by phase key, unconditionally.
  - `MilestoneSheet.tsx:324-328` — unconditional remap from milestone phase key.
  - `MarkerCluster.tsx:12-16` — `PHASE_TITLE` const keyed by now/next/later.
  - `RoadmapOverviewStrip.tsx:219, 241-244, 258` — "Current State", the three phase names, and "Scaled Impact", all unconditional.
  
  The four key-based remaps never consult `journey.phases[].label` at all, so a roadmap with authored labels shows real names in the pill/map headings and demo names in the strip, cluster popovers, milestone sheet, and status card simultaneously — an inconsistency the original single-location hardcode didn't have.

### 6. Project creation / rollback — PARTIAL, and the fix has a fatal hole

**What improved:**
- New durable log table `engine_project_intake_failures` with no FK to `engine_projects` so it survives rollback (`20260706000143`), written *before* the rollback runs (`engine-project-intake.functions.ts:249-270`), with an ops reader `listRecentIntakeFailures` (`:880-894`). Right design.
- New pre-insert guard: `client_portal_required` without a contact email throws before any writes (`:115-119`).

**The hole (CONFIRMED — see New Issues #1):** the insert runs through the user-scoped client (`sb = context.supabase`, `:72`; `auth-middleware.ts:46-61` builds it with the publishable key + user JWT → Postgres role `authenticated`). The migration grants `authenticated` only SELECT (`20260706000143:17`) and defines no INSERT policy. The insert fails every time. And because supabase-js returns `{ error }` without throwing, and the code awaits the insert inside try/catch **without checking the returned error** (`:255-267`), the `console.error` at `:269` never fires either. Then the rollback deletes all `engine_activity` for the project (`:499`), including the `integrity_failure` row. **Net effect: on an integrity failure, no durable record survives anywhere — the stated purpose of the fix is fully defeated, silently.**

**What didn't change:**
- Creation is still ~9 sequential PostgREST writes, no transaction/RPC (verified: zero `.rpc()` calls in the file).
- `rollbackHalfBornProject` (`:493-515`) still deletes only 5 engine tables + the project row; `engine_clients`, `client_portal_projects`, `client_portal_permissions` are never rolled back — a client can be left with a live-looking portal shell (`portal_status: "onboarding_pending"`, `payment_status: "paid"`) for a project that doesn't exist. All deletes still swallow errors (`:505-507, 512-514`).
- The portal upsert still clobbers live state on email conflict (`:199-214`): `onConflict: "primary_email"` resets `portal_status`/`payment_status`/`current_phase` and reassigns `owner_email`. New wrinkle: on the existing-client path `data.newClient` is undefined, so `contact_name`/`company_name` are overwritten with `null`.

### 7. Intake → engine bridge — PARTIAL: manual-but-wired

A bridge now exists: `ops/submissions.$id.tsx:120-148` composes the submission's Q&A into a notes blob (capped at 20,000 chars) and links to `/engine/projects/new` with `submissionId`, `company`, `contactEmail`, `projectName`, `notes` prefilled; `engine.projects.new.tsx:14-64` zod-validates and consumes them. Creating the project there fires extraction through the existing `createProjectFromSource` path. This matches the recommended shape.

**Gaps:**
- **No durable linkage.** `submissionId` becomes only a cosmetic source-name prefix (`engine.projects.new.tsx:61-63`); the mutation payload and `CreateInput` carry no submission field. Nothing connects `intake_submissions.id` to the created `engine_projects` row.
- **Dead audit check.** The route looks for audit actions `bridged_to_engine`/`engine_project_created` (`ops/submissions.$id.tsx:143-145`) to flip the button label, but repo-wide grep finds zero writers of either action. The "Previously bridged" state is unreachable; double-creation from one submission is undetectable.
- `approveSubmission` itself still only flips status and sends an email (`ops.functions.ts:448-551`); email enqueue failure is warn-only (`:541-542`). The non-atomic review-row insert is still warn-only (`intake.functions.ts:366-371`) — a submission can still be invisible in the INNER-JOINed queue (partially mitigated by the non-blocking operator notifications at `:389-405`).

### 8. Client uploads and messages — FIXED at the right layer

Migration `20260706003002` solves this with **database triggers** — the only layer that catches the portal's direct-browser insert (`portal.files.tsx:222`, unchanged and now correctly covered):

- `tg_client_portal_files_fanout_engine`: on client-role upload, resolves the linked engine project and writes both an `engine_activity` row (`client_file_uploaded`) and an `operator_notifications` bell entry with metadata and an engine deep link. Skips operator/tai uploads.
- `tg_client_portal_messages_notify_operators`: on client-authored message, bell notification typed by `message_type` with subject-or-240-char preview; the `engine_activity` mirror is deliberately left to `sendPortalMessage` to avoid double entries.
- Both are `SECURITY DEFINER` with pinned `search_path = public`, and both swallow errors (`RAISE WARNING; RETURN NEW`) so a fanout failure can never break the client's upload — deliberate and documented.
- A real reader exists: `NotificationBell.tsx` subscribes live to `operator_notifications` (mounted in `ops/route.tsx:131`), with a full inbox at `ops/notifications.tsx` and role-gated list/read functions.
- Migration `20260706004808` revokes PUBLIC/anon/authenticated EXECUTE on both trigger functions — correct hardening.

**Scope notes:** message *bodies* still have no engine-side reader (bell carries a 240-char preview; repo-wide grep confirms only portal-side code reads `client_portal_messages` in full) — the loop closes for awareness, not content. The bell is mounted only in the **/ops shell**, not `/engine` (`engine.tsx` doesn't render it), so an operator living in mission control sees nothing until they visit /ops. Portal projects with no linked engine project silently produce no fanout (`IF engine_proj.id IS NULL THEN RETURN NEW`). Fanout failures are warning-only with no retry. App-layer mirrors elsewhere remain fire-and-forget.

### 9. Intelligence Memory — FIXED; the loop closes (in the pipeline path)

- **Auto-write:** after signal insert, the pipeline promotes signals with `confidence >= 80` (excluding `milestone_candidate`) into `engine_intelligence_memory`, mapped through a category→type table, deduped against existing project rows by normalized title, stamped `promoted_by: "ai:pipeline"` with signal/source traceability (`engine-intelligence.functions.ts:1145-1202`). Awaited inline, wrapped so memory failure never breaks the pipeline.
- **Read at generation:** the pipeline loads up to 60 non-archived entries for the project **plus cross-project entries** (`project_id.is.null`) (`:1014-1027`), passes them into `runStructuredPass` (`:1050`), where they render as a "PRIOR INTELLIGENCE MEMORY" block in the user prompt sent to both Claude and the Gemini fallback, with a system instruction to treat them as authoritative unless contradicted (`engine-ai-providers.server.ts:196-226, 269, 274-278`).
- Capture → recall → apply exists. The "write-only shoebox" verdict is retired.

**Remaining (non-blocking):** memory is read **only in the main pipeline** — the agent-console path (`engine-agent.functions.ts:129-176`) and `processSingleSource` include no memory at all; no confidence filter on read (all rows regardless of confidence, capped at 60 most recent); no intra-batch dedup (two same-titled signals in one run both insert) and dedup is project-scoped, so cross-project duplicates accumulate at read time; nothing promotes memory from client decisions or delivery outcomes; `used_in` remains unpopulated.

### 10. Extraction inconsistencies — NOT FIXED (was #9 in the original ranking)

Both halves are verbatim as audited:
- `processSingleSource` (fired by `createSource`/`reprocessSource`) still uses its own weaker prompt and writes only `engine_change_events` (`engine-intelligence.functions.ts:334-345`) — never `engine_extracted_signals`. A source added via `createSource` alone still produces zero categorized signals.
- The extraction UI still renders 12 category keys (`engine.projects.$projectId.extraction.tsx:11-24`) while the pipeline writes `extraction` as `{confidence, items: string[]}` (`engine-ai-providers.server.ts:44, 246`). AI-generated extraction still renders "Not extracted yet" in every card.

### 11. Production hygiene — PARTIAL

- **Q-Bank demo seeding: REMOVED from app code.** `getMilestoneBrief` is now a strict lookup returning `{milestone: null}`, with a comment memorializing the rule (`engine-execution.functions.ts:72-90`). Best individual hygiene fix in the batch.
- **But demo seeds live on in committed migrations:** `20260702053013` writes a demo "Q-Bank Engine" blueprint into project data, and `20260702164527` seeds fictional `engine_review_items` ("Mental Dental Academy… Q-Bank scope revision"), `engine_delivery_items`, and `engine_project_agents` rows. No cleanup migration exists — any fresh environment built from migrations gets demo rows in production tables.
- **`?__visual=demo` bypass: UNCHANGED.** Still skips portal auth with no `PROD`/`NODE_ENV` gate (`portal.tsx:40-45`). Blast radius is limited — it renders a static fixture with zero server calls (`portal.roadmap.tsx:113-121`, `portal-roadmap-demo-fixture.ts`) — but the unauthenticated production surface stands, and the portal layout shell still mounts around it.
- **Dead `portal-state.ts`: UNCHANGED** — imported only by its own test; both files still untracked, along with `AUDIT_REPORT.md` and **two migrations** (`20260630150000_intake_project_init.sql`, `20260702163000_portal_boundary_hardening.sql`). Uncommitted migrations are deploy drift: any environment built from git alone diverges from the one these were applied to.

---

## New Migration Review

| Migration | What it does | Issues |
|---|---|---|
| `20260706000143` (intake failures) | `engine_project_intake_failures` table, no FK (survives rollback), admin/operator SELECT policy, service_role ALL | **Defective for its main caller:** `GRANT SELECT` only + no INSERT grant/policy for `authenticated`; `createProjectFromSource` inserts via the user-scoped client → insert always fails, silently (error also unchecked in code). Fix: route the write through `supabaseAdmin`, or add `GRANT INSERT` + an admin/operator INSERT policy — and check the returned `error`. Keep intake PII out of `payload` (operator-readable). |
| `20260706001252` (investment columns) | `investment_confirmed_at/by` on `engine_projects` | Clean. Powers a real, consistently enforced gate. |
| `20260706003002` (portal fanout, 152 lines) | AFTER INSERT triggers on `client_portal_files`/`client_portal_messages` → `engine_activity` + `operator_notifications`; SECURITY DEFINER, pinned `search_path` | Well built. Error-swallowing (`RAISE WARNING; RETURN NEW`) is deliberate — accepted trade: silent fanout loss, no retry. Unlinked portal projects get no fanout. `operator_notifications` (from `20260705203514`) has correctly-scoped operator/admin SELECT RLS; inserts are trigger/service-role only — consistent. |
| `20260706003158` (task gating) | `engine_tasks.milestone_id` NOT NULL + FK re-created as `ON DELETE CASCADE` | Enforces Pillar 11's "every task connects to a milestone"; comment shows the orphan check was done first, and `createTask` was updated to match (required `milestoneId` + same-project verification, `engine-execution.functions.ts:290-334`). **But CASCADE is a semantic change from SET NULL** — see New Issues #3. |
| `20260706004808` (grant hardening) | Revokes EXECUTE on both trigger functions from PUBLIC/anon/authenticated; adds explicit operator management policy on `client_portal_files` | Correct and thoughtful — SECURITY DEFINER functions callable by anon would have been an escalation surface. |

---

## New Issues Introduced by the Fixes

1. **`engine_project_intake_failures` is unwritable in its primary path, doubly silently** — RLS/grant-blocked for `authenticated` (`20260706000143:17, 22-36`) while the code inserts via the user JWT client (`engine-project-intake.functions.ts:72, 255-267`), and the returned supabase-js `error` is never checked, so even the catch/log never fires. The rollback fix no-ops exactly where it matters.
2. **`decideReviewItem` approves the review item before its own gates.** Item status + audit written at `engine-ops.functions.ts:269-278`; investment/self-approval/critical-event/already-approved guards throw afterward (`:316-355`), stranding an approved review item with an unapproved version.
3. **`engine_tasks.milestone_id` moved from `ON DELETE SET NULL` to `ON DELETE CASCADE`** (`20260706003158`). Deleting a milestone now silently hard-deletes its tasks, including completed ones with audit value. Latent — no code path deletes `engine_milestones` today — but undocumented and surprising.
4. **Approve-then-fail milestone apply:** the milestone-diff application inside `decideReviewItem` is a warn-only try/catch (`engine-ops.functions.ts:388-479`) that runs *after* the version is flipped to approved (`:357-367`). The advertised milestone changes can silently not exist while the version reads as approved; only a `console.warn` records it.
5. **Demo phase names multiplied instead of dying:** the `MapCanvas.tsx:668-675` Now/Next/Later remap plus key-based hardcodes in `StatusOverlayCard`, `MilestoneSheet`, `MarkerCluster`, and `RoadmapOverviewStrip` reintroduce "Foundation / Core Platform Build / Scale Systems" — now inconsistently across surfaces (see §5).
6. **Existing-client portal upsert nulls contact fields:** on the existing-client path `data.newClient` is undefined, so the upsert overwrites `contact_name`/`company_name` with `null` (`engine-project-intake.functions.ts:199-214`).
7. Minor: `severity: "warning"` in the new integrity-warning activity (`engine-project-intake.functions.ts:295`) vs the codebase's `"warn"` convention (3 uses) — free-text column so no error, but severity filtering will miss it.

---

## Remaining Gaps (ranked by severity)

1. **Durable intake-failure log is unwritable and doubly silent** (New Issues #1) — ops-initiated rollbacks still leave zero durable evidence anywhere.
2. **`transitionDelivery` remains the operator side door** — `assertOps` can move deliveries to `sent`/`execution` (`engine-ops.functions.ts:107-167`); no gate at all when `project_id` is null (`:130`). The last open piece of the "operators cannot approve sacred parts" boundary.
3. **Portal full-row leaks persist** — `client_portal_projects` `select("*")` ships `owner_email` + five Stripe IDs + `metadata` to the browser (`portal.functions.ts:406-410, 477`); `client_portal_onboarding` (`:449`) and `client_portal_billing` (`:468`) also full-row; `supporting_notes` included in the "fixed" roadmap projection against the sibling function's own doctrine (`:459-461` vs `:639`); `engineSourceId` still returned (`:1959`); `approved_at`-based filter lets archived roadmaps resurface (`:463`).
4. **`decideReviewItem` ordering defect** (New Issues #2) — inconsistent approved-item/unapproved-version state, unretryable.
5. **No budget-cap check before pipeline generation** — spend recorded only post-hoc (`engine-intelligence.functions.ts:1448-1461`); the portal onboarding path can spend unbounded on a capped project.
6. **Zero behavioral role-rejection tests.** Verified across the suite: the new admin gate has no test (`ADMIN_APPROVAL_TYPES` appears in zero test files); `startExecutionEngagement` is untested entirely; publish/delivery/preview gates are covered only by static source-regex scans; `portal-publish-e2e` explicitly declares role paths out of scope; the new DB triggers have zero coverage. Every gate is protected only by the code itself.
7. **Canvas truth gaps** — Point A/B labels hardcoded at model and publish layers (authored labels unreachable); no authored/fallback tagging; payload-canvas-beats-engine precedence bug with comments claiming the opposite (`roadmap-publish.ts:365-380` vs `:480-482`); demo phase names across six components; mobile canvas has no Point A/B at all.
8. **Extraction path divergence** (untouched) — `processSingleSource` writes no categorized signals; extraction UI reads a schema nothing writes.
9. **Rollback still orphans `engine_clients`/portal rows; portal upsert still clobbers live state** (and now nulls contact fields) — `engine-project-intake.functions.ts:199-214, 493-515`.
10. **Hygiene tail:** `?__visual=demo` unauthenticated surface in prod; demo-seed rows in two committed migrations with no cleanup; dead `portal-state.ts`; two uncommitted migrations (deploy drift); message bodies preview-only; notification bell absent from the /engine shell; `updateTaskStatus` still a free-string, no-transition-rule write (now at least admin-gated, `engine-execution.functions.ts:337-351`).

---

## Updated Safety Boundary Status

| Boundary | Previous | Current | Notes |
|----------|----------|---------|-------|
| AI cannot approve | HELD (human gate too wide) | **HELD — strengthened** | Version approval admin-only in both paths; investment gate added; guards mirrored into `decideReviewItem` (with the ordering defect noted) |
| AI cannot publish/deliver/execute | HELD | **HELD** | Hard blocks intact (`engine-execution.functions.ts:30-33`); publish chain unchanged |
| Portal cannot read engine | HELD (with caveats) | **HELD — caveats narrowed** | Roadmap-row engine-linkage leak closed; projects/onboarding/billing full rows, `supporting_notes`, and `engineSourceId` remain |
| Sources stay internal | HELD | **HELD** | Unchanged; trigger-fn EXECUTE revocation reduces surface |
| Drafts cannot overwrite approved | HELD for versions / AT RISK for workspace | **HELD — both layers** | Approved `step_states` skipped by the pipeline; terminal statuses preserved; `updateProjectStep` protects approved Point A/B. Version immutability still app-layer only |
| Operator cannot approve sacred parts | **BROKEN** | **MOSTLY HELD** | Version approval closed (admin-only, both paths, queue-filtered). Open: `transitionDelivery` at `assertOps`, ungated for unlinked items; allowlist makes all six emails admin; zero rejection tests |

---

## Updated Pillar Status

| # | Pillar | Previous | Current | Notes |
|---|--------|----------|---------|-------|
| 1 | Intake | PARTIAL | **PARTIAL (improved)** | Manual prefilled bridge added; no durable submission↔project linkage; dead "previously bridged" check; review-row insert still warn-only; public intake still never auto-extracts |
| 2 | Project Creation | PARTIAL | **PARTIAL** | Durable failure log added but unwritable and silent; rollback still orphans clients/portal rows; still non-atomic; upsert clobber unchanged |
| 3 | Source Room | PASS | **PASS** | Unchanged; `signal_room` JSONB still untested by boundary tests |
| 4 | Intelligence Layer | PASS (caveats) | **PASS (same caveats)** | Extraction divergence + UI schema mismatch untouched; memory promotion added on top |
| 5 | Draft Roadmap | PASS (clobber caveat) | **PASS — caveat resolved** | Pipeline preserves approved steps + terminal statuses; re-runs produce reviewable diffs |
| 6 | Operator Review | PARTIAL (both directions) | **PARTIAL (one direction fixed)** | Operators can no longer approve versions; operators still cannot edit what the vision says they should (`updateProjectStep`/`setStepState` admin-only while `useEngineRole` promises `canEdit`) |
| 7 | Review & Approvals | PARTIAL (5/6 gates) | **MOSTLY PASS (6/6 gates exist)** | Investment is now a real admin-only gate checked in all three paths. Holes: `transitionDelivery` at `assertOps`; decide-path ordering defect |
| 8 | Client Portal | PARTIAL | **PARTIAL (improved)** | Roadmap-row projection largely fixed; projects/onboarding/billing full rows, `supporting_notes`, `engineSourceId`, `__visual=demo`, archived-row filter remain |
| 9 | Roadmap Canvas | FAIL | **PARTIAL** | Point A/B detail genuinely renders on desktop; phase pill real. Labels hardcoded, fallbacks untagged, precedence bug, jump menu + five components with demo names, mobile absent |
| 10 | Client Feedback Loop | PARTIAL | **MOSTLY PASS** | Files + messages reach the engine via DB triggers + live ops bell; body-level reader, engine-shell bell, and mirror retry still absent |
| 11 | Execution Tracker | PARTIAL | **PARTIAL (improved)** | Task→milestone enforced at three layers; Q-Bank seeding removed; `updateTaskStatus` still free-form; CASCADE regression noted |
| 12 | Intelligence Memory | PARTIAL | **PASS** | Capture → recall → apply loop closed (auto-write ≥80 confidence, prompt-injected read incl. cross-project). Next: decisions/outcomes promotion, agent-console read path |

---

## What Improved

Real credit is due — this was a substantive remediation pass, and several fixes went beyond the minimum:

- **The broken boundary was closed the right way.** Rather than blunting the whole review queue to admin, the fix scopes admin-only approval to version item types, keeps operator triage intact, *and* removes the false affordance from the operator's queue. Guards were mirrored between `decideReviewItem` and `approveVersion` so the two paths can't drift apart in strictness.
- **The investment gate went from display label to the most consistently enforced gate in the system** — admin-only toggle, checked at version approval (both paths) and portal publish, with clear operator-facing error copy and dedicated columns.
- **The pipeline clobber fix is a root-cause fix**, not a patch: transitional-status allowlist that also holds on the failure path, per-module approved-step preservation across all 11 columns, and an operator off-switch that the service-role onboarding path respects and *surfaces* when it blocks.
- **The intelligence-memory loop actually closes** — auto-promotion with dedupe and provenance, cross-project recall, and prompt framing that tells the model to treat memory as authoritative. Pillar 12 moved from shoebox to loop.
- **The upload/message fanout is solved at the database layer** — the only layer that catches the portal's direct-browser inserts — with SECURITY DEFINER hygiene (pinned `search_path`, EXECUTE revoked from anon) that most teams forget, plus a live realtime bell and inbox on the ops side.
- **Task→milestone linkage is enforced at three layers** (NOT NULL, FK, server-side same-project check), and the migration comment shows the orphan check was done before tightening.
- **Q-Bank demo seeding is gone from the app**, with a comment that makes the rule survive the next refactor.
- **`createTask` and the milestone-diff flow gained genuine defense-in-depth** — same-project milestone verification beyond the FK, and milestone re-runs producing human-reviewable diffs instead of mutations.
