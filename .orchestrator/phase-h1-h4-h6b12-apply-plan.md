# Combined Apply Plan — H1 + H4 + H6·B12

**Date:** 2026-07-14
**Owner:** Tai (human review + apply)
**Author:** Captain
**Status:** DRAFT — awaiting Tai approval

## Scope

Three independent, app-complete migrations whose DB halves are still
pending. J4 and I11 are already APPLIED and are **not** part of this plan.

| # | Phase | What it adds | App-side already shipped |
|---|---|---|---|
| 1 | **H1** | `engine_projects.cost_paused_at/reason` + `tg_engine_agent_costs_cap_guard` AFTER-INSERT trigger | `engine-cost-guard.functions.ts`, `/admin/cost-guard` |
| 2 | **H6 · B12** | `begin_proposal_apply()`, `apply_approved_proposal(uuid)`, `admin_edit_milestone_governed(uuid, jsonb)`, 2 governance triggers on milestones + implementation plans | Proposal apply path uses the new RPC |
| 3 | **H4** | pg_cron job `outcome-checkins-daily` (09:00 UTC) posting to `/api/public/hooks/outcome-checkins` | `engine-outcome-scheduler.functions.ts`, public hook, `/admin/outcome-scheduler` |

## Recommended apply order

Rationale: apply the **least entangled** migration first, then the one that
changes write paths, then the scheduler that depends on the app already
being deployed.

1. **H1 — Cost-Overrun Auto-Pause** *(lowest blast radius: two nullable
   columns + one trigger on an insert-only table)*
2. **H6 · B12 — Non-spine proposal enforcement** *(changes UPDATE
   semantics on `engine_milestones` and `engine_project_implementation_plans`;
   requires the caller audit below)*
3. **H4 — Outcome scheduler pg_cron job** *(pure cron registration; no
   schema; safe last)*

Each step is a separate migration file so a failure in one does not
require rolling back the others.

## Pre-apply checklist (all three)

- [ ] Latest app is deployed to production (H1 UI, B12 apply RPC caller,
      H4 public hook all live).
- [ ] `SUPABASE_PUBLISHABLE_KEY` value is available to paste into the H4
      cron body (do NOT commit the value; substitute at apply time).
- [ ] `.env` / secrets unchanged in the last 24h (no key rotation mid-apply).

### H1-specific

- [ ] Run preflight #3 from the H1 section of `PENDING_MIGRATIONS.md` —
      snapshot projects already over budget. Decide per project:
      raise the budget, pause manually first, or accept immediate
      auto-pause on next cost insert.
- [ ] Confirm no other trigger on `engine_agent_costs` mutates
      `engine_projects` (would double-write).

### B12-specific — caller audit (blocking)

Grep the app for every direct UPDATE on the governed columns. After apply,
any un-migrated caller will start throwing `Milestone body edits ... must
go through an approved chat proposal ...`.

```bash
rg -n "engine_milestones" src/ | rg -n "brief_md|acceptance_criteria|developer_prompt|client_safe_md"
rg -n "engine_project_implementation_plans" src/ | rg -n "\.update\(|summary|payload"
```

Every hit must either:
- go through `supabase.rpc('apply_approved_proposal', ...)`, or
- go through `supabase.rpc('admin_edit_milestone_governed', ...)` for
  admin-driven draft edits, or
- be inside a transaction that first calls `begin_proposal_apply()`.

Confirm `applyApprovedProposal()` in `src/lib/engine-execution.functions.ts`
(or wherever it lives) calls the RPC — not a raw `.update()`.

### H4-specific

- [ ] `pg_cron` and `pg_net` extensions enabled in the project (one-time).
- [ ] Public hook responds 200 to a manual POST with the `apikey` header:
      ```
      curl -X POST https://project--b3555ed3-b0dc-4def-8fee-77ff34a2cb82.lovable.app/api/public/hooks/outcome-checkins \
        -H "Content-Type: application/json" \
        -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -d '{}'
      ```

## Apply steps

For each migration, use the `supabase--migration` tool with the exact SQL
already in `.orchestrator/PENDING_MIGRATIONS.md` under its section.
**Do not combine — one migration per phase** so rollback is granular.

1. Apply H1 SQL block (columns + trigger function + trigger).
2. Wait for the linter output; if any new WARN references H1 objects,
   stop and triage before proceeding.
3. Apply B12 SQL block (5 functions + 2 triggers, in the order in the
   PENDING file).
4. Wait for linter; ensure no WARN on `apply_approved_proposal` search
   path or `admin_edit_milestone_governed`.
5. Apply H4 SQL block (extensions + `cron.schedule`). Substitute
   `REPLACE_WITH_PUBLISHABLE_KEY` with the real key BEFORE submitting.

## Verification (post-apply, in order)

### H1
```sql
SELECT trigger_name FROM information_schema.triggers
 WHERE trigger_name = 'engine_agent_costs_cap_guard';  -- 1 row

SELECT column_name FROM information_schema.columns
 WHERE table_name='engine_projects'
   AND column_name IN ('cost_paused_at','cost_paused_reason'); -- 2 rows
```
Then in `/admin/cost-guard`: pick a low-budget test project, insert a
synthetic `engine_agent_costs` row that pushes MTD over the cap, confirm:
- `cost_paused_at` populated,
- one `engine_review_items` row with `item_type='cost_overrun'`,
- one `engine_audit_log` row with `action='project.cost.autopause'`.

Resume via `/admin/cost-guard` **as a different staff email** than the
cost row's `actor_email`; confirm columns clear and audit + activity rows
are written; the resume must fail if the same email tries.

### B12
```sql
-- Should RAISE (direct write, no GUC):
UPDATE public.engine_milestones SET brief_md = brief_md || ' x'
 WHERE id = '<real-milestone-id>';

-- Should succeed atomically via the RPC:
SELECT public.apply_approved_proposal('<approved-proposal-uuid>');
```
Then in the app: open a non-spine proposal, approve it via the chat UI,
confirm the target milestone body updates and an `engine_activity`
`proposal.applied` row appears.

### H4
```sql
SELECT jobname, schedule, active FROM cron.job
 WHERE jobname = 'outcome-checkins-daily';  -- 1 row, active=t

-- After the first 09:00 UTC tick:
SELECT status, return_message, start_time
  FROM cron.job_run_details
 WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname='outcome-checkins-daily')
 ORDER BY start_time DESC LIMIT 5;  -- expect status='succeeded'

SELECT COUNT(*) FROM public.engine_review_items
 WHERE item_type = 'outcome_checkin'
   AND created_at > now() - interval '1 day';
```

## Rollback (per migration)

- **H1:** `DROP TRIGGER engine_agent_costs_cap_guard ON public.engine_agent_costs;
  DROP FUNCTION public.tg_engine_agent_costs_cap_guard();
  ALTER TABLE public.engine_projects DROP COLUMN cost_paused_at, DROP COLUMN cost_paused_reason;`
- **B12:** drop the two triggers, then
  `DROP FUNCTION apply_approved_proposal(uuid), begin_proposal_apply(),
  admin_edit_milestone_governed(uuid, jsonb),
  tg_engine_milestones_require_proposal(),
  tg_engine_impl_plans_require_proposal();`
- **H4:** `SELECT cron.unschedule('outcome-checkins-daily');`

## Non-goals

- Not applied here: Phase 4 main schema pack (`engine_milestone_solutions`,
  `engine_business_engines`, runs, exceptions). Larger and needs its own
  review pass.
- Not applied here: J4 or I11 — already APPLIED 2026-07-14.
- Not applied here: any changes to the `engine_project_status` enum.

## Deliverables after apply

- `.orchestrator/phase-h1-apply-output.md`
- `.orchestrator/phase-h6-b12-apply-output.md`
- `.orchestrator/phase-h4-apply-output.md`

Each captures: preflight snapshot, apply timestamp, linter output,
verification query results, and any anomalies.
