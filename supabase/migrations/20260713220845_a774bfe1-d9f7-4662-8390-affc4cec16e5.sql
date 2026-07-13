
CREATE OR REPLACE FUNCTION public.tg_engine_business_engines_gate()
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
  IF NEW.status = 'approved' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    has_contra := public.internal_project_has_contradictions(NEW.project_id);
    IF has_contra THEN
      RAISE EXCEPTION 'Cannot approve engine %: project % has unresolved contradictions',
        NEW.id, NEW.project_id USING ERRCODE = 'check_violation';
    END IF;

    SELECT COALESCE(jsonb_agg(s.field_key), '[]'::jsonb) INTO a_missing
      FROM public.internal_spine_field_keys(NEW.project_id, 'point-a') AS s(field_key)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.engine_spine_field_truth t
        WHERE t.project_id = NEW.project_id
          AND t.spine      = 'point-a'
          AND t.field_key  = s.field_key
          AND t.status     = 'approved_truth');

    SELECT COALESCE(jsonb_agg(s.field_key), '[]'::jsonb) INTO b_missing
      FROM public.internal_spine_field_keys(NEW.project_id, 'point-b') AS s(field_key)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.engine_spine_field_truth t
        WHERE t.project_id = NEW.project_id
          AND t.spine      = 'point-b'
          AND t.field_key  = s.field_key
          AND t.status     = 'approved_truth');

    IF jsonb_array_length(a_missing) > 0 OR jsonb_array_length(b_missing) > 0 THEN
      RAISE EXCEPTION 'Cannot approve engine %: spine not fully approved. point_a_missing=%, point_b_missing=%',
        NEW.id, a_missing, b_missing USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.approved_at IS NULL THEN NEW.approved_at := now(); END IF;
    IF NEW.approved_by IS NULL THEN
      RAISE EXCEPTION 'approved_by required when approving engine %', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.status = 'active' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    IF NEW.approved_at IS NULL OR COALESCE(TRIM(NEW.owner_email),'') = '' THEN
      RAISE EXCEPTION 'Engine % cannot activate without approved_at and owner_email', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
