-- Pillar 2 fix — engine_project_intake_failures was created with
-- GRANT SELECT only for `authenticated` and no INSERT policy, so the
-- app's user-scoped insert path was silently blocked by RLS (supabase-js
-- returns { error } without throwing, and the caller never checked it).
-- The app now writes through the service role, which bypasses RLS; this
-- grant + policy is defense-in-depth so an admin/operator-authenticated
-- path can also record failures directly.
GRANT INSERT ON public.engine_project_intake_failures TO authenticated;

CREATE POLICY "Admins and operators write intake failures"
  ON public.engine_project_intake_failures
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'operator'::public.app_role)
  );
