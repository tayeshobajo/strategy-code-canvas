
# Top-10 Gap Fix + Governance Gate Sweep

Goal: flip the Ultimate Confirmation to PASS by closing the 10 gaps from `.orchestrator/audit/capability-audit-2026-07-14c.md`, and add explicit governance gates so no AI-generated output becomes official without passing the relevant approval + completeness rules.

Ground rules (from `CLAUDE.md`):
- All schema changes are queued to `.orchestrator/PENDING_MIGRATIONS.md`. Nothing applied autonomously.
- Each phase writes `.orchestrator/phase-[id]-output.md` and commits `feat(phase-[id]): …`.
- No self-approval anywhere: any function that writes an acceptance/publish/promote state must reject when `created_by = approved_by`.
- No client-facing publish without human gate.

---

## Phase 0 — Acceptance criteria (deliverable-only, no code)

Write `.orchestrator/audit/acceptance-criteria-2026-07-14c.md`. For each of the 10 gaps and the governance sweep, define:
- Given / When / Then in plain language
- DB objects that must exist
- Server-function signatures + input/output shape
- UI surface that must render it
- Audit rows that must be written
- Test file(s) that must exist and pass

Also states the "definition of PASS" per gap so future audits stop at the same bar.

---

## Phase 1 — Governance gate sweep (foundation)

Formalises "AI output → official state" transitions. Ships first because every later phase must obey it.

- Add `src/lib/engine-governance-gate.server.ts`: single function `assertOfficialTransition({ actor, artifact, prior_state, next_state, review_item_id? })` that centralises: role check, no-self-approval, required review-item present + approved, completeness threshold (per-artifact), audit-log write.
- Enumerate the official-transition list in one place: milestone.status→approved, impl_plan.status→approved, mockup→approved, roadmap_version→published, delivery→sent, portal_roadmap→published, business_engine_run→completed, review_item→approved-with-conditions, engine_intelligence_memory promotion.
- Refactor existing call sites to route through the gate.
- Queue to PENDING_MIGRATIONS.md: DB-side twin — `assert_official_transition()` PL/pgSQL SECURITY DEFINER used by BEFORE triggers on the same tables. This is B12's design pattern extended to every "official" table.

Deliverable: single audit trail row per official transition, uniform shape.

---

## Phase 2 — Gap #1: Portal activity tracking

Server-side writes for `client_portal_activity`.

- `src/lib/portal-activity.functions.ts`: `logPortalActivity({ project_id, kind: viewed | downloaded | replied | follow_up_needed | acknowledged, subject_type, subject_id, metadata })`.
- Wire into `portal.roadmap.tsx`, `portal.files.tsx`, `portal.messages.tsx`, `portal.home.tsx`, `RoadmapAcknowledgmentBanner`, download handlers.
- Command Center + `portal.activity.tsx` read the new rows.
- Test: `portal-activity-writes.test.ts` — asserts each surface emits exactly one row per user action.

No schema change (table already has 9 columns).

---

## Phase 3 — Gap #10: Intake → truth internal-review gate

- Queue migration to PENDING_MIGRATIONS.md: `engine_intake_reviews` (id, submission_id, reviewer_id, decision, notes, decided_at) + trigger blocking `engine_extraction_runs` from starting until an accepted review row exists.
- Server fn `reviewIntakeSubmission({ submission_id, decision, notes })` in `src/lib/engine-intake-review.functions.ts`.
- Admin UI: extend `admin.intake-alerts.tsx` with a "Pending internal review" queue.
- Test: `intake-review-gate.test.ts` — extraction refuses to run without accepted review.

---

## Phase 4 — Gap #5 + #6: Approve-with-conditions lifecycle

- Queue migration: `engine_review_item_conditions` (id, review_item_id, text, status ∈ open|met|waived, resolved_by, resolved_at) + trigger: `engine_review_items` cannot transition to `closed` while any condition is `open`.
- Server fns in `src/lib/engine-approvals.functions.ts`: `addCondition`, `resolveCondition`, `approveWithConditions`.
- Extend Approvals Queue expanded card with conditions editor + resolve button.
- Test: `approve-with-conditions-lifecycle.test.ts`.

---

## Phase 5 — Gap #3 + #9: Cross-client privacy on `engine_intelligence_memory`

- Queue migration: add `client_id` NOT NULL to `engine_intelligence_memory`, backfill from project, add index; add RLS policy `USING (client_id = current_client_id())` (or equivalent SECURITY DEFINER helper).
- Add `pattern_is_generalizable` boolean + `de_identified_payload` jsonb; only rows with `pattern_is_generalizable = true` may be read across clients, and only the de-identified payload is returned.
- Server helper `readGeneralizablePatterns({ …context })` — used by frame/plan generators. All other reads scope to `client_id`.
- Test: `intelligence-memory-cross-client.test.ts` — asserts client A cannot read client B's raw patterns; generalizable+de-identified patterns are visible; identifying fields never leak.

---

## Phase 6 — Gap #7: Client acceptance separate from internal delivery

- Queue migration: `client_accepted_at`, `client_accepted_by`, `client_acceptance_notes` on `client_portal_roadmaps`; trigger blocking outcome-scheduler activation until `client_accepted_at IS NOT NULL`; add RPC `client_accept_delivery(_roadmap_id, _notes)`.
- Portal UI: "Accept delivery" action distinct from "Acknowledge" banner; different copy + audit row.
- Server fn `clientAcceptDelivery` in `src/lib/portal.functions.ts` calling the RPC.
- Test: `client-acceptance-vs-acknowledgment.test.ts`.

---

## Phase 7 — Gap #8: Auto-trigger family impact on child project state change

- Queue migration: trigger `tg_engine_projects_family_impact_notify` on `engine_projects` state transitions → inserts an `engine_review_items` row of kind `family_impact_review` when parent has other children.
- Server fn `computeAndQueueFamilyImpact(project_id)` in `src/lib/engine-family-impact.functions.ts` (already computes; wrap in a "queue proposal" call).
- Test: `family-impact-auto-trigger.test.ts`.

---

## Phase 8 — Gap #4: Multi-agent runtime instantiation

- `src/lib/engine-agent-orchestrator.server.ts`: `ensureAgentForCapability({ project_id, capability })` — checks `engine_project_agents`; if missing, provisions using `engine_agent_permissions` template rows; writes activity.
- Call sites: chat handler, packet builder, QA factory, mockup builder call `ensureAgentForCapability` before dispatching work.
- Queue migration: `engine_agent_capability_catalog` seed table (capability, description, default_permissions) so the catalog is structured, not prompt-only.
- Test: `agent-runtime-instantiation.test.ts`.

Covers audit items C5, C6, and partially C2/C10.

---

## Phase 9 — Gap #2: Seed the 5 named business engines

- `src/lib/engine-business-engine-templates.ts` — flesh out `content_authority`, `lead_follow_up`, `review_reputation`, `client_success`, `founder_rhythm` with real workflow steps, cadence (cron expression), owner role, trigger conditions, approval gates, metrics, and exception rules.
- Seed rows into `engine_business_engines` at project intake (or on-demand from a template picker).
- Portal + `engine.operations.tsx` surfaces named engines.
- Test: `business-engine-templates.test.ts` — each named engine instantiates + produces a valid `_runs` row.

No schema change; column shape already supports it.

---

## Phase 10 — Gap #6: Runtime model fallback loop

- `src/lib/engine-model-runtime.server.ts`: wraps `callLovableAi` with a retry-with-fallback loop that consults `engine-model-scoring.ts` for the next candidate on 429/402/5xx/timeout; records the primary failure to `engine_agent_costs`; escalates via review item after N failures.
- Refactor `callLovableAi` call sites (chat, extraction, plan builder, mockup builder) to use the wrapper.
- Test: `model-fallback-runtime.test.ts` — simulates primary failure, asserts secondary is called and the failure is logged.

---

## Phase 11 — Small governance fills

Closes the last three residual audit items alongside the sweep.

- **E10 "Recommend not-yet"**: add `recommendation ∈ build_now | build_later | do_not_build` to `engine_milestones` (queue migration). Surface in roadmap generator + milestone card.
- **D5 "explain what blocks readiness" per-field**: extend `spine_points_ready_summary` to return a per-field blocker array; render in Point A/B readiness panel.
- **G10 field-by-field spec approval**: add `field_approvals jsonb` on `engine_project_implementation_plans` + UI to approve individual fields; gate whole-plan approval on all-required-fields-approved.

Each of these routes through Phase 1's governance gate.

---

## Phase 12 — Verify + re-audit

- Run full test suite; every new test passes.
- Re-run the capability audit script/prompt against the same rubric; write `.orchestrator/audit/capability-audit-2026-07-14d.md`.
- Confirm the 10 items flip PASS and Ultimate Confirmation is PASS.
- Update `CLAUDE.md`'s "Three Highest-Leverage Gaps" section and BUILD_STATE.md.

---

## What ships to PENDING_MIGRATIONS.md (not applied)

Consolidated block in one entry so Tai can review together:

1. `assert_official_transition()` + BEFORE triggers on 8 official tables (Phase 1)
2. `engine_intake_reviews` + extraction-gate trigger (Phase 3)
3. `engine_review_item_conditions` + close-block trigger (Phase 4)
4. `engine_intelligence_memory.client_id` NOT NULL + de-ident columns + RLS (Phase 5)
5. `client_portal_roadmaps.client_accepted_*` + acceptance RPC + outcome-scheduler gate (Phase 6)
6. `tg_engine_projects_family_impact_notify` (Phase 7)
7. `engine_agent_capability_catalog` seed table (Phase 8)
8. `engine_milestones.recommendation` (Phase 11)
9. `engine_project_implementation_plans.field_approvals` (Phase 11)

Each item includes the exact SQL, rollback, and the code branch that already assumes it (so Tai can apply + we merge safely).

---

## Out of scope

- Applying B12 or any migration above — that is Tai's approval.
- Rewriting existing PASS items.
- New UI aesthetics — reuse existing shadcn patterns.
- Anything that would let one client's data influence another client's official output without the Phase 5 de-identification gate.
