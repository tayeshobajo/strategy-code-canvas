CREATE OR REPLACE FUNCTION public.activate_business_engine(_engine_id uuid, _owner_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.engine_business_engines%ROWTYPE;
  v_actor text := public.internal_caller_email();
  v_readiness jsonb;
  v_ready boolean;
  v_missing_a int;
  v_missing_b int;
BEGIN
  IF NOT public.is_engine_staff() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='insufficient_privilege';
  END IF;
  IF COALESCE(TRIM(_owner_email),'')='' THEN
    RAISE EXCEPTION 'owner_email required' USING ERRCODE='check_violation';
  END IF;

  SELECT * INTO v_row FROM public.engine_business_engines WHERE id=_engine_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Engine % not found', _engine_id USING ERRCODE='no_data_found';
  END IF;

  IF v_row.status <> 'active' THEN
    v_readiness := public.spine_points_approved(v_row.project_id);
    v_ready := COALESCE((v_readiness->>'ready')::boolean, false);
    v_missing_a := COALESCE(jsonb_array_length(v_readiness->'point_a'->'missing'), 0);
    v_missing_b := COALESCE(jsonb_array_length(v_readiness->'point_b'->'missing'), 0);

    IF NOT v_ready THEN
      RAISE EXCEPTION 'Cannot activate engine %: spine not ready (point_a missing=%, point_b missing=%, contradictions=%)',
        _engine_id, v_missing_a, v_missing_b,
        COALESCE((v_readiness->>'has_active_contradictions')::boolean, false)
        USING ERRCODE='check_violation';
    END IF;

    IF public.internal_project_has_contradictions(v_row.project_id) THEN
      RAISE EXCEPTION 'Cannot activate engine %: project has active spine contradictions', _engine_id
        USING ERRCODE='check_violation';
    END IF;
  END IF;

  IF v_row.status <> 'approved' AND v_row.status <> 'active' THEN
    UPDATE public.engine_business_engines
       SET status='approved', approved_by=v_actor,
           approved_at=COALESCE(approved_at, now()), owner_email=_owner_email
     WHERE id=_engine_id;
  ELSE
    UPDATE public.engine_business_engines SET owner_email=_owner_email WHERE id=_engine_id;
  END IF;

  UPDATE public.engine_business_engines
     SET status='active',
         next_run_at=COALESCE(next_run_at, public.internal_engine_next_run(v_row.cadence, now()))
   WHERE id=_engine_id;

  INSERT INTO public.engine_audit_log (project_id, actor_email, action, entity_type, entity_id, detail)
  VALUES (v_row.project_id, v_actor, 'engine.activated', 'business_engine', _engine_id,
    jsonb_build_object('owner_email', _owner_email, 'cadence', v_row.cadence, 'spine_ready', true));
END; $$;

REVOKE ALL ON FUNCTION public.activate_business_engine(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_business_engine(uuid, text) TO authenticated, service_role;