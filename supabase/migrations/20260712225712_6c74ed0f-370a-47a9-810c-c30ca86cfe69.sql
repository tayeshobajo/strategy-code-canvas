-- Phase 2 R4 — Point A / Point B Approval Ceremonies

CREATE TABLE IF NOT EXISTS public.engine_spine_ceremonies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  spine TEXT NOT NULL CHECK (spine IN ('point-a','point-b')),
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','completed','abandoned')),
  opened_by_email TEXT NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  completed_by_email TEXT,
  abandoned_at TIMESTAMPTZ,
  abandoned_by_email TEXT,
  abandon_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (status = 'completed'
      AND completed_at IS NOT NULL AND completed_by_email IS NOT NULL
      AND abandoned_at IS NULL AND abandoned_by_email IS NULL AND abandon_reason IS NULL)
    OR (status = 'abandoned'
      AND abandoned_at IS NOT NULL AND abandoned_by_email IS NOT NULL AND abandon_reason IS NOT NULL
      AND completed_at IS NULL AND completed_by_email IS NULL)
    OR (status = 'in_progress'
      AND completed_at IS NULL AND completed_by_email IS NULL
      AND abandoned_at IS NULL AND abandoned_by_email IS NULL AND abandon_reason IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS engine_spine_ceremonies_one_active
  ON public.engine_spine_ceremonies (project_id, spine)
  WHERE status = 'in_progress';
CREATE INDEX IF NOT EXISTS engine_spine_ceremonies_project_idx
  ON public.engine_spine_ceremonies (project_id, spine, opened_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.engine_spine_ceremonies TO authenticated;
GRANT ALL ON public.engine_spine_ceremonies TO service_role;

ALTER TABLE public.engine_spine_ceremonies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ceremonies_select_staff" ON public.engine_spine_ceremonies
  FOR SELECT TO authenticated USING (
    public.has_role_email(auth.jwt() ->> 'email', 'admin')
    OR public.has_role_email(auth.jwt() ->> 'email', 'operator')
    OR public.has_role_email(auth.jwt() ->> 'email', 'team_member')
  );
CREATE POLICY "ceremonies_insert_admin_op" ON public.engine_spine_ceremonies
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role_email(auth.jwt() ->> 'email', 'admin')
    OR public.has_role_email(auth.jwt() ->> 'email', 'operator')
  );
CREATE POLICY "ceremonies_update_admin_op" ON public.engine_spine_ceremonies
  FOR UPDATE TO authenticated USING (
    public.has_role_email(auth.jwt() ->> 'email', 'admin')
    OR public.has_role_email(auth.jwt() ->> 'email', 'operator')
  ) WITH CHECK (
    public.has_role_email(auth.jwt() ->> 'email', 'admin')
    OR public.has_role_email(auth.jwt() ->> 'email', 'operator')
  );

CREATE TABLE IF NOT EXISTS public.engine_spine_ceremony_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ceremony_id UUID NOT NULL REFERENCES public.engine_spine_ceremonies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  spine TEXT NOT NULL CHECK (spine IN ('point-a','point-b')),
  field_key TEXT NOT NULL,
  prior_status public.epistemic_status,
  new_status public.epistemic_status NOT NULL,
  source_ref JSONB NOT NULL DEFAULT '{}'::jsonb,
  decided_by_email TEXT NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS engine_spine_ceremony_decisions_ceremony_idx
  ON public.engine_spine_ceremony_decisions (ceremony_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS engine_spine_ceremony_decisions_project_idx
  ON public.engine_spine_ceremony_decisions (project_id, spine, field_key, decided_at DESC);

GRANT SELECT, INSERT ON public.engine_spine_ceremony_decisions TO authenticated;
GRANT ALL ON public.engine_spine_ceremony_decisions TO service_role;

ALTER TABLE public.engine_spine_ceremony_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ceremony_decisions_select_staff" ON public.engine_spine_ceremony_decisions
  FOR SELECT TO authenticated USING (
    public.has_role_email(auth.jwt() ->> 'email', 'admin')
    OR public.has_role_email(auth.jwt() ->> 'email', 'operator')
    OR public.has_role_email(auth.jwt() ->> 'email', 'team_member')
  );
CREATE POLICY "ceremony_decisions_insert_admin_op" ON public.engine_spine_ceremony_decisions
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role_email(auth.jwt() ->> 'email', 'admin')
    OR public.has_role_email(auth.jwt() ->> 'email', 'operator')
  );

ALTER TABLE public.engine_spine_field_truth
  ADD COLUMN IF NOT EXISTS ceremony_id UUID
    REFERENCES public.engine_spine_ceremonies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS engine_spine_field_truth_ceremony_idx
  ON public.engine_spine_field_truth (ceremony_id) WHERE ceremony_id IS NOT NULL;

CREATE TRIGGER trg_engine_spine_ceremonies_updated
  BEFORE UPDATE ON public.engine_spine_ceremonies
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE OR REPLACE FUNCTION public.audit_spine_ceremony_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.engine_audit_log
    (project_id, action, field_changed, old_value, new_value, actor_email, metadata)
  VALUES (
    NEW.project_id,
    CASE TG_OP WHEN 'INSERT' THEN 'spine_ceremony_opened' ELSE 'spine_ceremony_changed' END,
    'ceremony_status',
    CASE TG_OP WHEN 'UPDATE' THEN to_jsonb(OLD.status) ELSE NULL END,
    to_jsonb(NEW.status),
    COALESCE(NEW.completed_by_email, NEW.abandoned_by_email, NEW.opened_by_email),
    jsonb_build_object('ceremony_id', NEW.id, 'spine', NEW.spine)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_audit_spine_ceremony_ins AFTER INSERT ON public.engine_spine_ceremonies
  FOR EACH ROW EXECUTE FUNCTION public.audit_spine_ceremony_change();
CREATE TRIGGER trg_audit_spine_ceremony_upd AFTER UPDATE ON public.engine_spine_ceremonies
  FOR EACH ROW EXECUTE FUNCTION public.audit_spine_ceremony_change();

CREATE OR REPLACE FUNCTION public.audit_spine_ceremony_decision()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.engine_audit_log
    (project_id, action, field_changed, old_value, new_value, actor_email, metadata)
  VALUES (
    NEW.project_id, 'spine_ceremony_decision', NEW.field_key,
    to_jsonb(NEW.prior_status), to_jsonb(NEW.new_status), NEW.decided_by_email,
    jsonb_build_object('ceremony_id', NEW.ceremony_id, 'spine', NEW.spine, 'source_ref', NEW.source_ref)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_audit_spine_ceremony_decision_ins AFTER INSERT ON public.engine_spine_ceremony_decisions
  FOR EACH ROW EXECUTE FUNCTION public.audit_spine_ceremony_decision();

CREATE OR REPLACE FUNCTION public.internal_spine_field_keys(_project_id uuid, _spine text)
RETURNS SETOF text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _spine = 'point-a' THEN
    RETURN QUERY SELECT unnest(ARRAY['lenses','diagnosis','key_diagnosis']::text[]);
    RETURN QUERY
      SELECT DISTINCT field_key FROM public.engine_spine_field_truth
      WHERE project_id = _project_id AND spine = 'point-a' AND field_key LIKE 'diagnosis:%';
  ELSIF _spine = 'point-b' THEN
    RETURN QUERY SELECT unnest(ARRAY[
      '24_month_destination','10_year_position','client_outcome','customer_outcome',
      'operational_outcome','revenue_outcome','brand_position'
    ]::text[]);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.internal_spine_field_keys(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.internal_spine_field_keys(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.spine_field_keys(_project_id uuid, _spine text)
RETURNS SETOF text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE allowed boolean := false;
BEGIN
  SELECT
    public.is_engine_staff()
    OR public.has_role_email(coalesce(auth.email(), ''), 'team_member')
    OR EXISTS (
      SELECT 1 FROM public.client_portal_projects cpp
      JOIN public.client_portal_permissions perm ON perm.project_id = cpp.id
      JOIN public.engine_projects ep ON ep.client_portal_project_id = cpp.id
      WHERE ep.id = _project_id
        AND lower(perm.email) = lower(coalesce(auth.email(), ''))
        AND perm.revoked_at IS NULL
    )
  INTO allowed;
  IF NOT allowed THEN
    RAISE EXCEPTION 'Forbidden: access to project % not permitted', _project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY SELECT public.internal_spine_field_keys(_project_id, _spine);
END;
$$;
REVOKE ALL ON FUNCTION public.spine_field_keys(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spine_field_keys(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.internal_project_has_contradictions(_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.engine_extracted_signals
    WHERE project_id = _project_id AND status = 'contradicted' AND superseded_by IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.engine_spine_field_truth
    WHERE project_id = _project_id AND status = 'contradicted'
  );
$$;
REVOKE ALL ON FUNCTION public.internal_project_has_contradictions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.internal_project_has_contradictions(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_decision_matches_ceremony()
RETURNS TRIGGER AS $$
DECLARE cer RECORD;
BEGIN
  SELECT project_id, spine, status INTO cer
    FROM public.engine_spine_ceremonies WHERE id = NEW.ceremony_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Decision references unknown ceremony %', NEW.ceremony_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF cer.project_id <> NEW.project_id OR cer.spine <> NEW.spine THEN
    RAISE EXCEPTION 'Decision project_id/spine (%/%) does not match ceremony (%/%)',
      NEW.project_id, NEW.spine, cer.project_id, cer.spine
      USING ERRCODE = 'check_violation';
  END IF;
  IF cer.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Cannot record a decision on a % ceremony', cer.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.new_status = 'approved_truth' THEN
    IF COALESCE(NEW.source_ref ->> 'approval_kind', '') <> 'ceremony'
       OR COALESCE(NEW.source_ref ->> 'ceremony_id', '') <> NEW.ceremony_id::text
       OR COALESCE(NEW.source_ref ->> 'operator_confirmed_by', '') = '' THEN
      RAISE EXCEPTION
        'approved_truth decisions require source_ref.approval_kind=ceremony, matching ceremony_id, and operator_confirmed_by'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_enforce_decision_matches_ceremony
  BEFORE INSERT ON public.engine_spine_ceremony_decisions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_decision_matches_ceremony();

CREATE OR REPLACE FUNCTION public.enforce_point_a_before_point_b()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.spine = 'point-b' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.engine_spine_ceremonies
      WHERE project_id = NEW.project_id AND spine = 'point-a' AND status = 'completed'
    ) THEN
      RAISE EXCEPTION 'Point B ceremony cannot open before a Point A ceremony is completed for project %', NEW.project_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.spine = 'point-a' AND OLD.status = 'completed' AND NEW.status <> 'completed' THEN
    IF EXISTS (
      SELECT 1 FROM public.engine_spine_ceremonies
      WHERE project_id = OLD.project_id AND spine = 'point-b'
    ) THEN
      RAISE EXCEPTION
        'Cannot reopen/abandon a completed Point A while Point B ceremonies exist for project % (Phase 2B invalidation required)',
        OLD.project_id USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_enforce_point_a_before_point_b_ins
  BEFORE INSERT ON public.engine_spine_ceremonies
  FOR EACH ROW EXECUTE FUNCTION public.enforce_point_a_before_point_b();
CREATE TRIGGER trg_enforce_point_a_before_point_b_upd
  BEFORE UPDATE ON public.engine_spine_ceremonies
  FOR EACH ROW EXECUTE FUNCTION public.enforce_point_a_before_point_b();

CREATE OR REPLACE FUNCTION public.enforce_ceremony_completion()
RETURNS TRIGGER AS $$
DECLARE
  fkey text;
  row_status public.epistemic_status;
  row_ref jsonb;
  missing_required text[] := ARRAY[]::text[];
BEGIN
  IF NOT (NEW.status = 'completed' AND OLD.status <> 'completed') THEN
    RETURN NEW;
  END IF;
  IF public.internal_project_has_contradictions(NEW.project_id) THEN
    RAISE EXCEPTION 'Cannot complete ceremony %: project % has unresolved contradictions', NEW.id, NEW.project_id
      USING ERRCODE = 'check_violation';
  END IF;
  FOR fkey IN SELECT public.internal_spine_field_keys(NEW.project_id, NEW.spine) LOOP
    SELECT status, source_ref INTO row_status, row_ref
      FROM public.engine_spine_field_truth
     WHERE project_id = NEW.project_id AND spine = NEW.spine AND field_key = fkey;
    IF NOT FOUND THEN
      missing_required := array_append(missing_required, fkey || ' (no truth row)');
      CONTINUE;
    END IF;
    IF row_status = 'approved_truth' THEN CONTINUE; END IF;
    IF row_status = 'assumed'
       AND row_ref ->> 'approval_kind' = 'operator_override'
       AND COALESCE(row_ref ->> 'reason', '') <> ''
       AND COALESCE(row_ref ->> 'operator_confirmed_by', '') <> '' THEN
      CONTINUE;
    END IF;
    IF row_status = 'missing'
       AND row_ref ->> 'approval_kind' = 'operator_override'
       AND COALESCE(row_ref ->> 'reason', '') <> ''
       AND COALESCE(row_ref ->> 'operator_confirmed_by', '') <> ''
       AND (row_ref ->> 'accepted_as_risk')::boolean IS TRUE THEN
      CONTINUE;
    END IF;
    missing_required := array_append(missing_required, fkey || ' (' || row_status::text || ')');
  END LOOP;
  IF array_length(missing_required, 1) > 0 THEN
    RAISE EXCEPTION 'Ceremony % cannot complete: fields not terminal: %', NEW.id, array_to_string(missing_required, ', ')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_enforce_ceremony_completion
  BEFORE UPDATE ON public.engine_spine_ceremonies
  FOR EACH ROW EXECUTE FUNCTION public.enforce_ceremony_completion();