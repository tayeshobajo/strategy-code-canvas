# Phase H1 — Cost-Overrun Auto-Pause

Closes gap **H9** from `.orchestrator/audit/capability-audit-2026-07-14b.md`.

## What shipped

### App-side (this commit)

- `src/lib/engine-cost-guard.functions.ts`
  - `getCostGuardReport()` — MTD spend per project vs `agent_budget_monthly_cents`, ranked by risk (paused → over → warning → ok). Reads existing `engine_agent_costs` + `engine_projects`. NULL-safe against `cost_paused_at` / `cost_paused_reason` so it works both before and after the migration lands.
  - `resumeProjectAfterCostReview()` — staff-gated. Clears pause. **Separate-approver enforced**: resumer email must differ from the actor on the most recent `engine_agent_costs` row. Writes `engine_audit_log` (`project.cost.resume`) + `engine_activity`, and resolves any pending `cost_overrun` review items for the project.
- `src/routes/admin.cost-guard.tsx` — dashboard with summary cards, ranked project table, and resume form.
- `src/routes/admin.tsx` — nav entry (`DollarSign` icon).

### DB-side (NOT applied — awaiting Tai)

Migration proposal appended to `.orchestrator/PENDING_MIGRATIONS.md` under **"Phase H1 — Cost-Overrun Auto-Pause"**:

- Adds `engine_projects.cost_paused_at timestamptz` + `engine_projects.cost_paused_reason text` + a partial index.
- Creates `tg_engine_agent_costs_cap_guard()` (SECURITY DEFINER, `search_path = public`) and an AFTER-INSERT trigger on `engine_agent_costs` that:
  - Recomputes MTD spend for the project.
  - If `spend > agent_budget_monthly_cents` AND not already paused AND budget > 0: sets `cost_paused_at`, inserts a `cost_overrun` `engine_review_items` row (`impact='high'`, `source='cost_guard_auto'`), inserts an `engine_audit_log` row (`action='project.cost.autopause'`).
- Does **not** modify the `engine_project_status` enum. Pause is expressed by `cost_paused_at IS NOT NULL`; existing readers keep working.

Preflight query is in the migration proposal to check for projects already over budget before applying.

## Governance guarantees

- No AI can auto-pause AND then auto-resume — resume is staff-only via `assertStaff` + separate-approver check.
- Trigger uses `SECURITY DEFINER` with fixed `search_path = public` (matches `tg_engine_business_engines_gate` pattern from the governance-hardening phase).
- Audit trail: every auto-pause emits `engine_audit_log` + `engine_review_items`; every resume emits `engine_audit_log` + `engine_activity`.

## Verification (post-migration)

1. `\d public.engine_projects` shows both new columns.
2. `SELECT trigger_name FROM information_schema.triggers WHERE trigger_name='engine_agent_costs_cap_guard'` returns one row.
3. Insert a synthetic `engine_agent_costs` row that pushes a test project over its budget; confirm:
   - `engine_projects.cost_paused_at` populated
   - One `engine_review_items` row with `item_type='cost_overrun'`, `impact='high'`, `source='cost_guard_auto'`
   - One `engine_audit_log` row with `action='project.cost.autopause'`
4. From `/admin/cost-guard`, resume the paused project as a different staff email; confirm columns clear, audit + activity rows written, review items marked `resolved`.

## Files

- created `src/lib/engine-cost-guard.functions.ts`
- created `src/routes/admin.cost-guard.tsx`
- edited `src/routes/admin.tsx` (nav + icon)
- edited `.orchestrator/PENDING_MIGRATIONS.md` (H1 proposal)

Typecheck: PASS (`bunx tsgo --noEmit` clean).
