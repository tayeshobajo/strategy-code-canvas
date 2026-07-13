-- Phase 4 governance gate smoke harness.
--
-- Run as service_role / postgres (SECURITY DEFINER helpers bypass RLS).
-- Wrapped in a single transaction — always rolled back so it leaves no data.
--
-- Assertion pattern: each case uses a SAVEPOINT + EXCEPTION block. The block
-- must raise for blocking cases and must NOT raise for allow cases. Any case
-- that behaves the wrong way triggers RAISE EXCEPTION 'SMOKE FAIL: ...' at
-- the end of the case, which aborts the transaction and surfaces PASS/FAIL.
--
-- Usage:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/spine-gate-smoke.sql
--
-- Exit code 0 + final NOTICE 'SMOKE PASS' => all cases passed.
-- Any other outcome => FAIL; the RAISE payload identifies the case.

BEGIN;

DO $harness$
DECLARE
  v_client_id      uuid := gen_random_uuid();
  v_portal_proj_id uuid := gen_random_uuid();
  v_project_id     uuid := gen_random_uuid();
  v_engine_id      uuid := gen_random_uuid();
  v_ceremony_a_id  uuid := gen_random_uuid();
  v_ceremony_b_id  uuid := gen_random_uuid();
  v_signal_id      uuid := gen_random_uuid();
  v_actor          text := 'smoke:harness';
  v_human_email    text := 'smoke-operator@example.com';
  v_point_a_keys   text[] := ARRAY['lenses','diagnosis','key_diagnosis'];
  v_point_b_keys   text[] := ARRAY['24_month_destination','10_year_position',
                                   'client_outcome','customer_outcome',
                                   'operational_outcome','revenue_outcome','brand_position'];
  v_k              text;
  v_state          text;
BEGIN
  ------------------------------------------------------------------
  -- Seed scratch project
  ------------------------------------------------------------------
  INSERT INTO public.engine_clients (id, company)
    VALUES (v_client_id, 'Smoke Client');

  INSERT INTO public.client_portal_projects (id, name)
    VALUES (v_portal_proj_id, 'Smoke Portal');

  INSERT INTO public.engine_projects (id, name, client_id, client_portal_project_id, status)
    VALUES (v_project_id, 'Spine Gate Smoke', v_client_id, v_portal_proj_id, 'active');

  INSERT INTO public.engine_business_engines (id, project_id, name, cadence, status, created_by)
    VALUES (v_engine_id, v_project_id, 'Smoke Engine', 'weekly', 'proposed', v_actor);

  -- Two completed ceremonies (one per spine) for provenance-satisfying writes.
  INSERT INTO public.engine_spine_ceremonies (id, project_id, spine, status, created_by_email)
    VALUES (v_ceremony_a_id, v_project_id, 'point-a', 'completed', v_human_email),
           (v_ceremony_b_id, v_project_id, 'point-b', 'completed', v_human_email);

  -- Full approved truth for all canonical keys via the ceremony path.
  FOREACH v_k IN ARRAY v_point_a_keys LOOP
    INSERT INTO public.engine_spine_field_truth
      (project_id, spine, field_key, status, source_ref,
       updated_by_email, updated_by_actor, ceremony_id)
    VALUES (v_project_id, 'point-a', v_k, 'approved_truth',
            jsonb_build_object('kind','ceremony'),
            v_human_email, 'human', v_ceremony_a_id);
  END LOOP;
  FOREACH v_k IN ARRAY v_point_b_keys LOOP
    INSERT INTO public.engine_spine_field_truth
      (project_id, spine, field_key, status, source_ref,
       updated_by_email, updated_by_actor, ceremony_id)
    VALUES (v_project_id, 'point-b', v_k, 'approved_truth',
            jsonb_build_object('kind','ceremony'),
            v_human_email, 'human', v_ceremony_b_id);
  END LOOP;

  ------------------------------------------------------------------
  -- Helper: run an approve attempt on the engine and report state.
  -- Returns 'ALLOWED' or 'BLOCKED:<sqlstate>:<msg>'
  ------------------------------------------------------------------
  -- Inlined below per case to keep the harness one function.

  ------------------------------------------------------------------
  -- CASE A — full approve + no contradictions => allowed
  ------------------------------------------------------------------
  BEGIN
    UPDATE public.engine_business_engines
       SET status='approved', approved_by='smoke:reviewer', approved_at=now()
     WHERE id = v_engine_id;
    v_state := 'ALLOWED';
  EXCEPTION WHEN OTHERS THEN
    v_state := 'BLOCKED:' || SQLSTATE || ':' || SQLERRM;
  END;
  IF v_state <> 'ALLOWED' THEN
    RAISE EXCEPTION 'SMOKE FAIL A: expected ALLOWED, got %', v_state;
  END IF;
  -- Reset engine for subsequent cases.
  UPDATE public.engine_business_engines SET status='proposed', approved_by=NULL, approved_at=NULL WHERE id=v_engine_id;

  ------------------------------------------------------------------
  -- CASE B — missing 1 Point A key => blocked
  ------------------------------------------------------------------
  UPDATE public.engine_spine_field_truth
     SET status='verified',
         source_ref = jsonb_build_object('kind','ceremony'),
         updated_by_actor='human', updated_by_email=v_human_email
   WHERE project_id=v_project_id AND spine='point-a' AND field_key='lenses';
  BEGIN
    UPDATE public.engine_business_engines
       SET status='approved', approved_by='smoke:reviewer', approved_at=now()
     WHERE id=v_engine_id;
    v_state := 'ALLOWED';
  EXCEPTION WHEN check_violation THEN v_state := 'BLOCKED';
           WHEN OTHERS THEN v_state := 'BLOCKED_OTHER:' || SQLSTATE || ':' || SQLERRM;
  END;
  IF v_state <> 'BLOCKED' THEN RAISE EXCEPTION 'SMOKE FAIL B: got %', v_state; END IF;
  -- Restore.
  UPDATE public.engine_spine_field_truth SET status='approved_truth',
         source_ref=jsonb_build_object('kind','ceremony'), ceremony_id=v_ceremony_a_id
   WHERE project_id=v_project_id AND spine='point-a' AND field_key='lenses';
  UPDATE public.engine_business_engines SET status='proposed', approved_by=NULL, approved_at=NULL WHERE id=v_engine_id;

  ------------------------------------------------------------------
  -- CASE C — missing 1 Point B key => blocked
  ------------------------------------------------------------------
  UPDATE public.engine_spine_field_truth SET status='verified'
   WHERE project_id=v_project_id AND spine='point-b' AND field_key='brand_position';
  BEGIN
    UPDATE public.engine_business_engines SET status='approved', approved_by='smoke:reviewer', approved_at=now() WHERE id=v_engine_id;
    v_state := 'ALLOWED';
  EXCEPTION WHEN check_violation THEN v_state := 'BLOCKED';
           WHEN OTHERS THEN v_state := 'BLOCKED_OTHER:' || SQLSTATE || ':' || SQLERRM;
  END;
  IF v_state <> 'BLOCKED' THEN RAISE EXCEPTION 'SMOKE FAIL C: got %', v_state; END IF;
  UPDATE public.engine_spine_field_truth SET status='approved_truth', ceremony_id=v_ceremony_b_id,
         source_ref=jsonb_build_object('kind','ceremony')
   WHERE project_id=v_project_id AND spine='point-b' AND field_key='brand_position';
  UPDATE public.engine_business_engines SET status='proposed', approved_by=NULL, approved_at=NULL WHERE id=v_engine_id;

  ------------------------------------------------------------------
  -- CASE D — only smaller core subset approved => blocked
  -- Simulate a hypothetical "core-only" world: demote all but
  -- key_diagnosis + 24_month_destination.
  ------------------------------------------------------------------
  UPDATE public.engine_spine_field_truth SET status='verified'
   WHERE project_id=v_project_id
     AND ( (spine='point-a' AND field_key <> 'key_diagnosis')
        OR (spine='point-b' AND field_key <> '24_month_destination') );
  BEGIN
    UPDATE public.engine_business_engines SET status='approved', approved_by='smoke:reviewer', approved_at=now() WHERE id=v_engine_id;
    v_state := 'ALLOWED';
  EXCEPTION WHEN check_violation THEN v_state := 'BLOCKED';
           WHEN OTHERS THEN v_state := 'BLOCKED_OTHER:' || SQLSTATE || ':' || SQLERRM;
  END;
  IF v_state <> 'BLOCKED' THEN RAISE EXCEPTION 'SMOKE FAIL D: got %', v_state; END IF;
  -- Restore all.
  UPDATE public.engine_spine_field_truth SET status='approved_truth',
         source_ref=jsonb_build_object('kind','ceremony'),
         ceremony_id = CASE WHEN spine='point-a' THEN v_ceremony_a_id ELSE v_ceremony_b_id END
   WHERE project_id=v_project_id;
  UPDATE public.engine_business_engines SET status='proposed', approved_by=NULL, approved_at=NULL WHERE id=v_engine_id;

  ------------------------------------------------------------------
  -- CASE E — key is 'verified' (not approved_truth) => blocked
  ------------------------------------------------------------------
  UPDATE public.engine_spine_field_truth SET status='verified'
   WHERE project_id=v_project_id AND spine='point-a' AND field_key='diagnosis';
  BEGIN
    UPDATE public.engine_business_engines SET status='approved', approved_by='smoke:reviewer', approved_at=now() WHERE id=v_engine_id;
    v_state := 'ALLOWED';
  EXCEPTION WHEN check_violation THEN v_state := 'BLOCKED';
           WHEN OTHERS THEN v_state := 'BLOCKED_OTHER:' || SQLSTATE || ':' || SQLERRM;
  END;
  IF v_state <> 'BLOCKED' THEN RAISE EXCEPTION 'SMOKE FAIL E: got %', v_state; END IF;
  UPDATE public.engine_spine_field_truth SET status='approved_truth', ceremony_id=v_ceremony_a_id,
         source_ref=jsonb_build_object('kind','ceremony')
   WHERE project_id=v_project_id AND spine='point-a' AND field_key='diagnosis';
  UPDATE public.engine_business_engines SET status='proposed', approved_by=NULL, approved_at=NULL WHERE id=v_engine_id;

  ------------------------------------------------------------------
  -- CASE F — Point A contradiction => blocked
  ------------------------------------------------------------------
  UPDATE public.engine_spine_field_truth SET status='contradicted'
   WHERE project_id=v_project_id AND spine='point-a' AND field_key='diagnosis';
  BEGIN
    UPDATE public.engine_business_engines SET status='approved', approved_by='smoke:reviewer', approved_at=now() WHERE id=v_engine_id;
    v_state := 'ALLOWED';
  EXCEPTION WHEN check_violation THEN v_state := 'BLOCKED';
           WHEN OTHERS THEN v_state := 'BLOCKED_OTHER:' || SQLSTATE || ':' || SQLERRM;
  END;
  IF v_state <> 'BLOCKED' THEN RAISE EXCEPTION 'SMOKE FAIL F: got %', v_state; END IF;
  UPDATE public.engine_spine_field_truth SET status='approved_truth'
   WHERE project_id=v_project_id AND spine='point-a' AND field_key='diagnosis';
  UPDATE public.engine_business_engines SET status='proposed', approved_by=NULL, approved_at=NULL WHERE id=v_engine_id;

  ------------------------------------------------------------------
  -- CASE G — Point B contradiction => blocked
  ------------------------------------------------------------------
  UPDATE public.engine_spine_field_truth SET status='contradicted'
   WHERE project_id=v_project_id AND spine='point-b' AND field_key='revenue_outcome';
  BEGIN
    UPDATE public.engine_business_engines SET status='approved', approved_by='smoke:reviewer', approved_at=now() WHERE id=v_engine_id;
    v_state := 'ALLOWED';
  EXCEPTION WHEN check_violation THEN v_state := 'BLOCKED';
           WHEN OTHERS THEN v_state := 'BLOCKED_OTHER:' || SQLSTATE || ':' || SQLERRM;
  END;
  IF v_state <> 'BLOCKED' THEN RAISE EXCEPTION 'SMOKE FAIL G: got %', v_state; END IF;
  UPDATE public.engine_spine_field_truth SET status='approved_truth'
   WHERE project_id=v_project_id AND spine='point-b' AND field_key='revenue_outcome';
  UPDATE public.engine_business_engines SET status='proposed', approved_by=NULL, approved_at=NULL WHERE id=v_engine_id;

  ------------------------------------------------------------------
  -- CASE H — active unresolved extracted-signal contradiction => blocked
  ------------------------------------------------------------------
  INSERT INTO public.engine_extracted_signals (id, project_id, status, superseded_by)
    VALUES (v_signal_id, v_project_id, 'contradicted', NULL);
  BEGIN
    UPDATE public.engine_business_engines SET status='approved', approved_by='smoke:reviewer', approved_at=now() WHERE id=v_engine_id;
    v_state := 'ALLOWED';
  EXCEPTION WHEN check_violation THEN v_state := 'BLOCKED';
           WHEN OTHERS THEN v_state := 'BLOCKED_OTHER:' || SQLSTATE || ':' || SQLERRM;
  END;
  IF v_state <> 'BLOCKED' THEN RAISE EXCEPTION 'SMOKE FAIL H: got %', v_state; END IF;
  DELETE FROM public.engine_extracted_signals WHERE id=v_signal_id;
  UPDATE public.engine_business_engines SET status='proposed', approved_by=NULL, approved_at=NULL WHERE id=v_engine_id;

  ------------------------------------------------------------------
  -- CASE I — reversed approved_truth => blocked
  ------------------------------------------------------------------
  UPDATE public.engine_spine_field_truth SET status='verified'
   WHERE project_id=v_project_id AND spine='point-a' AND field_key='key_diagnosis';
  BEGIN
    UPDATE public.engine_business_engines SET status='approved', approved_by='smoke:reviewer', approved_at=now() WHERE id=v_engine_id;
    v_state := 'ALLOWED';
  EXCEPTION WHEN check_violation THEN v_state := 'BLOCKED';
           WHEN OTHERS THEN v_state := 'BLOCKED_OTHER:' || SQLSTATE || ':' || SQLERRM;
  END;
  IF v_state <> 'BLOCKED' THEN RAISE EXCEPTION 'SMOKE FAIL I: got %', v_state; END IF;
  UPDATE public.engine_spine_field_truth SET status='approved_truth', ceremony_id=v_ceremony_a_id,
         source_ref=jsonb_build_object('kind','ceremony')
   WHERE project_id=v_project_id AND spine='point-a' AND field_key='key_diagnosis';
  UPDATE public.engine_business_engines SET status='proposed', approved_by=NULL, approved_at=NULL WHERE id=v_engine_id;

  ------------------------------------------------------------------
  -- CASE J — AI/system tries to write approved_truth without ceremony => blocked
  -- Requires the G1 trigger tg_engine_spine_field_truth_provenance to exist.
  ------------------------------------------------------------------
  BEGIN
    INSERT INTO public.engine_spine_field_truth
      (project_id, spine, field_key, status, source_ref,
       updated_by_email, updated_by_actor, ceremony_id)
    VALUES (v_project_id, 'point-a', 'diagnosis:smoke_ai_write', 'approved_truth',
            '{}'::jsonb, NULL, 'ai', NULL);
    v_state := 'ALLOWED';
  EXCEPTION WHEN check_violation THEN v_state := 'BLOCKED';
           WHEN OTHERS THEN v_state := 'BLOCKED_OTHER:' || SQLSTATE || ':' || SQLERRM;
  END;
  IF v_state <> 'BLOCKED' THEN
    RAISE EXCEPTION 'SMOKE FAIL J: AI wrote approved_truth without ceremony (got %). G1 trigger missing?', v_state;
  END IF;

  RAISE NOTICE 'SMOKE PASS: all cases A-J behaved as expected';
END
$harness$;

ROLLBACK;
