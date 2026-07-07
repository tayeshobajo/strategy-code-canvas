# Roadmap Engine Audit Report
## Date: 2026-07-05
## Auditor: Claude Fable 5

## Executive Summary

The Roadmap Engine is architecturally honest about its three-room model, and the most important wall — the Gallery wall — is real. The portal's primary read path (`getPortalRoadmapDocs`) reads only `client_portal_roadmaps` with an explicit column projection and an approved/delivered status filter, publishing goes through an allowlist projection (`CLIENT_SAFE_KEYS`) with a runtime guard plus a DB trigger that rejects `ai_generated` versions, and engine sources are locked behind admin-only RLS with server-side role asserts on every touching function. The AI agent genuinely cannot approve, publish, deliver, or execute: those actions are hard-blocked server-side regardless of stored permissions, drafts are insert-only and provenance-stamped, and the client-acknowledgment gate on execution start is the best-closed feedback loop in the system.

The Gate, however, has a hole in its most sacred door. `decideReviewItem` — the review-queue approval handler — is gated `assertOps` (admin **or** operator) yet performs full version approval: it flips `engine_roadmap_versions` to `approved` and locks `approved_snapshot`. The parallel `approveVersion` path correctly requires admin for the identical transition. A DB-granted operator can therefore final-approve roadmap versions, which the vision reserves for Tai/admin. Two more structural issues follow close behind: the intelligence pipeline silently overwrites live workspace modules (Point A/B, roadmap, investment, client preview) and force-resets project status to `draft` on every run, bypassing the agent permission matrix and budget cap entirely; and project creation is a chain of 8+ sequential writes with no transaction, whose compensating rollback orphans `engine_clients`/portal rows and deletes its own audit trail.

Finally, two of the vision's pillars are more built than wired. The Roadmap Canvas ships engine-authored Point A all the way to the portal snapshot and then never renders it — the marker is hardcoded "Current State / Operating today" — while hardcoded demo phase names show to every client. Intelligence Memory has a real table, taxonomy, and curation UI, but nothing writes to it automatically and no generation path ever reads it. The safety test suite is mostly static source-text regex ("tripwires," not proofs); the only live-DB tests silently skip when `PGHOST` is unset. The system's bones are good and several boundaries are genuinely enforced — but the vision's claim that "nothing passes without review" is currently true for AI and false for operators, and the client-facing map does not yet show the client their own truth.

---

## Pillar-by-Pillar Audit

### 1. Intake
**Status: PARTIAL**

**What works:**
- Public wizard (`/build-my-roadmap`) → `submitIntake` captures truth into `intake_submissions` with a review artifact (`roadmap_intake_reviews`, `approval_required: true`, `outbound_blocked: true`) — `src/lib/intake.functions.ts:242-408`.
- Attachments are read server-side from `intake_drafts` so the browser cannot forge them (`intake.functions.ts:250-280`); upload metadata has path-prefix enforcement and storage cleanup on failure (`intake.functions.ts:553-607`).
- Operator alert fanout is idempotent (`intake-alert-${submissionId}-${recipient}`, `intake.functions.ts:492`) — verified by the one genuinely behavioral test in this area.
- Portal onboarding intake **does** auto-run extraction: `submitPortalOnboarding` inserts an `engine_sources` row and fire-and-forgets `runIntelligencePipelineInternal` (`src/lib/portal.functions.ts:1857-1894`). Same for ops-side project creation (`src/lib/engine-project-intake.functions.ts:317-327`).

**Gaps found:**
- **Public intake never auto-extracts.** `intake.functions.ts` contains zero extraction calls, and `approveSubmission` (`src/lib/ops.functions.ts:448-547`) only flips review status and sends an email — it creates no project and runs no pipeline. The Pillar 1 → Pillar 2 bridge is an operator manually re-keying data into `/engine/projects/new`.
- Submission + review-row insert is non-atomic: review insert failure is warn-only (`intake.functions.ts:366-371`), and the ops queue view INNER JOINs reviews (`supabase/migrations/20260630150000_intake_project_init.sql:97-98`) — such a submission is invisible in the queue.
- `authorizes_scan` is hardcoded `false` in the UI payload (`build-my-roadmap.tsx:772`) — URL-scan consent can never be granted; dead feature as wired.
- Anon INSERT policy is `WITH CHECK (true)` with no rate limiting (`20260630150000:106-108`) — spam surface.

**Code evidence:** `intake.functions.ts:242-408, 366-371, 492`; `ops.functions.ts:448-547`; `portal.functions.ts:1857-1894`.

### 2. Project Creation
**Status: PARTIAL**

**What works:**
- `createProjectFromSource` (`src/lib/engine-project-intake.functions.ts:67-336`) has a real integrity gate: `assertProjectIntegrity` re-reads the DB (line 246) **before** the source insert and pipeline kick (line 298) — correct ordering.
- Failure triggers `rollbackHalfBornProject` (:472-494) and a throw; an admin safety net exists (`verifyProjectIntegrity` :518-600, `repairProjectIntegrity` :625-770) surfaced at `src/routes/admin.project-integrity.tsx:16-37`.
- Delivery-mode-aware checks avoid false positives on internal projects (:450-461); repair conservatively excludes portal linkage (:612-615).

**Gaps found:**
- **Not atomic.** Every write is a separate PostgREST call — no transaction/RPC. A crash between the `engine_projects` insert (:123-143) and the gate (:246) leaves a half-born project only the admin sweep can find. This is a compensating-transaction pattern, not atomicity.
- **Rollback orphans records.** `rollbackHalfBornProject` (:474-490) never deletes `engine_clients`, `client_portal_projects`, or `client_portal_permissions`. The comment at :110-111 claims the portal-email pre-check throws "before any inserts run," but the `engine_clients` insert (:84-95) has already executed by the throw at :115-119.
- **Rollback destroys its own audit trail.** The `integrity_failure` activity row (:252-258) is deleted by the rollback itself (:478 deletes ALL `engine_activity` for the project); the promised "project-agnostic path" (:250-251) does not exist. Rollbacks leave zero persistent evidence.
- All rollback deletes swallow errors (:481-493).
- Portal upsert `onConflict: "primary_email"` (:201-214) resets a live portal's `portal_status`/`payment_status` when a second project is created for the same contact — silent state clobbering.
- `listProjectsWithIntegrityIssues` is N+1 (~4-5 queries × up to 500 projects, :799-837).

**Code evidence:** `engine-project-intake.functions.ts:84-95, 115-119, 123-143, 246, 252-258, 472-494`.

### 3. Source Room
**Status: PASS**

**What works:**
- All 9 vision source types supported (`SOURCE_TYPES`, `src/lib/engine-intelligence.functions.ts:77-87`).
- Two enforcement layers: RLS — `engine_sources` has a single admin-only policy (`supabase/migrations/20260702060056:42-44`), the `engine-signals` bucket is admin-only (`20260702053908:7-22`), `visibility` is NOT NULL DEFAULT `internal_only` (`20260704152247:24-26`); server functions — every source-touching fn asserts admin (`engine-intelligence.functions.ts:93, 119, 153, 164, 834, 1355, 1371`; `engine-sources.functions.ts:52, 115`).
- Visibility changes are audited with old/new/reason and **rolled back if the audit insert fails** (`engine-sources.functions.ts:76-96`) — genuinely good design.
- Every inserter sets `visibility: "internal_only"` explicitly (`engine-intelligence.functions.ts:137`, `portal.functions.ts:1866`).

**Gaps found:**
- **Second, unguarded raw-truth store:** the Signal Room stores transcripts/briefs/notes in `engine_projects.signal_room` JSONB (`src/routes/engine.projects.$projectId.signal-room.tsx:25-48`), not `engine_sources`. Still internal (admin/team RLS) but covered by none of the four boundary tests — and portal-published `client_preview` derives from the same `engine_projects` row, making a future select-column mistake the most plausible leak path.
- `visibility='client_safe'` and `engine_extracted_signals.client_safe` are **dormant switches with no consumer** — safe today, but any future feature honoring them must add a portal-side guard test first.
- `submitPortalOnboarding` returns `engineSourceId` to the portal caller (`portal.functions.ts:1933`) — an internal engine UUID handed to a client audience; return `{ ok: true }` instead.
- SSRF nit: pipeline `fetch(src.url)` has no host restrictions (`engine-intelligence.functions.ts:251, 920`); admin-supplied, low risk.

**Code evidence:** cited inline above.

### 4. Intelligence Layer
**Status: PASS** (with two integrity caveats)

**What works:**
- All 10 vision signal categories present in the enum, the prompt, and the DB enum (`src/lib/engine-ai-providers.server.ts:20-41, 216`; migrations `20260704152247:3-7`, `20260705004211:17-26`), plus 5 extras (`decision_maker`, `investment_signal`, `open_question`, `business_model`, `current_system`).
- Signals persist with category/label/detail/confidence (`engine-intelligence.functions.ts:1038-1059`); milestones carry `source_evidence` back to signals/sources (:1085-1119).
- Provider fallback (Claude → Gemini) records provenance (`generation_provenance`, :1023-1031).

**Gaps found:**
- **Two divergent extraction paths.** `processSingleSource` (:218-375, fired by `createSource`) uses a weaker prompt and writes only to `engine_change_events` (:336-344) — never to `engine_extracted_signals`. Only the full pipeline produces categorized signals; a source added via `createSource` alone gets none.
- **Extraction UI ↔ pipeline schema mismatch.** `engine.projects.$projectId.extraction.tsx:11-24` renders 12 category keys, but the pipeline writes `extraction` as `{ confidence, items: string[] }` (`engine-ai-providers.server.ts:44`) — AI-generated extraction renders "Not extracted yet" in every card; the UI's richness is manual-entry only.
- Milestone `evidenceForName` matching is fuzzy 24-char substring with a generic fallback (:1086-1092) — evidence links are best-effort.

**Code evidence:** cited inline above.

### 5. Draft Roadmap
**Status: PASS** (version immutability holds; live-workspace clobber is the caveat — see Critical Issue #2)

**What works:**
- Full module coverage: point_a, point_b, hidden_assets, gap_map, blueprint, roadmap (phases+milestones), sequencing, deadlines, investment, client_preview (`engine-ai-providers.server.ts:43-55, 222-234`; pipeline stages `engine-agent-prompts.ts:103-115`).
- Drafts are marked at every layer: `status: "ai_generated"`, `created_by: "ai"`, AI-draft labels, full `generation_provenance` (`engine-intelligence.functions.ts:1012-1032`; `engine-agent.functions.ts:362-374, 467-474`); AI milestones get `created_by_kind: "ai"`, `approval_status: "draft"` (:1111-1115).
- **Approved versions cannot be overwritten by AI:** `_findOrCreateAiDraft` only selects `ai_generated|draft|tai_edited` rows (`engine-agent.functions.ts:331-338`); the pipeline only INSERTs new versions; `approved_snapshot` is locked separately at approval; milestone re-runs produce a diff for human approval instead of mutating (`engine-intelligence.functions.ts:1121-1166`); `regenerateMilestoneSection` refuses approved milestones (`engine-execution.functions.ts:1353-1355`); `archiveVersion` refuses the approved version (:517-519).

**Gaps found:**
- The pipeline overwrites live `engine_projects` module columns and forces `status: "draft"` with no state check (`engine-intelligence.functions.ts:1174-1202`, verified) — approved *version rows* survive, but unversioned operator edits and human `step_states` approvals are silently replaced.
- Version immutability is application-layer only — no DB trigger prevents an update to an approved `engine_roadmap_versions` row; it rests on WHERE clauses.
- Empty `agent_allowed_modules` disables the module restriction instead of denying (`engine-agent.functions.ts:422`).
- `approve`/`force` are client-supplied booleans (`engine-agent.functions.ts:95, 390, 427`) — human-in-loop is asserted by the caller, though audit rows are written.
- Two permission stores can drift: `updatePermissions` syncs mode → `agent_permission_level` but `updateAgentControls` never syncs back (`engine-agent.functions.ts:509-538` vs `engine-execution.functions.ts:689-737`).

**Code evidence:** cited inline above.

### 6. Operator Review
**Status: PARTIAL** (violation in both directions)

**What works:**
- Operator draft-shaping flow exists: `submitVersionForApproval` (`engine-ops.functions.ts:764-805`, `assertOps`) moves drafts to `tai_edited` and enqueues an "Approve official version" review item; UI in `engine.review.tsx:428-514`.

**Gaps found:**
- **Operators CAN approve the most sacred part** — see Critical Issue #1 (`decideReviewItem`, `engine-ops.functions.ts:223` + :310-320, verified).
- **Operators CANNOT do what the vision says they should:** `updateProjectStep` and `setStepState` require admin for every module including Point A/B and deadlines (`engine.functions.ts:714-718, 779-783`), while `useEngineRole` promises operators `canEdit: true` (`src/hooks/useEngineRole.ts:73`) — the UI promises what the server denies.
- The operator/admin distinction is void for all allowlisted humans: `OPERATOR_EMAILS` is a strict subset of `ADMIN_EMAILS` (`src/lib/ops/access.ts:9-24`); only DB-granted operators are actually restricted.
- `roadmap-review.ts`'s `review_gate` block (`:47-53, 161-172`) is unenforced metadata — nothing reads `outbound_blocked` to block an action.

**Code evidence:** cited inline above.

### 7. Review & Approvals
**Status: PARTIAL** (5 of 6 gates exist; the version gate leaks to operators; investment is a label, not a gate)

| Gate | Status | Evidence |
|---|---|---|
| Version approval | EXISTS, leaks to operators | `approveVersion` admin-gated with self-approval + critical-event guards (`engine-intelligence.functions.ts:419-501`); but `decideReviewItem` does the same transition at `assertOps` (`engine-ops.functions.ts:223, 310-320`) |
| Client preview | EXISTS | `approvePreview`: `assertAdminEmail`, requires version approved (`engine-ops.functions.ts:849-883`) |
| Investment | **MISSING as a gate** | "Investment Change" is a display label only (`engine-ops.functions.ts:210`); nothing creates such items; approving one has zero side effects (:254-256). Compensating: investment edits admin-only + audited (`engine.functions.ts:714-761`), agent-excluded (`engine-agent.functions.ts:316-317`) |
| Delivery | EXISTS | `sendProjectDelivery`: admin + full checklist + approved snapshot + approved version + preview approved (`engine-execution.functions.ts:743-791`) |
| Portal publish | EXISTS (strongest) | `publishVersionToPortal`: `assertAdminEmail` + dual status gates + allowlist payload (`engine-ops.functions.ts:916-1024`); DB trigger blocks `ai_generated` and requires `approved_roadmap_version_id`; runtime allowlist guard (`roadmap-publish.ts:503-533`) |
| Execution transition | EXISTS with a side door | `startExecutionEngagement`: admin + client acknowledgment required (`engine-execution.functions.ts:1106-1132`); but `transitionDelivery` is `assertOps` and lets operators set delivery status to `sent`/`execution` with only an approved-snapshot check (`engine-ops.functions.ts:107-167`) |

- "Tai as final authority" is not modeled: any of 6 allowlisted emails or any DB-granted admin is equally final (`access.ts:17-24`); "Awaiting Tai review" is branding.
- Legacy label-match fallback in `decideReviewItem` (:281-292) can approve "most recent pending" draft when the label doesn't match — mitigated for new items by the `version_id` FK.

### 8. Client Portal
**Status: PARTIAL** (architecture right; one real leak)

**What works:**
- Primary read path `getPortalRoadmapDocs`: explicit column projection + `status IN ('approved','delivered')`, scoped by active `client_portal_permissions` (`portal.functions.ts:621-664`), with an in-code doctrine comment banning internal columns (:631-634).
- Publish is allowlist-projected (`CLIENT_SAFE_KEYS`, `roadmap-publish.ts:522-533`) with a runtime guard (:503-514); no AI confidence, agent costs, or internal notes enter the snapshot (grep-verified; costs surfaced only via admin routes, `engine-execution.functions.ts:449, 569`).
- DB backstops: client RLS requires approved status + non-null version linkage + permission match (`20260702192431:36-48`); trigger requires `approved_roadmap_version_id`/`approved_at` (`20260705045722:16-19`).
- Auth: session-gated route, `requireSupabaseAuth` on every fn, email-based tenant scoping via RLS + application checks, revocation force-signs-out (`portal.functions.ts:852-923`); two-tenant isolation proven by the live e2e test.

**Gaps found:**
- **`getPortalContext` leaks internal columns** (verified): `select("*")` on `client_portal_roadmaps` at `portal.functions.ts:452-458`, full row returned to the browser at :472 — including `approved_roadmap_version_id`, `published_by` (operator email), `supporting_notes`, `acknowledged_by_email`, and `metadata.engine_project_id` (stamped at `engine-ops.functions.ts:1004`). RLS is row-level, not column-level; the UI uses 4 fields but the network response carries everything. Directly contradicts the doctrine at :631-634. Also `select("*")` on `client_portal_projects` (:406-410) bypasses the `portal_project_v` whitelist view built for this purpose.
- `getPortalContext`'s roadmap query lacks a status filter (:456) — RLS is the only backstop against drafts.
- `?__visual=demo` permanently bypasses portal auth on `/portal/roadmap` in production (`portal.tsx:40-45`) — renders only a fixture, but it's a standing unauthenticated surface.
- `portal-state.ts` + the `portal_workspaces` model are dead code — no route imports them (only the test does); real locking uses `client_portal_projects.portal_status` (`portal.tsx:75-104`). The `20260702163000_portal_boundary_hardening.sql` migration hardens legacy tables the code no longer uses — false confidence.

### 9. Roadmap Canvas
**Status: FAIL** (on the vision's named criterion: approved engine-authored Point A/B surfacing)

**What works:**
- The data pipeline is correct end-to-end: `engine_projects.point_a/point_b` → publish (`engine-ops.functions.ts:944-973`) → `client_safe_canvas.pointA/pointB` (`roadmap-publish.ts:365-380, 479-485`) → portal bridge (`portal.functions.ts:666-676`) → `buildRoadmapJourney` (`portal-roadmap-model.ts:507-522`). Verified at the data layer by the live e2e test.

**Gaps found:**
- **Point A never renders** (verified): the live canvas is `MapCanvas` (`portal.roadmap.tsx:30`; `JourneyCanvas.tsx` is orphaned), and its Point A marker is fully hardcoded — "Point A / Current State / Operating today" (`MapCanvas.tsx:745-758`). `journey.pointA.detail` is rendered nowhere in `src/`. Point B detail renders truncated to 60 chars (:768-771). The whole engine→snapshot→model pipeline for Point A is delivered correctly and dropped on the floor at render time.
- **Suspected fallback gap CONFIRMED at two layers, both silent:** model layer `pointA.detail = canvas ?? project.point_a ?? current_diagnosis` (`portal-roadmap-model.ts:507-522`); publish layer bakes the same substitution into the snapshot (`roadmap-publish.ts:483-484`) — downstream cannot distinguish authored from fallback content.
- **Precedence bug:** the comment at `roadmap-publish.ts:432-436` says engine point_a/point_b "override any derived fallback," but `buildClientSafeCanvas` prefers a payload-embedded canvas value over the engine field (:365-380) — a stale pointA inside the version payload wins.
- **Hardcoded demo copy shown to every client:** `CurrentPhasePill` maps phases to "Phase 1: Foundation / Phase 2: Core Platform Build / Phase 3: Scale Systems," ignoring real `journey.phases[].label` (`portal.roadmap.tsx:930-936`); the Jump-to menu does the same plus "Point B · Scaled Impact" (:1082-1086).
- Mobile canvas (`MobilePhaseStack.tsx`) omits Point A/B entirely.

### 10. Client Feedback Loop
**Status: PARTIAL**

| Client action | Recorded | Engine reader | Loop closed? |
|---|---|---|---|
| Roadmap viewed | `client_portal_activity` + mirror to `engine_delivery_items.client_viewed_at` (`portal.functions.ts:1053-1103`) | Delivery Room via `getPortalHandoffState` (`engine-execution.functions.ts:1047-1098`) | YES |
| Downloaded | `client_downloaded_at` (`portal.functions.ts:1077-1082`) | Same | YES |
| Acknowledged | `acknowledged_at` + delivery mirror (`portal.functions.ts:1026-1092`) | **Gates** `startExecutionEngagement` (`engine-execution.functions.ts:1130-1132`) | YES — strongest loop |
| Milestone decision | Activity + message + `engine_review_items` + audit + `engine_activity` (`portal.functions.ts:1337-1413`) | Review queue (`engine-ops.functions.ts:196-197`) | YES |
| Clarification request | Message + review item + audit (`portal.functions.ts:1434-1479`) | Review queue | YES |
| Free-form message | `client_portal_messages` (:1549-1571); best-effort 240-char preview to `engine_activity` (:1583-1594) | No engine reader of the messages table; preview only in feeds capped at 6–20 rows | **PARTIAL — confirmed** |
| Milestone-reviewed | Activity + best-effort `engine_activity` mirror (:1141-1174) | Generic feeds only; no state change, no queue item | PARTIAL (mirror exists; drives nothing) |
| File viewed/downloaded | RPC + counters; engine mirror only for 5 whitelisted categories (:1204-1237) | Feeds, important categories only | **PARTIAL — confirmed** |
| File uploaded by client | Direct browser insert into `client_portal_files` (`portal.files.tsx:222-235`) | **NONE** — no activity log, no mirror, no review item, no notification | **GAP — fully portal-only** |

- All portal→engine mirrors are fire-and-forget try/catch with `console.warn` on failure (`portal.functions.ts:1104-1106, 1172-1174, 1239-1241, 1592-1594`) — a lost mirror means a client action silently never reaches the engine; no retry/queue.
- Nothing from client feedback (e.g., unanswered messages) feeds `getExecutionAlerts` (`engine-ops.functions.ts:464-529`).

### 11. Execution Tracker
**Status: PARTIAL** (gating solid; linkage unenforced)

**What works:**
- Tasks carry `owner_email`, `due_date`, `acceptance_criteria`, priority, source, effort/cost estimates (migration `20260702132710:46-65`); briefs (`brief_md`, `developer_prompt`, `qa_checklist`) live on milestones (:17-23).
- `sendMilestoneToTasks` fans acceptance criteria into deduped, audited tasks (`engine-execution.functions.ts:283-356`).
- Gating is genuinely strong: milestone approval requires non-empty acceptance criteria (:249-256); approved-milestone fields protected without `force` (:180-222); agents hard-blocked from delivery/execution (:30-33, 706-713); delivery requires checklist + snapshot + approved version + approved preview (:760-791); execution start requires admin + client acknowledgment (:1106-1132).

**Gaps found:**
- **"Every task connects to a milestone" is not enforced:** `milestone_id` is nullable, `ON DELETE SET NULL` (migration :48), `createTask` defaults it to null (`engine-execution.functions.ts:386, 401`). Orphan tasks are legal.
- Milestone→gap/asset links are free-text columns, not FKs (migration :12-14); provenance exists only via `roadmap_version_id`/`source_evidence` when applied from a version diff.
- `updateTaskStatus` is an ungated status write — any string, no transition rules, no audit (:411-425).
- `getMilestoneBrief` silently inserts a hardcoded "Q-Bank Engine" demo milestone into production data when none is found (:97-176) — demo scaffolding in a live write path.
- Alert "Dismiss" is client-state only (`engine.execution.tsx:55, 216-218`); "Delivery Health %" is a cosmetic `100 - alerts*2` formula (:109).

### 12. Intelligence Memory
**Status: PARTIAL** (storage built; the loop absent)

**What works:**
- Real store: `engine_intelligence_memory` with nullable `project_id` (genuinely cross-project), type/confidence/tags, traceability FKs to source/milestone/signal (migrations `20260702180621:28-68`, `20260702183916:36-43`).
- CRUD + curation UI with the vision's exact taxonomy — Client Truth, Decision, Constraint, Preference, Risk (`engine-intelligence.functions.ts:1408-1535`; `engine.intelligence.tsx:23-60`), plus an append-only decisions ledger (:1551-1622).

**Gaps found:**
- **Nothing writes memory automatically.** Only the manual UI functions insert (:1466, :1527). The pipeline, client decisions, portal feedback, and delivery outcomes never promote anything.
- **Nothing reads memory during generation.** Zero references in `engine-agent-prompts.ts`, `engine-agent.functions.ts`, `engine-ai.server.ts`, or the extraction pipeline (grep-verified). A new project's AI drafting starts cold — "long-term memory across projects" never influences a roadmap.
- `used_in` is free text with no populating mechanism (migration `20260702180621:39`).

It is a write-only shoebox: capture → recall → apply does not exist.

---

## Safety Boundary Verification

| Boundary | Status | Evidence |
|----------|--------|----------|
| AI cannot approve | **HELD** | Only two paths set `status='approved'`, both human-gated server fns never called by agent code (`engine-intelligence.functions.ts:419-501`; `engine-ops.functions.ts:215-335`); self-approval guards in both; AI-authored versions require a human approver by construction. Caveat: the human gate is too wide (operators — Issue #1). |
| AI cannot publish/deliver/execute | **HELD** | `assertActionAllowed` unconditionally throws for `send_delivery`/`move_project_to_execution` (`engine-execution.functions.ts:30-33`); `updatePermissions` coerces them to `blocked` even for admins (:706-713); only inserts into `client_portal_roadmaps` are the two admin-gated paths, backstopped by the DB trigger rejecting `ai_generated`. |
| Portal cannot read engine | **HELD (with caveats)** | Client RLS reaches only `client_portal_*` tables; all engine-table touches in `portal.functions.ts` are server-side admin mirrors feeding writes, not responses. Caveats: `getPortalContext` leaks engine linkage UUIDs + operator email through `select("*")` (`portal.functions.ts:452-472`); the static guard's escape hatch whitelists any `supabaseAdmin` read and its table list omits `engine_projects`/`engine_milestones`/`engine_clients`/`engine_activity` (`portal-safety-guard.test.ts:25-42, 70-75`). |
| Sources stay internal | **HELD** | Admin-only RLS on `engine_sources` (`20260702060056:42-44`) and the storage bucket (`20260702053908:7-22`); `assertAdmin` on every source fn; every inserter sets `internal_only`. Watch: `signal_room` JSONB duplicates raw truth outside the guarded table with no boundary test; dormant `client_safe` switches have no consumer yet. |
| Drafts cannot overwrite approved | **HELD for version records / AT RISK for live workspace** | Insert-only pipeline; draft-reuse filters exclude approved (`engine-agent.functions.ts:331-338`); `approved_snapshot` locked at approval. But the pipeline clobbers live `engine_projects` modules + status (`engine-intelligence.functions.ts:1174-1202`, verified), and version immutability has no DB-level enforcement. |
| Operator cannot approve sacred parts | **BROKEN** | `decideReviewItem` at `assertOps` performs full version approval (`engine-ops.functions.ts:223, 310-320`, verified); `transitionDelivery` at `assertOps` moves deliveries to `sent`/`execution` (:107-167); enforced nowhere in UI either (`useEngineRole.ts:72`; `engine.review.tsx:266-269`). Preview/publish/delivery-send/execution-start ARE correctly admin-only. |

**A note on the safety tests:** most are static source-text regex scans, not behavioral tests — `project-integrity-rollback`, `onboarding-triggers-extraction`, `review-item-and-publish-gates`, `review-item-version-fk`, `publish-column-integrity`, `portal-safety-guard`, `portal-cannot-read-engine-sources`, and both non-live `source-visibility` tests all `readFileSync` production source and assert text patterns. They are legitimate regression tripwires but cannot catch logic bugs (the rollback test passes despite the orphaned `engine_clients`; one test is keyed to an anchor comment). The only runtime tests — `source-visibility-live` and `portal-publish-e2e` — are real and valuable (the e2e proves payload sanitization and two-tenant isolation against a live DB) but `describe.skipIf(!PGHOST)` means they silently skip on any machine without PG env, and neither executes as an authenticated client role under RLS. Zero tests anywhere assert that an operator is *rejected* from a sacred action. The behavioral exceptions: `intake-alert-idempotency` (real logic, mocked DB), `ops/access.test` (solid fail-closed coverage of `hasRoleForEmail`), `roadmap-review.test` (shape only), and `portal-state.test` (tests dead code).

---

## Critical Issues (ranked by severity)

1. **Operators can final-approve roadmap versions.** `decideReviewItem` is gated `assertOps` (`engine-ops.functions.ts:223`) yet flips versions to `approved` and locks `approved_snapshot` (:310-320) — the exact transition `approveVersion` reserves for admin (`engine-intelligence.functions.ts:423`). The P0-4 comment (:249-253) shows the side effect was added deliberately without tightening the gate. Compounded by `transitionDelivery` (also `assertOps`, :107-167) and by zero tests asserting operator rejection. *Verified in source.*
2. **The intelligence pipeline silently clobbers live workspace state and bypasses all agent controls.** `runIntelligencePipelineInternal` overwrites `engine_projects` module columns and forces `status: "draft"` unconditionally (`engine-intelligence.functions.ts:1174-1202`, verified), ignoring human `step_states` approvals and project status; it also runs without `assertActionAllowed` or budget-cap checks, auto-triggered with service-role credentials from portal onboarding (`portal.functions.ts:1880-1883`) — a blocked/capped project still gets AI runs and workspace overwrites.
3. **`getPortalContext` ships internal fields to the client browser.** `select("*")` on `client_portal_roadmaps` returned wholesale (`portal.functions.ts:452-472`, verified): `approved_roadmap_version_id`, `published_by` operator email, `supporting_notes`, `metadata.engine_project_id`. Contradicts the codebase's own doctrine and e2e assertions, which only cover the other read path.
4. **The client-facing canvas doesn't show the client's truth.** Engine-authored Point A never renders (hardcoded marker, `MapCanvas.tsx:745-758`, verified); Point B truncates at 60 chars; silent diagnosis/summary fallbacks are baked in at two layers (`roadmap-publish.ts:483-484`; `portal-roadmap-model.ts:507-522`); hardcoded demo phase names show to every client (`portal.roadmap.tsx:930-936, 1082-1086`). Pillar 9 is the vision's centerpiece and it currently displays placeholder copy.
5. **Project creation is non-atomic and its rollback is leaky.** No transaction across 8+ writes; rollback orphans `engine_clients`/portal rows, deletes its own `integrity_failure` audit row, and swallows delete errors (`engine-project-intake.functions.ts:123-143, 252-258, 472-494`). The admin sweep is the real safety net.
6. **The public intake → engine bridge doesn't exist.** No auto-extraction on `/build-my-roadmap` submissions; approval sends an email but creates nothing (`ops.functions.ts:448-547`); a failed review-row insert makes a submission invisible in the queue (`intake.functions.ts:366-371`).
7. **Client uploads and messages don't reach the engine.** File uploads are fully engine-invisible (`portal.files.tsx:222-235`); message bodies have no engine reader (240-char best-effort preview only); all mirrors are fire-and-forget with no retry.
8. **Intelligence memory loop is absent** — nothing auto-captures, nothing recalls at generation time (Pillar 12).
9. **Extraction pipeline inconsistencies:** `processSingleSource` never writes categorized signals; the extraction UI reads a schema the pipeline doesn't write (Pillar 4 caveats).
10. **Production hygiene:** `getMilestoneBrief` seeds demo data into prod (`engine-execution.functions.ts:97-176`); `?__visual=demo` bypasses portal auth (`portal.tsx:40-45`); portal upsert clobbers live portal state on email conflict (`engine-project-intake.functions.ts:201-214`); dead `portal-state.ts`/`portal_workspaces` and a hardening migration targeting dropped tables.

## Recommendations (prioritized)

1. **Change `assertOps` → `assertAdminEmail` in `decideReviewItem`** (`engine-ops.functions.ts:223`) — or gate only the version-approval side effect (:254-335) behind an admin check, leaving triage ops-wide. Do the same evaluation for `transitionDelivery`. One-line class of fix; closes the broken boundary.
2. **Add a behavioral role-rejection test suite:** operator credentials must be rejected from `decideReviewItem`-approve (post-fix), `approvePreview`, `publishVersionToPortal`, `sendProjectDelivery`, `startExecutionEngagement`. This is the missing test category — everything else is regex.
3. **Fix `getPortalContext`:** replace both `select("*")` calls with explicit projections (`portal.functions.ts:406-410, 452-458`); add a status filter to the roadmap query; extend `portal-publish-e2e` forbidden-column assertions to this read path. Stop returning `engineSourceId` from `submitPortalOnboarding` (:1933).
4. **Render the truth in the canvas:** wire `journey.pointA.detail`/`pointB.detail` into `MapCanvas` (and `MobilePhaseStack`), replace the hardcoded phase pills and jump-menu with `journey.phases[].label`, fix the canvas-vs-engine precedence in `buildClientSafeCanvas` (`roadmap-publish.ts:365-380`), and tag fallback-derived pointA/pointB in the snapshot (e.g. `pointA.source: "authored" | "fallback"`) so it can never silently substitute.
5. **Make the pipeline respect the workspace:** before overwriting `engine_projects` modules, skip columns whose `step_states` are `approved` (or write to the draft version payload only); check `assertActionAllowed`/budget before generation, not just record cost after.
6. **Wrap project creation in a single `SECURITY DEFINER` RPC** (transaction), or at minimum: add `engine_clients`/portal tables to the rollback, move the portal-email pre-check before the client insert, and log `integrity_failure` to a project-agnostic table the rollback doesn't delete.
7. **Close the intake bridge:** on `approveSubmission`, offer one-click `createProjectFromSource` pre-filled from the submission (auto-extraction then fires via the existing path); make the review-row insert failure fatal or queue-visible.
8. **Close the feedback gaps:** log client file uploads via `log_client_portal_activity` + engine mirror + operator notification; add an engine-side reader for `client_portal_messages` (or auto-create review items past a threshold); convert fire-and-forget mirrors to an outbox/retry pattern.
9. **Wire the memory loop:** inject relevant `engine_intelligence_memory` rows into the pipeline/agent prompt context (read side), and auto-propose memory entries from client decisions and delivery outcomes (write side, human-curated via the existing decisions ledger).
10. **Hygiene:** remove the Q-Bank demo seeding from `getMilestoneBrief`; gate `?__visual=demo` to non-production; guard the `signal_room` JSONB store with a boundary test; delete or wire `portal-state.ts`; run the live tests (`PGHOST`) in CI so they stop silently skipping.

## What's Working Well

- **The publish gate chain is genuinely defense-in-depth:** admin assert + version-approved + preview-approved status gates, an allowlist payload projection with a runtime guard that throws on unknown keys, and a DB trigger that rejects `ai_generated` versions and requires approval linkage. This is the strongest boundary in the system and the right pattern to copy elsewhere.
- **AI containment is real, not advisory:** hard-blocked delivery/execution actions that even admins cannot unlock, safe permission defaults, `draft_only` downgrade semantics, insert-only versioning with full provenance, self-approval guards, and the diff-not-mutate milestone re-run design.
- **The acknowledgment loop closes properly** — client ack is recorded, mirrored to delivery items, and *gates* execution start server-side.
- **Source-room enforcement is layered and audited** — admin-only RLS + per-function asserts + explicit `internal_only` on every insert, and visibility changes that roll back if the audit write fails (a genuinely careful touch).
- **Cost tracking is thorough and internal:** per-call estimation, a cost ledger on every agent run, a server-enforced budget cap on the agent console, and admin-only surfacing.
- **The live e2e test (`portal-publish-e2e`) is excellent when it runs** — real DB, real payload builder, forbidden-marker assertions, and a two-tenant isolation proof.
- **Fail-closed role helper** (`hasRoleForEmail`) with solid unit coverage, and integrity tooling (`verifyProjectIntegrity`/repair/admin sweep) that shows the team already thinks in terms of half-born-project detection.
