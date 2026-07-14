# Phase H6 — Governance & AI safety edges

**Sprint:** H6 of H6→H10 partial-closure plan (`.lovable/plan.md`).
**Scope:** 5 PARTIAL items — B12, J4, Q7, I11, K8.
**Status:** App-side shipped. DB changes proposed in `.orchestrator/PENDING_MIGRATIONS.md` (Phase H6 · B12, J4, I11). Zero migrations applied autonomously.

## Delivered

- **B12 — Non-spine proposal enforcement.** Trigger + GUC pattern proposed for milestone body / plan body edits so any material update flows through `engine_project_chat_proposals`. Migration only; no code paths currently bypass. Follow-up commit will set `SET LOCAL engine.proposal_apply='on'` inside `applyApprovedProposal()` before the migration is applied.
- **J4 — Universal impact panel.** `src/components/ProposalImpactPanel.tsx` renders standardised `{scope, budgetDelta, timelineDelta, dependencies, clientExpectations, reversibility, risks}` for every proposal type. `deriveImpactSummary()` helper backfills a safe payload from existing rows until the `impact_summary` column lands (proposed).
- **Q7 — Explicit model scoring.** `src/lib/engine-model-scoring.ts` — scores models across quality / privacy / cost / reliability / availability with per-task weights. `selectionAuditPayload()` is the standard shape written to `engine_agent_costs.metadata.model_selection` (existing jsonb column, no schema change).
- **I11 — Risk-scored approvals queue.** `src/lib/engine-review-risk-score.ts` — pure function shared between app-side sort and the DB trigger (proposed migration mirrors the exact formula). Formula: `clamp(impact*0.4 + urgency*0.4 + deadline*0.2 + client_risk_boost)`.
- **K8 — Root-cause causality graph.** `src/lib/engine-drift-causality.functions.ts` clusters open review items + spine audit rows + engine exceptions per project and emits causal edges (spine change → downstream item within same project, sequential milestone review items). Rendered on `/admin/drift-detection` under a new "Root-Cause Clusters" section.

## Guardrails observed

- No autonomous migrations. Every DDL in this sprint is written to PENDING_MIGRATIONS.md for Tai to review.
- No AI approves own work — new drift-causality reader is read-only, no mutations.
- Staff-only server functions gated with the same `assertStaff` pattern as prior hardening sprints.
- Type-safe: new modules use existing project types + `z` for input validation.

## Files

Created:
- `src/lib/engine-review-risk-score.ts`
- `src/lib/engine-model-scoring.ts`
- `src/lib/engine-drift-causality.functions.ts`
- `src/components/ProposalImpactPanel.tsx`

Edited:
- `src/routes/admin.drift-detection.tsx` (adds Root-Cause Clusters section)
- `.orchestrator/PENDING_MIGRATIONS.md` (three new Phase H6 sections)
- `.orchestrator/BUILD_STATE.md` (H6 row)

## Next

H7 — Intake & Understanding (A8 transcript pipeline, A9 optional-pill polish, A12 hard review gate, B10 gap-analyzer → agent tasks).
