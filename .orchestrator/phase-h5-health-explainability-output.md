# Phase H5 — Health Explainability

**Status:** ✅ Complete. No schema changes.

## What shipped

- `src/lib/engine-health-explainer.functions.ts`
  - `explainProjectHealth({ projectId })` — aggregates open review items, business-engine exceptions, cost-pause state, family-impact blockers, recent high/critical audit events
  - `explainEngineHealth({ engineId })` — engine-scoped exceptions
  - Ranked by severity weight (critical=40, high=25, medium=12, low=5, info=1); verdict `healthy | at_risk | blocked | unknown`
  - Each driver includes an `evidenceRef` (table + id) so admins can jump to source
- `src/components/HealthExplainerPanel.tsx` — reusable driver list panel with severity chips + evidence refs
- `src/routes/admin.health-explainer.tsx` — picker: enter a project or engine ID, see ranked drivers
- Admin nav entry ("Health explainer") in `src/routes/admin.tsx`

## Verdict rules

- Any critical driver, cost-pause, or family-impact blocker → `blocked`
- Score ≥ 25 → `at_risk`
- Otherwise → `healthy`

## Integration points available

`HealthExplainerPanel` is a plain component ready to drop onto:
- project detail headers (`src/routes/engine/$projectId/*`)
- portfolio dashboards

Not auto-mounted this phase to keep the change focused on the admin surface. Follow-up integration is trivial (`<HealthExplainerPanel explanation={...} />`).

## Guardrails

- Staff-gated (operator or admin role required).
- Read-only server fn — no state changes.
- No schema changes.
