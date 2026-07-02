CREATE OR REPLACE FUNCTION public.admin_revoke_role(_email text, _role app_role)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  caller_email text := lower(coalesce(auth.email(), ''));
  normalized text := lower(trim(_email));
  affected integer;
  remaining integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  -- Guard against self-lockout
  IF _role = 'admin'::public.app_role AND normalized = caller_email THEN
    RAISE EXCEPTION 'Cannot revoke your own admin role';
  END IF;
  -- Guard against removing the last admin in the system
  IF _role = 'admin'::public.app_role THEN
    SELECT count(*) INTO remaining
    FROM public.user_roles
    WHERE role = 'admin'::public.app_role
      AND lower(email) <> normalized;
    IF remaining = 0 THEN
      RAISE EXCEPTION 'Cannot revoke the last remaining admin';
    END IF;
  END IF;

  DELETE FROM public.user_roles
  WHERE lower(email) = normalized AND role = _role;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$function$;