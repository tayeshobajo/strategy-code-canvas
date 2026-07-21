-- Tighten subscription visibility: require verified email for email-based match,
-- prefer user_id matching. Prevents a new account claiming an unverified email
-- from viewing another customer's subscription/billing metadata.
DROP POLICY IF EXISTS "Users see own subs by user_id or email" ON public.subscriptions;

CREATE POLICY "Users see own subs by user_id or verified email"
ON public.subscriptions
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR (
    customer_email IS NOT NULL
    AND customer_email = auth.email()
    AND COALESCE((auth.jwt() -> 'user_metadata' ->> 'email_verified')::boolean, false) = true
  )
);

-- operator_notifications: harden SELECT policy to require an authenticated
-- session before role check evaluates (defense in depth for Realtime).
DROP POLICY IF EXISTS "Operators and admins can view notifications" ON public.operator_notifications;

CREATE POLICY "Operators and admins can view notifications"
ON public.operator_notifications
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.has_role(auth.uid(), 'operator'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);
