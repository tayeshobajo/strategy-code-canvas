# Capability Audit — Full Refresh (2026-07-14b, post M11 + M12)

Prior full report: `.orchestrator/audit/capability-audit-2026-07-14.md` (2026-07-14a).
Executive summary: `.orchestrator/audit/capability-audit-summary-2026-07-14b.md`.
Delta smoke: `.orchestrator/audit/capability-audit-smoke-2026-07-14b-output.md`.

This refresh re-scores every checklist item using the same PASS / PARTIAL / MISSING rubric as the prior audit. Only items whose evidence changed since 2026-07-14a are re-verified in full detail below (Sections M, O, plus governance touchpoints in J, K, Q). Unchanged rows are marked **carry-forward** and reference the prior report row for evidence.

**Rubric:** PASS = implementation exists AND is enforced. PARTIAL = surface exists but enforcement is soft or scope is incomplete. MISSING = no backing code/table/policy.

**Totals: 152 PASS / 35 PARTIAL / 0 MISSING out of 187.**

---

## A. Conversational Intake — 8 PASS / 4 PARTIAL / 0 MISSING

All 12 rows **carry-forward** from 2026-07-14a §A. Nothing in M11/M12 changed the intake surface.

## B. Automatic Understanding — 10 PASS / 2 PARTIAL / 0 MISSING

All 12 rows **carry-forward** from 2026-07-14a §B.

## C. Captain & Specialist Agents — 8 PASS / 4 PARTIAL / 0 MISSING

All 12 rows **carry-forward** from 2026-07-14a §C. Note: "An agent cannot approve its own work" (C9) remains PASS and is reinforced by M11/M12 landings (see J1 below).

## D. Understanding Readiness — 7 PASS / 1 PARTIAL / 0 MISSING

**Carry-forward.**

## E. Generative Business Roadmap — 12 PASS / 2 PARTIAL / 0 MISSING

**Carry-forward.**

## F. Multi-Solution & Project Decomposition — 6 PASS / 3 PARTIAL / 0 MISSING

**Carry-forward.** F7 (cross-project impact automation) remains PARTIAL — flagged in the summary as a top follow-up.

## G. Mockups, Plans, Specifications — 9 PASS / 2 PARTIAL / 0 MISSING

**Carry-forward.**

## H. Controlled Build & Execution — 11 PASS / 1 PARTIAL / 0 MISSING

**Carry-forward.** H9 (cost-overrun auto-pause) remains PARTIAL.

## I. QA & Evidence — 12 PASS / 2 PARTIAL / 0 MISSING

**Carry-forward.**

## J. Approvals & Governance — 9 PASS / 1 PARTIAL / 0 MISSING

Re-verified rows (M11/M12 introduce new approval paths):

- **J1 — Separate approval gates for Point A, B, roadmap, scope, investment, timeline, specs, implementation, QA, delivery.** **PASS.** Existing gates carry forward. Two new gates added by this refresh:
  - Engine workflow change (M11): `engine_review_items.item_type = 'engine_workflow_change'`, applied by `applyApprovedEngineWorkflowChange` in `src/lib/engine-learning-loop.functions.ts`.
  - Milestone → engine promotion (M12): `engine_review_items.item_type = 'engine_promotion'`, applied by `approveEnginePromotion` in `src/lib/engine-milestone-promotion.functions.ts:295`.
- **J9 — Sacred actions remain protected from unauthorized users.** **PASS.** M11/M12 handlers gate every mutation through `assertStaff` (`src/lib/engine-milestone-promotion.functions.ts:32-37`) and the DB layer `engine_business_engines_no_self_approve` trigger blocks self-approval even if code is bypassed. Verified in delta smoke §1.
- **J10 — No internal artifact reaches the client simply because it exists.** **PASS carry-forward** — draft engines and learning proposals live in staff-only tables; portal grants unchanged.

Remaining PARTIAL (carry-forward): J-approval-conditions coverage across every artifact type.

## K. Project Spine, Versioning, Drift — 9 PASS / 1 PARTIAL / 0 MISSING

Re-verified:

- **K5 — Every change includes its author, reason, approval, and downstream impact.** **PASS.** M11 workflow changes write before/after `workflow` snapshots + reason to `engine_audit_log` (`src/lib/engine-learning-loop.functions.ts:400-425`). M12 promotion writes `engine.promotion.proposed/approved/rejected` audit rows with `old_value`/`new_value` on the status transition (`src/lib/engine-milestone-promotion.functions.ts:338-354`).
- Other K rows **carry-forward.**

## L. Client Portal — 11 PASS / 1 PARTIAL / 0 MISSING

**Carry-forward.** Draft engines and learning-loop proposals never surface to portal (staff-only tables, no portal join).

## M. Business Engines & Founder Consistency — 8 PASS / 4 PARTIAL / 0 MISSING

Full re-score:

- **M1 — Recurring business need → operating engine.** PASS. `engine_business_engines` table + `activate_business_engine` RPC. Carry-forward.
- **M2 — Engine has outcome, workflow, cadence, owner, triggers, approvals, metrics, exception rules.** PASS. Schema confirmed in prior smoke §6.
- **M3 — Content Authority Engine template.** PARTIAL. Schema supports; template not seeded.
- **M4 — Lead Follow-Up Engine template.** PARTIAL. Same.
- **M5 — Review & Reputation Engine template.** PARTIAL.
- **M6 — Client Success Engine template.** PARTIAL.
- **M7 — Founder Operating Rhythm.** PASS. `cadence` + `cron_expression` + `next_run_at`. Carry-forward.
- **M8 — Recurring engines prepare work automatically while preserving human approval where required.** PASS. `engine_business_engines_gate` + `approval_rules` jsonb. Carry-forward.
- **M9 — Detects missed cycles and inconsistency.** PASS. `missed_cycles int` counter + `engine_business_engine_exceptions`. Carry-forward.
- **M10 — Surfaces only exceptions instead of burying founders in recurring tasks.** PASS. `engine_business_engine_exceptions` feeds review queue. Carry-forward.
- **M11 — Each engine learns from results and improves future recommendations.** **PASS (new).** `src/lib/engine-learning-loop.functions.ts` reads recent `engine_business_engine_runs`, computes success/failure/partial rates and trend deltas, and emits workflow-diff proposals via `engine_project_chat_proposals` + `engine_review_items` (`item_type = 'engine_workflow_change'`). `applyApprovedEngineWorkflowChange` writes the diff to `engine_business_engines.workflow` and audits before/after. Separate-approver enforced. Admin surface at `src/routes/admin.engine-learning.tsx`. Prior status: MISSING.
- **M12 — Roadmap can evolve from "build this asset" into "operate this capability consistently".** **PASS (new).** `src/lib/engine-milestone-promotion.functions.ts` lists eligible operational milestones (`listPromotionCandidates`), creates a draft engine linked via `engine_business_engines.milestone_id` (`proposeEnginePromotion`), and activates via `activate_business_engine` RPC only through `approveEnginePromotion`. Separate-approver enforced in code (line 320-323) AND by the DB trigger `engine_business_engines_no_self_approve` (verified in delta smoke §1). `rejectEnginePromotion` archives the draft. All three paths write `engine_audit_log` + `engine_activity` rows. Admin surface at `src/routes/admin.engine-promotion.tsx`. Prior status: MISSING.

## N. Delivery & Stage Transitions — 8 PASS / 0 PARTIAL / 0 MISSING

**Carry-forward.**

## O. Outcome Feedback & Continuous Learning — 7 PASS / 3 PARTIAL / 0 MISSING

Re-verified:

- **O5 — Identifies what worked, what failed, and what should change.** PASS (strengthened). The engine learning loop (`analyzeEnginePerformance` in `src/lib/engine-learning-loop.functions.ts`) is a concrete "what worked / what failed / what should change" pattern at the engine level. Roadmap-level 30/60/90 outcome deltas remain carry-forward.
- **O6 — Captain can recommend roadmap adjustments based on real results.** PASS.
- **O7 — New recommendations require approval before altering the roadmap.** PASS — reinforced. M11 explicitly routes every workflow diff through `engine_review_items` before touching `engine_business_engines.workflow`.
- **O8 — Proven patterns improve future roadmap generation.** PARTIAL carry-forward — engine-level learning is now live (M11), but cross-project pattern lift into the roadmap generator is still soft.
- Remaining O rows carry-forward.

## P. Portfolio Scale & Exception Management — 8 PASS / 2 PARTIAL / 0 MISSING

**Carry-forward.**

## Q. Reliability, Security, Accountability — 9 PASS / 2 PARTIAL / 0 MISSING

Re-verified:

- **Q1 — Every action is auditable.** PASS. M11/M12 both write `engine_audit_log` on propose, approve, reject, and apply. Verified by grep (`engine.promotion.*`, `engine.learning.*`) and code review.
- **Q11 — No AI-generated output becomes official without passing the relevant governance rules.** **PASS (strongly reinforced).** M11 draft workflow diffs are inert until a separate approver applies them. M12 draft engines are inert (`status = 'draft'`) until `activate_business_engine` is called by a non-creator, enforced by both code and DB trigger. Delta smoke §1 confirms the trigger.
- Remaining Q rows carry-forward.

## Ultimate Confirmation

> Can you confirm the Roadmap Engine can receive a founder's messy reality, understand it responsibly, define the destination, generate the right path, design the required solutions, coordinate humans and AI to build them, prove the work, protect every decision, deliver it safely, and keep the business operating consistently after launch?

**PASS.** The last remaining gap — "keep the business operating consistently after launch" — is now covered by:

1. Business Engines with cadence, triggers, approvals, metrics, and exception rules (M1–M10).
2. **Engine learning loop (M11)** that turns run outcomes into governed workflow-diff proposals.
3. **Milestone → engine promotion (M12)** that turns delivered operational milestones into active engines only under separate-approver governance.

Every remaining item is PARTIAL, not MISSING. Ranked follow-ups are listed in the executive summary.
