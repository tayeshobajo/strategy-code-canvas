# Plan: Refresh Capability Audit (post M11 + M12)

The last audit (`.orchestrator/audit/capability-audit-2026-07-14.md`) scored 150 PASS / 35 PARTIAL / 2 MISSING, with the two MISSING items being:

- **M11** — engine-level learning loop
- **M12** — milestone → engine promotion

Both have since landed:

- `src/lib/engine-learning-loop.functions.ts` + `src/routes/admin.engine-learning.tsx` (phase output: `.orchestrator/phase-m11-engine-learning-output.md`)
- `src/lib/engine-milestone-promotion.functions.ts` + `src/routes/admin.engine-promotion.tsx` (phase output: `.orchestrator/phase-m12-engine-promotion-output.md`)

The user has re-pasted the full A–Q + Ultimate checklist. They want an updated, evidence-based confirmation for every item, reflecting the new landings.

## Deliverables (all read-only, under `.orchestrator/audit/`)

1. **`capability-audit-2026-07-14b.md`** — full refreshed scorecard. One row per checklist item with Status (PASS / PARTIAL / MISSING), Evidence (file:line, table, policy, trigger, or SQL result), and Gap (if any). Diff-focused against the prior report: only re-verify items touching Sections F, M, J, K, O, Q where M11/M12 changes propagate; carry forward unchanged rows with a "carry-forward" note pointing at the prior report row.
2. **`capability-audit-summary-2026-07-14b.md`** — updated section scorecard, Ultimate Confirmation verdict, and remaining PARTIALs ranked by blast radius. Explicitly re-scores M11 and M12 and updates Section M totals.
3. **`capability-audit-smoke-2026-07-14b.sql`** + **`capability-audit-smoke-2026-07-14b-output.md`** — small delta smoke harness: confirm `engine_business_engines_no_self_approve` still fires on promotion path, `engine_review_items` gains `engine_promotion` / `engine_workflow_change` types, no new permissive policies, promotion route reachable behind `assertStaff`.

## Method

- Codebase evidence via `rg` in `src/lib/**`, `src/routes/**`, `.orchestrator/phase-m1{1,2}-*.md`.
- DB evidence via `psql` (read-only): triggers, policies, grants on `engine_business_engines`, `engine_business_engine_runs`, `engine_review_items`, `engine_audit_log`.
- Scoring rules unchanged from prior audit (PASS requires implementation AND enforcement).

## Guardrails

- Read-only. No migrations, inserts, updates, deletes, deploys, or `BUILD_STATE.md` phase-status changes.
- Any newly-discovered required migration goes only into `.orchestrator/PENDING_MIGRATIONS.md` as a proposal.
- No source-file edits outside the four audit artifacts above.

## Expected outcome

Based on the landed code, expected result is **≈152 PASS / 35 PARTIAL / 0 MISSING**, moving the Ultimate Confirmation from PARTIAL → PASS on the "operate consistently after launch" clause. Remaining PARTIALs (e.g., cost-overrun auto-pause H9, cross-project impact automation F7, Business Engine templates M3–M6) will be listed as next candidate phases but not built in this pass.
