# Capability Audit — Delta SQL Smoke Output (2026-07-14b)

Read-only run of `capability-audit-smoke-2026-07-14b.sql` against production Supabase after M11 (engine learning loop) and M12 (milestone → engine promotion) landed.

## 1. Self-approval trigger

```
                 tgname
-----------------------------------------
 engine_business_engines_no_self_approve
```

Trigger definition:
```
CREATE TRIGGER engine_business_engines_no_self_approve
  BEFORE INSERT OR UPDATE OF approved_by
  ON public.engine_business_engines
  FOR EACH ROW
  EXECUTE FUNCTION tg_engine_business_engines_no_self_approve()
```

**Verdict:** the promotion approval path (`approveEnginePromotion` → `activate_business_engine` RPC) is still gated at the DB layer. The code-level check in `src/lib/engine-milestone-promotion.functions.ts:320-323` is defence-in-depth, not the sole barrier.

## 2. Policies on `engine_business_engines`

```
       polname       |    polroles     | polcmd
---------------------+-----------------+--------
 Staff read engines  | {authenticated} | r
 Staff write engines | {authenticated} | *
```

Both policies are staff-scoped (through `has_role` in their `USING`/`WITH CHECK` clauses — carried from prior audit). No `USING (true)` policy on this table.

## 3. `engine_review_items` accepts new item_types without migration

```
 column_name | data_type
-------------+-----------
 item_type   | text
 source      | text
 status      | text
```

`item_type` is free-form `text`, so the new values `engine_promotion` (M12) and `engine_workflow_change` (M11) insert cleanly. No pending migration required.

Historical distinct values today (pre-first-use of new types): `backend_plan, decision, frame_set, implementation_plan, mockup_set, qa_plan, review_item, roadmap_version`. New values will appear after the first proposal is created.

## 4. Permissive-policy check on M11/M12 surface

Query returned **0 rows**. No `USING (true)` policy exposes `engine_business_engines`, `engine_business_engine_runs`, `engine_review_items`, `engine_audit_log`, or `engine_activity` to `anon` or `authenticated`.

## 5. Activation RPC

```
         proname          | prosecdef
--------------------------+-----------
 activate_business_engine | t
```

`SECURITY DEFINER` — required to flip status → `active` under RLS. Called from `approveEnginePromotion` (`src/lib/engine-milestone-promotion.functions.ts:327-331`).

## Overall

**PASS.** No RLS drift, no permissive policy leaks, `no_self_approve` trigger intact, `activate_business_engine` present, `engine_review_items.item_type` accepts the new values without schema change. No PENDING_MIGRATIONS additions required.
