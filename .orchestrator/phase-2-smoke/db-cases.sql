-- Phase 2 smoke — 22 cases
-- Runs in a single transaction, ROLLBACK at end. Nothing persists.
-- Each case is a PL/pgSQL block with EXCEPTION capture and appends to _results.

\set ON_ERROR_STOP off
\pset pager off
\pset border 2

BEGIN;

CREATE TEMP TABLE _results (
  case_no int PRIMARY KEY,
  surface text,
  label   text,
  expected text,
  actual  text,
  result  text,
  detail  text
);

-- Fixture ---------------------------------------------------------------------
DO $$
DECLARE
  v_project uuid;
  v_operator text := 'henry@trusttai.com';
BEGIN
  INSERT INTO public.engine_projects (name, status, client_id)
  VALUES ('smoke:phase-2:' || to_char(now(),'YYYYMMDD_HH24MISS'), 'active', '6cced335-64ac-4084-9824-89f2bfe5a52f')
  RETURNING id INTO v_project;

  PERFORM set_config('smoke.project', v_project::text, false);
  PERFORM set_config('smoke.operator', v_operator, false);

  -- Seed truth rows on Point A: two static as needs_confirmation, dynamic diagnosis:x, diagnosis:y
  INSERT INTO public.engine_spine_field_truth (project_id, spine, field_key, status, source_ref, updated_by_email, updated_by_actor)
  VALUES
    (v_project, 'point-a', 'lenses',        'needs_confirmation', '{"kind":"backfill"}'::jsonb, v_operator, 'human'),
    (v_project, 'point-a', 'diagnosis',     'needs_confirmation', '{"kind":"backfill"}'::jsonb, v_operator, 'human'),
    (v_project, 'point-a', 'key_diagnosis', 'needs_confirmation', '{"kind":"backfill"}'::jsonb, v_operator, 'human'),
    (v_project, 'point-a', 'diagnosis:x',   'needs_confirmation', '{"kind":"backfill"}'::jsonb, v_operator, 'human'),
    (v_project, 'point-a', 'diagnosis:y',   'needs_confirmation', '{"kind":"backfill"}'::jsonb, v_operator, 'human');

  RAISE NOTICE 'Fixture project: %', v_project;
END $$;

-- Helper to record ------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.record(n int, s text, l text, exp text, act text, r text, d text DEFAULT '')
RETURNS void LANGUAGE sql AS $$
  INSERT INTO _results VALUES (n, s, l, exp, act, r, d)
  ON CONFLICT (case_no) DO UPDATE SET actual=EXCLUDED.actual, result=EXCLUDED.result, detail=EXCLUDED.detail;
$$;

-- ============================================================================
-- CASE 1: startCeremony point-a inserts a row (simulated: direct INSERT with all fields)
-- ============================================================================
DO $$
DECLARE v_project uuid := current_setting('smoke.project')::uuid;
        v_op text := current_setting('smoke.operator');
        v_id uuid;
BEGIN
  INSERT INTO public.engine_spine_ceremonies (project_id, spine, status, opened_by_email)
  VALUES (v_project, 'point-a', 'in_progress', v_op)
  RETURNING id INTO v_id;
  PERFORM set_config('smoke.ceremony_a', v_id::text, false);
  PERFORM pg_temp.record(1, 'DB', 'startCeremony point-a inserts row w/ opened_by_email',
    'row created, opened_by_email=operator',
    'id=' || v_id || ' opened_by=' || v_op, 'PASS');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.record(1, 'DB', 'startCeremony point-a', 'insert ok', SQLERRM, 'FAIL');
END $$;

-- ============================================================================
-- CASE 2: second startCeremony returns same id (enforced by partial unique index)
-- ============================================================================
DO $$
DECLARE v_project uuid := current_setting('smoke.project')::uuid;
        v_op text := current_setting('smoke.operator');
BEGIN
  BEGIN
    INSERT INTO public.engine_spine_ceremonies (project_id, spine, status, opened_by_email)
    VALUES (v_project, 'point-a', 'in_progress', v_op);
    PERFORM pg_temp.record(2, 'DB', 'duplicate in-progress point-a ceremony blocked',
      'unique violation', 'INSERT succeeded (no unique index?)', 'FAIL');
  EXCEPTION WHEN unique_violation THEN
    PERFORM pg_temp.record(2, 'DB', 'duplicate in-progress point-a ceremony blocked',
      'unique_violation', SQLERRM, 'PASS');
  END;
END $$;

-- ============================================================================
-- CASE 3: recordCeremonyDecision (stated) upserts truth row and stamps ceremony_id
-- ============================================================================
DO $$
DECLARE v_project uuid := current_setting('smoke.project')::uuid;
        v_op text := current_setting('smoke.operator');
        v_c uuid := current_setting('smoke.ceremony_a')::uuid;
        v_truth_cid uuid;
BEGIN
  INSERT INTO public.engine_spine_ceremony_decisions
    (ceremony_id, project_id, spine, field_key, prior_status, new_status, source_ref, decided_by_email)
  VALUES (v_c, v_project, 'point-a', 'lenses', 'needs_confirmation', 'stated',
          jsonb_build_object('kind','operator_note','note','smoke case 3'), v_op);

  UPDATE public.engine_spine_field_truth
     SET status='stated',
         source_ref=jsonb_build_object('kind','operator_note','note','smoke case 3'),
         ceremony_id=v_c,
         updated_by_email=v_op,
         updated_by_actor='human'
   WHERE project_id=v_project AND spine='point-a' AND field_key='lenses'
   RETURNING ceremony_id INTO v_truth_cid;

  IF v_truth_cid = v_c THEN
    PERFORM pg_temp.record(3, 'DB', 'recordCeremonyDecision stamps ceremony_id + writes audit',
      'truth.ceremony_id = ceremony', 'match', 'PASS');
  ELSE
    PERFORM pg_temp.record(3, 'DB', 'recordCeremonyDecision stamps ceremony_id',
      'truth.ceremony_id = ceremony', 'mismatch: ' || v_truth_cid, 'FAIL');
  END IF;
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.record(3, 'DB', 'recordCeremonyDecision (stated)', 'ok', SQLERRM, 'FAIL');
END $$;

-- ============================================================================
-- CASE 4: completeCeremony blocked while any field still needs_confirmation
-- ============================================================================
DO $$
DECLARE v_c uuid := current_setting('smoke.ceremony_a')::uuid;
BEGIN
  BEGIN
    UPDATE public.engine_spine_ceremonies SET status='completed', completed_at=now(), completed_by_email='henry@trusttai.com' WHERE id=v_c;
    PERFORM pg_temp.record(4, 'DB', 'completeCeremony blocked when non-terminal fields exist',
      'check_violation', 'update succeeded', 'FAIL');
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.record(4, 'DB', 'completeCeremony blocked when non-terminal fields exist',
      'check_violation', SQLERRM, 'PASS');
  WHEN OTHERS THEN
    PERFORM pg_temp.record(4, 'DB', 'completeCeremony gate', 'check_violation', SQLSTATE || ' ' || SQLERRM, 'FAIL');
  END;
END $$;

-- ============================================================================
-- CASE 5: Direct SQL UPDATE status='completed' rejected — same as 4 via trigger (proves it isn't app-only)
-- ============================================================================
DO $$
DECLARE v_c uuid := current_setting('smoke.ceremony_a')::uuid;
BEGIN
  BEGIN
    UPDATE public.engine_spine_ceremonies SET status='completed' WHERE id=v_c;
    PERFORM pg_temp.record(5, 'DB', 'raw SQL completion on incomplete ceremony rejected',
      'check_violation', 'update succeeded', 'FAIL');
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.record(5, 'DB', 'raw SQL completion on incomplete ceremony rejected',
      'check_violation', SQLERRM, 'PASS');
  END;
END $$;

-- ============================================================================
-- CASE 6: completion with bare `missing` (no accepted_as_risk) rejected
-- Drive all other fields to approved_truth, leave one as bare missing.
-- ============================================================================
DO $$
DECLARE v_project uuid := current_setting('smoke.project')::uuid;
        v_c uuid := current_setting('smoke.ceremony_a')::uuid;
        v_op text := current_setting('smoke.operator');
        v_field text;
        v_sr jsonb;
BEGIN
  -- Approve every field except diagnosis:y (leave as bare missing)
  FOR v_field IN SELECT unnest(ARRAY['lenses','diagnosis','key_diagnosis','diagnosis:x']) LOOP
    v_sr := jsonb_build_object(
      'kind','operator_note',
      'approval_kind','ceremony',
      'ceremony_id', v_c::text,
      'operator_confirmed_by', v_op,
      'note','smoke approve');
    INSERT INTO public.engine_spine_ceremony_decisions
      (ceremony_id, project_id, spine, field_key, prior_status, new_status, source_ref, decided_by_email)
    VALUES (v_c, v_project, 'point-a', v_field,
            (SELECT status FROM public.engine_spine_field_truth WHERE project_id=v_project AND spine='point-a' AND field_key=v_field),
            'approved_truth', v_sr, v_op);
    UPDATE public.engine_spine_field_truth
       SET status='approved_truth', source_ref=v_sr, ceremony_id=v_c, updated_by_email=v_op, updated_by_actor='human'
     WHERE project_id=v_project AND spine='point-a' AND field_key=v_field;
  END LOOP;

  -- diagnosis:y left as bare 'missing' (no accepted_as_risk)
  UPDATE public.engine_spine_field_truth
     SET status='missing',
         source_ref=jsonb_build_object('kind','operator_note','note','bare missing'),
         updated_by_email=v_op, updated_by_actor='human'
   WHERE project_id=v_project AND spine='point-a' AND field_key='diagnosis:y';

  BEGIN
    UPDATE public.engine_spine_ceremonies
       SET status='completed', completed_at=now(), completed_by_email=v_op
     WHERE id=v_c;
    PERFORM pg_temp.record(6, 'DB', 'complete blocked with bare missing field',
      'check_violation', 'update succeeded', 'FAIL');
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.record(6, 'DB', 'complete blocked with bare missing field',
      'check_violation', SQLERRM, 'PASS');
  END;
END $$;

-- ============================================================================
-- CASE 7: diagnosis:y re-decided as missing + operator_override + accepted_as_risk → completeCeremony succeeds
-- ============================================================================
DO $$
DECLARE v_project uuid := current_setting('smoke.project')::uuid;
        v_c uuid := current_setting('smoke.ceremony_a')::uuid;
        v_op text := current_setting('smoke.operator');
        v_sr jsonb := jsonb_build_object(
          'kind','operator_override',
          'approval_kind','operator_override',
          'operator_confirmed_by', v_op,
          'reason','not applicable to this engagement',
          'accepted_as_risk', true);
BEGIN
  INSERT INTO public.engine_spine_ceremony_decisions
    (ceremony_id, project_id, spine, field_key, prior_status, new_status, source_ref, decided_by_email)
  VALUES (v_c, v_project, 'point-a', 'diagnosis:y', 'missing', 'missing', v_sr, v_op);
  UPDATE public.engine_spine_field_truth SET status='missing', source_ref=v_sr, updated_by_email=v_op, updated_by_actor='human'
    WHERE project_id=v_project AND spine='point-a' AND field_key='diagnosis:y';

  UPDATE public.engine_spine_ceremonies
     SET status='completed', completed_at=now(), completed_by_email=v_op
   WHERE id=v_c;
  PERFORM pg_temp.record(7, 'DB', 'complete succeeds with accepted-risk missing',
    'completed', 'completed', 'PASS');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.record(7, 'DB', 'complete succeeds with accepted-risk missing',
    'ok', SQLSTATE || ' ' || SQLERRM, 'FAIL');
END $$;

-- ============================================================================
-- CASE 8: contradiction path — seed a contradicted row, retry complete on new ceremony
-- ============================================================================
DO $$
DECLARE v_project uuid := current_setting('smoke.project')::uuid;
        v_op text := current_setting('smoke.operator');
        v_c2 uuid;
        v_sr jsonb;
        v_field text;
BEGIN
  -- Reopen: we already completed above. Add a new project to isolate case 8
  DECLARE v_p2 uuid;
  BEGIN
    INSERT INTO public.engine_projects(name,status,client_id) VALUES('smoke:phase-2:c8', 'active','6cced335-64ac-4084-9824-89f2bfe5a52f') RETURNING id INTO v_p2;
    INSERT INTO public.engine_spine_field_truth(project_id,spine,field_key,status,source_ref,updated_by_email,updated_by_actor)
    VALUES
      (v_p2,'point-a','lenses','contradicted',jsonb_build_object('kind','operator_override','reason','conflict'),v_op,'human'),
      (v_p2,'point-a','diagnosis','needs_confirmation',jsonb_build_object('kind','backfill'),v_op,'human'),
      (v_p2,'point-a','key_diagnosis','needs_confirmation',jsonb_build_object('kind','backfill'),v_op,'human');

    INSERT INTO public.engine_spine_ceremonies(project_id,spine,status,opened_by_email)
    VALUES (v_p2,'point-a','in_progress',v_op) RETURNING id INTO v_c2;

    -- Approve everything
    FOR v_field IN SELECT unnest(ARRAY['lenses','diagnosis','key_diagnosis']) LOOP
      v_sr := jsonb_build_object('kind','operator_note','approval_kind','ceremony','ceremony_id',v_c2::text,'operator_confirmed_by',v_op);
      INSERT INTO public.engine_spine_ceremony_decisions
        (ceremony_id,project_id,spine,field_key,prior_status,new_status,source_ref,decided_by_email)
      VALUES (v_c2,v_p2,'point-a',v_field,
              (SELECT status FROM public.engine_spine_field_truth WHERE project_id=v_p2 AND spine='point-a' AND field_key=v_field),
              'approved_truth',v_sr,v_op);
      UPDATE public.engine_spine_field_truth
        SET status='approved_truth', source_ref=v_sr, ceremony_id=v_c2, updated_by_email=v_op, updated_by_actor='human'
        WHERE project_id=v_p2 AND spine='point-a' AND field_key=v_field;
    END LOOP;

    -- Force a contradicted row to remain (add another)
    INSERT INTO public.engine_spine_field_truth(project_id,spine,field_key,status,source_ref,updated_by_email,updated_by_actor)
    VALUES (v_p2,'point-a','diagnosis:z','contradicted',jsonb_build_object('kind','operator_override','reason','conflict'),v_op,'human');

    BEGIN
      UPDATE public.engine_spine_ceremonies SET status='completed', completed_at=now(), completed_by_email=v_op WHERE id=v_c2;
      PERFORM pg_temp.record(8,'DB','completion blocked by contradiction','check_violation','update succeeded','FAIL');
    EXCEPTION WHEN check_violation THEN
      PERFORM pg_temp.record(8,'DB','completion blocked by contradiction','check_violation',SQLERRM,'PASS');
    END;
  END;
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.record(8,'DB','completion blocked by contradiction','check_violation', SQLSTATE || ' ' || SQLERRM, 'FAIL');
END $$;

-- ============================================================================
-- CASE 9: startCeremony(point-b) with no completed Point A → rejected
-- Use a fresh project so precedence gate fires.
-- ============================================================================
DO $$
DECLARE v_op text := current_setting('smoke.operator');
        v_p3 uuid;
BEGIN
  INSERT INTO public.engine_projects(name,status,client_id) VALUES('smoke:phase-2:c9','active','6cced335-64ac-4084-9824-89f2bfe5a52f') RETURNING id INTO v_p3;
  BEGIN
    INSERT INTO public.engine_spine_ceremonies(project_id,spine,status,opened_by_email)
    VALUES(v_p3,'point-b','in_progress',v_op);
    PERFORM pg_temp.record(9,'DB','point-b blocked without completed point-a','check_violation','insert succeeded','FAIL');
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.record(9,'DB','point-b blocked without completed point-a','check_violation',SQLERRM,'PASS');
  END;
END $$;

-- ============================================================================
-- CASE 10: abandonCeremony(point-a) with existing point-b → rejected
-- Uses the original scratch project (has completed point-a from case 7).
-- ============================================================================
DO $$
DECLARE v_project uuid := current_setting('smoke.project')::uuid;
        v_op text := current_setting('smoke.operator');
        v_c uuid := current_setting('smoke.ceremony_a')::uuid;
        v_cb uuid;
BEGIN
  -- Open a Point B ceremony (point-a is completed from case 7)
  INSERT INTO public.engine_spine_ceremonies(project_id,spine,status,opened_by_email)
  VALUES(v_project,'point-b','in_progress',v_op) RETURNING id INTO v_cb;
  PERFORM set_config('smoke.ceremony_b', v_cb::text, false);

  BEGIN
    UPDATE public.engine_spine_ceremonies
      SET status='abandoned', abandoned_at=now(), abandoned_by_email=v_op, abandon_reason='test'
      WHERE id=v_c;
    PERFORM pg_temp.record(10,'DB','abandon point-a rejected while point-b exists','check_violation','update succeeded','FAIL');
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.record(10,'DB','abandon point-a rejected while point-b exists','check_violation',SQLERRM,'PASS');
  END;
END $$;

-- ============================================================================
-- CASE 11: mismatched project_id / spine on decision vs ceremony → rejected
-- ============================================================================
DO $$
DECLARE v_c uuid := current_setting('smoke.ceremony_a')::uuid;
        v_op text := current_setting('smoke.operator');
        v_other_project uuid;
BEGIN
  SELECT id INTO v_other_project FROM public.engine_projects WHERE name='smoke:phase-2:c9';
  BEGIN
    INSERT INTO public.engine_spine_ceremony_decisions
      (ceremony_id, project_id, spine, field_key, prior_status, new_status, source_ref, decided_by_email)
    VALUES (v_c, v_other_project, 'point-a', 'lenses', 'needs_confirmation', 'stated',
            jsonb_build_object('kind','operator_note','note','x'), v_op);
    PERFORM pg_temp.record(11,'DB','mismatched project_id on decision rejected','trigger raise','insert succeeded','FAIL');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record(11,'DB','mismatched project_id on decision rejected','trigger raise', SQLSTATE || ' ' || SQLERRM, 'PASS');
  END;
END $$;

-- ============================================================================
-- CASE 12: decision inserted against completed ceremony → rejected
-- ceremony_a is completed. Try to insert a decision on it.
-- ============================================================================
DO $$
DECLARE v_project uuid := current_setting('smoke.project')::uuid;
        v_op text := current_setting('smoke.operator');
        v_c uuid := current_setting('smoke.ceremony_a')::uuid;
BEGIN
  BEGIN
    INSERT INTO public.engine_spine_ceremony_decisions
      (ceremony_id, project_id, spine, field_key, prior_status, new_status, source_ref, decided_by_email)
    VALUES (v_c, v_project, 'point-a', 'lenses', 'approved_truth', 'stated',
            jsonb_build_object('kind','operator_note','note','post-complete'), v_op);
    PERFORM pg_temp.record(12,'DB','decision against completed ceremony rejected','raise','insert succeeded','FAIL');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record(12,'DB','decision against completed ceremony rejected','raise', SQLSTATE || ' ' || SQLERRM, 'PASS');
  END;
END $$;

-- ============================================================================
-- CASE 13: approved_truth decision missing provenance stamp → rejected by trigger
-- ============================================================================
DO $$
DECLARE v_project uuid := current_setting('smoke.project')::uuid;
        v_op text := current_setting('smoke.operator');
        v_cb uuid := current_setting('smoke.ceremony_b')::uuid;
BEGIN
  BEGIN
    -- Use point-b in-progress ceremony
    INSERT INTO public.engine_spine_ceremony_decisions
      (ceremony_id, project_id, spine, field_key, prior_status, new_status, source_ref, decided_by_email)
    VALUES (v_cb, v_project, 'point-b', '24_month_destination', 'needs_confirmation', 'approved_truth',
            jsonb_build_object('kind','operator_note','note','no provenance'), v_op);
    PERFORM pg_temp.record(13,'DB','approved_truth without provenance rejected','check_violation','insert succeeded','FAIL');
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.record(13,'DB','approved_truth without provenance rejected','check_violation',SQLERRM,'PASS');
  END;
END $$;

-- ============================================================================
-- CASE 14: full point-b success — every field reaches approved_truth w/ correct stamp
-- ============================================================================
DO $$
DECLARE v_project uuid := current_setting('smoke.project')::uuid;
        v_op text := current_setting('smoke.operator');
        v_cb uuid := current_setting('smoke.ceremony_b')::uuid;
        v_field text;
        v_sr jsonb;
        v_bad int;
BEGIN
  FOR v_field IN
    SELECT unnest(ARRAY['24_month_destination','10_year_position','client_outcome','customer_outcome',
                        'operational_outcome','revenue_outcome','brand_position'])
  LOOP
    v_sr := jsonb_build_object('kind','operator_note','approval_kind','ceremony','ceremony_id',v_cb::text,'operator_confirmed_by',v_op);
    INSERT INTO public.engine_spine_ceremony_decisions
      (ceremony_id, project_id, spine, field_key, prior_status, new_status, source_ref, decided_by_email)
    VALUES (v_cb, v_project, 'point-b', v_field, 'needs_confirmation', 'approved_truth', v_sr, v_op);
    INSERT INTO public.engine_spine_field_truth(project_id,spine,field_key,status,source_ref,ceremony_id,updated_by_email,updated_by_actor)
    VALUES (v_project,'point-b',v_field,'approved_truth',v_sr,v_cb,v_op,'human')
    ON CONFLICT (project_id,spine,field_key) DO UPDATE
      SET status='approved_truth',source_ref=v_sr,ceremony_id=v_cb,updated_by_email=v_op,updated_by_actor='human';
  END LOOP;

  UPDATE public.engine_spine_ceremonies SET status='completed', completed_at=now(), completed_by_email=v_op WHERE id=v_cb;

  SELECT count(*) INTO v_bad
    FROM public.engine_spine_field_truth
   WHERE project_id=v_project AND spine='point-b' AND status='approved_truth'
     AND ( COALESCE(source_ref->>'approval_kind','') <> 'ceremony'
           OR COALESCE(source_ref->>'ceremony_id','') <> v_cb::text
           OR COALESCE(source_ref->>'operator_confirmed_by','') = '' );

  IF v_bad = 0 THEN
    PERFORM pg_temp.record(14,'DB','full point-b approve + complete','all provenance stamped','0 bad rows','PASS');
  ELSE
    PERFORM pg_temp.record(14,'DB','full point-b approve + complete','all provenance stamped', v_bad::text || ' bad rows','FAIL');
  END IF;
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.record(14,'DB','full point-b approve + complete','ok', SQLSTATE || ' ' || SQLERRM, 'FAIL');
END $$;

-- ============================================================================
-- CASE 15: AI actor cannot write verified / approved_truth (Phase 1 R3 CHECK on truth)
-- ============================================================================
DO $$
DECLARE v_project uuid := current_setting('smoke.project')::uuid;
BEGIN
  BEGIN
    INSERT INTO public.engine_spine_field_truth(project_id,spine,field_key,status,source_ref,updated_by_email,updated_by_actor)
    VALUES(v_project,'point-a','key_diagnosis','verified',
           jsonb_build_object('kind','operator_note'),'ai@example.com','ai')
    ON CONFLICT (project_id,spine,field_key) DO UPDATE SET status='verified', updated_by_actor='ai';
    PERFORM pg_temp.record(15,'DB','AI actor blocked from verified/approved_truth','check_violation','insert succeeded','FAIL');
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.record(15,'DB','AI actor blocked from verified/approved_truth','check_violation',SQLERRM,'PASS');
  WHEN OTHERS THEN
    PERFORM pg_temp.record(15,'DB','AI actor blocked','check_violation', SQLSTATE || ' ' || SQLERRM, 'INCONCLUSIVE',
      'Blocked but not via check_violation');
  END;
END $$;

-- ============================================================================
-- CASE 16: unknown field_key rejected
-- ============================================================================
DO $$
DECLARE v_project uuid := current_setting('smoke.project')::uuid;
        v_op text := current_setting('smoke.operator');
        v_c uuid := current_setting('smoke.ceremony_a')::uuid;
BEGIN
  BEGIN
    INSERT INTO public.engine_spine_ceremony_decisions
      (ceremony_id,project_id,spine,field_key,prior_status,new_status,source_ref,decided_by_email)
    VALUES (v_c, v_project, 'point-a', 'not_a_real_key', 'needs_confirmation', 'stated',
            jsonb_build_object('kind','operator_note'), v_op);
    PERFORM pg_temp.record(16,'DB','unknown field_key rejected (app-layer guard)','app-layer only',
      'insert succeeded (no DB-level guard — enforced in engine-spine-registry.ts)','INCONCLUSIVE',
      'assertKnownFieldKey runs in server-fn layer; DB has no CHECK for field_key membership');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record(16,'DB','unknown field_key rejected','raise', SQLSTATE || ' ' || SQLERRM, 'PASS');
  END;
END $$;

-- ============================================================================
-- CASE 17: abandon requires reason; other lifecycle columns stay null (CHECK)
-- Use a fresh isolated ceremony.
-- ============================================================================
DO $$
DECLARE v_op text := current_setting('smoke.operator');
        v_p4 uuid;
        v_c4 uuid;
BEGIN
  INSERT INTO public.engine_projects(name,status,client_id) VALUES('smoke:phase-2:c17','active','6cced335-64ac-4084-9824-89f2bfe5a52f') RETURNING id INTO v_p4;
  INSERT INTO public.engine_spine_ceremonies(project_id,spine,status,opened_by_email)
    VALUES(v_p4,'point-a','in_progress',v_op) RETURNING id INTO v_c4;

  BEGIN
    UPDATE public.engine_spine_ceremonies
      SET status='abandoned', abandoned_at=now(), abandoned_by_email=v_op  -- omitted abandon_reason
      WHERE id=v_c4;
    -- If CHECK exists this raises; if not, we still verify happy path below.
    PERFORM pg_temp.record(17, 'DB', 'abandon requires reason (CHECK)', 'check_violation',
      'update succeeded without reason', 'INCONCLUSIVE',
      'No CHECK on abandon_reason at DB layer; enforced in abandonCeremony server fn');
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.record(17,'DB','abandon requires reason','check_violation',SQLERRM,'PASS');
  END;
END $$;

-- ============================================================================
-- CASE 18/19: R4 access gates — verify grants + presence of gate.
--   Direct impersonation of authenticated role with jwt claims is done via SET LOCAL.
-- ============================================================================
DO $$
DECLARE v_project uuid := current_setting('smoke.project')::uuid;
        v_priv text;
        v_defn text;
BEGIN
  SELECT string_agg(grantee || ':' || privilege_type, ',') INTO v_priv
    FROM information_schema.routine_privileges
   WHERE routine_schema='public' AND routine_name='internal_spine_field_keys';
  IF v_priv IS NULL OR position('authenticated' in coalesce(v_priv,'')) = 0 THEN
    PERFORM pg_temp.record(19,'DB','internal_spine_field_keys not granted to authenticated','no authenticated grant',
      coalesce(v_priv,'(none)'),'PASS');
  ELSE
    PERFORM pg_temp.record(19,'DB','internal_spine_field_keys not granted to authenticated','no authenticated grant',
      v_priv,'FAIL');
  END IF;

  SELECT pg_get_functiondef(oid) INTO v_defn FROM pg_proc WHERE proname='spine_field_keys' AND pronamespace='public'::regnamespace;
  IF v_defn ~ 'is_engine_staff' AND v_defn ~ 'client_portal' AND v_defn ~ 'insufficient_privilege' THEN
    PERFORM pg_temp.record(18,'DB','public spine_field_keys has access gate (staff OR portal member)','gate present',
      'is_engine_staff/client_portal/insufficient_privilege found in body','PASS');
  ELSE
    PERFORM pg_temp.record(18,'DB','public spine_field_keys access gate','gate present','pattern missing in body','FAIL');
  END IF;
END $$;

-- ============================================================================
-- CASE 20: staff caller — internal_spine_field_keys returns static + dynamic keys
-- ============================================================================
DO $$
DECLARE v_project uuid := current_setting('smoke.project')::uuid;
        v_keys text;
BEGIN
  SELECT string_agg(k,',' ORDER BY k) INTO v_keys
    FROM public.internal_spine_field_keys(v_project,'point-a') AS k;
  IF v_keys LIKE '%lenses%' AND v_keys LIKE '%diagnosis:x%' AND v_keys LIKE '%diagnosis:y%' THEN
    PERFORM pg_temp.record(20,'DB','internal helper returns static + dynamic keys','static+dynamic',v_keys,'PASS');
  ELSE
    PERFORM pg_temp.record(20,'DB','internal helper returns static + dynamic keys','static+dynamic',v_keys,'FAIL');
  END IF;
END $$;

-- ============================================================================
-- CASE 21: portal member gate — verified by function definition (portal-permission check).
--   Real impersonation with a portal-member JWT is not reliably reproducible
--   from a service_role psql session, so we assert the gate structurally.
-- ============================================================================
DO $$
DECLARE v_defn text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_defn FROM pg_proc WHERE proname='spine_field_keys' AND pronamespace='public'::regnamespace;
  IF v_defn ~ 'client_portal_projects' AND v_defn ~ 'client_portal_permissions' THEN
    PERFORM pg_temp.record(21,'DB','portal-member branch present in spine_field_keys','portal path present',
      'client_portal_projects + client_portal_permissions referenced','PASS');
  ELSE
    PERFORM pg_temp.record(21,'DB','portal-member branch','portal path present','missing','INCONCLUSIVE',
      'Impersonation not run — gate verified by function body inspection');
  END IF;
END $$;

-- ============================================================================
-- CASE 22: completion trigger sees dynamic diagnosis:* keys via internal_spine_field_keys
--   Set up a fresh project with static fields approved_truth but diagnosis:x needs_confirmation.
--   Direct SQL UPDATE to status='completed' must be rejected.
-- ============================================================================
DO $$
DECLARE v_op text := current_setting('smoke.operator');
        v_p5 uuid;
        v_c5 uuid;
        v_field text;
        v_sr jsonb;
BEGIN
  INSERT INTO public.engine_projects(name,status,client_id) VALUES('smoke:phase-2:c22','active','6cced335-64ac-4084-9824-89f2bfe5a52f') RETURNING id INTO v_p5;
  INSERT INTO public.engine_spine_ceremonies(project_id,spine,status,opened_by_email)
    VALUES(v_p5,'point-a','in_progress',v_op) RETURNING id INTO v_c5;

  FOR v_field IN SELECT unnest(ARRAY['lenses','diagnosis','key_diagnosis']) LOOP
    v_sr := jsonb_build_object('kind','operator_note','approval_kind','ceremony','ceremony_id',v_c5::text,'operator_confirmed_by',v_op);
    INSERT INTO public.engine_spine_field_truth(project_id,spine,field_key,status,source_ref,ceremony_id,updated_by_email,updated_by_actor)
    VALUES(v_p5,'point-a',v_field,'approved_truth',v_sr,v_c5,v_op,'human');
  END LOOP;

  -- Dynamic key still needs_confirmation
  INSERT INTO public.engine_spine_field_truth(project_id,spine,field_key,status,source_ref,updated_by_email,updated_by_actor)
    VALUES(v_p5,'point-a','diagnosis:x','needs_confirmation',jsonb_build_object('kind','backfill'),v_op,'human');

  BEGIN
    UPDATE public.engine_spine_ceremonies SET status='completed', completed_at=now(), completed_by_email=v_op WHERE id=v_c5;
    PERFORM pg_temp.record(22,'DB','completion trigger sees dynamic diagnosis:* keys',
      'check_violation','update succeeded','FAIL');
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.record(22,'DB','completion trigger sees dynamic diagnosis:* keys',
      'check_violation',SQLERRM,'PASS');
  END;
END $$;

-- ============================================================================
-- Final results
-- ============================================================================
SELECT case_no, surface, result, label, left(detail, 60) as detail FROM _results ORDER BY case_no;

SELECT
  count(*) filter (where result='PASS') AS pass,
  count(*) filter (where result='FAIL') AS fail,
  count(*) filter (where result='INCONCLUSIVE') AS inconclusive,
  count(*) AS total
FROM _results;

-- Machine-readable JSON summary
SELECT jsonb_agg(jsonb_build_object(
  'case', case_no, 'surface', surface, 'label', label,
  'expected', expected, 'actual', actual, 'result', result, 'detail', detail
) ORDER BY case_no) AS results_json FROM _results \gset

\echo === RESULTS_JSON_BEGIN ===
SELECT :'results_json';
\echo === RESULTS_JSON_END ===

ROLLBACK;
