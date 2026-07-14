# Capability Audit — Executive Summary (2026-07-14)

Full report: `.orchestrator/audit/capability-audit-2026-07-14.md`
SQL smoke: `.orchestrator/audit/capability-audit-smoke-output.md`

## Headline

**150 PASS / 35 PARTIAL / 2 MISSING out of 187 items — ≈80% PASS.**

Up from ≈65% CONFIRMED on 2026-07-13. The jump comes from three landings:

1. **Phase 5D — Multi-Solution / Family** (Section F): `parent_project_id`, `engine_milestone_solutions`, `engine_projects_child_rollup_guard` trigger, family + portal-family routes, `FamilyDependencyGraph`. Section F moved from 4 GAP → 0 MISSING.
2. **Business Engines schema** (Section M): `engine_business_engines`, `_runs`, `_exceptions` tables with cadence/cron/triggers/approval_rules/metrics/missed_cycles, plus engines route. Section M moved from 5 NOT BUILT / 5 GAP → 6 PASS / 4 PARTIAL / 2 MISSING.
3. **Governance Hardening Phase 4 + hotfix**: G1 provenance trigger, expanded no-self-approve to Sections F/M, `current_phase` column and `client_portal_roadmaps` grants restored with negative-token verification.

## Section scorecard

| Section | PASS | PARTIAL | MISSING |
|---|---:|---:|---:|
| A. Conversational Intake | 8 | 4 | 0 |
| B. Automatic Understanding | 10 | 2 | 0 |
| C. Captain & Specialists | 8 | 4 | 0 |
| D. Understanding Readiness | 7 | 1 | 0 |
| E. Generative Roadmap | 12 | 2 | 0 |
| F. Multi-Solution Decomposition | 6 | 3 | 0 |
| G. Mockups / Plans / Specs | 9 | 2 | 0 |
| H. Controlled Build | 11 | 1 | 0 |
| I. QA & Evidence | 12 | 2 | 0 |
| J. Approvals & Governance | 9 | 1 | 0 |
| K. Spine / Versioning / Drift | 9 | 1 | 0 |
| L. Client Portal | 11 | 1 | 0 |
| **M. Business Engines** | **6** | **4** | **2** |
| N. Delivery / Stage Transitions | 8 | 0 | 0 |
| O. Outcome Feedback | 7 | 3 | 0 |
| P. Portfolio Scale | 8 | 2 | 0 |
| Q. Reliability & Accountability | 9 | 2 | 0 |

## The two remaining MISSING items

Both in Section M:

- **M11 — Engine-level learning loop.** `engine_business_engine_runs.outputs` is written but never fed back into the parent engine's `workflow` or prompt basis.
- **M12 — Milestone → engine promotion.** An operational milestone at delivery does not auto-promote into an `engine_business_engines` row; the promotion is manual.

Both are additive; neither blocks current governance or delivery flow.

## Ultimate Confirmation verdict

**PASS** on receive → understand → destination → path → design → coordinate → prove → protect → deliver.
**PARTIAL** on "operate consistently after launch" — Business Engines run and gate, but do not yet learn or auto-promote from milestones.

## Suggested next phases (mapped to `doctrine/ROADMAP_ENGINE_PHASE_MAP.md` themes)

1. **Engine Learning Loop** (closes M11) — join outcome-feedback pattern synthesis with `engine_business_engine_runs.outputs`, emit workflow-diff proposals through the existing chat-proposal governance.
2. **Operate-Mode Promotion** (closes M12) — trigger on milestone kind `operational` reaching `delivered`, generate an `engine_business_engines` draft, route via `engine_review_items`.
3. **Business Engine Templates** (fills M3–M6) — seed migration with Content Authority / Lead Follow-Up / Reputation / Client Success templates.
4. **Cost-overrun auto-pause** (closes H9) — extend `engine_business_engines_gate` pattern to enforce a budget threshold on `engine_agent_costs`.
5. **Cross-project impact automation** (closes F7) — wire the family graph to emit `engine_review_items` when a parent/child status change would invalidate a sibling.

No migrations were applied by this audit. Any migration proposal from the above phases must land in `.orchestrator/PENDING_MIGRATIONS.md` first.

## Guardrails observed

- Read-only. No SQL writes, no migrations, no `BUILD_STATE.md` phase-status changes.
- SQL smoke harness kept alongside the report (`capability-audit-smoke.sql`) so the run is reproducible.
- All verdicts trace back to a code path, table + policy, trigger, or SQL result cited in the full report.
