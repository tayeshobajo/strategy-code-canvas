# Phase 4 Output — Multi-Solution Decomposition + Business Engines + Command Center (schema)

**Status:** MIGRATION APPLIED
**Completed:** 2026-07-13
**Scope:** Schema + governance triggers + `spine_points_approved` helper only. App layer (RPCs, routes, scheduler, smoke) is Phase 4B and will be built next.

## What landed

### New enums
- `milestone_solution_status` (`candidate|selected|deferred|rejected|superseded`)
- `business_engine_kind`, `business_engine_status`, `business_engine_cadence`
- `engine_run_status`
- `engine_exception_severity`, `engine_exception_status`

### New tables (all staff-only, RLS on, service_role full)
- `engine_milestone_solutions` — candidate solutions per milestone with assumptions, dependency arrays, evidence link arrays.
- `engine_business_engines` — recurring engines (workflow, cadence, triggers, approval rules, metrics, exception rules, lifecycle status).
- `engine_business_engine_runs` — immutable per-cycle run log (inputs/outputs/decisions/cost/latency/evidence), UNIQUE `(engine_id, cycle_key)`.
- `engine_business_engine_exceptions` — ranked Command Center feed (severity, urgency 0-100, impact 0-100, deadline, client_risk, next_action).

### Governance triggers
- `engine_solutions_single_selected` — promoting one solution to `selected` auto-supersedes the prior selection.
- `engine_solutions_no_self_approve`, `engine_business_engines_no_self_approve` — mirror Phase 9C (`agent:%` creator can’t self-approve).
- `engine_business_engines_gate`:
  - `→approved` hard-blocks on `internal_project_has_contradictions(project_id)`.
  - `→approved` requires **all** canonical Point A + Point B keys at `approved_truth` (universe pulled from `internal_spine_field_keys` — same source of truth as ceremony completion). Missing keys are enumerated in the raise message.
  - `→approved` requires `approved_by`; stamps `approved_at` if null.
  - `→active` requires `approved_at` AND non-empty `owner_email`.
- `engine_business_engine_runs_seal` — once `completed_at IS NOT NULL AND status IN ('completed','failed','skipped')`, further UPDATE raises.

### New helper
- `spine_points_approved(_project_id uuid) → jsonb` (SECURITY DEFINER, project-aware).
  Returns `{ready, point_a:{required,missing,approved}, point_b:{required,missing,approved}, has_active_contradictions}`.
  Access gate: engine staff OR active portal member on the mapped project. REVOKE PUBLIC, GRANT authenticated + service_role.

## Not in this migration (Phase 4B queue)

- SECURITY DEFINER RPCs: `propose_milestone_solution`, `select_milestone_solution`, `activate_business_engine`, `record_engine_run`, `open_engine_exception`, `resolve_engine_exception`, `get_command_center_exceptions`.
- Server functions and routes: solutions board, per-project engines page, admin Command Center.
- `/api/public/hooks/engine-tick` scheduler + pg_cron job.
- Smoke suite S1–S6.

## Notes
- Linter warnings after apply are pre-existing project-wide (search_path mutable, public-exec SECURITY DEFINER). All new functions in this migration set `search_path = public` and REVOKE PUBLIC on the one non-trigger helper.
- Engines never touch the client portal directly; portal publish still routes through `publish_portal_roadmap`. Engines emit proposals into `engine_project_chat_proposals` (wired in Phase 4B).
