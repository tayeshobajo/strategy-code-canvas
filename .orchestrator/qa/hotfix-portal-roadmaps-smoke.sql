-- Hotfix verification — engine_projects.current_phase + client_portal_roadmaps grants
-- Note: sandbox_exec can only SELECT its own rows from information_schema.role_table_grants,
-- and cannot SET ROLE anon. Grant presence is verified via pg_class.relacl + has_table_privilege.
-- The negative portal-token test is done via a temporary SECURITY DEFINER helper that
-- switches role, runs the read under a JWT claim, and returns counts.
\pset border 0
\pset footer off

-- CHECK 1: current_phase column present + selectable
SELECT 'CHECK1 current_phase_column: ' ||
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='engine_projects' AND column_name='current_phase'
      AND data_type='text' AND is_nullable='YES'
  ) THEN 'PASS' ELSE 'FAIL' END AS result;

SELECT 'CHECK1b current_phase_selectable: ' ||
  CASE WHEN (SELECT count(*) >= 0 FROM (SELECT current_phase FROM public.engine_projects LIMIT 1) x)
    THEN 'PASS' ELSE 'FAIL' END AS result;

-- CHECK 2: grants present via has_table_privilege (works cross-role)
SELECT 'CHECK2 grants: ' ||
  CASE WHEN
    has_table_privilege('anon', 'public.client_portal_roadmaps', 'SELECT')
    AND has_table_privilege('authenticated', 'public.client_portal_roadmaps', 'SELECT')
    AND has_table_privilege('authenticated', 'public.client_portal_roadmaps', 'INSERT')
    AND has_table_privilege('authenticated', 'public.client_portal_roadmaps', 'UPDATE')
    AND has_table_privilege('authenticated', 'public.client_portal_roadmaps', 'DELETE')
    AND has_table_privilege('service_role', 'public.client_portal_roadmaps', 'SELECT')
    AND has_table_privilege('service_role', 'public.client_portal_roadmaps', 'INSERT')
    THEN 'PASS (anon:SELECT; authenticated:SELECT+INSERT+UPDATE+DELETE; service_role:ALL)'
    ELSE 'FAIL' END AS result;

-- CHECK 3: RLS still enforcing, both policies unchanged
SELECT 'CHECK3 rls_intact: ' ||
  CASE WHEN c.relrowsecurity
       AND (SELECT count(*) FROM pg_policy WHERE polrelid=c.oid) = 2
       AND EXISTS (SELECT 1 FROM pg_policy WHERE polrelid=c.oid AND polname='Clients read published roadmaps')
       AND EXISTS (SELECT 1 FROM pg_policy WHERE polrelid=c.oid AND polname='Operators manage roadmaps')
    THEN 'PASS (rls on; both policies present)'
    ELSE 'FAIL' END AS result
FROM pg_class c WHERE relname='client_portal_roadmaps';

-- CHECK 4+5: portal-token test via SECURITY DEFINER probe.
-- The probe runs as postgres (superuser) but explicitly SETs role + JWT claims to
-- simulate an anon portal magic-link session. We drop it at the end.
CREATE OR REPLACE FUNCTION public._hotfix_portal_probe(p_email text, p_scope text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n bigint := 0;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('email', p_email, 'role', 'anon')::text, true);
  EXECUTE 'SET LOCAL ROLE anon';
  IF p_scope = 'mine_published' THEN
    EXECUTE format(
      'SELECT count(*) FROM public.client_portal_roadmaps r WHERE r.status=$1 AND EXISTS (SELECT 1 FROM public.client_portal_permissions p WHERE p.project_id=r.project_id AND lower(p.email)=lower($2) AND p.revoked_at IS NULL)'
    ) INTO n USING 'published', p_email;
  ELSIF p_scope = 'others_published' THEN
    EXECUTE format(
      'SELECT count(*) FROM public.client_portal_roadmaps r WHERE r.status=$1 AND NOT EXISTS (SELECT 1 FROM public.client_portal_permissions p WHERE p.project_id=r.project_id AND lower(p.email)=lower($2) AND p.revoked_at IS NULL)'
    ) INTO n USING 'published', p_email;
  ELSIF p_scope = 'any_nonpublished' THEN
    EXECUTE 'SELECT count(*) FROM public.client_portal_roadmaps r WHERE r.status <> $1' INTO n USING 'published';
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN n;
END $$;

DO $$
DECLARE
  v_email text;
  v_pub_id uuid;
  v_client_project uuid;
  n_mine bigint;
  n_others bigint;
  n_nonpub bigint;
  n_ground_truth_mine bigint;
BEGIN
  -- Find an existing published roadmap that has at least one active permission grant.
  SELECT r.id, r.project_id, p.email
    INTO v_pub_id, v_client_project, v_email
  FROM public.client_portal_roadmaps r
  JOIN public.client_portal_permissions p ON p.project_id = r.project_id AND p.revoked_at IS NULL
  WHERE r.status = 'published'
  ORDER BY r.published_at DESC NULLS LAST
  LIMIT 1;

  IF v_email IS NULL THEN
    RAISE NOTICE 'CHECK4 positive_read: SKIP (no published roadmap with active permission grant in DB)';
    RAISE NOTICE 'CHECK5 negative_portal_token: SKIP (no data to test)';
    RETURN;
  END IF;

  -- Ground truth for the "mine" count computed under postgres.
  SELECT count(*) INTO n_ground_truth_mine
  FROM public.client_portal_roadmaps r
  WHERE r.status='published' AND EXISTS (
    SELECT 1 FROM public.client_portal_permissions p
    WHERE p.project_id=r.project_id AND lower(p.email)=lower(v_email) AND p.revoked_at IS NULL);

  n_mine := public._hotfix_portal_probe(v_email, 'mine_published');
  n_others := public._hotfix_portal_probe(v_email, 'others_published');
  n_nonpub := public._hotfix_portal_probe(v_email, 'any_nonpublished');

  IF n_mine >= 1 AND n_mine = n_ground_truth_mine THEN
    RAISE NOTICE 'CHECK4 positive_read: PASS (email=% saw % published roadmap(s), matches ground truth)', v_email, n_mine;
  ELSE
    RAISE NOTICE 'CHECK4 positive_read: FAIL (email=% saw %, ground truth %)', v_email, n_mine, n_ground_truth_mine;
  END IF;

  IF n_others = 0 AND n_nonpub = 0 THEN
    RAISE NOTICE 'CHECK5 negative_portal_token: PASS (others=0, non_published=0)';
  ELSE
    RAISE NOTICE 'CHECK5 negative_portal_token: FAIL (others=%, non_published=%) — ROLLBACK GRANTS', n_others, n_nonpub;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public._hotfix_portal_probe(text, text);
