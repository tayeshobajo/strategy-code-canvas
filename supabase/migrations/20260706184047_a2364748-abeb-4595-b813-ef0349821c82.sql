CREATE POLICY "Operators can update their own reads"
ON public.operator_notification_reads
FOR UPDATE
TO authenticated
USING (lower(email) = lower(COALESCE(auth.email(), '')))
WITH CHECK (
  lower(email) = lower(COALESCE(auth.email(), ''))
  AND (public.has_role(auth.uid(), 'operator'::public.app_role)
       OR public.has_role(auth.uid(), 'admin'::public.app_role))
);