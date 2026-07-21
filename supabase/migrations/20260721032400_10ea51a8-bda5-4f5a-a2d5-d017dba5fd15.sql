DROP POLICY IF EXISTS "Users see own subs by user_id or verified email" ON public.subscriptions;
CREATE POLICY "Users see own subs by user_id or verified email"
ON public.subscriptions
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR (
    customer_email IS NOT NULL
    AND customer_email = auth.email()
    AND COALESCE((auth.jwt() ->> 'email_verified')::boolean, false) = true
  )
);