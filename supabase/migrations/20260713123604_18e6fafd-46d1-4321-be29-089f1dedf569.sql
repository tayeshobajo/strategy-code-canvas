BEGIN;

DROP POLICY IF EXISTS "Clients read approved roadmaps"
  ON public.client_portal_roadmaps;

CREATE POLICY "Clients read published roadmaps"
  ON public.client_portal_roadmaps
  FOR SELECT TO authenticated
  USING (
    status = 'published'
    AND project_id IN (
      SELECT p.project_id
        FROM public.client_portal_permissions p
       WHERE lower(p.email) = lower(auth.email())
         AND p.revoked_at IS NULL
    )
  );

CREATE OR REPLACE FUNCTION public.publish_portal_roadmap(
  _portal_project_id     uuid,
  _engine_project_id     uuid,
  _engine_version_id     uuid,
  _title                 text,
  _version_label         text,
  _executive_summary     text,
  _current_diagnosis     text,
  _strategic_priorities  jsonb,
  _sequence_30_60_90     jsonb,
  _risks_dependencies    jsonb,
  _recommended_next_move text,
  _client_safe_canvas    jsonb,
  _visible_modules       jsonb DEFAULT '{}'::jsonb,
  _publish_diff          jsonb DEFAULT '{}'::jsonb,
  _summary               text  DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor          text := auth.email();
  v_prior_id       uuid;
  v_new_id         uuid;
  v_published_evt  uuid;
BEGIN
  IF NOT public.is_engine_staff() THEN
    RAISE EXCEPTION 'publish_portal_roadmap: not authorized';
  END IF;
  IF v_actor IS NULL OR length(btrim(v_actor)) = 0 THEN
    RAISE EXCEPTION 'publish_portal_roadmap: caller email required';
  END IF;
  IF _portal_project_id IS NULL OR _engine_project_id IS NULL THEN
    RAISE EXCEPTION 'publish_portal_roadmap: project ids required';
  END IF;

  SELECT id INTO v_prior_id
    FROM public.client_portal_roadmaps
   WHERE project_id = _portal_project_id
     AND status     = 'published'
   FOR UPDATE;

  IF v_prior_id IS NOT NULL THEN
    UPDATE public.client_portal_roadmaps
       SET status = 'superseded'
     WHERE id = v_prior_id;
  END IF;

  INSERT INTO public.client_portal_roadmaps (
    project_id, approved_roadmap_version_id, title, version_label,
    executive_summary, current_diagnosis, strategic_priorities,
    sequence_30_60_90, risks_dependencies, recommended_next_move,
    client_safe_canvas, visible_modules, publish_diff,
    previous_publication_id, status, published_at, published_by
  ) VALUES (
    _portal_project_id, _engine_version_id, _title, _version_label,
    _executive_summary, _current_diagnosis,
    COALESCE(_strategic_priorities, '[]'::jsonb),
    COALESCE(_sequence_30_60_90, '{}'::jsonb),
    COALESCE(_risks_dependencies, '[]'::jsonb),
    _recommended_next_move,
    COALESCE(_client_safe_canvas, '{}'::jsonb),
    COALESCE(_visible_modules, '{}'::jsonb),
    COALESCE(_publish_diff, '{}'::jsonb),
    v_prior_id, 'published', now(), v_actor
  ) RETURNING id INTO v_new_id;

  IF v_prior_id IS NOT NULL THEN
    INSERT INTO public.client_portal_publish_events (
      portal_project_id, portal_roadmap_id, previous_portal_roadmap_id,
      engine_project_id, engine_version_id, event_type, actor_email,
      summary, diff
    ) VALUES (
      _portal_project_id, v_prior_id, NULL,
      _engine_project_id, _engine_version_id, 'superseded', v_actor,
      _summary, '{}'::jsonb
    );
  END IF;

  INSERT INTO public.client_portal_publish_events (
    portal_project_id, portal_roadmap_id, previous_portal_roadmap_id,
    engine_project_id, engine_version_id, event_type, actor_email,
    summary, diff
  ) VALUES (
    _portal_project_id, v_new_id, v_prior_id,
    _engine_project_id, _engine_version_id, 'published', v_actor,
    _summary, COALESCE(_publish_diff, '{}'::jsonb)
  ) RETURNING id INTO v_published_evt;

  RETURN v_published_evt;
END $$;

CREATE OR REPLACE FUNCTION public.rollback_portal_publication(
  _portal_project_id uuid,
  _target_roadmap_id uuid,
  _reason            text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor        text := auth.email();
  v_current_id   uuid;
  v_engine_proj  uuid;
  v_engine_ver   uuid;
  v_target_stat  text;
  v_target_proj  uuid;
  v_event_id     uuid;
BEGIN
  IF NOT public.is_engine_staff() THEN
    RAISE EXCEPTION 'rollback_portal_publication: not authorized';
  END IF;
  IF v_actor IS NULL OR length(btrim(v_actor)) = 0 THEN
    RAISE EXCEPTION 'rollback_portal_publication: caller email required';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) = 0 THEN
    RAISE EXCEPTION 'rollback_portal_publication: reason required';
  END IF;

  SELECT project_id, status
    INTO v_target_proj, v_target_stat
    FROM public.client_portal_roadmaps
   WHERE id = _target_roadmap_id
   FOR UPDATE;

  IF v_target_proj IS NULL THEN
    RAISE EXCEPTION 'rollback_portal_publication: target not found';
  END IF;
  IF v_target_proj <> _portal_project_id THEN
    RAISE EXCEPTION 'rollback_portal_publication: target belongs to different project';
  END IF;
  IF v_target_stat <> 'superseded' THEN
    RAISE EXCEPTION 'rollback_portal_publication: target must be superseded (got %)', v_target_stat;
  END IF;

  SELECT r.id, v.engine_project_id, r.approved_roadmap_version_id
    INTO v_current_id, v_engine_proj, v_engine_ver
    FROM public.client_portal_roadmaps r
    LEFT JOIN public.engine_roadmap_versions v
      ON v.id = r.approved_roadmap_version_id
   WHERE r.project_id = _portal_project_id
     AND r.status     = 'published'
   FOR UPDATE;

  IF v_current_id IS NULL THEN
    RAISE EXCEPTION 'rollback_portal_publication: no live published row to retract';
  END IF;

  UPDATE public.client_portal_roadmaps
     SET status            = 'retracted',
         retracted_at      = now(),
         retracted_by      = v_actor,
         retraction_reason = _reason
   WHERE id = v_current_id;

  UPDATE public.client_portal_roadmaps
     SET status = 'published'
   WHERE id = _target_roadmap_id;

  INSERT INTO public.client_portal_publish_events (
    portal_project_id, portal_roadmap_id, previous_portal_roadmap_id,
    engine_project_id, engine_version_id, event_type, actor_email,
    summary, diff
  ) VALUES (
    _portal_project_id, _target_roadmap_id, v_current_id,
    COALESCE(v_engine_proj, gen_random_uuid()), v_engine_ver,
    'rolled_back', v_actor, _reason, '{}'::jsonb
  ) RETURNING id INTO v_event_id;

  RETURN v_event_id;
END $$;

CREATE OR REPLACE FUNCTION public.retract_portal_publication(
  _portal_roadmap_id uuid,
  _reason            text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor       text := auth.email();
  v_project     uuid;
  v_status      text;
  v_engine_proj uuid;
  v_engine_ver  uuid;
  v_event_id    uuid;
BEGIN
  IF NOT public.is_engine_staff() THEN
    RAISE EXCEPTION 'retract_portal_publication: not authorized';
  END IF;
  IF v_actor IS NULL OR length(btrim(v_actor)) = 0 THEN
    RAISE EXCEPTION 'retract_portal_publication: caller email required';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) = 0 THEN
    RAISE EXCEPTION 'retract_portal_publication: reason required';
  END IF;

  SELECT r.project_id, r.status,
         v.engine_project_id, r.approved_roadmap_version_id
    INTO v_project, v_status, v_engine_proj, v_engine_ver
    FROM public.client_portal_roadmaps r
    LEFT JOIN public.engine_roadmap_versions v
      ON v.id = r.approved_roadmap_version_id
   WHERE r.id = _portal_roadmap_id
   FOR UPDATE;

  IF v_project IS NULL THEN
    RAISE EXCEPTION 'retract_portal_publication: roadmap not found';
  END IF;
  IF v_status <> 'published' THEN
    RAISE EXCEPTION 'retract_portal_publication: roadmap must be published (got %)', v_status;
  END IF;

  UPDATE public.client_portal_roadmaps
     SET status            = 'retracted',
         retracted_at      = now(),
         retracted_by      = v_actor,
         retraction_reason = _reason
   WHERE id = _portal_roadmap_id;

  INSERT INTO public.client_portal_publish_events (
    portal_project_id, portal_roadmap_id, previous_portal_roadmap_id,
    engine_project_id, engine_version_id, event_type, actor_email,
    summary, diff
  ) VALUES (
    v_project, _portal_roadmap_id, NULL,
    COALESCE(v_engine_proj, gen_random_uuid()), v_engine_ver,
    'retracted', v_actor, _reason, '{}'::jsonb
  ) RETURNING id INTO v_event_id;

  RETURN v_event_id;
END $$;

CREATE OR REPLACE FUNCTION public.restore_portal_publication(
  _portal_roadmap_id uuid,
  _reason            text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor       text := auth.email();
  v_project     uuid;
  v_status      text;
  v_engine_proj uuid;
  v_engine_ver  uuid;
  v_conflict    uuid;
  v_event_id    uuid;
BEGIN
  IF NOT public.is_engine_staff() THEN
    RAISE EXCEPTION 'restore_portal_publication: not authorized';
  END IF;
  IF v_actor IS NULL OR length(btrim(v_actor)) = 0 THEN
    RAISE EXCEPTION 'restore_portal_publication: caller email required';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) = 0 THEN
    RAISE EXCEPTION 'restore_portal_publication: reason required';
  END IF;

  SELECT r.project_id, r.status,
         v.engine_project_id, r.approved_roadmap_version_id
    INTO v_project, v_status, v_engine_proj, v_engine_ver
    FROM public.client_portal_roadmaps r
    LEFT JOIN public.engine_roadmap_versions v
      ON v.id = r.approved_roadmap_version_id
   WHERE r.id = _portal_roadmap_id
   FOR UPDATE;

  IF v_project IS NULL THEN
    RAISE EXCEPTION 'restore_portal_publication: roadmap not found';
  END IF;
  IF v_status <> 'retracted' THEN
    RAISE EXCEPTION 'restore_portal_publication: roadmap must be retracted (got %)', v_status;
  END IF;

  SELECT id INTO v_conflict
    FROM public.client_portal_roadmaps
   WHERE project_id = v_project
     AND status     = 'published'
   FOR UPDATE;
  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'restore_portal_publication: another roadmap is currently published in this project';
  END IF;

  UPDATE public.client_portal_roadmaps
     SET status            = 'published',
         retracted_at      = NULL,
         retracted_by      = NULL,
         retraction_reason = NULL
   WHERE id = _portal_roadmap_id;

  INSERT INTO public.client_portal_publish_events (
    portal_project_id, portal_roadmap_id, previous_portal_roadmap_id,
    engine_project_id, engine_version_id, event_type, actor_email,
    summary, diff
  ) VALUES (
    v_project, _portal_roadmap_id, NULL,
    COALESCE(v_engine_proj, gen_random_uuid()), v_engine_ver,
    'restored', v_actor, _reason, '{}'::jsonb
  ) RETURNING id INTO v_event_id;

  RETURN v_event_id;
END $$;

CREATE OR REPLACE FUNCTION public.acknowledge_portal_roadmap(
  _portal_roadmap_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email       text := lower(coalesce(auth.email(), ''));
  v_project     uuid;
  v_status      text;
  v_already_ack timestamptz;
  v_engine_proj uuid;
  v_engine_ver  uuid;
  v_event_id    uuid;
BEGIN
  IF v_email = '' THEN
    RAISE EXCEPTION 'acknowledge_portal_roadmap: caller email required';
  END IF;

  SELECT r.project_id, r.status, r.acknowledged_at,
         v.engine_project_id, r.approved_roadmap_version_id
    INTO v_project, v_status, v_already_ack, v_engine_proj, v_engine_ver
    FROM public.client_portal_roadmaps r
    LEFT JOIN public.engine_roadmap_versions v
      ON v.id = r.approved_roadmap_version_id
   WHERE r.id = _portal_roadmap_id
   FOR UPDATE;

  IF v_project IS NULL THEN
    RAISE EXCEPTION 'acknowledge_portal_roadmap: roadmap not found';
  END IF;
  IF v_status <> 'published' THEN
    RAISE EXCEPTION 'acknowledge_portal_roadmap: roadmap must be published (got %)', v_status;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.client_portal_permissions p
     WHERE p.project_id = v_project
       AND lower(p.email) = v_email
       AND p.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'acknowledge_portal_roadmap: not authorized for this project';
  END IF;

  IF v_already_ack IS NOT NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.client_portal_roadmaps
     SET acknowledged_at       = now(),
         acknowledged_by_email = v_email
   WHERE id = _portal_roadmap_id;

  INSERT INTO public.client_portal_publish_events (
    portal_project_id, portal_roadmap_id, previous_portal_roadmap_id,
    engine_project_id, engine_version_id, event_type, actor_email,
    summary, diff
  ) VALUES (
    v_project, _portal_roadmap_id, NULL,
    COALESCE(v_engine_proj, gen_random_uuid()), v_engine_ver,
    'acknowledged', v_email, NULL, '{}'::jsonb
  ) RETURNING id INTO v_event_id;

  RETURN v_event_id;
END $$;

CREATE OR REPLACE FUNCTION public.get_portal_publication_history(
  _portal_project_id uuid
) RETURNS TABLE (
  event_id          uuid,
  event_type        text,
  actor_email       text,
  summary           text,
  created_at        timestamptz,
  portal_roadmap_id uuid,
  previous_portal_roadmap_id uuid,
  engine_project_id uuid,
  engine_version_id uuid,
  roadmap_title     text,
  roadmap_version_label text,
  roadmap_status    text,
  roadmap_published_at timestamptz,
  roadmap_retracted_at timestamptz,
  roadmap_retraction_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_engine_staff() THEN
    RAISE EXCEPTION 'get_portal_publication_history: not authorized';
  END IF;

  RETURN QUERY
  SELECT e.id, e.event_type, e.actor_email, e.summary, e.created_at,
         e.portal_roadmap_id, e.previous_portal_roadmap_id,
         e.engine_project_id, e.engine_version_id,
         r.title, r.version_label, r.status, r.published_at,
         r.retracted_at, r.retraction_reason
    FROM public.client_portal_publish_events e
    LEFT JOIN public.client_portal_roadmaps r
      ON r.id = e.portal_roadmap_id
   WHERE e.portal_project_id = _portal_project_id
   ORDER BY e.created_at DESC, e.id DESC;
END $$;

REVOKE ALL ON FUNCTION public.publish_portal_roadmap(uuid,uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,text,jsonb,jsonb,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rollback_portal_publication(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.retract_portal_publication(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_portal_publication(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.acknowledge_portal_roadmap(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_portal_publication_history(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.publish_portal_roadmap(uuid,uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,text,jsonb,jsonb,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_portal_publication(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retract_portal_publication(uuid,text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_portal_publication(uuid,text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_portal_roadmap(uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_portal_publication_history(uuid)   TO authenticated;

COMMIT;