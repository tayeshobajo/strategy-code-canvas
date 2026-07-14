# Capability Audit — Executive Summary (2026-07-14b, post M11 + M12)

Prior report: `.orchestrator/audit/capability-audit-summary.md` (2026-07-14a).
Full refreshed scorecard: `.orchestrator/audit/capability-audit-2026-07-14b.md`.
Delta SQL smoke: `.orchestrator/audit/capability-audit-smoke-2026-07-14b-output.md`.

## Headline

**152 PASS / 35 PARTIAL / 0 MISSING out of 187 items — ≈81% PASS.**

Both prior-MISSING items closed:

- **M11 — Engine-level learning loop.** Landed in `src/lib/engine-learning-loop.functions.ts` + admin route `src/routes/admin.engine-learning.tsx`. Reads `engine_business_engine_runs`, computes success/failure/partial rates and trend deltas, and — when thresholds are met — proposes a workflow diff via `engine_project_chat_proposals` + `engine_review_items` (`item_type = 'engine_workflow_change'`). Application requires a separate approver; before/after states are captured in `engine_audit_log`. Phase output: `.orchestrator/phase-m11-engine-learning-output.md`.
- **M12 — Milestone → engine promotion.** Landed in `src/lib/engine-milestone-promotion.functions.ts` + admin route `src/routes/admin.engine-promotion.tsx`. Eligible = approved + complete/delivered + operational-phase milestones. `proposeEnginePromotion` creates a **draft** `engine_business_engines` row plus an `engine_review_items` (`item_type = 'engine_promotion'`); `approveEnginePromotion` activates via `activate_business_engine()` RPC. Separate-approver enforced in code AND at the DB layer by `engine_business_engines_no_self_approve` (trigger verified in the delta smoke). Phase output: `.orchestrator/phase-m12-engine-promotion-output.md`.

## Section scorecard (delta from 2026-07-14a)

| Section | PASS | PARTIAL | MISSING | Δ |
|---|---:|---:|---:|---|
| A. Conversational Intake | 8 | 4 | 0 | — |
| B. Automatic Understanding | 10 | 2 | 0 | — |
| C. Captain & Specialists | 8 | 4 | 0 | — |
| D. Understanding Readiness | 7 | 1 | 0 | — |
| E. Generative Roadmap | 12 | 2 | 0 | — |
| F. Multi-Solution Decomposition | 6 | 3 | 0 | — |
| G. Mockups / Plans / Specs | 9 | 2 | 0 | — |
| H. Controlled Build | 11 | 1 | 0 | — |
| I. QA & Evidence | 12 | 2 | 0 | — |
| J. Approvals & Governance | 9 | 1 | 0 | — |
| K. Spine / Versioning / Drift | 9 | 1 | 0 | — |
| L. Client Portal | 11 | 1 | 0 | — |
| **M. Business Engines** | **8** | **4** | **0** | **+2 PASS, −2 MISSING** |
| N. Delivery / Stage Transitions | 8 | 0 | 0 | — |
| O. Outcome Feedback | 7 | 3 | 0 | — |
| P. Portfolio Scale | 8 | 2 | 0 | — |
| Q. Reliability & Accountability | 9 | 2 | 0 | — |

Section M final: **8 PASS / 4 PARTIAL / 0 MISSING**.

## Ultimate Confirmation verdict

**PASS.** Every clause is now satisfied by concrete implementation:

- receive → conversational intake (A) + document/transcript ingest
- understand responsibly → extraction, provenance, confidence, contradiction detection (B)
- define the destination → readiness gate + Point A/B into Project Spine (D)
- generate the right path → business-specific roadmap generator (E)
- design the required solutions → multi-solution/family decomposition (F) + mockups/plans (G)
- coordinate humans and AI → Captain + specialist agents with permissions and audit (C, H)
- prove the work → QA + evidence gate with human acceptance separation (I)
- protect every decision → Spine + versioning + governance triggers + no-self-approval (J, K, Q)
- deliver it safely → delivery-readiness gate + portal publish transition + client acknowledgment (L, N)
- **keep the business operating consistently after launch** → Business Engines with cadence/triggers/approval + **M11 learning loop** feeding proposals + **M12 promotion** turning milestones into ongoing engines under governance (M, O)

Prior "PARTIAL on operate consistently after launch" is now **PASS**.

## Remaining PARTIALs — ranked by blast radius

Carried forward from prior audit; none are MISSING, all have surface with soft enforcement.

1. **H9 — Cost-overrun auto-pause.** `engine_agent_costs` records cost but no trigger halts a project on threshold. Fix pattern: extend `engine_business_engines_gate` style trigger.
2. **F7 — Cross-project impact automation.** Family graph renders in `FamilyDependencyGraph.tsx` but sibling-invalidation is a manual review, not an automatic `engine_review_items` emission.
3. **M3–M6 — Business Engine templates.** Content Authority / Lead Follow-Up / Reputation / Client Success templates are supported by schema but not seeded.
4. **O — Outcome feedback loop coverage.** 30/60/90 check-ins exist as a pattern; automated scheduler across all delivered projects is partial.
5. **P9 — Portfolio explainability.** Health/at-risk/blocked classification is rendered but the "why" panel is thin.

## Guardrails observed

- Read-only. No SQL writes, no migrations applied, no `BUILD_STATE.md` phase-status changes.
- Delta smoke harness kept alongside the report (`capability-audit-smoke-2026-07-14b.sql`) so the run is reproducible.
- No new PENDING_MIGRATIONS entries required — M11/M12 use existing tables and free-form `item_type` text column.
