
-- =====================================================================
-- Phase 4 QA Fixes — Governance Gate Hardening (Revision 2.1)
-- Executable order: (1) audit already done externally, (2) legacy rows
-- remediated externally, (3) fail-closed guard, (4) create/replace
-- provenance function, (5) drop/create trigger, then G1a (split RPCs)
-- and G2 (roadmap_versions + projects gates).
-- =====================================================================

-- -----------------------------------------------------------------
-- Step 3 — Fail-closed pre-install guard (G1).
-- Ceremony branch mirrors the trigger predicate exactly.
-- -----------------------------------------------------------------
DO $guard$
DECLARE
  bad_count integer;
BEGIN
  SELECT count(*) INTO bad_count
    FROM public.engine_spine_field_truth t
   WHERE t.status = 'approved_truth'
     AND (
          t.updated_by_actor IS DISTINCT FROM 'human'
       OR (t.ceremony_id IS NULL AND COALESCE(t.source_ref->>'kind','') <> 'operator_override')
       OR (t.ceremony_id IS NOT NULL AND NOT EXISTS (
             SELECT 1
               FROM public.engine_spine_ceremonies c
               JOIN public.engine_spine_ceremony_decisions d
                 ON d.ceremony_id = c.id
              WHERE c.id          = t.ceremony_id
                AND c.project_id  = t.project_id
                AND c.spine       = t.spine
                AND c.status      = 'completed'
                AND d.project_id  = t.project_id
                AND d.spine       = t.spine
                AND d.field_key   = t.field_key
                AND d.new_status  = 'approved_truth'))
       OR (t.ceremony_id IS NULL
           AND COALESCE(t.source_ref->>'kind','') = 'operator_override'
           AND (
                COALESCE(lower(t.source_ref->>'operator_email'),'') <> COALESCE(lower(t.updated_by_email),'')
             OR COALESCE(btrim(t.source_ref->>'reason'),'') = ''
             OR NOT (
                  public.has_role_email(t.source_ref->>'operator_email', 'admin'::app_role)
               OR public.has_role_email(t.source_ref->>'operator_email', 'operator'::app_role))
           ))
     );

  IF bad_count > 0 THEN
    RAISE EXCEPTION
      'Phase 4 provenance guard: % legacy approved_truth row(s) fail the trigger predicate. Remediate via Step 1/2 (attach a real ceremony+decision for the exact field_key, re-stamp as compliant operator_override, or demote to verified) before installing trg_engine_spine_field_truth_provenance.',
      bad_count
      USING ERRCODE = 'check_violation';
  END IF;
END
$guard$;

-- -----------------------------------------------------------------
-- Step 4 — G1 provenance function
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_engine_spine_field_truth_provenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ceremony        public.engine_spine_ceremonies%ROWTYPE;
  decision_exists boolean;
  op_email        text;
  op_reason       text;
  is_op_staff     boolean;
BEGIN
  IF NEW.status <> 'approved_truth' THEN
    RETURN NEW;
  END IF;

  IF NEW.updated_by_actor IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'approved_truth requires human actor (got actor=%, field=%:%)',
      NEW.updated_by_actor, NEW.spine, NEW.field_key
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.ceremony_id IS NOT NULL THEN
    SELECT * INTO ceremony FROM public.engine_spine_ceremonies WHERE id = NEW.ceremony_id;
    IF ceremony.id IS NULL
       OR ceremony.project_id <> NEW.project_id
       OR ceremony.spine      <> NEW.spine
       OR ceremony.status     <> 'completed' THEN
      RAISE EXCEPTION 'approved_truth ceremony_id % invalid (project/spine mismatch or not completed) for field %:%',
        NEW.ceremony_id, NEW.spine, NEW.field_key
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT EXISTS (
      SELECT 1
        FROM public.engine_spine_ceremony_decisions d
       WHERE d.ceremony_id = NEW.ceremony_id
         AND d.project_id  = NEW.project_id
         AND d.spine       = NEW.spine
         AND d.field_key   = NEW.field_key
         AND d.new_status  = 'approved_truth'
    ) INTO decision_exists;
    IF NOT decision_exists THEN
      RAISE EXCEPTION 'approved_truth ceremony % has no matching decision for field %:%',
        NEW.ceremony_id, NEW.spine, NEW.field_key
        USING ERRCODE = 'check_violation';
    END IF;

  ELSIF (NEW.source_ref ->> 'kind') = 'operator_override' THEN
    op_email  := lower(COALESCE(NEW.source_ref ->> 'operator_email', ''));
    op_reason := btrim(COALESCE(NEW.source_ref ->> 'reason', ''));

    IF op_email = '' OR op_email <> lower(COALESCE(NEW.updated_by_email, '')) THEN
      RAISE EXCEPTION 'approved_truth operator_override requires source_ref.operator_email matching updated_by_email (field %:%)',
        NEW.spine, NEW.field_key USING ERRCODE = 'check_violation';
    END IF;
    IF op_reason = '' THEN
      RAISE EXCEPTION 'approved_truth operator_override requires source_ref.reason (field %:%)',
        NEW.spine, NEW.field_key USING ERRCODE = 'check_violation';
    END IF;

    SELECT public.has_role_email(op_email, 'admin'::app_role)
        OR public.has_role_email(op_email, 'operator'::app_role)
      INTO is_op_staff;
    IF NOT COALESCE(is_op_staff, false) THEN
      RAISE EXCEPTION 'approved_truth operator_override email % lacks admin/operator role (field %:%)',
        op_email, NEW.spine, NEW.field_key USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.engine_audit_log (
      project_id, action, field_changed, old_value, new_value, actor_email, metadata
    ) VALUES (
      NEW.project_id,
      'spine_field_truth_operator_override',
      NEW.spine || ':' || NEW.field_key,
      NULL,
      jsonb_build_object('status','approved_truth','source_ref',NEW.source_ref),
      NEW.updated_by_email,
      jsonb_build_object('actor_kind','human','reason', op_reason)
    );
  ELSE
    RAISE EXCEPTION 'approved_truth requires ceremony_id or source_ref.kind=operator_override (field %:%)',
      NEW.spine, NEW.field_key USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Step 5 — install trigger (idempotent).
DROP TRIGGER IF EXISTS trg_engine_spine_field_truth_provenance ON public.engine_spine_field_truth;
CREATE TRIGGER trg_engine_spine_field_truth_provenance
BEFORE INSERT OR UPDATE ON public.engine_spine_field_truth
FOR EACH ROW EXECUTE FUNCTION public.tg_engine_spine_field_truth_provenance();

-- =====================================================================
-- G1a — Split spine_points_approved for portal safety.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.spine_points_approved(_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  point_a_required text[];
  point_b_required text[];
  point_a_missing  text[];
  point_b_missing  text[];
  contradictions   boolean;
  allowed          boolean;
BEGIN
  allowed := public.is_engine_staff()
          OR current_setting('request.jwt.claim.role', true) = 'service_role'
          OR current_user = 'service_role';
  IF NOT allowed THEN
    RAISE EXCEPTION 'Forbidden: spine_points_approved is staff/service-only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(array_agg(s.field_key), '{}') INTO point_a_required
    FROM public.internal_spine_field_keys(_project_id, 'point-a') AS s(field_key);
  SELECT COALESCE(array_agg(s.field_key), '{}') INTO point_b_required
    FROM public.internal_spine_field_keys(_project_id, 'point-b') AS s(field_key);

  SELECT COALESCE(array_agg(k), '{}') INTO point_a_missing
    FROM unnest(point_a_required) AS k
   WHERE NOT EXISTS (
     SELECT 1 FROM public.engine_spine_field_truth t
      WHERE t.project_id = _project_id AND t.spine = 'point-a'
        AND t.field_key = k AND t.status = 'approved_truth');

  SELECT COALESCE(array_agg(k), '{}') INTO point_b_missing
    FROM unnest(point_b_required) AS k
   WHERE NOT EXISTS (
     SELECT 1 FROM public.engine_spine_field_truth t
      WHERE t.project_id = _project_id AND t.spine = 'point-b'
        AND t.field_key = k AND t.status = 'approved_truth');

  contradictions := public.internal_project_has_contradictions(_project_id);

  RETURN jsonb_build_object(
    'ready',
      array_length(point_a_missing,1) IS NULL
      AND array_length(point_b_missing,1) IS NULL
      AND NOT contradictions,
    'point_a', jsonb_build_object(
      'required', to_jsonb(point_a_required),
      'missing',  to_jsonb(point_a_missing),
      'approved', array_length(point_a_missing,1) IS NULL),
    'point_b', jsonb_build_object(
      'required', to_jsonb(point_b_required),
      'missing',  to_jsonb(point_b_missing),
      'approved', array_length(point_b_missing,1) IS NULL),
    'has_active_contradictions', contradictions
  );
END;
$$;

REVOKE ALL ON FUNCTION public.spine_points_approved(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spine_points_approved(uuid) TO service_role, authenticated;

CREATE OR REPLACE FUNCTION public.spine_points_ready_summary(_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a_missing_ct int;
  b_missing_ct int;
  contradictions boolean;
  allowed boolean;
BEGIN
  SELECT public.is_engine_staff()
      OR current_setting('request.jwt.claim.role', true) = 'service_role'
      OR current_user = 'service_role'
      OR EXISTS (
        SELECT 1
          FROM public.client_portal_projects cpp
          JOIN public.client_portal_permissions perm ON perm.project_id = cpp.id
          JOIN public.engine_projects ep ON ep.client_portal_project_id = cpp.id
         WHERE ep.id = _project_id
           AND lower(perm.email) = lower(coalesce(auth.email(), ''))
           AND perm.revoked_at IS NULL)
    INTO allowed;
  IF NOT allowed THEN
    RAISE EXCEPTION 'Forbidden: access to project % not permitted', _project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT count(*) INTO a_missing_ct
    FROM public.internal_spine_field_keys(_project_id,'point-a') AS s(field_key)
   WHERE NOT EXISTS (SELECT 1 FROM public.engine_spine_field_truth t
     WHERE t.project_id=_project_id AND t.spine='point-a'
       AND t.field_key=s.field_key AND t.status='approved_truth');

  SELECT count(*) INTO b_missing_ct
    FROM public.internal_spine_field_keys(_project_id,'point-b') AS s(field_key)
   WHERE NOT EXISTS (SELECT 1 FROM public.engine_spine_field_truth t
     WHERE t.project_id=_project_id AND t.spine='point-b'
       AND t.field_key=s.field_key AND t.status='approved_truth');

  contradictions := public.internal_project_has_contradictions(_project_id);

  RETURN jsonb_build_object(
    'ready', a_missing_ct=0 AND b_missing_ct=0 AND NOT contradictions,
    'point_a_approved', a_missing_ct=0,
    'point_a_missing_count', a_missing_ct,
    'point_b_approved', b_missing_ct=0,
    'point_b_missing_count', b_missing_ct,
    'has_active_contradictions', contradictions);
END;
$$;

GRANT EXECUTE ON FUNCTION public.spine_points_ready_summary(uuid) TO authenticated, service_role;

-- =====================================================================
-- G2 — Extend gate to engine_roadmap_versions and engine_projects.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_engine_roadmap_versions_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a_missing jsonb;
  b_missing jsonb;
  has_contra boolean;
BEGIN
  IF NEW.status = 'approved'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN

    has_contra := public.internal_project_has_contradictions(NEW.project_id);
    IF has_contra THEN
      RAISE EXCEPTION 'Cannot approve roadmap version %: project % has unresolved contradictions',
        NEW.id, NEW.project_id USING ERRCODE = 'check_violation';
    END IF;

    SELECT COALESCE(jsonb_agg(s.field_key), '[]'::jsonb) INTO a_missing
      FROM public.internal_spine_field_keys(NEW.project_id, 'point-a') AS s(field_key)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.engine_spine_field_truth t
        WHERE t.project_id = NEW.project_id AND t.spine = 'point-a'
          AND t.field_key = s.field_key AND t.status = 'approved_truth');

    SELECT COALESCE(jsonb_agg(s.field_key), '[]'::jsonb) INTO b_missing
      FROM public.internal_spine_field_keys(NEW.project_id, 'point-b') AS s(field_key)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.engine_spine_field_truth t
        WHERE t.project_id = NEW.project_id AND t.spine = 'point-b'
          AND t.field_key = s.field_key AND t.status = 'approved_truth');

    IF jsonb_array_length(a_missing) > 0 OR jsonb_array_length(b_missing) > 0 THEN
      RAISE EXCEPTION 'Cannot approve roadmap version %: spine not fully approved. point_a_missing=%, point_b_missing=%',
        NEW.id, a_missing, b_missing USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.approved_at IS NULL THEN NEW.approved_at := now(); END IF;
    IF NEW.approved_by IS NULL THEN
      RAISE EXCEPTION 'approved_by required when approving roadmap version %', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS engine_roadmap_versions_gate ON public.engine_roadmap_versions;
CREATE TRIGGER engine_roadmap_versions_gate
BEFORE INSERT OR UPDATE OF status ON public.engine_roadmap_versions
FOR EACH ROW EXECUTE FUNCTION public.tg_engine_roadmap_versions_gate();

CREATE OR REPLACE FUNCTION public.tg_engine_roadmap_versions_no_self_approve()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.approved_by IS NOT NULL
     AND NEW.created_by IS NOT NULL
     AND NEW.approved_by = NEW.created_by
     AND (NEW.created_by ILIKE 'agent:%' OR NEW.created_by = 'ai') THEN
    RAISE EXCEPTION 'AI-created roadmap version % cannot self-approve (created_by=%, approved_by=%)',
      NEW.id, NEW.created_by, NEW.approved_by USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS engine_roadmap_versions_no_self_approve ON public.engine_roadmap_versions;
CREATE TRIGGER engine_roadmap_versions_no_self_approve
BEFORE INSERT OR UPDATE OF approved_by ON public.engine_roadmap_versions
FOR EACH ROW EXECUTE FUNCTION public.tg_engine_roadmap_versions_no_self_approve();

CREATE OR REPLACE FUNCTION public.tg_engine_projects_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a_missing jsonb;
  b_missing jsonb;
  has_contra boolean;
BEGIN
  IF NEW.status = 'approved'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    has_contra := public.internal_project_has_contradictions(NEW.id);
    IF has_contra THEN
      RAISE EXCEPTION 'Cannot approve project %: unresolved contradictions', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT COALESCE(jsonb_agg(s.field_key),'[]'::jsonb) INTO a_missing
      FROM public.internal_spine_field_keys(NEW.id,'point-a') AS s(field_key)
     WHERE NOT EXISTS (SELECT 1 FROM public.engine_spine_field_truth t
       WHERE t.project_id=NEW.id AND t.spine='point-a'
         AND t.field_key=s.field_key AND t.status='approved_truth');
    SELECT COALESCE(jsonb_agg(s.field_key),'[]'::jsonb) INTO b_missing
      FROM public.internal_spine_field_keys(NEW.id,'point-b') AS s(field_key)
     WHERE NOT EXISTS (SELECT 1 FROM public.engine_spine_field_truth t
       WHERE t.project_id=NEW.id AND t.spine='point-b'
         AND t.field_key=s.field_key AND t.status='approved_truth');
    IF jsonb_array_length(a_missing) > 0 OR jsonb_array_length(b_missing) > 0 THEN
      RAISE EXCEPTION 'Cannot approve project %: spine not fully approved. point_a_missing=%, point_b_missing=%',
        NEW.id, a_missing, b_missing USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS engine_projects_gate ON public.engine_projects;
CREATE TRIGGER engine_projects_gate
BEFORE INSERT OR UPDATE OF status ON public.engine_projects
FOR EACH ROW EXECUTE FUNCTION public.tg_engine_projects_gate();
