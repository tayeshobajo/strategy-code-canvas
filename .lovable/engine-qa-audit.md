# Roadmap Engine QA/Audit — Status Report

Generated: 2026-07-04. Source: parallel codebase audit of routes, server functions, migrations, RLS, and RPCs. No code changes were made.

Legend: ✅ PASS · ⚠️ PARTIAL · ❌ FAIL · ❓ UNKNOWN

---

## Executive Summary

**Overall posture: strong core, weak surface.** The engine's data model, RLS, publish gates, audit trail, and safety enforcement are in good shape. The gaps are concentrated in:

1. **UI surfacing** — several fields (portal publish status, current phase, source count, next-best-actions) exist in the DB but are not shown in Command Center / Projects list / Delivery Room.
2. **Per-step state machine** — the 14-step workspace stores JSON blobs without per-step `draft/review/approved` state.
3. **Enum/naming drift from spec** — `client_facing` vs `published`, `Portal publish` review type missing, `engine_tasks` vs `engine_agent_tasks`, `visible_modules` column missing from publications.
4. **Automation gaps** — client decisions don't auto-block tasks; change requests don't auto-spawn drafts; agent-suggested review type missing.
5. **Mock UI** — `engine.execution.tsx` Active Builds table is hardcoded static data.

None of the "Must-Pass" gates fail. All 10 pass. All 5 end-to-end scenarios have working code paths.

---

## Section-by-Section

### §1 Internal Role Routing — ✅ PASS

Sidebar has all 8 required items. Admin/operator gated via `has_role_email`. Operator does not default to `/ops/queue`.

- ⚠️ There is no explicit `client` value in `app_role` enum. Clients are blocked by omission (portal uses separate token-based auth). Functional but not spec-literal.

### §2 Command Center — ⚠️ PARTIAL

Missing from `CommandCenterPayload`:
- ❌ **sources_processing** count
- ❌ **portal_published** metric (data exists via `client_facing` status; not surfaced)
- ❌ **next_best_actions** widget (only per-project `next_action`)
- ⚠️ `system_health` is hardcoded `"green"` — no real health check

### §3 Projects Page — ⚠️ PARTIAL

Present: client, name, status, step, draft/approved version, agent status, open decisions, deadline pressure, last updated, next action.

Missing from row / `EngineProjectRow` type:
- ❌ **current_phase**
- ❌ **source_count**
- ❌ **latest_source_processed**
- ❌ **portal_publish_status**

Missing per-row actions:
- ❌ Add source · view review items · view portal status · archive

### §4 New Project Creation — ⚠️ PARTIAL

Working paths: blank, paste text (transcript), website URL.

- ⚠️ **File upload** — UI placeholder ("File upload lands in a follow-up build"); not functional
- ⚠️ **Plaud** — mentioned in copy; no dedicated tab or integration
- ❌ **Intake form** as creation source — no tab
- ❌ **Product spec** — not in `SOURCE_TYPES`
- ⚠️ **Notes** — `research_note`/`email_note` types exist but no UI tab
- ❌ **Project agent record** not created at intake
- ❌ **Workspace record** not created at intake

### §5 Source Intake — ⚠️ PARTIAL

Schema exists with visibility default `internal_only`.

Field-name drift vs spec:
- ⚠️ `name` (spec: `title`)
- ⚠️ `created_by_email` (spec: `uploaded_by`)
- ⚠️ `raw_text` + `storage_path` + `url` (spec: `raw_content`/`file_ref`)

Missing:
- ❌ **`extraction_status` column** on `engine_sources` (only tracked in `engine_extraction_runs`)
- ❌ Status enum lacks **`uploaded`**, **`needs_review`**, **`archived`** (only `queued/processing/processed/failed`)

### §6 Intelligence Extraction — ⚠️ PARTIAL

13 signal categories present; extraction runs + signals tables solid.

- ❌ **`business_model`** and **`current_system`** signal categories missing from enum + prompts
- ⚠️ Milestone candidates buried inside `roadmap.phases[].milestones[]`; no standalone `milestone_candidates` output field
- ⚠️ Client-safe language / open questions captured in signals table but not exposed as named `DraftModules` outputs

### §7 Draft Roadmap Generation — ✅ PASS

Draft inserted as `status='ai_generated'`; all 11 modules populated; review item created; two independent guards prevent AI self-approval and client publish.

- ❓ Portal data fetch not explicitly traced to confirm it gates on `status != 'ai_generated'` (RLS on `client_portal_roadmaps` blocks by trigger, so effectively PASS).

### §8 14-Step Workspace — ⚠️ PARTIAL

All 14 steps present as routes + `WorkspaceStepper` renders inside workspace layout.

- ❌ **No per-step draft/review/approved state machine** — steps are stateless JSON blobs
- ❌ **Source evidence not displayed** on any step page
- ⚠️ No **per-step "send to review"** — review is version-level only

### §9 Manual Override — ⚠️ PARTIAL

All step editors work; edits don't auto-publish; audit log wired.

- ❌ `engine_audit_log` missing spec fields: **`field_changed`**, **`old_value`**, **`new_value`**, **`reason`** (has `actor_email`, `action`, `affected_modules`, `version_id`, `metadata`)
- ❓ Milestone reorder — no `reorderMilestone` server fn found; `sort_index` column exists

### §10 Versioning — ⚠️ PARTIAL

Full compare UI, provenance stored, approve/archive/restore guards enforced.

- ❌ Status enum uses **`client_facing`** instead of spec's **`published`** (semantic match, name drift)

### §11 Review & Approvals — ⚠️ PARTIAL

Draft creates review item, three-action decision flow, audit trail, rejection preserves draft.

- ❌ **`Portal publish`** review type missing from TYPES array
- ❌ **`Agent-suggested`** review type missing (distinct from Agent Permission)
- ⚠️ `engine_review_items.source` is free text, not FK to source/version row (linkage exists via `project_id` + soon `client_portal_project_id` from previous batch)

### §12 Roadmap Builder — ⚠️ PARTIAL

Milestones show phase, dependencies, deadline relevance, client-safe copy, internal notes.

- ⚠️ Builder reads `project.roadmap.milestones` JSON blob, not live `engine_milestones` table
- ❌ **`source_evidence`** column missing on `engine_milestones`
- ❌ No explicit **`sequence`** column (only `sort_index`)
- ❌ **No reorder server fn**; no draft-change on reorder
- ❌ No AI suggestion UI in builder

### §13 Milestone Brief Workspace — ✅ PASS

Full tabbed brief (Overview, Brief, Acceptance Criteria, Developer Prompt, QA Checklist, Dependencies, Risks, History). Approvable, locks fields, sends to tasks.

- ❓ **Included/excluded scope** not a distinct field (may live in freeform `brief_md`)

### §14 Agent Task Board — ⚠️ PARTIAL

All 9 statuses, milestone/source linkage, owner, effort, cost.

- ⚠️ UI reads **`engine_tasks`**, not spec's `engine_agent_tasks` (two tables exist — naming mismatch)
- ⚠️ `pending_approval` flag exists but not gate-checked on status transitions
- ⚠️ Acceptance-criteria count not surfaced on task card

### §15 Agent Cost Center — ✅ PASS

All metrics wired: total spend, monthly budget, remaining, projected, by category/module/milestone, cost per approved output, unused draft cost, warning + hard-stop thresholds. Full UI with charts + CSV export.

### §16 Agent Permissions — ✅ PASS

Three modes, all 10 actions, all 6 safety rules present and enforced server-side via `assertActionAllowed` + `HARD_BLOCKED` set + `PROTECTED_APPROVED_FIELDS`.

### §17 Publishing to Client Portal — ⚠️ PARTIAL

Hard dual-gate (version approved + client_preview approved). Client-safe payload stripping via `buildClientSafePayload` allowlist. Portal never reads internal tables.

Column-name / shape drift from spec on `client_portal_roadmaps`:
- ⚠️ `source_version_id` (spec: `approved_roadmap_version_id`)
- ⚠️ `approved_at` reused as publish timestamp (spec: `published_at`)
- ⚠️ `published_by` lives in `metadata` JSONB (spec: top-level column)
- ⚠️ `client_id` not direct column (implied via project FK)
- ❌ **`visible_modules`** column missing
- ⚠️ `pdf_file_id` + `one_pager_file_id` instead of generic `attached_files`
- ⚠️ `supporting_notes` (spec: `client_safe_notes`)

### §18 Delivery Room — ⚠️ PARTIAL

Route exists; state machine, history, recipient, channel, last action, view/acknowledge tracking all wired.

- ❌ **Portal publish status column not shown** in UI table (data exists via `client_portal_roadmap_id`)
- ⚠️ No explicit `next_step` DB column (functional via action buttons)

### §19 Execution Tracker — ⚠️ PARTIAL

Server-side approval gate enforced (`acknowledged_at` required). Task ↔ milestone linkage in DB.

- ❌ **`BUILDS` array is hardcoded static mock data** in `engine.execution.tsx:20–30` — Active Builds table not DB-driven
- ⚠️ `blocked_decision` column exists but not auto-set when client responds
- ⚠️ Change request does not auto-spawn a new draft version

### §20 Intelligence Memory — ✅ PASS

Table + UI at `/engine/intelligence` (minor path drift from spec `/engine/memory`). Confidence 0–100 CHECK, `used_in`, source/milestone/signal links, decisions audit table.

- ⚠️ `type` is free-text (no ENUM); relies on convention

### §21 Portal Feedback Loop — ⚠️ PARTIAL

View/open/acknowledge/decision/clarification/file-download all wired with activity + message + review item + `engine_activity`.

- ❓ **`BookCallModal` backend wiring unconfirmed** — component mounted, submit handler not traced
- ⚠️ Send-message doesn't auto-write to `engine_activity`
- ⚠️ Follow-up task not auto-created in `engine_tasks` (review item created instead)

---

## End-to-End Scenarios

| # | Scenario | Result |
|---|---|---|
| 1 | Project from transcript → draft v0.1 not in portal | ✅ PASS |
| 2 | Tai edits + approves; prior approved preserved | ✅ PASS |
| 3 | Publish to portal (dual gate + client-safe strip + RLS) | ✅ PASS |
| 4 | Client responds → engine activity + review item | ✅ PASS |
| 5 | Change after new source → new draft, approved untouched | ✅ PASS |

## Must-Pass Gates

All 10 ✅ PASS. Portal only shows approved, operator/portal separate, project starts from source, structured extraction, drafts don't overwrite, overrides tracked, review gate works, approved publishes, portal actions feed back, audit trail complete.

---

## Prioritized Backlog (my read)

### P0 — Correctness / Trust
1. **§19 Execution Tracker Active Builds → real data** (currently static mock — misleading operator UI)
2. **§17 rename publication columns** to spec (`source_version_id → approved_roadmap_version_id`, `approved_at → published_at`, promote `published_by` out of metadata) + add **`visible_modules`**
3. **§11 add Portal publish + Agent-suggested review types** and make `engine_review_items.source` a FK to source/version

### P1 — Surface parity ✅ DONE (2026-07-05)
4. **§2 Command Center**: added `sources_processing`, `portal_published`, `next_best_actions`; wired real `system_health` (fails/warnings → amber/red).
5. **§3 Projects list**: added `current_phase`, `source_count`, `latest_source_processed`, `portal_publish_status` columns + per-row quick actions (Add source · Review items · Portal).
6. **§18 Delivery Room**: added Portal publish status column (links to portal share URL when published).
7. **§9 Audit log**: added `field_changed`, `old_value`, `new_value`, `reason` columns on `engine_audit_log`.


### P2 — Workspace depth ✅ DONE (2026-07-05)
8. **§8 Per-step state machine**: added `engine_projects.step_states` jsonb; `setStepState` server fn writes audit + activity; edits auto-flip step to `draft`. `StepStateBar` chip + Draft/Review/Approved toggle now on every step page. Source evidence panel (`SourceEvidence`) reads `engine_extracted_signals` by per-step category map.
9. **§12 Roadmap Builder**: reads live `engine_milestones` via `listMilestonesLive`; added `engine_milestones.source_evidence` jsonb; `reorderMilestone` server fn swaps `sort_index`, resets builder step to draft, and emits audit + change_event. Legacy JSON fallback preserved with an amber advisory.


### Invariants Stage A — Spine safety ✅ DONE (2026-07-05)
- **Portal safety guard**: added `src/lib/__tests__/portal-safety-guard.test.ts` — static scan of `portal.functions.ts` blocks any `.from("engine_*")` read outside `supabaseAdmin` mirror writes; asserts `CLIENT_SAFE_KEYS` covers every `ClientSafeRoadmap` field; asserts the AI-draft backstop migration exists.
- **buildClientSafePayload runtime allowlist**: throws in dev/test if any non-allowlisted key is present on the client payload; logs in prod so a benign new key doesn't take down publishing.
- **DB backstop trigger**: `tg_client_portal_roadmaps_require_source_version` now refuses `approved/delivered` when the referenced `engine_roadmap_versions.status = 'ai_generated'` — verified via smoke test.
- **Source → milestone traceability**: intelligence pipeline now materializes AI-drafted milestones into `engine_milestones` with `source_evidence` linking each row back to the run's signals + source ids. Only runs when the project has no existing milestones (never overwrites operator work).



### P3 — Automation & completeness
11. **§4 New Project Creation**: wire actual file upload, add intake-form / product-spec / notes tabs, create agent + workspace records at intake
12. **§5 Source Intake**: add `extraction_status` column on source row; expand status enum (`uploaded/needs_review/archived`)
13. **§19 Auto-block tasks** on `blocked_decision` when client responds; auto-spawn draft on change request
14. **§21 Confirm/wire BookCallModal** backend
15. **§10 Rename `client_facing` → `published`** (or accept the semantic difference and document it)

### P4 — Cosmetic / naming
16. **§14 Consolidate `engine_tasks` vs `engine_agent_tasks`** naming
17. **§20 Rename route** `/engine/intelligence` → `/engine/memory` if strict spec adherence needed
18. **§1 Add explicit `client` role** to `app_role` enum (or accept omission-based blocking)

---

## Files & tables cited

Routes: `engine.tsx`, `engine.index.tsx`, `engine.projects.index.tsx`, `engine.projects.new.tsx`, `engine.projects.$projectId.*.tsx` (all 14 steps), `engine.review.tsx`, `engine.delivery.tsx`, `engine.execution.tsx`, `engine.intelligence.tsx`, `engine.projects.$projectId.versions.compare.tsx`.

Server fns: `engine.functions.ts`, `engine-intelligence.functions.ts`, `engine-agent.functions.ts`, `engine-ops.functions.ts`, `engine-execution.functions.ts`, `engine-project-intake.functions.ts`, `portal.functions.ts`.

Tables: `engine_projects`, `engine_sources`, `engine_extracted_signals`, `engine_extraction_runs`, `engine_roadmap_versions`, `engine_milestones`, `engine_review_items`, `engine_review_audit`, `engine_audit_log`, `engine_activity`, `engine_tasks`, `engine_agent_tasks`, `engine_agent_costs`, `engine_agent_permissions`, `engine_delivery_items`, `engine_delivery_history`, `engine_intelligence_memory`, `engine_intelligence_decisions`, `engine_change_events`, `engine_version_change_decisions`, `client_portal_roadmaps`, `client_portal_messages`, `client_portal_activity`.


### Invariants Stage B — Project creation completeness ✅ DONE (2026-07-05)
- `createProjectFromSource` now provisions every required sibling row in one call: `engine_project_agents`, `engine_agent_permissions`, a `v0.0` container in `engine_roadmap_versions`, and (when a client contact email exists) an upserted `client_portal_projects` row with FK linkage on `engine_projects.client_portal_project_id` plus an owner `client_portal_permissions` row.
- Failures on any sibling insert don't abort project creation but are surfaced as a single `engine_activity` `integrity_warning` for triage.
- New `verifyProjectIntegrity` server fn (`engine-project-intake.functions.ts`) returns a per-project checklist for use by ops UI / smoke tests.


### Gap Closure Log — G-3: Source visibility defense-in-depth ✅ DONE (2026-07-05)

**Status:** Closed. The engine's source-visibility contract — "every source is `internal_only` unless Tai deliberately approves otherwise" — is enforced at three layers with regression tests locking each layer.

**Enforcement layers:**
1. **DB default (authoritative):** `engine_sources.visibility` is `NOT NULL DEFAULT 'internal_only'` (migration `20260704152247_45f7e7ee...sql`). Insert without visibility → row is `internal_only`. Insert with `NULL` → rejected.
2. **App layer:** All three engine_sources inserters set `visibility: "internal_only"` explicitly:
   - `src/lib/engine-intelligence.functions.ts` → `createSource` (Signal Room / Intelligence Layer UI: covers `transcript`, `brief`, `website_url`, `document`, `screenshot`, `email_note`, `research_note`, `competitor_url`, `previous_roadmap` — Plaud transcripts, uploaded docs, manual notes, and website URLs all funnel through here via the `type` discriminator).
   - `src/lib/engine-project-intake.functions.ts` → `createProjectFromSource`.
   - `src/lib/portal.functions.ts` → `submitPortalOnboarding`.
   - `reprocessSource` re-runs the pipeline on an existing row; it does not create or clone rows.
3. **RLS isolation:** `engine_sources` has a single admin-only policy (`has_role(auth.uid(), 'admin')`). No `anon` grant, no portal-role policy, no unconditional authenticated access. Client portal code contains zero references to `engine_sources`.

**Guard tests (prevent regression):**
- `src/lib/__tests__/source-visibility-defense.test.ts` — scans every `engine_sources.insert(...)` under `src/`, asserts each carries explicit `visibility: 'internal_only'`; asserts `SOURCE_TYPES` enum still covers every audience-facing flavor; asserts the latest visibility migration keeps `NOT NULL DEFAULT 'internal_only'`.
- `src/lib/__tests__/portal-cannot-read-engine-sources.test.ts` — scans all `src/routes/portal.*`, `src/lib/portal*.ts`, and `src/components/portal/` for the string `engine_sources` (ignoring prose comments); asserts the latest RLS-touching migration for `engine_sources` gates every policy on the admin role check and never grants `TO anon`.
- `src/lib/__tests__/source-visibility-live.test.ts` — live-DB test (skipped when `PGHOST` absent): inserts a source without `visibility` and asserts the DB default fills `internal_only`; asserts NULL is rejected; asserts column metadata via `information_schema`.

Portal audiences see raw source truth only when it has been deliberately promoted into `client_portal_roadmaps` / `client_portal_files` / `client_portal_messages` through the approved-roadmap publish flow (G-0 concern, separately closed).
