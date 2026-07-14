# Phase M11 — Engine Learning Loop (COMPLETE)

**Closes audit gap M11** — successful and failed outcomes now continuously update future recommendations, with full evidence tracking, via existing governance rails.

## What was built

Two server function modules + one admin route, all reading `engine_business_engine_runs` and writing through existing governance tables. **No schema migrations.**

### Files
- `src/lib/engine-learning-loop.functions.ts`
- `src/routes/admin.engine-learning.tsx`
- Nav entry added in `src/routes/admin.tsx` (icon: Brain)

### Server functions
| Fn | Role |
|---|---|
| `analyzeEngineLearning({windowRuns})` | Read-only. Per active engine, computes total/success/failed/partial runs, success rate, avg latency/cost, first-half vs second-half trend (improving/degrading/stable), and a suggested `WorkflowDiff` when thresholds trip. |
| `proposeEngineWorkflowChange({engineId, reason, diff, supportingRunIds})` | Writes a proposal into `engine_project_chat_proposals` (type `implementation_prompt`, payload carries `engine_id`, `current_workflow`, `workflow_diff`, `supporting_run_ids`, `proposed_by`), mirrors an entry into `engine_review_items` (`item_type = engine_workflow_change`), and logs the proposal to `engine_audit_log` + `engine_activity`. |
| `applyApprovedEngineWorkflowChange({proposalId, approverEmail})` | Applies the diff to `engine_business_engines.workflow`. Enforces `approverEmail == caller` AND `approver ≠ proposer` (self-approval blocked). Writes before/after snapshot to `engine_audit_log` (`field_changed = 'workflow'`, `old_value`, `new_value`), marks the proposal `converted`, and posts to `engine_activity`. |

### Suggestion rules (`suggestDiff`)
- `failedRuns ≥ 3` AND `successRate < 0.5` → `add_guard` (insert preflight step at index 0)
- `trend == 'degrading'` AND `successRate < 0.75` → `add_review_step` (append human-review step)
- `trend == 'improving'` AND `successRate ≥ 0.9` → advisory `note` (cadence-widen candidate)
- Otherwise no diff; recommendation string only

## Evidence trail (per proposal → application)
1. `engine_project_chat_proposals` row — payload includes `supporting_run_ids` linking back to specific `engine_business_engine_runs` rows.
2. `engine_review_items` mirror — surfaces in the Approvals Queue.
3. `engine_audit_log` — one row on propose, one row on apply. Apply row carries the full before/after workflow JSON as `old_value` / `new_value` and the diff in `metadata`.
4. `engine_activity` — human-facing timeline entries at both stages.
5. `engine_project_chat_proposals.converted_ref` — final application record with `applied_by` + `applied_at`.

## Guardrails observed
- `assertStaff` on every fn (operator/admin only).
- Learning code never mutates an engine directly — always emits a proposal.
- Self-approval blocked in code AND relies on existing DB trigger `engine_business_engines_no_self_approve` for any status change side effects.
- No new tables. Zero migrations.

## How to verify (post-deploy)
1. Sign in as staff, open `/admin/engine-learning`.
2. Confirm the table renders (empty state OK — no engines yet in DB).
3. Once at least one active engine exists with ≥3 runs, click "Propose change" on a signal with a suggested diff → confirm rows land in `engine_project_chat_proposals`, `engine_review_items`, `engine_audit_log`, `engine_activity`.
4. As a **different** staff email, paste the proposal ID + your email → click "Apply change". Confirm the workflow updates on the engine and audit rows appear.
5. Attempt to apply as the same email that proposed → expect explicit "Self-approval forbidden" error.

## Non-goals
- No auto-application. Every diff requires human approval.
- No auto-schedule adjustment. Cadence changes are advisory only (marked `note`).
- No new tables or migrations.

## Follow-ups (optional)
- Once real engine runs accumulate, extend `suggestDiff` with cost-overrun and latency-regression rules.
- Consider surfacing `analyzeEngineLearning` output in the per-project engine detail page as a "Learning" panel.
