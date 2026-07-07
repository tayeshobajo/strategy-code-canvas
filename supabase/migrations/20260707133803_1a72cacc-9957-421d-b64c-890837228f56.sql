
-- S1: data-drive operator detection
CREATE OR REPLACE FUNCTION public.client_portal_is_operator(_email text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE role IN ('operator'::public.app_role, 'admin'::public.app_role)
      AND lower(email) = lower(coalesce(_email, ''))
  );
$$;

-- S2: tighten DELETE policy on operator_notification_reads
DROP POLICY IF EXISTS "Operators can clear their own reads" ON public.operator_notification_reads;
CREATE POLICY "Operators can clear their own reads"
ON public.operator_notification_reads
FOR DELETE
TO authenticated
USING (
  lower(email) = lower(COALESCE(auth.email(), ''::text))
  AND (public.has_role(auth.uid(), 'operator'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role))
);

-- S3: scope suppressed_emails policies to service_role only, add DELETE
DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public.suppressed_emails;
DROP POLICY IF EXISTS "Service role can read suppressed emails" ON public.suppressed_emails;

CREATE POLICY "Service role reads suppressed emails"
ON public.suppressed_emails
FOR SELECT
TO service_role
USING (true);

CREATE POLICY "Service role writes suppressed emails"
ON public.suppressed_emails
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role updates suppressed emails"
ON public.suppressed_emails
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role deletes suppressed emails"
ON public.suppressed_emails
FOR DELETE
TO service_role
USING (true);
