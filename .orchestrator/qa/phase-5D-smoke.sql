-- Phase 5D QA smoke — READ-ONLY DB verification of the family surface guards.
-- Sandbox exec cannot INSERT into engine_projects (grants are select-only for
-- test roles). Mutation-path guards are verified via (a) DB trigger inspection
-- here and (b) static code review in phase-5D-smoke-output.md.
\pset border 0
\pset footer off

-- ============================================================
-- CHECK 1: Cycle prevention — DB trigger present
-- ============================================================
SELECT 'CHECK1 cycle_prevention: ' ||
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE proname='tg_engine_projects_gate'
  ) THEN 'PASS (tg_engine_projects_gate exists)'
    ELSE 'FAIL (trigger missing)' END AS result;

-- ============================================================
-- CHECK 2: Parent-completion guard (Revision 4) — trigger inspection
-- ============================================================
SELECT 'CHECK2 parent_completion_guard: ' ||
  CASE WHEN pg_get_functiondef(p.oid) LIKE '%internal_all_children_completed%'
       AND pg_get_functiondef(p.oid) LIKE '%internal_all_children_approved%'
    THEN 'PASS (children approved+completed required)'
    ELSE 'FAIL (guard clause missing)' END AS result
FROM pg_proc p WHERE proname='tg_engine_projects_gate';

-- ============================================================
-- CHECK 3: Child rollup guard trigger present (frozen parent detach)
-- ============================================================
SELECT 'CHECK3 child_rollup_guard: ' ||
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE proname='tg_engine_projects_child_rollup_guard'
  ) THEN 'PASS' ELSE 'FAIL' END AS result;

-- ============================================================
-- CHECK 4: engine_projects RLS enabled + scoped policies (no USING(true))
-- ============================================================
SELECT 'CHECK4 engine_projects_rls: ' ||
  CASE WHEN c.relrowsecurity
       AND (SELECT count(*) FROM pg_policy WHERE polrelid=c.oid) >= 2
       AND NOT EXISTS (
         SELECT 1 FROM pg_policy
         WHERE polrelid=c.oid
           AND pg_get_expr(polqual, polrelid) IN ('true')
       )
    THEN 'PASS (rls on, ' || (SELECT count(*) FROM pg_policy WHERE polrelid=c.oid)::text || ' scoped policies)'
    ELSE 'FAIL' END AS result
FROM pg_class c WHERE relname='engine_projects';

-- ============================================================
-- CHECK 5: engine_audit_log RLS enabled + admin/team read + admin insert only
-- ============================================================
SELECT 'CHECK5 audit_log_rls: ' ||
  CASE WHEN c.relrowsecurity
       AND EXISTS (
         SELECT 1 FROM pg_policy
         WHERE polrelid=c.oid AND polcmd='a'
           AND pg_get_expr(polwithcheck, polrelid) LIKE '%has_role%admin%'
       )
    THEN 'PASS (admin-gated insert)'
    ELSE 'FAIL' END AS result
FROM pg_class c WHERE relname='engine_audit_log';

-- ============================================================
-- CHECK 6: client_portal_roadmaps RLS scoped by permissions/operator
-- ============================================================
SELECT 'CHECK6 portal_roadmaps_rls: ' ||
  CASE WHEN c.relrowsecurity
       AND EXISTS (
         SELECT 1 FROM pg_policy
         WHERE polrelid=c.oid AND polcmd='r'
           AND pg_get_expr(polqual, polrelid) LIKE '%client_portal_permissions%'
       )
       AND NOT EXISTS (
         SELECT 1 FROM pg_policy
         WHERE polrelid=c.oid
           AND pg_get_expr(polqual, polrelid) IN ('true')
       )
    THEN 'PASS (scoped by client_portal_permissions + operator)'
    ELSE 'FAIL' END AS result
FROM pg_class c WHERE relname='client_portal_roadmaps';

-- ============================================================
-- CHECK 7: parent_project_id column + FK + index present
-- ============================================================
SELECT 'CHECK7 family_column: ' ||
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='engine_projects' AND column_name='parent_project_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu USING (constraint_name, table_schema)
    WHERE tc.table_name='engine_projects' AND kcu.column_name='parent_project_id'
      AND tc.constraint_type='FOREIGN KEY'
  ) THEN 'PASS (column + FK)'
    ELSE 'FAIL' END AS result;

-- ============================================================
-- CHECK 8: current_phase column drift on client_portal_roadmaps
-- (expected MISSING — subject of hotfix)
-- ============================================================
SELECT 'CHECK8 current_phase_column: ' ||
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='client_portal_roadmaps' AND column_name='current_phase'
  ) THEN 'PRESENT (hotfix already applied)'
    ELSE 'MISSING (hotfix pending — see PENDING_MIGRATIONS.md)' END AS result;
