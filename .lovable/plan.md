## Hardening Sprint Plan — Post-Ultimate-Confirmation

Core capability is proven (152 PASS / 35 PARTIAL / 0 MISSING). No new core phases. Five hardening sprints, ranked by blast radius. Each is independently shippable and touches only the surfaces named.

### Sprint H1 — Cost-overrun auto-pause (closes H9)

**Why first:** silent spend is the highest-severity remaining risk. Everything else is UX or coverage.

**Build:**
- Migration proposal → `.orchestrator/PENDING_MIGRATIONS.md`:
  - `engine_projects.cost_cap_usd numeric`, `cost_paused_at timestamptz`, `cost_paused_reason text`
  - Trigger `engine_agent_costs_cap_guard` on `engine_agent_costs` insert: if `SUM(cost_usd) per project > cost_cap_usd`, set project `status='paused'`, write `engine_audit_log` row `project.cost.autopause`, insert `engine_review_items` (`item_type='cost_overrun'`) for staff.
- Server fn `resumeProjectAfterCostReview` in `src/lib/engine-cost-guard.functions.ts` — staff-gated, requires reviewer ≠ last cost committer, clears pause + audits.
- Admin surface at `src/routes/admin.cost-guard.tsx` — list of paused projects, per-project spend breakdown, resume action.
- Phase output → `.orchestrator/phase-h9-cost-autopause-output.md`.

### Sprint H2 — Cross-project impact automation (closes F7)

**Build:**
- Server fn `emitFamilyImpactReviews` in `src/lib/engine-family-impact.functions.ts`. Triggered from existing status-change hooks on `engine_projects` and `engine_milestones`.
- For each sibling/parent/child linked via `parent_project_id` and `engine_milestone_solutions`, insert `engine_review_items` (`item_type='family_impact'`) with `old_value`/`new_value` snapshot + affected node list.
- Extend `FamilyDependencyGraph.tsx` with a "pending impact reviews" badge per node (read-only additive prop, no layout change).
- No schema migration needed — uses existing tables.
- Phase output → `.orchestrator/phase-f7-family-impact-output.md`.

### Sprint H3 — Business Engine templates (closes M3–M6)

**Build:** Migration proposal seeding four `engine_business_engines` template rows (`status='template'`, `project_id=NULL`) → `.orchestrator/PENDING_MIGRATIONS.md`:
- Content Authority Engine (weekly cadence, publish workflow, review gate)
- Lead Follow-Up Engine (event-triggered, 24h/72h/7d cadence, escalation rule)
- Review & Reputation Engine (post-delivery trigger, response-time SLA)
- Client Success Engine (monthly cadence, health-score metric, at-risk exception)

Each template: `outcome`, `workflow` jsonb, `cadence`, `cron_expression`, `approval_rules`, `metrics`, `exception_rules`. Admin route `src/routes/admin.engine-templates.tsx` adds a "clone template into project" action calling existing `activate_business_engine` RPC after a separate-approver gate. Phase output → `.orchestrator/phase-m3-m6-templates-output.md`.

### Sprint H4 — Outcome feedback scheduler coverage (closes O partials)

**Build:**
- `pg_cron` job `outcome_checkins_scheduler` (per `schedule-jobs-options`, `apikey` header pattern) hitting `/api/public/hooks/outcome-checkins`.
- Route `src/routes/api/public/hooks/outcome-checkins.ts` scans `engine_projects` where `status='delivered'` and computes 30/60/90d elapsed windows, emitting `engine_review_items` (`item_type='outcome_checkin'`) with the delta pattern used in M11.
- Migration proposal for cron job → `.orchestrator/PENDING_MIGRATIONS.md`.
- Phase output → `.orchestrator/phase-o-outcome-coverage-output.md`.

### Sprint H5 — Portfolio health explainability (closes P9)

**Build:** UI-only. Extend the portfolio dashboard (existing at `src/routes/ops/*` or admin surface — confirm during build) with a per-project "why this status" panel: renders reason codes from `engine_review_items`, `engine_business_engine_exceptions`, `engine_audit_log` (last 5 status-changing rows), and any active `cost_paused_reason` from H1. No schema changes. Phase output → `.orchestrator/phase-p9-health-explainability-output.md`.

### Guardrails (all sprints)

- Any DDL goes only to `.orchestrator/PENDING_MIGRATIONS.md`. No auto-applied migrations.
- No AI-approves-own-work paths. All new gates enforce separate-approver in code AND rely on existing DB triggers where applicable.
- No portal-facing surface changes without an explicit approval gate.
- Every sprint ends with: phase output file + `BUILD_STATE.md` append + typecheck clean.

### Sequencing

Ship H1 first (risk). H2 and H3 can run in parallel after H1 (independent surfaces). H4 depends on H3 templates existing. H5 last (consumes signals from H1–H4).

### Technical notes

- H1 trigger uses the same `SECURITY DEFINER` pattern as `engine_business_engines_gate` — verify with `has_role(auth.uid(), 'admin')` for resume.
- H2 avoids infinite loops by tagging emitted review items with `source='family_impact_auto'` and skipping re-emission when the triggering change itself came from a `family_impact` approval.
- H4 uses the documented `apikey` header pattern from `schedule-jobs-options`, not a custom `CRON_SECRET`.
