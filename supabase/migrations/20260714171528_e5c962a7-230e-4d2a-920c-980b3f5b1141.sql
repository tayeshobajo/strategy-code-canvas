-- Phase 4 QA Fixes Rev 2.2 — replace provenance trigger predicate to accept
-- ceremony.status IN ('in_progress','completed'). All other logic identical
-- to Rev 2.1 already installed.

-- Fail-closed guard (mirrors Rev 2.2 predicate exactly).
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
                AND c.status      IN ('in_progress','completed')
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
      'Phase 4 Rev 2.2 guard: % legacy approved_truth row(s) fail the trigger predicate.',
      bad_count
      USING ERRCODE = 'check_violation';
  END IF;
END
$guard$;

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
       OR ceremony.status NOT IN ('in_progress','completed') THEN
      RAISE EXCEPTION 'approved_truth ceremony_id % invalid (project/spine mismatch or not in_progress/completed) for field %:%',
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

DROP TRIGGER IF EXISTS trg_engine_spine_field_truth_provenance ON public.engine_spine_field_truth;
CREATE TRIGGER trg_engine_spine_field_truth_provenance
BEFORE INSERT OR UPDATE ON public.engine_spine_field_truth
FOR EACH ROW EXECUTE FUNCTION public.tg_engine_spine_field_truth_provenance();