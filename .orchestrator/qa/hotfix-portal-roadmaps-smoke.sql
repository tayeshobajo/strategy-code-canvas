-- Hotfix verification — engine_projects.current_phase + client_portal_roadmaps grants
\pset border 0
\pset footer off

-- CHECK 1: current_phase column present
SELECT 'CHECK1 current_phase_column: ' ||
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='engine_projects' AND column_name='current_phase'
      AND data_type='text' AND is_nullable='YES'
  ) THEN 'PASS' ELSE 'FAIL' END AS result;

SELECT 'CHECK1b current_phase_selectable: ' ||
  CASE WHEN (SELECT count(*) >= 0 FROM (SELECT current_phase FROM public.engine_projects LIMIT 1) x)
    THEN 'PASS' ELSE 'FAIL' END AS result;

-- CHECK 2: grants present on client_portal_roadmaps
WITH g AS (
  SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name='client_portal_roadmaps'
    AND grantee IN ('anon','authenticated','service_role')
  GROUP BY grantee
)
SELECT 'CHECK2 grants: ' ||
  CASE WHEN
    (SELECT privs FROM g WHERE grantee='anon') LIKE '%SELECT%'
    AND (SELECT privs FROM g WHERE grantee='authenticated') LIKE '%SELECT%'
    AND (SELECT privs FROM g WHERE grantee='authenticated') LIKE '%INSERT%'
    AND (SELECT privs FROM g WHERE grantee='authenticated') LIKE '%UPDATE%'
    AND (SELECT privs FROM g WHERE grantee='authenticated') LIKE '%DELETE%'
    AND (SELECT privs FROM g WHERE grantee='service_role') LIKE '%SELECT%'
    THEN 'PASS (anon SELECT; authenticated CRUD; service_role ALL)'
    ELSE 'FAIL' END AS result;

-- CHECK 3: RLS still enforcing, both policies unchanged
SELECT 'CHECK3 rls_intact: ' ||
  CASE WHEN c.relrowsecurity
       AND (SELECT count(*) FROM pg_policy WHERE polrelid=c.oid) = 2
       AND EXISTS (SELECT 1 FROM pg_policy WHERE polrelid=c.oid AND polname='Clients read published roadmaps')
       AND EXISTS (SELECT 1 FROM pg_policy WHERE polrelid=c.oid AND polname='Operators manage roadmaps')
    THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_class c WHERE relname='client_portal_roadmaps';

-- CHECK 4 + 5: Positive/negative portal-token test.
-- Simulate anon role with a JWT email claim; verify only published rows for
-- that email's client_portal_permissions surface.
DO $$
DECLARE
  v_email text;
  v_pub_id uuid;
  v_client_project uuid;
  v_other_client_project uuid;
  v_visible int;
  v_other_visible int;
  v_nonpub_visible int;
BEGIN
  -- Find an existing published roadmap that has at least one active permission grant.
  SELECT r.id, r.project_id, p.email
    INTO v_pub_id, v_client_project, v_email
  FROM public.client_portal_roadmaps r
  JOIN public.client_portal_permissions p ON p.project_id = r.project_id AND p.revoked_at IS NULL
  WHERE r.status = 'published'
  LIMIT 1;

  IF v_pub_id IS NULL THEN
    RAISE NOTICE 'CHECK4 positive_read: SKIP (no published roadmap with active permission grant in DB)';
    RAISE NOTICE 'CHECK5 negative_portal_token: SKIP (no data to test)';
    RETURN;
  END IF;

  -- Pick a different published roadmap (another project) to serve as the "other client" row.
  SELECT project_id INTO v_other_client_project
  FROM public.client_portal_roadmaps
  WHERE status = 'published' AND project_id <> v_client_project
  LIMIT 1;

  -- Simulate anon session with the granted email as JWT claim.
  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims',
    json_build_object('email', v_email, 'role', 'anon')::text, true);

  -- CHECK 4 positive: my client's published rows should be visible
  SELECT count(*) INTO v_visible
  FROM public.client_portal_roadmaps
  WHERE id = v_pub_id;

  -- CHECK 5a: another client's published rows must NOT be visible
  IF v_other_client_project IS NOT NULL THEN
    SELECT count(*) INTO v_other_visible
    FROM public.client_portal_roadmaps
    WHERE project_id = v_other_client_project;
  ELSE
    v_other_visible := 0;
  END IF;

  -- CHECK 5b: non-published rows for anyone must NOT be visible
  SELECT count(*) INTO v_nonpub_visible
  FROM public.client_portal_roadmaps
  WHERE status <> 'published';

  RESET ROLE;

  IF v_visible >= 1 THEN
    RAISE NOTICE 'CHECK4 positive_read: PASS (email=% saw its published roadmap)', v_email;
  ELSE
    RAISE NOTICE 'CHECK4 positive_read: FAIL (email=% did NOT see its published roadmap %)', v_email, v_pub_id;
  END IF;

  IF v_other_visible = 0 AND v_nonpub_visible = 0 THEN
    RAISE NOTICE 'CHECK5 negative_portal_token: PASS (other-client=0, non-published=0)';
  ELSE
    RAISE NOTICE 'CHECK5 negative_portal_token: FAIL (other-client=%, non-published=%) — ROLLBACK GRANTS',
      v_other_visible, v_nonpub_visible;
  END IF;
END $$;
