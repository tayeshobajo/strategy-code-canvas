-- App roles enum + user_roles table + has_role() helper
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'operator', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.app_role NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by text,
  UNIQUE (email, role)
);

CREATE INDEX IF NOT EXISTS user_roles_user_id_idx ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS user_roles_email_idx ON public.user_roles(lower(email));

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Users can see their own roles; service role manages
DROP POLICY IF EXISTS "user_roles self read" ON public.user_roles;
CREATE POLICY "user_roles self read" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR lower(email) = lower(auth.email()));

-- has_role by user_id
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE role = _role
      AND (
        user_id = _user_id
        OR lower(email) = lower((SELECT u.email FROM auth.users u WHERE u.id = _user_id))
      )
  );
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- has_role by email (used by server fns that already have claim.email)
CREATE OR REPLACE FUNCTION public.has_role_email(_email text, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE role = _role AND lower(email) = lower(_email)
  );
$$;

REVOKE ALL ON FUNCTION public.has_role_email(text, public.app_role) FROM public;
GRANT EXECUTE ON FUNCTION public.has_role_email(text, public.app_role) TO authenticated, service_role;

-- Backfill: seed existing hardcoded operator/admin emails
INSERT INTO public.user_roles (email, role, granted_by) VALUES
  ('tai@trusttai.com', 'operator', 'migration'),
  ('henry@trusttai.com', 'operator', 'migration'),
  ('tai@trust-tai.com', 'operator', 'migration'),
  ('henry@trust-tai.com', 'operator', 'migration'),
  ('hello@trusttai.com', 'admin', 'migration'),
  ('hello@trust-tai.com', 'admin', 'migration'),
  ('tai@trusttai.com', 'admin', 'migration'),
  ('henry@trusttai.com', 'admin', 'migration')
ON CONFLICT (email, role) DO NOTHING;

-- Link user_id where auth.users already exists
UPDATE public.user_roles ur
SET user_id = u.id
FROM auth.users u
WHERE ur.user_id IS NULL AND lower(u.email) = lower(ur.email);
