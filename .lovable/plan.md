
# Roadmap Engine — Context Pack (Read-Only Audit)

This is a snapshot of the current system. **No code changes are being made.** All findings anchored to file:line evidence gathered from the codebase, migrations, and Supabase types.

---

## 1. Route Map

**Layout gates**
- `/_authenticated/route.tsx` — `supabase.auth.getUser()`, redirects to `/auth` if none
- `/engine.tsx` — requires `admin | operator | team_member` role
- `/admin.tsx` — requires `admin` (or hardcoded owner email)
- `/ops/route.tsx` — requires `operator | admin`
- `/portal.tsx` — `checkPortalAccess()`; staff bounce to `/engine`, revoked → `/portal/access-denied`

### 1a. Client Portal (client-facing)

| Route | File | Purpose | Data | Actions |
|---|---|---|---|---|
| `/portal` → `/portal/home` | `portal.index.tsx` | Redirect | — | — |
| `/portal/home` | `portal.home.tsx` | Client dashboard | `getPortalContext` | `resendPortalWelcome` |
| `/portal/roadmap` | `portal.roadmap.tsx` | Canvas + drawer + mini-map | `getPortalRoadmapDocs` | `recordPortalRoadmapEvent`, `respondToPortalDecision`, `requestPortalClarification` |
| `/portal/roadmap-mockup` | `portal.roadmap-mockup.tsx` | Static design demo (noindex) | fixtures | — |
| `/portal/onboarding` | `portal.onboarding.tsx` | 4-section intake wizard | `getPortalOnboarding` | `savePortalOnboardingSection`, `submitPortalOnboarding`, storage upload |
| `/portal/messages` | `portal.messages.tsx` | Threaded messages (`?milestone=`, realtime) | direct `portal_messages` query | `sendPortalMessage` |
| `/portal/files` | `portal.files.tsx` | Shared file library (search) | direct `portal_files` query | upload, `logPortalFileEvent`, signed URL |
| `/portal/billing` | `portal.billing.tsx` | Stripe history + subscription | direct `stripe_payments` | `createBillingPortalSession`, cancel/reactivate/change |
| `/portal/activity` | `portal.activity.tsx` | Chronological event feed | infinite query on `portal_activity` | — |
| `/portal/account` | `portal.account.tsx` | Profile + sign-out | auth session | `updatePortalProfile`, `resendPortalWelcome`, `signOut` |
| `/portal/login` | `portal.login.tsx` | Magic-link entry | — | `requestPortalMagicLink` |
| `/portal/access-denied` | `portal.access-denied.tsx` | Revoked state (signs out on mount) | — | — |
| `/auth` | `auth.tsx` | Universal magic-link, role-aware redirect | `has_role_email` RPC | `requestPortalMagicLink` |

### 1b. Roadmap Engine (internal only)

| Route | File | Purpose |
|---|---|---|
| `/engine` (Command Center) | `engine.index.tsx` | Cross-project ops dashboard (`getCommandCenter`) |
| `/engine/review` (Review & Approvals) | `engine.review.tsx` | Unified review queue (`listReviewQueue`, `listDraftVersions`, `decideReviewItem`) |
| `/engine/delivery` (Delivery Room) | `engine.delivery.tsx` | Per-project delivery lifecycle (`listDeliveries`, `transitionDelivery`, `setPortalRoadmapStatus`) |
| `/engine/execution` (Execution Tracker) | `engine.execution.tsx` | Live alerts (`getExecutionAlerts`, 30s poll; `listActiveBuilds`, 60s) |
| `/engine/intelligence` (Intelligence Memory) | `engine.intelligence.tsx` | Global memory (`listIntelligenceMemory`, `upsertIntelligenceMemory`) |
| `/engine/operations` (Global Ops) | `engine.operations.tsx` | Cross-project agent view (`listProjectAgents`, `createProjectAgent`) |
| `/engine/templates` | `engine.templates.tsx` | **Placeholder** — "Coming in next build" |
| `/engine/projects` (index) | `engine.projects.index.tsx` | Projects listing |
| `/engine/projects/new` | `engine.projects.new.tsx` | Project creation wizard (`createProjectFromSource`) |
| `/engine/projects/$id` | (layout) | Workspace shell + 14-step stepper (`getProjectWorkspace`) |
| `/engine/projects/$id/overview` | `.overview.tsx` | Project dashboard |
| `/engine/projects/$id/signal-room` | `.signal-room.tsx` | Sources inbox |
| `/engine/projects/$id/intelligence-layer` | `.intelligence-layer.tsx` | Full pipeline UI (sources, versions, change events) |
| `/engine/projects/$id/extraction` | `.extraction.tsx` | AI pipeline runs |
| `/engine/projects/$id/point-a` `/point-b` `/hidden-assets` `/gap-map` `/blueprint` `/builder` `/sequencing` `/deadlines` `/investment` `/preview` `/delivery` | one route file each | 11 module editors (JSON stepEditor → `updateProjectStep`) |
| `/engine/projects/$id/versions/compare` | `.versions.compare.tsx` | Version diff + `approveVersion` + `publishVersionToPortal` |
| `/engine/projects/$id/agent` `/agent/tasks` `/agent/costs` `/agent/permissions` | agent console family | AI agent workbench |
| `/engine/projects/$id/milestones/$mId/brief` | `.milestone.brief.tsx` | Per-milestone brief workspace |

### 1c. Admin & Ops

| Route | Purpose |
|---|---|
| `/admin/client-portals` | Portal admin (list/edit/revoke/resend) |
| `/admin/roles` | Grant/revoke `user_roles` |
| `/admin/config` | Runtime config display |
| `/ops/queue`, `/submissions/$id`, `/editor/$id`, `/history`, `/insights` | Intake submission workflow |
| `/ops/emails`, `/ops/access-events` | Email health + portal access telemetry |

### 1d. Public marketing + APIs

- Public: `/`, `/about`, `/what-we-build`, `/investment`, `/walks[/$slug]`, `/insights[/$slug]`, `/build-my-roadmap`, `/checkout/*`, `/unsubscribe`, `/sitemap.xml`
- Server routes: `/api/public/hooks/build-roadmap-contact` (form), `/api/public/payments/webhook` (Stripe HMAC), `/email/unsubscribe`, `/lovable/email/*` (auth+transactional email pipeline)

---

## 2. Database Schema Inventory

### 2a. Enums (14)

- `app_role` = admin | operator | user | team_member (**no `ai` / no `client`**)
- `engine_project_status` (10): intake → active → source_processing → draft → needs_review → approved → delivered → in_execution → blocked → archived
- `engine_source_type` (9): transcript, brief, website_url, document, screenshot, email_note, research_note, competitor_url, previous_roadmap
- `engine_source_status`: queued | processing | processed | failed
- `engine_source_visibility`: internal_only | operator_only | client_safe
- `engine_version_status` (8): ai_generated → draft → needs_review → tai_edited → approved → client_facing → delivered → archived
- `engine_change_kind` (8), `engine_agent_task_kind` (10), `engine_agent_task_status` (4), `engine_agent_permission` (3), `engine_extraction_run_status` (4)
- `engine_signal_category` (15): goal, pain, opportunity, deadline, constraint, decision_maker, hidden_asset, risk, required_system, milestone_candidate, investment_signal, client_language, open_question, business_model, current_system

### 2b. Engine tables (internal-only) — 24

| Table | Purpose | project_id | portal_id | Audit |
|---|---|---|---|---|
| `engine_clients` | Client company registry | — | — | updated_at |
| `engine_projects` | Master project + module JSONBs + approved_snapshot | (self) | ✓ **bridge** | audit_log + change_events |
| `engine_project_dates` | Named deadlines | ✓ | — | — |
| `engine_project_agents` | AI agent instances | ✓ | — | updated_at |
| `engine_agent_permissions` | 1:1 permission config, budget caps, action matrix | ✓ (PK) | — | updated_at |
| `engine_agent_tasks` | Every AI prompt+output+cost | ✓ | — | full |
| `engine_agent_costs` | Cost ledger | ✓ | — | append |
| `engine_sources` | Raw source docs/URLs, visibility enum, processing stages | ✓ | — | full |
| `engine_extraction_runs` | AI pipeline runs | ✓ | — | append |
| `engine_extracted_signals` | Structured signals (15 categories, client_safe flag) | ✓ | — | full |
| `engine_roadmap_versions` | Versioned payloads, `client_preview_status`, published back-links | ✓ | via `published_portal_roadmap_id` **bridge** | approved_by/at |
| `engine_change_events` | Semantic changes (blockers, scope, risk) | ✓ | — | resolved_at |
| `engine_version_change_decisions` | Per-change accept/edit/reject | ✓ | — | append |
| `engine_audit_log` | Field-level audit (**old/new/field_changed/reason**) | ✓ | — | primary audit |
| `engine_milestones` | Milestones w/ brief_md, client_safe_md, acceptance criteria, source_evidence | ✓ | — | approval_status |
| `engine_tasks` | Tasks under milestones | ✓ | — | updated_at |
| `engine_signals` | Lightweight triage inbox | ✓ | — | — |
| `engine_activity` | Internal event feed | ✓ | — | append |
| `engine_intelligence_memory` | Cross-project memory | ✓ | — | archived_at |
| `engine_intelligence_decisions` | Memory decision audit | ✓ | — | append |
| `engine_review_items` | Review queue items | ✓ | ✓ **bridge** | review_audit |
| `engine_review_audit` | Review lifecycle history | — | — | append |
| `engine_delivery_items` | Per-delivery record, client ack timestamps | ✓ | via `client_portal_roadmap_id` **bridge** | full |
| `engine_delivery_history` | Delivery status transitions | — | — | append |

### 2c. Client Portal tables (client-facing / bridge)

- `client_portal_projects` — root, primary_email, phase, Stripe fields, `intake_submission_id`
- `client_portal_permissions` — email-based ACL with `can_view_roadmap`, `can_message`, etc.; `revoked_at`
- `client_portal_onboarding` — 4-section wizard state (business_basics, goals_priorities, assets_docs, review_submit)
- `client_portal_messages` — `sender_type`, `visible_to_client`, `action_required`, `related_roadmap_section` (free text)
- `client_portal_files` — `client_visible`, `is_internal`, `linked_roadmap_document_id`, engagement counters
- `client_portal_billing` — Stripe payment records
- `client_portal_roadmaps` — **the only table the portal roadmap page reads**; carries allowlisted client-safe payload
- `client_portal_activity` — client-facing event log (`actor_type`, `client_visible`)
- `portal_messages` — **legacy single-table** (see gap G-9)
- `portal_access_events` — auth diagnostics
- `client_access` — Stripe-purchase-anchored access record

### 2d. Bridge / cross-cutting

- `roadmap_documents`, `roadmap_approvals` — approval records; historical
- `intake_submissions`, `intake_drafts`, `email_*`, `orders`, `subscriptions`, `processed_stripe_events`
- `user_roles` + `has_role`/`has_role_email` SECURITY DEFINER functions

### 2e. Key triggers

- `tg_touch_updated_at()` — attached to most tables
- **`tg_client_portal_roadmaps_require_source_version`** (migration `20260705045722`) — blocks any `client_portal_roadmaps` row whose linked `engine_roadmap_versions.status = 'ai_generated'`, or where `approved_at IS NULL`, or where the source-version FK is NULL
- Storage RLS on `client-portal-files` bucket + `portal_files_v` view strips `uploaded_by_email` and enforces `client_visible=true AND is_internal=false`

---

## 3. Project Creation Flow

**Entry** `/engine/projects/new` (`engine.projects.new.tsx:26`) → `createProjectFromSource` (`src/lib/engine-project-intake.functions.ts:61`, gated by `requireSupabaseAuth` + admin/operator role).

**Steps (single-call, non-transactional):**
1. Optional `engine_clients` insert (new-client mode).
2. `engine_projects` row: `status=intake`, `current_step=signal`, `agent_status=inactive`, `signal_room` JSON.
3. `engine_activity` — `project_created`.
4. **Stage B sibling rows** (all best-effort, failures logged as `integrity_warning` — no rollback):
   - `engine_project_agents` (default "Roadmap Agent")
   - `engine_agent_permissions` (`permission_mode=draft_only`)
   - `engine_roadmap_versions` v0.0 container (`status=draft`)
   - `client_portal_projects` **upsert on primary_email** — only if `contact_email` present
   - `engine_projects.client_portal_project_id` back-link
   - `client_portal_permissions` owner grant
5. Source classification: no content → `status=draft` returned; content → `engine_sources` row (`visibility=internal_only`, `status=queued`).
6. Fire-and-forget `runIntelligencePipelineInternal(void)` — UI polls.
7. `verifyProjectIntegrity` server fn exists (line 375) to audit missing siblings post-hoc.

**Direct answers**
- **Orphaned data possible?** Yes — Stage B failures leave the project without the affected sibling(s); only a warning is logged.
- **Engine project without portal?** Yes — if `contact_email` is empty OR client mode is `existing` (portal step is skipped entirely in that branch).
- **Portal project without engine project?** Yes — Stripe checkout can create/upsert a `client_portal_projects` row before any engine project exists.
- **Enforcement?** FK on `engine_projects.client_portal_project_id` is **nullable** — no DB-level requirement. The `verifyProjectIntegrity` fn is the only detector.

---

## 4. Source Intake Flow

| Source type | Entry | Server fn | project_id | visibility default | Auto-extract? | Reprocess | In portal? |
|---|---|---|---|---|---|---|---|
| Paste brief / transcript / meeting | `/engine/projects/new` paste tab | `createProjectFromSource` | ✓ | `internal_only` | ✓ (fire-and-forget) | ✓ `reprocessSource` | ✗ |
| Website URL | same, URL tab | same | ✓ | `internal_only` | ✓ | ✓ | ✗ |
| Uploaded file (creation) | new-project upload tab | (not wired) | — | — | ✗ | — | ✗ **P1 gap** |
| File upload (post-creation) | Signal Room | `createSource` | ✓ | **NOT SET** (bug G-2) | ✓ `processSingleSource` | ✓ | ✗ |
| Manual note / research | Signal Room | `createSource` | ✓ | **NOT SET** | ✓ | ✓ | ✗ |
| Client intake form (portal onboarding) | `/portal/onboarding` | `submitPortalOnboarding` | ✓ (via portal→engine lookup) | `internal_only` | **✗ pipeline never fires** (G-1) | manual | ✗ (triggers "Intake Ready" review item) |
| Plaud / other transcript | via Signal Room upload | `createSource` | ✓ | **NOT SET** | ✓ | ✓ | ✗ |

**Direct answers**
- **Intake form → engine source?** Yes, `engine_sources` row inserted, but **extraction is not triggered automatically** — operator must run it manually.
- **Onboarding cross-writes engine?** Yes — `engine_sources` + `engine_review_items` + `engine_audit_log` + `engine_activity` inserts.
- **Uploads become usable sources?** Only post-creation via Signal Room. Creation-time upload tab is a stub ("File upload lands in a follow-up build").
- **Files tied to right project?** Post-creation yes (project_id required). Creation-time upload never lands.

---

## 5. Intelligence Extraction Flow

**Fn:** `runIntelligencePipelineInternal` (`src/lib/engine-intelligence.functions.ts:842`)

**Providers:**
- Stage 1 (intake pass): **Lovable AI Gateway** → `google/gemini-3-flash-preview`
- Stage 2 (structured pass): **Anthropic direct** → `claude-sonnet-4-5-20250929` via `ANTHROPIC_API_KEY`; falls back to Lovable Gemini on failure

**Writes:**
- `engine_extraction_runs` (start `running` → `succeeded`/`failed`, providers, models, `cost_cents`, `produced_version_id`)
- `engine_extracted_signals` (per-signal, category, confidence, `client_safe=false` by default, `used_in_version_id`)
- `engine_roadmap_versions` (new row, `status=ai_generated`, `created_by=ai`, `payload` = 11 modules, `generation_provenance`)
- `engine_milestones` — **only on first run** (guard `existingMs === 0`); rows include `source_evidence`
- `engine_projects` — module JSONB columns + `status=needs_review` + agent spend increment
- `engine_change_events` per AI-flagged event
- `engine_sources.status = processed` + `confidence` + `used_in_version_ids`
- `engine_review_items` — `item_type=roadmap_version`, `status=pending`, `source=ai`
- `engine_audit_log` (pipeline complete)

**Signal categories extracted** (15): goal, pain, opportunity, deadline, constraint, decision_maker, hidden_asset, risk, required_system, milestone_candidate, investment_signal, client_language, open_question, business_model, current_system — ✅ covers everything requested (goals, systems, pains, deadlines, constraints, hidden assets, blueprint/milestone/investment candidates, open questions, client-safe language).

**Error handling:** run row updated to `failed` with `error` text; `engine_activity` severity=error.
**Cost tracking:** yes, per run + per agent task in `engine_agent_costs` and `engine_projects.agent_spend_month_cents`.

---

## 6. Draft Roadmap Generation

Continues from pipeline (§5). Produces `engine_roadmap_versions` with `status=ai_generated` + `engine_review_items` (`status=pending`) linked by label, not by `version_id`.

**Direct answers**
- **Can AI write to approved versions?** No — `approveVersion` throws "Version is already approved"; DB trigger blocks `ai_generated` versions from being published; `assertActionAllowed` HARD_BLOCKED includes `send_delivery` and `move_project_to_execution`; `draft_only` permission mode downgrades all "allowed" → "needs_approval".
- **Overwrite published content?** No — published rows in `client_portal_roadmaps` are superseded (prior `delivered` rows demoted to `approved`), not overwritten.
- **Change client-facing data directly?** No — AI writes only to draft `payload`; portal reads exclusively from `client_portal_roadmaps`.
- **Draft clearly marked?** Yes — `status=ai_generated` + `created_by=ai` + DB trigger + RLS filter `status IN ('approved','delivered')`.

---

## 7. Approval & Review Flow

**Schema:** `engine_review_items`(id, project_id, **client_portal_project_id (nullable)**, project, item_type, title, impact, source, requested_by, status ∈ pending|in_review|approved|sent_back|rejected).
Audit: `engine_review_audit` (review_item_id, action, actor, routed_to, reason, at).

**Item types & triggers**

| Type | Created by |
|---|---|
| `roadmap_version` | AI pipeline (`engine-intelligence.functions.ts:1163`) |
| `Roadmap Update` | `submitVersionForApproval` |
| `Client Preview` | `submitPreviewForApproval` |
| `Intake Ready` | Portal `submitPortalOnboarding` |
| `Client Decision` | `respondToPortalDecision` |
| `Client Clarification` | `requestPortalClarification` |

**All portal-originated review items include both `project_id` AND `client_portal_project_id`** (enforced by `review-item-and-publish-gates.test.ts`).

**Approval gates in order**
1. **Version approval** — `approveVersion`: blocks re-approval, blocks self-approval (creator==approver), blocks if unresolved critical `engine_change_events`. Writes `roadmap_approvals`, `approved_snapshot`, `engine_audit_log`.
2. **Client preview submit** — requires `version.status=approved`, sets `client_preview_status=draft`, creates review item.
3. **Client preview approve** — **admin only** (`assertAdminEmail`), requires `client_preview_status=draft`, sets → `approved`.
4. **Portal publish** — **admin only**, requires `version.status=approved AND client_preview_status=approved`, requires resolved `client_portal_project_id` (auto-link by email or throws).
5. **Delivery transition** — moving to `sent`/`execution` requires non-empty `engine_projects.approved_snapshot`.
6. **Agent HARD_BLOCKED** — `send_delivery`, `move_project_to_execution` always throw regardless of permissions; `draft_only` downgrades every action to `needs_approval`.

**DB backstop** — trigger `tg_client_portal_roadmaps_require_source_version` throws if publish references an `ai_generated` version.

**Direct answers**
- **Operator bypass?** No documented bypass; gates enforced in server fns + DB trigger + RLS.
- **AI bypass?** No — HARD_BLOCKED + trigger + no self-approval.
- **Client-facing publish without approval?** No — three layers (app fn, trigger, RLS).
- **Overwrite approved versions?** No — new versions supersede; approved rows immutable through server fns.

---

## 8. Client Portal Publishing Flow

**Trigger:** operator calls `publishVersionToPortal` (`src/lib/engine-ops.functions.ts:794`) or `sendProjectDelivery` (`engine-execution.functions.ts:743`, master delivery).

**Steps**
1. Guards: version approved + client_preview approved.
2. Resolve `client_portal_project_id` (auto-link by email if null).
3. `buildClientSafePayload` (`src/lib/roadmap-publish.ts:76`) with **CLIENT_SAFE_KEYS allowlist** (9 keys): title, version_label, executive_summary, current_diagnosis, strategic_priorities, sequence_30_60_90, risks_dependencies, recommended_next_move, supporting_notes. Runtime guard throws in dev, logs in prod on unlisted keys.
4. Prior `delivered` rows → `approved` (supersede).
5. INSERT `client_portal_roadmaps` with `status=delivered`, `approved_at`, `published_at`, `published_by`, `approved_roadmap_version_id: ver.id`.
6. DB trigger validates.
7. Back-link `engine_roadmap_versions.published_to_portal_at` + `published_portal_roadmap_id`.
8. `engine_audit_log` (`action=version_published_to_portal`).

**Portal read:** `getPortalRoadmapDocs` (`src/lib/portal.functions.ts:613`) SELECTs 16 named columns only, filters `status IN ('approved','delivered')`. Static test `portal-safety-guard.test.ts` asserts `portal.functions.ts` never reads from any `engine_*` table.

**RLS:** clients read only rows where `status IN ('approved','delivered') AND source_version_id IS NOT NULL AND approved_at IS NOT NULL AND project_id ∈ permitted-set`.

**Direct answers**
- **What does /portal/roadmap read?** Exactly the 9-field allowlisted payload from `client_portal_roadmaps`, plus metadata fields (owner_name, next_meeting_at, share_url, approved_at, version_label).
- **Draft roadmap content in portal?** No — three layers (guard, trigger, RLS).
- **Raw transcripts?** No — never reachable from portal fns.
- **Internal notes/AI confidence/costs/comments/risk?** No — allowlist strips everything; SELECT column list explicit.

**⚠️ Bug candidate found by canvas audit** — Insert at `engine-ops.functions.ts:862` sends `approved_roadmap_version_id`, but the RLS-relevant column added by migration `20260702192431` is `source_version_id`. If the column mapping actually differs, `source_version_id` is NULL and **RLS blocks all newly published roadmaps from clients**. Needs a live DB check before other work.

---

## 9. Portal Roadmap Canvas Data Model

- **Route:** `portal.roadmap.tsx` → `RoadmapView` → `getPortalRoadmapDocs` → `buildRoadmapJourney(raw, project)` (`src/lib/portal-roadmap-model.ts`) → `<MapCanvas>` + `<MilestoneSheet>` + `<RoadmapOverviewMiniMap>` + `<StatusOverlayCard>` + `<MobilePhaseStack>`
- **Phases** = fixed 3-phase (now/next/later) `PHASE_LABELS`, populated by `bucketSequence(row.sequence_30_60_90)` — dynamic, any count.
- **Milestones/decisions/deliverables/deadlines** = items within phase buckets; `kind` inferred from `raw.kind` / `file_url` / `dueDate` / `meeting_at`.
- **Point A** = `project.point_a ?? row.current_diagnosis`; **Point B** = `project.point_b ?? row.executive_summary`. **`project` is currently always null in `getPortalRoadmapDocs`** (line 658), so Point A/B always fall back to summary/diagnosis — the engine's `point_a`/`point_b` fields never surface.
- **Current phase**: first phase with `in_progress` milestone → phase of `activeMilestone` → first phase with non-complete milestone.
- **Marker positions**: `roadmap-layout.ts::targetBounds` geometry; markers rendered by `MilestoneNode.tsx` with `data-marker-slug` for deep-link scroll.
- **Mini-map**: same journey model via `canvas-context.tsx`.
- **Drawer**: `?m=<slug>` URL param → `journey.milestones.find(...)`.

**Direct answers**
- **Supports any project?** Yes — driven by `client_portal_roadmaps` payload.
- **Variable phase count?** Structure is fixed at 3; contents are dynamic.
- **Variable milestone count?** Yes.
- **Marker placement**: dynamic per journey model, not hardcoded coordinates.

---

## 10. Client Portal Feedback Loop

| Action | Portal write | Engine mirror | Command Center visible? |
|---|---|---|---|
| View roadmap | `client_portal_activity` + `client_portal_roadmaps.viewed_*` | `engine_delivery_items.client_viewed_at` + `engine_delivery_history` | ✓ |
| Download | same | `engine_delivery_items.client_downloaded_at` | ✓ |
| Acknowledge | `client_portal_roadmaps.acknowledged_at` | `engine_delivery_items.status=client_acknowledged` | ✓ |
| Mark milestone reviewed | `client_portal_activity` | **nothing** | ⚠️ portal-only |
| Respond to decision | `client_portal_messages` + `client_portal_activity` | `engine_review_items` + `engine_audit_log` + `engine_activity` | ✓ |
| Request clarification | `client_portal_messages` + `client_portal_activity` | `engine_review_items` + `engine_audit_log` | ✓ |
| Send free-form message | `client_portal_messages` | **nothing** | ⚠️ operator must poll |
| Download/view file | `log_portal_file_event` RPC | **nothing** | ⚠️ portal-only |
| Submit onboarding | `client_portal_onboarding.status=submitted` | `engine_sources` + `engine_review_items` + `engine_audit_log` + `engine_activity` | ✓ (but no auto-pipeline) |

**Direct answers**
- **Client decisions feed back?** Yes (decisions + clarifications).
- **Clarifications linked to milestone?** Loosely — via `milestoneTitle` string and `messageId`, but no FK to `engine_milestones.id`.
- **Client activity disappear?** Free-form messages, milestone-reviewed events, and file view/download events are portal-only — invisible to Command Center unless operator opens `/portal/messages` or `portal_activity`.

---

## 11. Files & Messages

- Files: `client_portal_files` with `client_visible + is_internal + uploaded_by_role` triple-gate. RLS + `portal_files_v` view enforce `client_visible=true AND is_internal=false`. Storage bucket `client-portal-files` policies scope per project.
- Messages: `client_portal_messages` gated on `visible_to_client=true`. `sender_type` forced server-side in `sendPortalMessage` (`portal.functions.ts:1414`) → clients can't forge as operator via devtools.
- Two message tables exist: `client_portal_messages` (project-scoped, canonical) and legacy `portal_messages` (single-table, `/utils/portal.functions.ts:175`) still used by `/portal/messages` route direct query.
- Roadmap context on messages: `related_roadmap_section text` (**free text, no FK**), `related_file_ids uuid[]` (**no FK constraint**).

**Direct answers**
- **Internal files leak?** No — dual guard via RLS + view.
- **Wrong-project file scoping?** Path relies on RLS + `project_id` filter; upload sets both — safe if RLS is enabled.
- **Roadmap context on messages?** Structurally weak — free text only; no enforced link to milestone/decision IDs.

---

## 12. Role & Permission Model

**Enum values** (`app_role`): `admin`, `operator`, `user`, `team_member`. **No `client` or `ai` role.**

- **admin** — everything; can approve, publish, deliver, grant roles.
- **operator** — engine + ops routes; can approve versions + `decideReviewItem`; **cannot** admin-only `approvePreview` and (in some places) admin-only publish.
- **team_member** — read-only engine views (added by `20260702183916` migration).
- **client** — no DB role; identified by `client_portal_permissions` row (email match, `revoked_at IS NULL`). Zero RLS access to `engine_*` tables.
- **AI agent** — no DB identity. Gated at application layer by `assertActionAllowed` (`engine-execution.functions.ts:24`): HARD_BLOCKED = `send_delivery`, `move_project_to_execution`; `draft_only` downgrades all actions to `needs_approval`.

**Direct answers**
- **Client → engine routes?** No — layout gate + RLS.
- **Operator publish?** Yes (via `publishVersionToPortal` when both approvals in place).
- **Operator approve official version?** Yes.
- **AI approve/publish/deliver/overwrite?** No — HARD_BLOCKED + trigger + no self-approval.

---

## 13. Audit Trail

| Table | Captures |
|---|---|
| `engine_audit_log` | Field-level: action, actor_email, `field_changed`, `old_value`, `new_value`, affected_modules, reason. Written for updateProjectStep (high-impact), version approve/publish, milestone changes, budget updates. |
| `engine_change_events` | Semantic changes (new_info, conflict, risk, deadline_change, scope_change, investment_impact, client_copy_affected) |
| `engine_activity` | Free-form severity-tagged project events |
| `engine_review_audit` | Review-item action/actor/reason/routing |
| `engine_version_change_decisions` | Per-change accept/edit/reject |
| `engine_delivery_history` | Delivery status transitions |
| `engine_intelligence_decisions` | Memory item before/after |
| `client_portal_activity` | Client-facing events (view, ack, message, etc.) |
| `portal_access_events` | Auth diagnostics |

**Direct answers**
- **Trace milestone back to source?** Partially — `engine_milestones.source_evidence` (only populated on first pipeline run; not updated on re-runs), `engine_extracted_signals.used_in_version_id`, and `engine_roadmap_versions.source_ids[]`. Chain exists but not surfaced in UI.
- **Who edited a draft?** Yes — `engine_audit_log.actor_email` + `field_changed` + values.
- **Diff between versions?** Yes — `getVersionCompareData` + `engine_version_change_decisions`; full payload JSONB diff.
- **Who approved / published?** Yes — three sources: `engine_review_audit.actor`, `engine_roadmap_versions.approved_by`, `engine_audit_log`.

---

## 14. Prioritized Gap List

**P0 — data-safety or publish-integrity risks**

- **G-0. Possible portal-publish column-name mismatch.** `publishVersionToPortal` INSERT at `engine-ops.functions.ts:862` sends `approved_roadmap_version_id`, but RLS migration `20260702192431` references `source_version_id`. If mapping differs, RLS blocks all newly published roadmaps from clients. **Verify against live DB immediately.** (server function / migration)
- **G-1. Portal onboarding does not trigger extraction pipeline.** `submitPortalOnboarding` inserts `engine_sources` with `status=queued` but never calls `runIntelligencePipelineInternal`. Operator must remember to run it manually or the intake sits idle. (server function)
- **G-2. `createSource` omits `visibility` field.** Sources created via Signal Room or `reprocessSource` don't set `engine_source_visibility` — DB default not explicitly specified. Risk: internal note treated as unspecified visibility in future client_safe filters. (server function / migration default)

**P1 — workflow completeness**

- **G-3. Review-item ↔ version link is by label, not `version_id`.** In `decideReviewItem` (`engine-ops.functions.ts:270`) fallback is `rows[0]` — if two drafts co-exist, wrong version could be approved. (schema: add `version_id` FK)
- **G-4. Stage B sibling failures are non-fatal.** `createProjectFromSource` writes 6 sibling rows best-effort; failures log `integrity_warning` only. Orphaned projects can result. No transactional rollback. (server function)
- **G-5. Engine project may exist without portal.** When client mode is `existing` OR `contact_email` empty, `client_portal_projects` upsert is skipped. `client_portal_project_id` stays null. (server function)
- **G-6. Portal project may exist without engine project.** Stripe checkout creates `client_portal_projects` before any engine project. No enforcement. (workflow)
- **G-7. `engine_milestones` never updated on re-runs.** Guard `existingMs === 0` prevents merging new milestone candidates from later sources. (server function)
- **G-8. Point A / Point B never reach the portal.** `getPortalRoadmapDocs:658` hardcodes `project: null`, so `project.point_a`/`point_b` fallback is always the summary/diagnosis. Engine-authored Point A/B don't surface. (server function)
- **G-9. Two message tables in parallel.** Legacy `portal_messages` (used by `/portal/messages` direct query) coexists with canonical `client_portal_messages` (used by decision/clarification flows). Sender name/context can diverge. (schema consolidation)
- **G-10. Creation-time file upload is a stub.** `/engine/projects/new` upload tab says "lands in follow-up build" — files must be added post-creation. (UI + server fn)
- **G-11. Free-form client messages don't feed Command Center.** `sendPortalMessage` writes only to `client_portal_messages`; no `engine_activity` / no `engine_review_items` — operators must poll portal. (server function)

**P2 — polish / observability**

- **G-12. Milestone-reviewed events don't reach engine.** `recordPortalMilestoneReview` writes only `client_portal_activity`. (server function)
- **G-13. File view/download events don't reach engine.** `logPortalFileEvent` writes only portal RPC. (server function)
- **G-14. Messages have no structured milestone/phase FK.** `related_roadmap_section` is free text, `related_file_ids` has no FK constraint. (schema)
- **G-15. `engine_audit_log` diff quality varies.** Present for high-impact steps (investment, preview, delivery) but not uniformly across all module edits. (server function)
- **G-16. AI role is application-gated only.** No DB `ai` role; enforcement lives in `assertActionAllowed` — bypassable by any future direct service-role write. (defence-in-depth; add SECURITY DEFINER guards)

**P3 — cosmetic / roadmap**

- **G-17. `/engine/templates` is a placeholder.**
- **G-18. `/engine/projects/$id/intelligence` legacy stub — replaced by `/intelligence-layer`.**

---

## 15. Top 10 Recommended Fixes (in order)

1. **G-0** Verify `approved_roadmap_version_id` vs `source_version_id` column mapping. Fix insert or add migration alias. (server fn OR migration) — **do first, before any publish demo.**
2. **G-1** Wire `submitPortalOnboarding` to call `runIntelligencePipelineInternal` after inserting the onboarding source. (server fn)
3. **G-2** Default `engine_sources.visibility = 'internal_only'` at DB level AND set explicitly in `createSource`. (migration + server fn)
4. **G-4** Make `createProjectFromSource` transactional (single RPC or wrap in try/rollback), OR run `verifyProjectIntegrity` immediately and abort creation on missing rows. (server fn / RPC)
5. **G-3** Add `version_id uuid` FK on `engine_review_items`; populate on AI-pipeline insert; use it in `decideReviewItem` — remove label fallback. (schema + server fn)
6. **G-5/G-6** Enforce engine↔portal linkage: block `createProjectFromSource` if no `contact_email` OR auto-generate a placeholder portal project; add scheduled job to reconcile orphaned portal projects. (server fn + cron)
7. **G-8** Populate `PortalRoadmapDoc.project` in `getPortalRoadmapDocs` with `engine_projects.point_a/point_b` (via the bridge FK). (server fn)
8. **G-11** Mirror `sendPortalMessage` into `engine_activity` (and optionally create a low-impact review item when `action_required=true`). (server fn)
9. **G-7** Add a merge path in `runIntelligencePipelineInternal` to append new milestone candidates on re-runs (upsert-by-label with confidence). (server fn)
10. **G-9** Deprecate legacy `portal_messages`: point `/portal/messages` at `client_portal_messages` + backfill; drop old table after migration. (UI + schema)

---

## 16. Final Verdict

- **Start a project from source material?** ✅ Yes — paste/URL flows work end-to-end; upload creation is a stub (post-creation upload works).
- **AI creates a draft roadmap?** ✅ Yes — two-pass pipeline produces `engine_roadmap_versions` (`ai_generated`) + signals + change events + milestones (first run only).
- **Approved versions protected?** ✅ Yes — `approveVersion` guards, self-approval blocked, critical change events block, DB trigger enforces publish gate.
- **Only approved content reaches portal?** ✅ **Conditional on G-0** — three layers exist (allowlist, DB trigger, RLS), but if `source_version_id` is silently NULL on publish, RLS hides everything from clients. Verify before trusting.
- **Client activity feeds back into engine?** ⚠️ Partial — decisions, clarifications, view/download/ack DO. Free-form messages, milestone-reviewed events, and file view/download events DO NOT.
- **Single most dangerous gap?** **G-0** — a column-name mismatch on the publish insert can silently break every client's portal view. It's the only P0 that fails silently at runtime.
- **Single most important next build step?** After confirming G-0 is safe, **G-1: auto-run extraction on onboarding submit**. It closes the intake → intelligence bridge — the first half of the spine you asked to protect.

---

## 17. Requested Exports — Where They Live in This Pack

1. **DB schema summary** → §2 (14 enums + 24 engine tables + 10 portal tables)
2. **Route list** → §1 (all 83 route files grouped by audience)
3. **Server function list** → 109+ fns catalogued in the research report (grouped A–J). Full list too long for this document — available on request or via `rg createServerFn src/lib src/utils`. Key groups:
   - A. Project intake (9): `createProjectFromSource`, `verifyProjectIntegrity`, `saveDraft`, `loadDraft`, `submitIntake`, `sendResumeLink`, `reflectAnswer`, attachment fns
   - B. Sources (7): `listSources`, `createSource`, `removeSource`, `reprocessSource`, `runIntelligencePipeline`, `listExtractedSignals`, `listExtractionRuns`
   - C. Agent (12): agent tasks, dashboard, costs, budget controls, permissions, regenerate milestone section
   - D. Versioning (9): list/approve/archive/compare/restore/restoreSection/compareData/listDecisions/recordDecision
   - E. Review & approval (17): engine review queue + intake submission workflow (ops fns)
   - F. Publishing (8): publishVersionToPortal, sendProjectDelivery, saveDeliveryChecklist, portal-link fns, listDraftVersions, listProjectAuditLog, setPortalRoadmapStatus
   - G. Portal reads (11): checkPortalAccess, magic link, context, roadmap docs, events, onboarding, handoff, execution start
   - H. Portal messaging/files/billing (16): sendPortalMessage×2, respond/clarify, file events, follow-up, profile, resend, Stripe fns
   - I. Audit/activity (5): listAuditLog, listChangeEvents, resolveChangeEvent, adminListAccessEvents, getExecutionAlerts
   - J. Admin/ops (~24): getCommandCenter, listProjects, workspace, updateProjectStep, milestones/tasks fns
4. **Role/permission map** → §12
5. **Client portal data-read map** → §8 (portal reads only `client_portal_roadmaps` — enforced by static test)
6. **AI / source processing flow** → §5
7. **Approval / publish flow** → §7 + §8

---

## 18. The Big Question — Source-to-Canvas Path per Object

Canonical spine (deviations noted):

```
engine_sources (type ∈ transcript|brief|website_url|document|screenshot|
                       email_note|research_note|competitor_url|previous_roadmap)
  → runIntelligencePipelineInternal
    → engine_extraction_runs (Gemini intake + Claude structured)
    → engine_extracted_signals (15 categories, client_safe flag)
    → engine_roadmap_versions (status=ai_generated, payload+source_ids[])
    → engine_milestones (first-run materialization, source_evidence JSON)
    → engine_review_items (auto pending)
  → operator edits → status=tai_edited
  → approveVersion → status=approved, approved_snapshot on engine_projects
  → submitPreviewForApproval / approvePreview → client_preview_status=approved
  → publishVersionToPortal
    → buildClientSafePayload (9-key allowlist)
    → client_portal_roadmaps INSERT (status=delivered, source_version_id=ver.id)
    → tg_client_portal_roadmaps_require_source_version validates
    → engine_roadmap_versions back-linked
  → getPortalRoadmapDocs (16-col SELECT, status filter, RLS)
  → buildRoadmapJourney(raw, project=null)
  → MapCanvas / MilestoneNode / MilestoneSheet / MiniMap
```

| Object | Source | Bridge quality |
|---|---|---|
| **Phase** | `sequence_30_60_90` JSON in `client_portal_roadmaps` | Structure fixed 3-phase; inferred by `bucketSequence`; no DB phase table |
| **Milestone** | Items in phase buckets | `engine_milestones` NOT used in portal path; source_evidence populated only first run |
| **Decision** | `kind='decision'` on item | Inferred from `raw.kind`; not enforced |
| **Deliverable** | `kind='deliverable'` or `file_url` | No milestone FK on files; only `linked_roadmap_document_id` → `roadmap_documents` |
| **Deadline** | `dueDate` on item | No dedicated deadline table |
| **Point A** | `project.point_a` OR `current_diagnosis` | **BROKEN — `project` always null (G-8), always falls back to current_diagnosis** |
| **Point B** | `project.point_b` OR `executive_summary` | **BROKEN — same** |
| **File** | `client_portal_files` | No milestone FK; context is free text `category` |
| **Client action** | `clientActionNeeded` on milestone; `action_required` on message | No structured link between action-required message and milestone slug |

---

**No code changes were made. This pack is ready for reviewer sign-off.**
