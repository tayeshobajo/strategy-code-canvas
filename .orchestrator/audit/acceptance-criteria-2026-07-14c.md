# Acceptance Criteria — Top-10 Gap Fix + Governance Gate Sweep

Companion to `.orchestrator/audit/capability-audit-2026-07-14c.md`.
Every phase in `.lovable/plan.md` (Phases 1–11) is verified against the rubric
below. A gap is only marked PASS in the next audit when **every** row in its
"Definition of PASS" is satisfied.

Convention:
- **DB**: objects that must exist (`pg_tables`, `pg_proc`, `pg_trigger`).
- **Server fn**: `createServerFn` exports (path + signature).
- **UI**: routes/components that must render/write the new state.
- **Audit**: `engine_audit_log` / `engine_activity` / `engine_review_audit`
  rows that must appear.
- **Tests**: file paths that must exist and pass.

---

## Gate 0 — Governance Gate Sweep (Phase 1)

**Given** an AI agent (or any actor) attempts to transition an artifact from a
draft state to an **official** state,
**When** the transition would flip the artifact to `approved` / `published` /
`accepted` / `promoted` / `completed`,
**Then** the transition MUST be rejected unless:
1. The actor has the required role for that artifact type (`has_role_email`).
2. The actor is not the artifact's `created_by`.
3. A `engine_review_items` row exists in `approved` state for the transition
   (or the artifact type is exempt — enumerated in code).
4. The artifact's completeness threshold is met (per-type predicate).
5. An `engine_audit_log` row is written with `action='official_transition'`.

**Definition of PASS**

| Item | Requirement |
|---|---|
| DB | `assert_official_transition(_artifact_type, _artifact_id, _next_state, _actor_email, _review_item_id)` SECURITY DEFINER function present. BEFORE triggers on: `engine_milestones`, `engine_project_implementation_plans`, `engine_project_mockups`, `engine_roadmap_versions`, `engine_delivery_items`, `client_portal_roadmaps`, `engine_business_engine_runs`, `engine_intelligence_memory`. |
| Server fn | `src/lib/engine-governance-gate.server.ts` exports `assertOfficialTransition(...)` used by every writing server fn. |
| Enumeration | `OFFICIAL_TRANSITIONS` constant lists all 8 transitions with the required review-item kind + completeness predicate. |
| Audit | Exactly one `engine_audit_log` row per successful transition. |
| Tests | `governance-gate-official-transitions.test.ts`: rejects self-approval, rejects missing review, rejects incomplete artifact, accepts happy path. |

---

## Gap #1 — Portal activity tracking (Phase 2)

**Given** a client views/downloads/replies/marks-follow-up on a portal surface,
**When** the interaction occurs,
**Then** exactly one `client_portal_activity` row MUST be written with a
non-null `kind`, `subject_type`, `subject_id`, and `client_portal_project_id`.

**Definition of PASS**

| Item | Requirement |
|---|---|
| DB | No schema change; use existing 9-column table. |
| Server fn | `src/lib/portal-activity.functions.ts`: `logPortalActivity({ project_id, kind, subject_type, subject_id, metadata? })`. `kind` ∈ `viewed` \| `downloaded` \| `replied` \| `follow_up_needed` \| `acknowledged`. |
| UI writers | `portal.roadmap.tsx` (viewed on mount, acknowledged on banner click), `portal.files.tsx` (viewed on list, downloaded per file), `portal.messages.tsx` (replied on send, follow_up_needed on flag), `portal.home.tsx` (viewed on mount), `RoadmapAcknowledgmentBanner`. |
| UI readers | `portal.activity.tsx` shows all kinds; Command Center exception feed reads `follow_up_needed` rows. |
| Audit | `client_portal_activity` IS the audit. |
| Tests | `portal-activity-writes.test.ts`: each surface emits exactly one row per user action; no duplicate on remount. |

---

## Gap #10 — Internal review before intake becomes truth (Phase 3)

**Given** an intake submission lands in `intake_submissions`,
**When** extraction (`engine_extraction_runs`) attempts to start,
**Then** it MUST refuse unless a row exists in `engine_intake_reviews` with
`decision='accepted'` for that submission.

**Definition of PASS**

| Item | Requirement |
|---|---|
| DB | Table `engine_intake_reviews (id uuid pk, submission_id uuid fk, reviewer_email text, decision text check in ('pending','accepted','rejected','needs_more'), notes text, decided_at timestamptz, created_at, updated_at)`. Trigger `tg_engine_extraction_runs_require_review` BEFORE INSERT rejects unless accepted review row exists. GRANTs to `authenticated` + `service_role`. RLS scoped to admins via `has_role`. |
| Server fn | `src/lib/engine-intake-review.functions.ts`: `listPendingIntakeReviews()`, `reviewIntakeSubmission({ submission_id, decision, notes })` (admin-only via role check). |
| UI | `admin.intake-alerts.tsx` gains a "Pending internal review" tab with accept/reject controls per submission. |
| Audit | `engine_audit_log` row on every review decision. |
| Tests | `intake-review-gate.test.ts`: extraction insert fails with helpful error when no accepted review; passes after acceptance; rejected submission never extracts. |

---

## Gaps #5 + #6 — Approve-with-conditions lifecycle (Phase 4)

**Given** a reviewer approves a review item with conditions,
**When** the review item's status is set to `approved_with_conditions`,
**Then** the parent artifact MUST remain gated until every `open` condition is
`met` or `waived`, and the review item cannot be `closed` while any condition
is still `open`.

**Definition of PASS**

| Item | Requirement |
|---|---|
| DB | Table `engine_review_item_conditions (id, review_item_id fk, text, status check in ('open','met','waived'), resolved_by, resolved_at, created_by, created_at)`. Trigger `tg_engine_review_items_conditions_gate` blocks `status='closed'` when any child condition is `open`. Extend `engine_review_items.status` allowlist to include `approved_with_conditions`. |
| Server fn | `src/lib/engine-approvals.functions.ts`: `addCondition`, `resolveCondition({ condition_id, status: 'met'\|'waived', notes })`, `approveWithConditions({ review_item_id, conditions: string[] })`. Every write hits the governance gate. |
| UI | Approvals Queue expanded card: conditions editor (list, add, resolve, waive with reason). Read-only rendering elsewhere. |
| Audit | `engine_review_audit` row per condition state change. |
| Tests | `approve-with-conditions-lifecycle.test.ts`: cannot close with open condition; artifact remains gated; met/waived both unblock; reason required for waive. |

---

## Gaps #3 + #9 — Cross-client privacy on `engine_intelligence_memory` (Phase 5)

**Given** a pattern lives in `engine_intelligence_memory` for client A,
**When** any read is issued from a session scoped to client B (or an
unauthenticated public read runs),
**Then** the pattern MUST be invisible **unless** it carries
`pattern_is_generalizable=true`, in which case only the `de_identified_payload`
is returned — never the raw client-specific fields.

**Definition of PASS**

| Item | Requirement |
|---|---|
| DB | Add columns `client_id uuid NOT NULL` (backfilled from project), `pattern_is_generalizable boolean NOT NULL DEFAULT false`, `de_identified_payload jsonb`. Add index on `client_id`. RLS: within-client rows use existing project-scoped policy; cross-client reads only allowed via SECURITY DEFINER helper `read_generalizable_patterns()` that projects only `de_identified_payload`. |
| Server fn | `readGeneralizablePatterns({ topic, capability_filter })` in `src/lib/engine-intelligence-memory.functions.ts`. Frame/plan/mockup generators MUST use this helper for cross-client reads; direct SELECTs across `client_id` are lint-forbidden. |
| UI | Admin memory view shows `client_id` and generalizable flag. Promoting a pattern to generalizable requires a review item (routed via Gate 0). |
| Audit | `engine_audit_log` row on promote/demote of `pattern_is_generalizable`. |
| Tests | `intelligence-memory-cross-client.test.ts`: client A row invisible to client B session; generalizable+de-identified row visible; raw identifying columns never returned across clients; promotion requires review + non-self approval. |

---

## Gap #7 — Client acceptance separate from delivery acknowledgment (Phase 6)

**Given** a delivery is published to the portal,
**When** the client clicks "Accept delivery",
**Then** `client_portal_roadmaps.client_accepted_at` MUST be set with the
signer's identity, distinct from `acknowledged_at`. The outcome scheduler
(30/60/90 cadence) MUST NOT arm until `client_accepted_at IS NOT NULL`.

**Definition of PASS**

| Item | Requirement |
|---|---|
| DB | Add `client_accepted_at timestamptz`, `client_accepted_by text`, `client_acceptance_notes text` to `client_portal_roadmaps`. RPC `client_accept_delivery(_roadmap_id uuid, _notes text)` SECURITY DEFINER, callable by portal-user role. Trigger `tg_engine_outcome_scheduler_require_acceptance` on `engine_outcome_checkins` blocks arming until acceptance. |
| Server fn | `clientAcceptDelivery({ roadmap_id, notes })` in `src/lib/portal.functions.ts` calls the RPC. |
| UI | Portal delivery view: distinct "Accept delivery" primary action (only enabled after `acknowledged_at`), separate from acknowledgment banner. Copy: "Acknowledged" = "I have seen this"; "Accepted" = "I confirm this is delivered as agreed". |
| Audit | `engine_audit_log` row on accept; `client_portal_publish_events` extended with `event_kind='client_accepted'`. |
| Tests | `client-acceptance-vs-acknowledgment.test.ts`: acknowledged ≠ accepted; scheduler blocked before acceptance; scheduler arms after acceptance; portal reader shows both states. |

---

## Gap #8 — Auto-trigger family impact on child project state change (Phase 7)

**Given** a child project in a family transitions state (scope, timeline,
budget, or status),
**When** the transition is committed,
**Then** an `engine_review_items` row of kind `family_impact_review` MUST be
automatically queued for every sibling child that could be affected, with the
impact summary pre-computed.

**Definition of PASS**

| Item | Requirement |
|---|---|
| DB | Trigger `tg_engine_projects_family_impact_notify` AFTER UPDATE on `engine_projects` — fires only when `parent_id IS NOT NULL` and monitored columns change. Enqueues into `engine_review_items` via SECURITY DEFINER helper. |
| Server fn | Wrap existing `computeFamilyImpact` with `queueFamilyImpactReview({ project_id, source_change })`. |
| UI | Family view shows queued impact reviews inline; Approvals Queue surfaces them under `family_impact_review` filter. |
| Audit | `engine_activity` row per enqueue. |
| Tests | `family-impact-auto-trigger.test.ts`: monitored change enqueues one review per sibling; unrelated update does not enqueue; parent-less project skips. |

---

## Gap #4 — Multi-agent runtime instantiation (Phase 8)

**Given** a project needs work of a capability (`research`, `design`, `qa`,
`seo`, `analytics`, `content`, `compliance`, `automation`, `dev`),
**When** the work is dispatched,
**Then** the orchestrator MUST ensure a scoped agent with the correct
permission template exists in `engine_project_agents`; if missing, provision
one from the capability catalog before dispatching.

**Definition of PASS**

| Item | Requirement |
|---|---|
| DB | Seed table `engine_agent_capability_catalog (capability pk, description, default_permissions jsonb, default_model text)`. Seed 9 capabilities. |
| Server fn | `ensureAgentForCapability({ project_id, capability })` in `src/lib/engine-agent-orchestrator.server.ts`. |
| Call sites | Chat handler, packet builder, QA factory, mockup builder, extraction runner all call it before dispatching. |
| Audit | `engine_activity` row on provision. |
| Tests | `agent-runtime-instantiation.test.ts`: missing agent is provisioned with catalog permissions; existing agent is reused; unknown capability throws; permissions never widen an existing agent. |

---

## Gap #2 — Named business engine templates (Phase 9)

**Given** a project reaches the "operate consistently" stage,
**When** a named business engine is instantiated (`content_authority`,
`lead_follow_up`, `review_reputation`, `client_success`, `founder_rhythm`),
**Then** a `engine_business_engines` row MUST land with a real workflow, real
cadence (cron expression), owner role, trigger conditions, approval gate,
metrics, and exception rules — no placeholder JSON.

**Definition of PASS**

| Item | Requirement |
|---|---|
| DB | No schema change. |
| Server fn | `src/lib/engine-business-engine-templates.ts` exports typed template constants for the 5 engines with **all** required fields populated. `instantiateNamedEngine({ project_id, template_key })` writes the row through the governance gate. |
| Runs | First run of each engine produces a valid `engine_business_engine_runs` row within its cadence window. |
| UI | `engine.operations.tsx` template picker lists the 5 engines with their steps; portal `portal.roadmap.tsx` shows client-safe engine names. |
| Audit | `engine_activity` on instantiate; `engine_business_engine_exceptions` populated when a run misses cadence. |
| Tests | `business-engine-templates.test.ts`: each named engine instantiates without missing-field errors and produces a valid first run. |

---

## Gap #6 (Q8) — Runtime model fallback loop (Phase 10)

**Given** a primary AI model call fails with 429 / 402 / 5xx / timeout,
**When** the wrapper catches the failure,
**Then** it MUST consult `engine-model-scoring.ts` for the next-best candidate,
retry (up to N=2 additional attempts across different providers), record every
attempt (primary + fallback) in `engine_agent_costs`, and escalate via a
`engine_review_items` row of kind `model_fallback_exhausted` after all
attempts fail.

**Definition of PASS**

| Item | Requirement |
|---|---|
| Server fn | `src/lib/engine-model-runtime.server.ts` exports `callAiWithFallback({ capability, prompt, ... })`. All `callLovableAi` call sites migrated. |
| Cost logging | Every attempt (success or fail) writes one `engine_agent_costs` row with `attempt_index` + `outcome`. |
| Escalation | Exhaustion writes a review item with severity based on capability. |
| Tests | `model-fallback-runtime.test.ts`: primary 429 triggers fallback; fallback success completes the call; all-fail path escalates. |

---

## Gap E10 / D5 / G10 — Small governance fills (Phase 11)

**E10 "Recommend not-yet"**
| Item | Requirement |
|---|---|
| DB | `engine_milestones.recommendation text check in ('build_now','build_later','do_not_build') NOT NULL DEFAULT 'build_now'`. |
| UI | Roadmap generator picks a recommendation per milestone; milestone card displays it; approving `build_later` / `do_not_build` still requires the governance gate. |
| Tests | `milestone-recommendation.test.ts`: generator populates non-default when signals justify; UI renders each state. |

**D5 "Per-field readiness blockers"**
| Item | Requirement |
|---|---|
| DB | Extend `spine_points_ready_summary()` to return `blockers jsonb` (array of `{field, reason, severity}`). |
| UI | Point A / Point B readiness panel renders the blocker list. |
| Tests | `spine-readiness-blockers.test.ts`: at least one blocker returned when readiness < 100. |

**G10 "Field-by-field spec approval"**
| Item | Requirement |
|---|---|
| DB | Add `field_approvals jsonb NOT NULL DEFAULT '{}'` to `engine_project_implementation_plans`. Governance gate rejects whole-plan approval unless every required field is present in `field_approvals` with `status='approved'`. |
| UI | Plan view shows approval state per required field with per-field approve buttons. |
| Tests | `plan-field-approval-gate.test.ts`: whole-plan approval blocked until all required fields approved. |

---

## Phase 12 — Verify + re-audit

- Every test file above exists and passes.
- Re-run capability audit; write `.orchestrator/audit/capability-audit-2026-07-14d.md`.
- Verdict: all 10 gaps flip PASS. Ultimate Confirmation flips to PASS.
- Update `.orchestrator/BUILD_STATE.md` and `CLAUDE.md` "Three Highest-Leverage Gaps".

---

## Cross-cutting invariants that every phase must uphold

1. No server fn writes an "official" state without routing through the Phase 1
   governance gate.
2. No CREATE TABLE lands without matching GRANT + RLS in the same migration
   (per `public-schema-grants` doctrine).
3. No migration is applied autonomously — every schema change queues under
   `.orchestrator/PENDING_MIGRATIONS.md`.
4. No AI actor can approve its own output (`created_by ≠ approved_by`).
5. Every phase writes `.orchestrator/phase-[id]-output.md` on completion.
6. Every phase commits under `feat(phase-[id]): …`.
