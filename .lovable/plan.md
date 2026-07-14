# Fresh Capability Audit — Roadmap Engine (A→Q + Ultimate)

## Deliverable

One new file:

`.orchestrator/audit/capability-audit-2026-07-14c.md`

Structured as:

1. **Executive summary** — counts per verdict (PASS / PARTIAL / FAIL / UNBUILT), the 10 highest-impact gaps, the "Ultimate Confirmation" verdict, and a table of section-level scores (A–Q).
2. **One block per confirmation** — every single question from A–Q + the Ultimate, in the order given, with:
   - Verdict: `PASS` / `PARTIAL` / `FAIL` / `UNBUILT`
   - Evidence: 1–3 `path:line` citations OR a DB object name (table / policy / trigger / function) OR "no code / no schema found"
   - One-line rationale
   - When PARTIAL/FAIL, a one-line "what would flip it to PASS"
3. **Cross-cutting findings** — patterns spanning multiple sections (e.g. "portal publish path is gated but portal activity is not tracked" appears in L and N; roll it up once).
4. **Governance/spine changes since 2026-07-14b** — B12 triggers, `apply_approved_proposal`, `admin_edit_milestone_governed`, `impact_summary`, `risk_score`, drift causality — verified fresh against current code + DB, not inherited from prior audits.

The prior `capability-audit-2026-07-14b*` files are NOT trusted; every confirmation is re-verified from the current codebase and live DB state.

## Method

For each section I'll combine three read-only signals:

1. **Codebase evidence** — `rg` / `code--view` across `src/lib/**`, `src/routes/**`, `src/components/**`, `src/integrations/**`, and `supabase/migrations/**`. I'll use `acp_subagent--explore` for the wide-search sections (E roadmap generation, K spine/drift, M engines, P portfolio) to keep my own context clean.
2. **DB evidence** — `psql` (read-only) for: table existence + column set, RLS policies, triggers, `pg_proc` for SECURITY DEFINER functions, and spot-checked row counts (e.g. does `engine_review_items` actually carry `risk_score` values, does `engine_project_chat_proposals` carry `impact_summary`).
3. **Runtime signals where they exist** — reading tests under `src/**/__tests__/`, `.orchestrator/qa/*`, and `.lovable/*-qa-report.md` to see which invariants already have regression coverage.

## Verdict rubric (applied uniformly)

- **PASS** — code path + DB objects + (where relevant) an approval/audit trail + a test or QA artifact.
- **PARTIAL** — capability exists but is missing one of: server-side enforcement, audit trail, UI surface, or coverage on all relevant surfaces.
- **FAIL** — capability is claimed by architecture docs or referenced by other code, but the enforcing code / policy / trigger is missing or bypassable.
- **UNBUILT** — no code, schema, or doctrine reference exists yet.

## Section coverage plan

- **A Conversational intake** — `intake_drafts`, `intake_submissions`, voice/attachment components, `src/routes/intake*`, transcript pipeline (H7-A8 in `.lovable/plan.md`).
- **B Automatic understanding** — `engine_extraction_runs`, `engine_extracted_signals`, `engine_project_intake_failures`, `engine-intelligence.functions.ts`, contradiction detection.
- **C Captain & agents** — `engine_project_agents`, `engine_agent_tasks`, `engine_agent_permissions`, `engine_agent_costs`, Phase 9C no-self-approval check.
- **D Understanding readiness** — Point A / Point B promotion, spine gate (`supabase/tests/spine-gate-smoke.sql`), `engine_spine_*` tables.
- **E Roadmap generation** — `engine_project_frames`, `engine_roadmap_versions`, `engine_milestones`, "not yet" recommendations, existing-asset detection.
- **F Multiple solutions / decomposition** — parent/child project modeling in `engine_projects`, cross-project dependencies.
- **G Mockups & specs** — `engine_project_mockups`, plans/frames, versioning, approval-required-before-build gate.
- **H Controlled build** — `engine_project_build_packets`, `engine_project_build_evidence`, "do not touch" boundary, cost-overrun approvals.
- **I QA & evidence** — `engine_project_qa_plans`, `engine_project_qa_evidence_reviews`, no-self-acceptance rule.
- **J Approvals & governance** — `engine_review_items` + risk_score, `engine_review_audit`, `ProposalImpactPanel` / `ProposalImpactEditor`, condition tracking.
- **K Spine, versioning, drift** — `engine_spine_field_truth`, `engine_version_change_decisions`, `engine-drift-causality.functions.ts`, B12 triggers verified live.
- **L Client comms & portal** — `client_portal_*` tables, `RoadmapAcknowledgmentBanner`, `portal.functions.ts` publish gates, portal activity tracking (`client_portal_activity`, `portal_access_events`).
- **M Business engines** — `engine_business_engines`, `engine_business_engine_runs`, `engine_business_engine_exceptions`, named-engine coverage (Content / Lead / Review / Client-Success / Founder Rhythm).
- **N Delivery & transitions** — `engine_delivery_items`, `engine_delivery_history`, `sendProjectDelivery` gate, delivery-readiness reviews.
- **O Outcome feedback** — 30/60/90 scheduler (H4 output), `engine_intelligence_memory`, cross-client privacy boundary.
- **P Portfolio scale** — command-center / NBA coverage, exception ranking (I11 risk_score), Decision Log surface.
- **Q Reliability, security, accountability** — audit coverage, RLS breadth, `engine-model-scoring.ts`, fallback behavior, low-confidence disclosure.
- **Ultimate confirmation** — synthesized from the above; PASS only if every section clears PARTIAL.

## What this plan does NOT do

- No migrations, no code edits, no doctrine rewrites. Fresh audit only.
- No re-running of the linter or security scan (already have current results in context).
- No plan for fixing gaps — that would be a follow-up sprint once you've read the verdicts.

## Time / cost note

This is a large exploration: ~200 confirmations × 2–3 evidence lookups each. I'll batch reads and delegate the widest sections to `acp_subagent--explore` to keep it efficient, but expect the audit file itself to be long (~1500–2500 lines). After approval I'll produce it in one build-mode turn.
