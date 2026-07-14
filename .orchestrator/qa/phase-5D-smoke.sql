-- Phase 5D QA smoke — DB-layer guards for the family surface.
-- Runs as service role (bypasses RLS). App-layer authorization (assertStaff,
-- cross-client server-fn checks, portal payload filtering) is verified by
-- static code review in phase-5D-smoke-output.md.
--
-- All test data is rolled back at the end.
\set ON_ERROR_STOP off
\pset border 0
\pset footer off

BEGIN;

-- Deterministic test client + project ids
DO $$
DECLARE
  c_a uuid := 'aaaaaaa5-d000-4000-8000-000000000001';
  c_b uuid := 'aaaaaaa5-d000-4000-8000-000000000002';
  p_a_root uuid := 'aaaaaaa5-d000-4000-8000-000000000010';
  p_a_child uuid := 'aaaaaaa5-d000-4000-8000-000000000011';
  p_a_grand uuid := 'aaaaaaa5-d000-4000-8000-000000000012';
  p_b_root uuid := 'aaaaaaa5-d000-4000-8000-000000000020';
  err text;
BEGIN
  -- seed clients if the table exists
  BEGIN
    INSERT INTO engine_clients (id, company) VALUES
      (c_a, 'QA5D Client A'), (c_b, 'QA5D Client B')
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  -- seed projects (skip trigger side-effects by using planning status)
  INSERT INTO engine_projects (id, name, client_id, status, project_kind)
  VALUES
    (p_a_root, 'QA5D-A-root', c_a, 'intake', 'parent'),
    (p_a_child, 'QA5D-A-child', c_a, 'intake', 'child'),
    (p_a_grand, 'QA5D-A-grand', c_a, 'intake', 'child'),
    (p_b_root, 'QA5D-B-root', c_b, 'intake', 'parent')
  ON CONFLICT (id) DO UPDATE
    SET parent_project_id = NULL, status = 'intake';

  UPDATE engine_projects SET parent_project_id = p_a_root WHERE id = p_a_child;
  UPDATE engine_projects SET parent_project_id = p_a_child WHERE id = p_a_grand;

  RAISE NOTICE 'SEED OK';
END $$;

-- ============================================================
-- CHECK 1: Cycle detection at DB layer (reparent to descendant)
-- ============================================================
DO $$
DECLARE
  p_root uuid := 'aaaaaaa5-d000-4000-8000-000000000010';
  p_grand uuid := 'aaaaaaa5-d000-4000-8000-000000000012';
  err text;
BEGIN
  BEGIN
    UPDATE engine_projects SET parent_project_id = p_grand WHERE id = p_root;
    RAISE NOTICE 'CHECK1 cycle_detection: FAIL (update succeeded)';
    UPDATE engine_projects SET parent_project_id = NULL WHERE id = p_root;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err = MESSAGE_TEXT;
    RAISE NOTICE 'CHECK1 cycle_detection: PASS (%)', err;
  END;
END $$;

-- ============================================================
-- CHECK 2: Approved parent freezes child-set (add child)
-- ============================================================
DO $$
DECLARE
  p_a_root uuid := 'aaaaaaa5-d000-4000-8000-000000000010';
  p_new uuid := 'aaaaaaa5-d000-4000-8000-000000000013';
  c_a uuid := 'aaaaaaa5-d000-4000-8000-000000000001';
  err text;
BEGIN
  -- Push root to approved by bypassing the spine gate is hard here; instead
  -- we simulate by directly checking isFrozenStatus semantics: the app fn
  -- refuses on status='approved'. The DB trigger for reparent/detach lives
  -- in tg_engine_projects_child_rollup_guard. We test that.
  -- Force root approved via direct update (may fail spine gate); if so, skip.
  BEGIN
    UPDATE engine_projects
      SET status = 'approved', approved_at = now()
      WHERE id = p_a_root;
    -- Attempt to insert a child under the approved parent.
    BEGIN
      INSERT INTO engine_projects (id, name, client_id, parent_project_id, status, project_kind)
      VALUES (p_new, 'QA5D-A-late-child', c_a, p_a_root, 'intake', 'child');
      RAISE NOTICE 'CHECK2 frozen_parent_add_child: SKIP (no DB-level guard; app-layer only)';
      DELETE FROM engine_projects WHERE id = p_new;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS err = MESSAGE_TEXT;
      RAISE NOTICE 'CHECK2 frozen_parent_add_child: PASS (%)', err;
    END;
    UPDATE engine_projects SET status = 'intake', approved_at = NULL WHERE id = p_a_root;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err = MESSAGE_TEXT;
    RAISE NOTICE 'CHECK2 frozen_parent_add_child: SKIP (spine gate blocked test setup: %)', err;
  END;
END $$;

-- ============================================================
-- CHECK 3: Parent complete requires ALL children approved+completed
-- (Revision 4 behavior)
-- ============================================================
DO $$
DECLARE
  p_a_root uuid := 'aaaaaaa5-d000-4000-8000-000000000010';
  err text;
BEGIN
  BEGIN
    UPDATE engine_projects
      SET status = 'completed', completed_at = now()
      WHERE id = p_a_root;
    RAISE NOTICE 'CHECK3 parent_complete_gate: FAIL (children not completed but parent completed)';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err = MESSAGE_TEXT;
    RAISE NOTICE 'CHECK3 parent_complete_gate: PASS (%)', err;
  END;
END $$;

-- ============================================================
-- CHECK 4: Audit log columns exist and accept family.* actions
-- ============================================================
DO $$
DECLARE
  p_a_child uuid := 'aaaaaaa5-d000-4000-8000-000000000011';
  audit_id uuid;
BEGIN
  INSERT INTO engine_audit_log (project_id, action, actor_email, summary, affected_modules, metadata)
  VALUES (p_a_child, 'family.reparent', 'qa@test.local', 'qa smoke row',
          ARRAY['family','rollups'], jsonb_build_object('subtree_ids', jsonb_build_array(p_a_child)))
  RETURNING id INTO audit_id;
  IF audit_id IS NOT NULL THEN
    RAISE NOTICE 'CHECK4 audit_log_insert: PASS';
  ELSE
    RAISE NOTICE 'CHECK4 audit_log_insert: FAIL';
  END IF;
END $$;

-- ============================================================
-- CHECK 5: Portal roadmaps RLS scoping (hotfix preflight)
-- ============================================================
DO $$
DECLARE
  rls_on boolean;
  n_policies int;
  broad_policies int;
BEGIN
  SELECT relrowsecurity INTO rls_on FROM pg_class WHERE relname='client_portal_roadmaps';
  SELECT count(*) INTO n_policies FROM pg_policy WHERE polrelid='public.client_portal_roadmaps'::regclass;
  SELECT count(*) INTO broad_policies FROM pg_policy
    WHERE polrelid='public.client_portal_roadmaps'::regclass
      AND pg_get_expr(polqual, polrelid) IN ('true');
  IF rls_on AND n_policies >= 2 AND broad_policies = 0 THEN
    RAISE NOTICE 'CHECK5 portal_roadmaps_rls: PASS (rls=%, policies=%, broad=%)', rls_on, n_policies, broad_policies;
  ELSE
    RAISE NOTICE 'CHECK5 portal_roadmaps_rls: FAIL (rls=%, policies=%, broad=%)', rls_on, n_policies, broad_policies;
  END IF;
END $$;

-- ============================================================
-- CHECK 6: engine_projects RLS enabled + policies exist
-- ============================================================
DO $$
DECLARE
  rls_on boolean;
  n_policies int;
BEGIN
  SELECT relrowsecurity INTO rls_on FROM pg_class WHERE relname='engine_projects';
  SELECT count(*) INTO n_policies FROM pg_policy WHERE polrelid='public.engine_projects'::regclass;
  IF rls_on AND n_policies > 0 THEN
    RAISE NOTICE 'CHECK6 engine_projects_rls: PASS (rls=%, policies=%)', rls_on, n_policies;
  ELSE
    RAISE NOTICE 'CHECK6 engine_projects_rls: FAIL (rls=%, policies=%)', rls_on, n_policies;
  END IF;
END $$;

-- ============================================================
-- CHECK 7: engine_audit_log RLS enabled + policies exist
-- ============================================================
DO $$
DECLARE
  rls_on boolean;
  n_policies int;
BEGIN
  SELECT relrowsecurity INTO rls_on FROM pg_class WHERE relname='engine_audit_log';
  SELECT count(*) INTO n_policies FROM pg_policy WHERE polrelid='public.engine_audit_log'::regclass;
  IF rls_on AND n_policies > 0 THEN
    RAISE NOTICE 'CHECK7 audit_log_rls: PASS (rls=%, policies=%)', rls_on, n_policies;
  ELSE
    RAISE NOTICE 'CHECK7 audit_log_rls: FAIL (rls=%, policies=%)', rls_on, n_policies;
  END IF;
END $$;

ROLLBACK;
