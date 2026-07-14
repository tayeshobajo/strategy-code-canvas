-- Capability audit smoke harness (2026-07-14). Read-only.
-- Executed via psql against production Supabase.

-- 1. RLS on every public engine_/client_portal_ table
SELECT c.relname, c.relrowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
  AND (c.relname LIKE 'engine\_%' ESCAPE '\' OR c.relname LIKE 'client\_portal\_%' ESCAPE '\')
ORDER BY 1;

-- 2. Permissive (USING true) policies — expect only service-role rows
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname='public' AND (qual='true' OR with_check='true');

-- 3. Triggers per table (self-approve, gates, roll-ups, scrub)
SELECT event_object_table, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema='public'
ORDER BY 1,2;

-- 4. Governance functions
SELECT routine_name, security_type
FROM information_schema.routines
WHERE routine_schema='public' AND routine_type='FUNCTION'
ORDER BY 1;

-- 5. Constraints (self-approve, roll-ups, kind shape)
SELECT conname, conrelid::regclass, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE connamespace='public'::regnamespace AND contype IN ('c','u','x')
ORDER BY conrelid::regclass::text, conname;

-- 6. Default ACLs on public — should grant CRUD to anon/auth/service_role
SELECT defaclrole::regrole::text, defaclnamespace::regnamespace::text, defaclacl::text
FROM pg_default_acl WHERE defaclnamespace='public'::regnamespace;

-- 7. Multi-solution + family (Section F / Phase 5D) column presence
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='engine_projects'
  AND column_name IN ('parent_project_id','project_kind','current_phase','completed_at');

-- 8. Business Engines (Section M) table shape
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='engine_business_engines'
ORDER BY ordinal_position;
