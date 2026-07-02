
-- Admin can see all role rows
DROP POLICY IF EXISTS "user_roles admin read" ON public.user_roles;
CREATE POLICY "user_roles admin read"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- List
CREATE OR REPLACE FUNCTION public.admin_list_user_roles()
RETURNS TABLE(id uuid, email text, role public.app_role, user_id uuid, granted_by text, granted_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  RETURN QUERY
    SELECT r.id, r.email, r.role, r.user_id, r.granted_by, r.granted_at
    FROM public.user_roles r
    ORDER BY r.granted_at DESC;
END;
$$;

-- Grant
CREATE OR REPLACE FUNCTION public.admin_grant_role(_email text, _role public.app_role)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_email text := lower(coalesce(auth.email(), ''));
  normalized text := lower(trim(_email));
  target_uid uuid;
  new_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  IF normalized IS NULL OR normalized = '' OR position('@' in normalized) = 0 THEN
    RAISE EXCEPTION 'Invalid email';
  END IF;

  SELECT u.id INTO target_uid FROM auth.users u WHERE lower(u.email) = normalized LIMIT 1;

  INSERT INTO public.user_roles(email, role, user_id, granted_by)
  VALUES (normalized, _role, target_uid, caller_email)
  ON CONFLICT (email, role) DO UPDATE SET user_id = COALESCE(EXCLUDED.user_id, public.user_roles.user_id)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

-- Revoke
CREATE OR REPLACE FUNCTION public.admin_revoke_role(_email text, _role public.app_role)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_email text := lower(coalesce(auth.email(), ''));
  normalized text := lower(trim(_email));
  affected integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  -- Guard against self-lockout
  IF _role = 'admin'::public.app_role AND normalized = caller_email THEN
    RAISE EXCEPTION 'Cannot revoke your own admin role';
  END IF;

  DELETE FROM public.user_roles
  WHERE lower(email) = normalized AND role = _role;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- Lock down execute
REVOKE ALL ON FUNCTION public.admin_list_user_roles() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_grant_role(text, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_revoke_role(text, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_user_roles() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_grant_role(text, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_revoke_role(text, public.app_role) TO authenticated, service_role;
