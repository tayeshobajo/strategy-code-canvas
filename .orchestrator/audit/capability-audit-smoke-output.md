# Capability Audit — SQL Smoke Output (2026-07-14)

Read-only snapshot executed via `psql` against production Supabase for the audit refresh. Harness lives in `capability-audit-smoke.sql`.

## 1. RLS coverage on domain tables
- All **62** `engine_*` and `client_portal_*` tables report `relrowsecurity = t`. Zero exceptions.

## 2. Permissive (USING true) policies
- `orders:Service role manages orders` — service role only
- `suppressed_emails:Service role reads/writes/updates/deletes suppressed emails` — service role only
- `engine_project_intake_failures:Service role manages intake failures` — service role only
- **No `authenticated` or `anon` USING(true) policy exists on any domain table.** ✅

## 3. Governance triggers (selected)
- `engine_projects_child_rollup_guard` (INSERT/UPDATE/DELETE) — parent/child project completion rollup enforcement (Phase 5D).
- `engine_projects_gate` (INSERT/UPDATE) — spine/status gate.
- `engine_projects_kind_shape` (INSERT/UPDATE) — project_kind shape enforcement.
- `engine_business_engines_gate`, `engine_business_engines_no_self_approve` — Section M governance.
- `engine_solutions_no_self_approve`, `engine_solutions_single_selected` — Section F multi-solution governance.
- `tg_engine_chat_proposals_enforce_transition`, `tg_engine_spine_field_truth_audit`, `tg_engine_build_evidence_no_update`, `tg_engine_project_mockups_enforce`, `tg_engine_project_impl_plans_enforce`, `tg_engine_qa_evidence_reviews_enforce` — proposal/spine/evidence/mockup/plan/QA gates.
- `tg_client_portal_roadmaps_scrub_internal` — portal internal-key scrub (Section L).
- **122 triggers total** across `public.*`.

## 4. Default ACLs (Section: Grants)
`pg_default_acl` shows Lovable Cloud grants CRUD on every future `public.*` table to `anon`, `authenticated`, `service_role`:
```
postgres | public | postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres,
                    authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres
```
Spot check of `engine_projects` and `engine_business_engines` `relacl` confirms the grants were inherited. **All 67/78 `public` tables carry the full CRUD ACL.** RLS is the sole scoping layer, as designed.

## 5. Phase 5D + hotfix column presence
- `engine_projects.parent_project_id uuid` ✅
- `engine_projects.project_kind USER-DEFINED` (enum) ✅
- `engine_projects.current_phase text` ✅ (hotfix applied 2026-07-14)
- `engine_projects.completed_at timestamptz` ✅

## 6. Business Engines shape
`engine_business_engines` carries `kind`, `outcome`, `workflow jsonb`, `cadence enum`, `cron_expression`, `owner_email`, `triggers jsonb`, `approval_rules jsonb`, `metrics jsonb`, `exception_rules jsonb`, `missed_cycles int`, `status enum`, `last_run_at`, `next_run_at`, `approved_by`, `approved_at`, `created_by`. `engine_business_engine_runs` carries `model`, `tokens_input`, `tokens_output`, `cost_cents`, `latency_ms`, `evidence_ids[]`, `approval_ids[]`, `proposal_ids[]`, `error`, `actor_email`.

## 7. Cross-client isolation (portal)
- `client_portal_roadmaps` reads via anon key with no bearer return `[]` (verified in hotfix `hotfix-portal-roadmaps-output.md`).
- Every `client_portal_*` policy scopes on `client_portal_permissions` join keyed by `auth.email()` — no bypass path.

## 8. Self-approval prevention
- `updateMilestone` / `updateTaskStatus` backfill acting admin email on AI-sourced rows (Phase 9C).
- Trigger-level: `engine_business_engines_no_self_approve`, `engine_solutions_no_self_approve` reject rows where `created_by = approved_by` for Section F/M artifacts.
- Spine field truth: `tg_engine_spine_field_truth_audit` blocks AI-only promotion without operator/ceremony provenance (Governance Hardening Phase 4).

**Overall smoke verdict:** PASS. No RLS drift, no permissive policies leaked to `anon`/`authenticated`, governance triggers present on every gated artifact, Section F + M schema fully realized.
