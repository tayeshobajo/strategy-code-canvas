CREATE OR REPLACE FUNCTION public._smoke_phase4()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
DECLARE
  v_client_id      uuid := gen_random_uuid();
  v_portal_proj_id uuid := gen_random_uuid();
  v_project_id     uuid := gen_random_uuid();
  v_engine_id      uuid := gen_random_uuid();
  v_ceremony_a_id  uuid := gen_random_uuid();
  v_ceremony_b_id  uuid := gen_random_uuid();
  v_signal_id      uuid := gen_random_uuid();
  v_actor          text := 'smoke:harness';
  v_human_email    text := 'tai@trust-tai.com';
  v_point_a_keys   text[] := ARRAY['lenses','diagnosis','key_diagnosis'];
  v_point_b_keys   text[] := ARRAY['24_month_destination','10_year_position',
                                   'client_outcome','customer_outcome',
                                   'operational_outcome','revenue_outcome','brand_position'];
  v_k              text;
  v_state          text;
BEGIN
  INSERT INTO public.engine_clients (id, company) VALUES (v_client_id, 'Smoke Client');
  INSERT INTO public.client_portal_projects (id, primary_email, company_name)
    VALUES (v_portal_proj_id, 'smoke-portal@example.com', 'Smoke Portal');
  INSERT INTO public.engine_projects (id, name, client_id, client_portal_project_id, status)
    VALUES (v_project_id, 'Spine Gate Smoke', v_client_id, v_portal_proj_id, 'active');
  INSERT INTO public.engine_business_engines (id, project_id, name, kind, outcome, cadence, status, created_by)
    VALUES (v_engine_id, v_project_id, 'Smoke Engine', 'custom', 'smoke-outcome', 'weekly', 'proposed', v_actor);

  INSERT INTO public.engine_spine_ceremonies (id, project_id, spine, status, opened_by_email, opened_at)
    VALUES (v_ceremony_a_id, v_project_id, 'point-a', 'in_progress', v_human_email, now());
  FOREACH v_k IN ARRAY v_point_a_keys LOOP
    INSERT INTO public.engine_spine_ceremony_decisions
      (ceremony_id, project_id, spine, field_key, new_status, source_ref, decided_by_email)
    VALUES (v_ceremony_a_id, v_project_id, 'point-a', v_k, 'approved_truth',
            jsonb_build_object('kind','ceremony','approval_kind','ceremony',
              'ceremony_id', v_ceremony_a_id::text,
              'operator_confirmed_by', v_human_email),
            v_human_email);
  END LOOP;
  FOREACH v_k IN ARRAY v_point_a_keys LOOP
    INSERT INTO public.engine_spine_field_truth
      (project_id, spine, field_key, status, source_ref, updated_by_email, updated_by_actor, ceremony_id)
    VALUES (v_project_id, 'point-a', v_k, 'approved_truth',
            jsonb_build_object('kind','operator_override',
              'operator_email', v_human_email,
              'reason','smoke bootstrap',
              'approval_kind','operator_override',
              'operator_confirmed_by', v_human_email),
            v_human_email, 'human', NULL);
  END LOOP;
  UPDATE public.engine_spine_ceremonies
     SET status='completed', completed_at=now(), completed_by_email=v_human_email
   WHERE id = v_ceremony_a_id;

  INSERT INTO public.engine_spine_ceremonies (id, project_id, spine, status, opened_by_email, opened_at)
    VALUES (v_ceremony_b_id, v_project_id, 'point-b', 'in_progress', v_human_email, now());
  FOREACH v_k IN ARRAY v_point_b_keys LOOP
    INSERT INTO public.engine_spine_ceremony_decisions
      (ceremony_id, project_id, spine, field_key, new_status, source_ref, decided_by_email)
    VALUES (v_ceremony_b_id, v_project_id, 'point-b', v_k, 'approved_truth',
            jsonb_build_object('kind','ceremony','approval_kind','ceremony',
              'ceremony_id', v_ceremony_b_id::text,
              'operator_confirmed_by', v_human_email),
            v_human_email);
  END LOOP;
  FOREACH v_k IN ARRAY v_point_b_keys LOOP
    INSERT INTO public.engine_spine_field_truth
      (project_id, spine, field_key, status, source_ref, updated_by_email, updated_by_actor, ceremony_id)
    VALUES (v_project_id, 'point-b', v_k, 'approved_truth',
            jsonb_build_object('kind','operator_override',
              'operator_email', v_human_email,
              'reason','smoke bootstrap',
              'approval_kind','operator_override',
              'operator_confirmed_by', v_human_email),
            v_human_email, 'human', NULL);
  END LOOP;
  UPDATE public.engine_spine_ceremonies
     SET status='completed', completed_at=now(), completed_by_email=v_human_email
   WHERE id = v_ceremony_b_id;

  UPDATE public.engine_spine_field_truth
     SET ceremony_id = v_ceremony_a_id, source_ref = jsonb_build_object('kind','ceremony')
   WHERE project_id = v_project_id AND spine = 'point-a';
  UPDATE public.engine_spine_field_truth
     SET ceremony_id = v_ceremony_b_id, source_ref = jsonb_build_object('kind','ceremony')
   WHERE project_id = v_project_id AND spine = 'point-b';

  -- CASE A
  BEGIN
    UPDATE public.engine_business_engines SET status='approved', approved_by='smoke:reviewer', approved_at=now() WHERE id = v_engine_id;
    v_state := 'ALLOWED';
  EXCEPTION WHEN OTHERS THEN v_state := 'BLOCKED:' || SQLSTATE || ':' || SQLERRM;
  END;
  IF v_state <> 'ALLOWED' THEN RAISE EXCEPTION 'SMOKE FAIL A: %', v_state; END IF;
  UPDATE public.engine_business_engines SET status='proposed', approved_by=NULL, approved_at=NULL WHERE id=v_engine_id;

  -- CASE B
  UPDATE public.engine_spine_field_truth
     SET status='verified', source_ref = jsonb_build_object('kind','ceremony'),
         updated_by_actor='human', updated_by_email=v_human_email
   WHERE project_id=v_project_id AND spine='point-a' AND field_key='lenses';
  BEGIN
    UPDATE public.engine_business_engines SET status='approved', approved_by='smoke:reviewer', approved_at=now() WHERE id=v_engine_id;
    v_state := 'ALLOWED';
  EXCEPTION WHEN check_violation THEN v_state := 'BLOCKED';
           WHEN OTHERS THEN v_state := 'BLOCKED_OTHER:' || SQLSTATE || ':' || SQLERRM;
  END;
  IF v_state <> 'BLOCKED' THEN RAISE EXCEPTION 'SMOKE FAIL B: %', v_state; END IF;
  UPDATE public.engine_spine_field_truth SET status='approved_truth',
         source_ref=jsonb_build_object('kind','ceremony'), ceremony_id=v_ceremony_a_id
   WHERE project_id=v_project_id AND spine='point-a' AND field_key='lenses';
  UPDATE public.engine_business_engines SET status='proposed', approved_by=NULL, approved_at=NULL WHERE id=v_engine_id;

  -- CASE C
  UPDATE public.engine_spine_field_truth SET status='verified'
   WHERE project_id=v_project_id AND spine='point-b' AND field_key='brand_position';
  BEGIN
    UPDATE public.engine_business_engines SET status='approved', approved_by='smoke:reviewer', approved_at=now() WHERE id=v_engine_id;
    v_state := 'ALLOWED';
  EXCEPTION WHEN check_violation THEN v_state := 'BLOCKED';
           WHEN OTHERS THEN v_state := 'BLOCKED_OTHER:' || SQLSTATE || ':' || SQLERRM;
  END;
  IF v_state <> 'BLOCKED' THEN RAISE EXCEPTION 'SMOKE FAIL C: %', v_state; END IF;
  UPDATE public.engine_spine_field_truth SET status='approved_truth', ceremony_id=v_ceremony_b_id,
         source_ref=jsonb_build_object('kind','ceremony')
   WHERE project_id=v_project_id AND spine='point-b' AND field_key='brand_position';
  UPDATE public.engine_business_engines SET status='proposed', approved_by=NULL, approved_at=NULL WHERE id=v_engine_id;

  -- CASE D
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
  IF v_state <> 'BLOCKED' THEN RAISE EXCEPTION 'SMOKE FAIL D: %', v_state; END IF;
  UPDATE public.engine_spine_field_truth SET status='approved_truth',
         source_ref=jsonb_build_object('kind','ceremony'),
         ceremony_id = CASE WHEN spine='point-a' THEN v_ceremony_a_id ELSE v_ceremony_b_id END
   WHERE project_id=v_project_id;
  UPDATE public.engine_business_engines SET status='proposed', approved_by=NULL, approved_at=NULL WHERE id=v_engine_id;

  -- CASE E
  UPDATE public.engine_spine_field_truth SET status='verified'
   WHERE project_id=v_project_id AND spine='point-a' AND field_key='diagnosis';
  BEGIN
    UPDATE public.engine_business_engines SET status='approved', approved_by='smoke:reviewer', approved_at=now() WHERE id=v_engine_id;
    v_state := 'ALLOWED';
  EXCEPTION WHEN check_violation THEN v_state := 'BLOCKED';
           WHEN OTHERS THEN v_state := 'BLOCKED_OTHER:' || SQLSTATE || ':' || SQLERRM;
  END;
  IF v_state <> 'BLOCKED' THEN RAISE EXCEPTION 'SMOKE FAIL E: %', v_state; END IF;
  UPDATE public.engine_spine_field_truth SET status='approved_truth', ceremony_id=v_ceremony_a_id,
         source_ref=jsonb_build_object('kind','ceremony')
   WHERE project_id=v_project_id AND spine='point-a' AND field_key='diagnosis';
  UPDATE public.engine_business_engines SET status='proposed', approved_by=NULL, approved_at=NULL WHERE id=v_engine_id;

  -- CASE F
  UPDATE public.engine_spine_field_truth SET status='contradicted'
   WHERE project_id=v_project_id AND spine='point-a' AND field_key='diagnosis';
  BEGIN
    UPDATE public.engine_business_engines SET status='approved', approved_by='smoke:reviewer', approved_at=now() WHERE id=v_engine_id;
    v_state := 'ALLOWED';
  EXCEPTION WHEN check_violation THEN v_state := 'BLOCKED';
           WHEN OTHERS THEN v_state := 'BLOCKED_OTHER:' || SQLSTATE || ':' || SQLERRM;
  END;
  IF v_state <> 'BLOCKED' THEN RAISE EXCEPTION 'SMOKE FAIL F: %', v_state; END IF;
  UPDATE public.engine_spine_field_truth SET status='approved_truth'
   WHERE project_id=v_project_id AND spine='point-a' AND field_key='diagnosis';
  UPDATE public.engine_business_engines SET status='proposed', approved_by=NULL, approved_at=NULL WHERE id=v_engine_id;

  -- CASE G
  UPDATE public.engine_spine_field_truth SET status='contradicted'
   WHERE project_id=v_project_id AND spine='point-b' AND field_key='revenue_outcome';
  BEGIN
    UPDATE public.engine_business_engines SET status='approved', approved_by='smoke:reviewer', approved_at=now() WHERE id=v_engine_id;
    v_state := 'ALLOWED';
  EXCEPTION WHEN check_violation THEN v_state := 'BLOCKED';
           WHEN OTHERS THEN v_state := 'BLOCKED_OTHER:' || SQLSTATE || ':' || SQLERRM;
  END;
  IF v_state <> 'BLOCKED' THEN RAISE EXCEPTION 'SMOKE FAIL G: %', v_state; END IF;
  UPDATE public.engine_spine_field_truth SET status='approved_truth'
   WHERE project_id=v_project_id AND spine='point-b' AND field_key='revenue_outcome';
  UPDATE public.engine_business_engines SET status='proposed', approved_by=NULL, approved_at=NULL WHERE id=v_engine_id;

  -- CASE H
  INSERT INTO public.engine_extracted_signals (id, project_id, status, superseded_by, category, label, confidence, client_safe, source_ref)
    VALUES (v_signal_id, v_project_id, 'contradicted', NULL, 'risk', 'smoke-signal', 0.5, false, '{}'::jsonb);
  BEGIN
    UPDATE public.engine_business_engines SET status='approved', approved_by='smoke:reviewer', approved_at=now() WHERE id=v_engine_id;
    v_state := 'ALLOWED';
  EXCEPTION WHEN check_violation THEN v_state := 'BLOCKED';
           WHEN OTHERS THEN v_state := 'BLOCKED_OTHER:' || SQLSTATE || ':' || SQLERRM;
  END;
  IF v_state <> 'BLOCKED' THEN RAISE EXCEPTION 'SMOKE FAIL H: %', v_state; END IF;
  DELETE FROM public.engine_extracted_signals WHERE id=v_signal_id;
  UPDATE public.engine_business_engines SET status='proposed', approved_by=NULL, approved_at=NULL WHERE id=v_engine_id;

  -- CASE I
  UPDATE public.engine_spine_field_truth SET status='verified'
   WHERE project_id=v_project_id AND spine='point-a' AND field_key='key_diagnosis';
  BEGIN
    UPDATE public.engine_business_engines SET status='approved', approved_by='smoke:reviewer', approved_at=now() WHERE id=v_engine_id;
    v_state := 'ALLOWED';
  EXCEPTION WHEN check_violation THEN v_state := 'BLOCKED';
           WHEN OTHERS THEN v_state := 'BLOCKED_OTHER:' || SQLSTATE || ':' || SQLERRM;
  END;
  IF v_state <> 'BLOCKED' THEN RAISE EXCEPTION 'SMOKE FAIL I: %', v_state; END IF;
  UPDATE public.engine_spine_field_truth SET status='approved_truth', ceremony_id=v_ceremony_a_id,
         source_ref=jsonb_build_object('kind','ceremony')
   WHERE project_id=v_project_id AND spine='point-a' AND field_key='key_diagnosis';
  UPDATE public.engine_business_engines SET status='proposed', approved_by=NULL, approved_at=NULL WHERE id=v_engine_id;

  -- CASE J
  BEGIN
    INSERT INTO public.engine_spine_field_truth
      (project_id, spine, field_key, status, source_ref, updated_by_email, updated_by_actor, ceremony_id)
    VALUES (v_project_id, 'point-a', 'diagnosis:smoke_ai_write', 'approved_truth',
            '{}'::jsonb, NULL, 'ai', NULL);
    v_state := 'ALLOWED';
  EXCEPTION WHEN check_violation THEN v_state := 'BLOCKED';
           WHEN OTHERS THEN v_state := 'BLOCKED_OTHER:' || SQLSTATE || ':' || SQLERRM;
  END;
  IF v_state <> 'BLOCKED' THEN RAISE EXCEPTION 'SMOKE FAIL J: %', v_state; END IF;

  -- CASE J2
  BEGIN
    INSERT INTO public.engine_spine_field_truth
      (project_id, spine, field_key, status, source_ref, updated_by_email, updated_by_actor, ceremony_id)
    VALUES (v_project_id, 'point-a', 'diagnosis:unrelated_field', 'approved_truth',
            jsonb_build_object('kind','ceremony'), v_human_email, 'human', v_ceremony_a_id);
    v_state := 'ALLOWED';
  EXCEPTION WHEN check_violation THEN v_state := 'BLOCKED';
           WHEN OTHERS THEN v_state := 'BLOCKED_OTHER:' || SQLSTATE || ':' || SQLERRM;
  END;
  IF v_state <> 'BLOCKED' THEN RAISE EXCEPTION 'SMOKE FAIL J2: %', v_state; END IF;

  -- CASES K/L/M
  DECLARE v_version_id uuid := gen_random_uuid();
  BEGIN
    INSERT INTO public.engine_roadmap_versions (id, project_id, version, status, created_by)
      VALUES (v_version_id, v_project_id, 'smoke-v1', 'ai_generated', 'ai');
    UPDATE public.engine_spine_field_truth SET status='verified'
     WHERE project_id=v_project_id AND spine='point-a' AND field_key='lenses';
    BEGIN
      UPDATE public.engine_roadmap_versions SET status='approved', approved_by='smoke-operator@example.com' WHERE id=v_version_id;
      v_state := 'ALLOWED';
    EXCEPTION WHEN check_violation THEN v_state := 'BLOCKED';
             WHEN OTHERS THEN v_state := 'BLOCKED_OTHER:' || SQLSTATE || ':' || SQLERRM;
    END;
    IF v_state <> 'BLOCKED' THEN RAISE EXCEPTION 'SMOKE FAIL K: %', v_state; END IF;
    UPDATE public.engine_spine_field_truth SET status='approved_truth',
           source_ref=jsonb_build_object('kind','ceremony'), ceremony_id=v_ceremony_a_id
     WHERE project_id=v_project_id AND spine='point-a' AND field_key='lenses';

    UPDATE public.engine_spine_field_truth SET status='verified'
     WHERE project_id=v_project_id AND spine='point-b' AND field_key='brand_position';
    BEGIN
      UPDATE public.engine_projects SET status='approved' WHERE id=v_project_id;
      v_state := 'ALLOWED';
    EXCEPTION WHEN check_violation THEN v_state := 'BLOCKED';
             WHEN OTHERS THEN v_state := 'BLOCKED_OTHER:' || SQLSTATE || ':' || SQLERRM;
    END;
    IF v_state <> 'BLOCKED' THEN RAISE EXCEPTION 'SMOKE FAIL L: %', v_state; END IF;
    UPDATE public.engine_spine_field_truth SET status='approved_truth',
           source_ref=jsonb_build_object('kind','ceremony'), ceremony_id=v_ceremony_b_id
     WHERE project_id=v_project_id AND spine='point-b' AND field_key='brand_position';

    BEGIN
      UPDATE public.engine_roadmap_versions SET status='approved', approved_by='smoke-operator@example.com' WHERE id=v_version_id;
      UPDATE public.engine_projects SET status='approved' WHERE id=v_project_id;
      v_state := 'ALLOWED';
    EXCEPTION WHEN OTHERS THEN v_state := 'BLOCKED:' || SQLSTATE || ':' || SQLERRM;
    END;
    IF v_state <> 'ALLOWED' THEN RAISE EXCEPTION 'SMOKE FAIL M: %', v_state; END IF;
  END;

  RAISE EXCEPTION 'SMOKE_PASS_SENTINEL';
END;
  RETURN 'SMOKE FAIL: harness did not raise sentinel';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM = 'SMOKE_PASS_SENTINEL' THEN
      RETURN 'SMOKE PASS: all cases A-M behaved as expected';
    END IF;
    RETURN 'SMOKE FAIL: ' || SQLSTATE || ' :: ' || SQLERRM;
END
$fn$;

REVOKE ALL ON FUNCTION public._smoke_phase4() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._smoke_phase4() TO authenticated, service_role;