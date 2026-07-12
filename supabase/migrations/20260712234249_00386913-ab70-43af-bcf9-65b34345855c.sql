CREATE OR REPLACE FUNCTION public.spine_field_keys(_project_id uuid, _spine text)
RETURNS SETOF text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE allowed boolean := false;
BEGIN
  SELECT
    public.is_engine_staff()
    OR public.has_role_email(coalesce(auth.email(), ''), 'team_member')
  INTO allowed;
  IF NOT allowed THEN
    RAISE EXCEPTION 'Forbidden: spine_field_keys is staff-only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY SELECT public.internal_spine_field_keys(_project_id, _spine);
END;
$$;

REVOKE ALL ON FUNCTION public.spine_field_keys(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spine_field_keys(uuid, text) TO authenticated, service_role;