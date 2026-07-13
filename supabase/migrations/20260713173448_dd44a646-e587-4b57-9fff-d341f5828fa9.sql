
CREATE OR REPLACE FUNCTION public.internal_caller_email()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((auth.jwt() ->> 'email'), (auth.jwt() -> 'user_metadata' ->> 'email'), 'system')
$$;
REVOKE ALL ON FUNCTION public.internal_caller_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.internal_caller_email() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.propose_milestone_solution(_milestone_id uuid, _payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_project_id uuid; v_id uuid; v_actor text := public.internal_caller_email();
BEGIN
  IF NOT public.is_engine_staff() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='insufficient_privilege'; END IF;
  SELECT project_id INTO v_project_id FROM public.engine_milestones WHERE id = _milestone_id;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'Milestone % not found', _milestone_id USING ERRCODE='no_data_found'; END IF;
  INSERT INTO public.engine_milestone_solutions (
    milestone_id, project_id, title, summary, rationale, effort_estimate, investment_estimate_cents,
    assumptions, depends_on_solution_ids, depends_on_milestone_ids, evidence_source_ids, metadata, created_by
  ) VALUES (
    _milestone_id, v_project_id,
    COALESCE(NULLIF(_payload->>'title',''), 'Untitled solution'),
    NULLIF(_payload->>'summary',''), NULLIF(_payload->>'rationale',''),
    NULLIF(_payload->>'effort_estimate',''),
    NULLIF((_payload->>'investment_estimate_cents'),'')::int,
    COALESCE(_payload->'assumptions','[]'::jsonb),
    COALESCE(ARRAY(SELECT (jsonb_array_elements_text(_payload->'depends_on_solution_ids'))::uuid),'{}'::uuid[]),
    COALESCE(ARRAY(SELECT (jsonb_array_elements_text(_payload->'depends_on_milestone_ids'))::uuid),'{}'::uuid[]),
    COALESCE(ARRAY(SELECT (jsonb_array_elements_text(_payload->'evidence_source_ids'))::uuid),'{}'::uuid[]),
    COALESCE(_payload->'metadata','{}'::jsonb),
    COALESCE(NULLIF(_payload->>'created_by',''), v_actor)
  ) RETURNING id INTO v_id;
  INSERT INTO public.engine_audit_log (project_id, actor_email, action, entity_type, entity_id, detail)
  VALUES (v_project_id, v_actor, 'solution.proposed', 'milestone_solution', v_id,
    jsonb_build_object('milestone_id', _milestone_id, 'title', _payload->>'title'));
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.propose_milestone_solution(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.propose_milestone_solution(uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.select_milestone_solution(_solution_id uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.engine_milestone_solutions%ROWTYPE; v_actor text := public.internal_caller_email();
BEGIN
  IF NOT public.is_engine_staff() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='insufficient_privilege'; END IF;
  SELECT * INTO v_row FROM public.engine_milestone_solutions WHERE id = _solution_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Solution % not found', _solution_id USING ERRCODE='no_data_found'; END IF;
  IF v_row.created_by IS NOT NULL AND v_row.created_by ILIKE 'agent:%' AND v_row.created_by = v_actor THEN
    RAISE EXCEPTION 'AI-created solution % cannot be self-approved', _solution_id USING ERRCODE='check_violation';
  END IF;
  UPDATE public.engine_milestone_solutions
     SET status='selected', approved_by=v_actor, approved_at=now()
   WHERE id=_solution_id;
  INSERT INTO public.engine_audit_log (project_id, actor_email, action, entity_type, entity_id, detail)
  VALUES (v_row.project_id, v_actor, 'solution.selected', 'milestone_solution', _solution_id,
    jsonb_build_object('milestone_id', v_row.milestone_id, 'reason', _reason));
END; $$;
REVOKE ALL ON FUNCTION public.select_milestone_solution(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.select_milestone_solution(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.internal_engine_next_run(_cadence business_engine_cadence, _from timestamptz)
RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _cadence
    WHEN 'daily' THEN _from + interval '1 day'
    WHEN 'weekly' THEN _from + interval '7 days'
    WHEN 'biweekly' THEN _from + interval '14 days'
    WHEN 'monthly' THEN _from + interval '1 month'
    WHEN 'quarterly' THEN _from + interval '3 months'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.activate_business_engine(_engine_id uuid, _owner_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.engine_business_engines%ROWTYPE; v_actor text := public.internal_caller_email();
BEGIN
  IF NOT public.is_engine_staff() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='insufficient_privilege'; END IF;
  IF COALESCE(TRIM(_owner_email),'')='' THEN RAISE EXCEPTION 'owner_email required' USING ERRCODE='check_violation'; END IF;
  SELECT * INTO v_row FROM public.engine_business_engines WHERE id=_engine_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Engine % not found', _engine_id USING ERRCODE='no_data_found'; END IF;
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
    jsonb_build_object('owner_email', _owner_email, 'cadence', v_row.cadence));
END; $$;
REVOKE ALL ON FUNCTION public.activate_business_engine(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_business_engine(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_engine_run(
  _engine_id uuid, _cycle_key text, _status engine_run_status,
  _inputs jsonb DEFAULT '{}'::jsonb, _outputs jsonb DEFAULT '{}'::jsonb,
  _decisions jsonb DEFAULT '[]'::jsonb, _model text DEFAULT NULL,
  _cost_cents int DEFAULT NULL, _latency_ms int DEFAULT NULL,
  _tokens_input int DEFAULT NULL, _tokens_output int DEFAULT NULL,
  _evidence_ids uuid[] DEFAULT '{}'::uuid[], _proposal_ids uuid[] DEFAULT '{}'::uuid[],
  _approval_ids uuid[] DEFAULT '{}'::uuid[], _error text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_engine public.engine_business_engines%ROWTYPE; v_id uuid;
  v_actor text := public.internal_caller_email(); v_now timestamptz := now();
BEGIN
  IF NOT public.is_engine_staff() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='insufficient_privilege'; END IF;
  SELECT * INTO v_engine FROM public.engine_business_engines WHERE id=_engine_id;
  IF v_engine.id IS NULL THEN RAISE EXCEPTION 'Engine % not found', _engine_id USING ERRCODE='no_data_found'; END IF;
  INSERT INTO public.engine_business_engine_runs (
    engine_id, project_id, cycle_key, status, scheduled_for, started_at, completed_at,
    inputs, outputs, decisions, model, tokens_input, tokens_output, cost_cents, latency_ms,
    evidence_ids, approval_ids, proposal_ids, error, actor_email
  ) VALUES (
    _engine_id, v_engine.project_id, _cycle_key, _status,
    COALESCE(v_engine.next_run_at, v_now), v_now,
    CASE WHEN _status IN ('completed','failed','skipped') THEN v_now ELSE NULL END,
    COALESCE(_inputs,'{}'::jsonb), COALESCE(_outputs,'{}'::jsonb), COALESCE(_decisions,'[]'::jsonb),
    _model, _tokens_input, _tokens_output, _cost_cents, _latency_ms,
    COALESCE(_evidence_ids,'{}'::uuid[]), COALESCE(_approval_ids,'{}'::uuid[]),
    COALESCE(_proposal_ids,'{}'::uuid[]), _error, v_actor
  ) ON CONFLICT (engine_id, cycle_key) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.engine_business_engine_runs
     WHERE engine_id=_engine_id AND cycle_key=_cycle_key;
    RETURN v_id;
  END IF;
  UPDATE public.engine_business_engines
     SET last_run_at=v_now,
         next_run_at=public.internal_engine_next_run(v_engine.cadence, v_now)
   WHERE id=_engine_id;
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.record_engine_run(uuid, text, engine_run_status, jsonb, jsonb, jsonb, text, int, int, int, int, uuid[], uuid[], uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_engine_run(uuid, text, engine_run_status, jsonb, jsonb, jsonb, text, int, int, int, int, uuid[], uuid[], uuid[], text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.open_engine_exception(
  _engine_id uuid, _kind text, _summary text,
  _severity engine_exception_severity DEFAULT 'medium',
  _detail jsonb DEFAULT '{}'::jsonb,
  _urgency_score int DEFAULT 50, _impact_score int DEFAULT 50,
  _deadline_at timestamptz DEFAULT NULL, _client_risk boolean DEFAULT false,
  _next_action text DEFAULT NULL, _next_action_owner text DEFAULT NULL,
  _run_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_project_id uuid; v_id uuid;
BEGIN
  IF NOT public.is_engine_staff() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='insufficient_privilege'; END IF;
  SELECT project_id INTO v_project_id FROM public.engine_business_engines WHERE id=_engine_id;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'Engine % not found', _engine_id USING ERRCODE='no_data_found'; END IF;
  INSERT INTO public.engine_business_engine_exceptions (
    engine_id, run_id, project_id, kind, severity, summary, detail,
    urgency_score, impact_score, deadline_at, client_risk, next_action, next_action_owner
  ) VALUES (
    _engine_id, _run_id, v_project_id, _kind, _severity, _summary, COALESCE(_detail,'{}'::jsonb),
    LEAST(100, GREATEST(0, _urgency_score)),
    LEAST(100, GREATEST(0, _impact_score)),
    _deadline_at, _client_risk, _next_action, _next_action_owner
  ) RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.open_engine_exception(uuid, text, text, engine_exception_severity, jsonb, int, int, timestamptz, boolean, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_engine_exception(uuid, text, text, engine_exception_severity, jsonb, int, int, timestamptz, boolean, text, text, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resolve_engine_exception(_exception_id uuid, _resolution_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor text := public.internal_caller_email();
BEGIN
  IF NOT public.is_engine_staff() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='insufficient_privilege'; END IF;
  UPDATE public.engine_business_engine_exceptions
     SET status='resolved', resolved_by=v_actor, resolved_at=now(), resolution_note=_resolution_note
   WHERE id=_exception_id;
END; $$;
REVOKE ALL ON FUNCTION public.resolve_engine_exception(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_engine_exception(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_command_center_exceptions(_limit int DEFAULT 50)
RETURNS TABLE (
  id uuid, engine_id uuid, engine_name text,
  project_id uuid, project_name text,
  kind text, severity engine_exception_severity, summary text,
  urgency_score int, impact_score int, deadline_at timestamptz, client_risk boolean,
  next_action text, next_action_owner text, status engine_exception_status, created_at timestamptz
) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    e.id, e.engine_id, be.name AS engine_name,
    e.project_id, p.name AS project_name,
    e.kind, e.severity, e.summary,
    e.urgency_score, e.impact_score, e.deadline_at, e.client_risk,
    e.next_action, e.next_action_owner, e.status, e.created_at
  FROM public.engine_business_engine_exceptions e
  LEFT JOIN public.engine_business_engines be ON be.id=e.engine_id
  LEFT JOIN public.engine_projects p ON p.id=e.project_id
  WHERE public.is_engine_staff() AND e.status='open'
  ORDER BY
    CASE e.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
    e.client_risk DESC,
    e.urgency_score DESC,
    e.deadline_at NULLS LAST,
    e.impact_score DESC,
    e.created_at DESC
  LIMIT GREATEST(1, LEAST(500, _limit));
$$;
REVOKE ALL ON FUNCTION public.get_command_center_exceptions(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_command_center_exceptions(int) TO authenticated, service_role;
