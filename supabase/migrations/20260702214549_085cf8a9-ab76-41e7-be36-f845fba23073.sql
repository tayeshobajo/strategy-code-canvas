
-- 1. Remove redundant policies using current_client_portal_project_id() (single-project ambiguity).
DROP POLICY IF EXISTS "Clients read own onboarding" ON public.client_portal_onboarding;
DROP POLICY IF EXISTS "Clients read own approved roadmap" ON public.client_portal_roadmaps;

-- Ensure clients can still read onboarding for ALL projects they are permitted to.
CREATE POLICY "Clients read permitted onboarding"
  ON public.client_portal_onboarding
  FOR SELECT
  TO authenticated
  USING (
    project_id IN (
      SELECT p.project_id
      FROM public.client_portal_permissions p
      WHERE lower(p.email) = lower(auth.email())
        AND p.revoked_at IS NULL
    )
    OR public.client_portal_is_operator(auth.email())
  );

-- 2. Revoke EXECUTE from anon on SECURITY DEFINER functions that should never be public.
REVOKE EXECUTE ON FUNCTION public.admin_grant_role(text, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_role(text, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_list_user_roles() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_list_email_dlq(text, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_retry_email_dlq(text, bigint) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role_email(text, public.app_role) FROM anon, public;

-- 3. Orders: allow authenticated customers to read their own orders by email.
CREATE POLICY "Customers read own orders"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (lower(customer_email) = lower(auth.email()));

-- 4. intake_submissions: explicitly revoke any client access; server-only via service_role.
REVOKE ALL ON public.intake_submissions FROM anon, authenticated, public;
GRANT ALL ON public.intake_submissions TO service_role;
COMMENT ON TABLE public.intake_submissions IS
  'Server-only: written and read exclusively by the intake edge/server functions via service_role. RLS is fail-closed (no policies) and no client-facing grants exist.';
