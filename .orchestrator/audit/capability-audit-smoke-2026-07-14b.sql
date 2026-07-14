-- Delta smoke harness for M11 + M12 landings (2026-07-14b)
-- Read-only. Confirms governance surface for engine learning loop and
-- milestone → engine promotion is intact.

-- 1. Self-approval trigger still present on engine_business_engines
SELECT tgname
FROM pg_trigger
WHERE tgrelid = 'public.engine_business_engines'::regclass
  AND tgname = 'engine_business_engines_no_self_approve'
  AND NOT tgisinternal;

-- 2. Policies on engine_business_engines are staff-only, not permissive
SELECT polname, polroles::regrole[], polcmd
FROM pg_policy
WHERE polrelid = 'public.engine_business_engines'::regclass;

-- 3. engine_review_items.item_type is free-form text (accepts the new
--    'engine_promotion' and 'engine_workflow_change' values without a schema
--    migration).
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'engine_review_items'
  AND column_name IN ('item_type', 'source', 'status');

-- 4. No permissive USING(true) policy has been added for anon/authenticated
--    on the engine_* surface touched by M11/M12.
SELECT c.relname, p.polname, p.polroles::regrole[]
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
WHERE c.relname IN (
    'engine_business_engines',
    'engine_business_engine_runs',
    'engine_review_items',
    'engine_audit_log',
    'engine_activity'
  )
  AND pg_get_expr(p.polqual, p.polrelid) = 'true'
  AND p.polroles::regrole[] && ARRAY['anon'::regrole, 'authenticated'::regrole];

-- 5. Activation RPC exists and is SECURITY DEFINER
SELECT proname, prosecdef
FROM pg_proc
WHERE proname = 'activate_business_engine';
