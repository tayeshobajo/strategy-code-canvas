
-- 1. Narrow client_portal_messages UPDATE policy so clients can only edit
-- their own messages, not operator-authored ones.
DROP POLICY IF EXISTS "Clients update own action items" ON public.client_portal_messages;
CREATE POLICY "Clients update own portal messages"
  ON public.client_portal_messages
  FOR UPDATE TO authenticated
  USING (
    sender_type = 'client'
    AND lower(author_email) = lower(auth.email())
    AND project_id IN (
      SELECT project_id FROM public.client_portal_permissions
      WHERE lower(email) = lower(auth.email()) AND revoked_at IS NULL
    )
  )
  WITH CHECK (
    sender_type = 'client'
    AND lower(author_email) = lower(auth.email())
    AND project_id IN (
      SELECT project_id FROM public.client_portal_permissions
      WHERE lower(email) = lower(auth.email()) AND revoked_at IS NULL
    )
  );

-- 2. Backfill user_id on user_roles from auth.users so we can key strictly on id.
UPDATE public.user_roles ur
   SET user_id = u.id
  FROM auth.users u
 WHERE ur.user_id IS NULL
   AND lower(u.email) = lower(ur.email);

-- 3. Restrict user_roles self-read policy to user_id match only.
DROP POLICY IF EXISTS "user_roles self read" ON public.user_roles;
CREATE POLICY "user_roles self read" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 4. has_role() must only trust user_id, never unverified email match.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE role = _role
      AND user_id = _user_id
  );
$function$;

-- 5. Keep user_id fresh when a granted email later signs up.
CREATE OR REPLACE FUNCTION public.tg_user_roles_backfill_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_roles
     SET user_id = NEW.id
   WHERE user_id IS NULL
     AND lower(email) = lower(NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_roles_backfill_on_auth_user ON auth.users;
CREATE TRIGGER trg_user_roles_backfill_on_auth_user
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.tg_user_roles_backfill_user_id();
