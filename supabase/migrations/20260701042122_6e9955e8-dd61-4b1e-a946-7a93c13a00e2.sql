
-- Grants for portal tables (data API access)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_portal_projects TO authenticated;
GRANT ALL ON public.client_portal_projects TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_portal_permissions TO authenticated;
GRANT ALL ON public.client_portal_permissions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_portal_onboarding TO authenticated;
GRANT ALL ON public.client_portal_onboarding TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_portal_messages TO authenticated;
GRANT ALL ON public.client_portal_messages TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_portal_files TO authenticated;
GRANT ALL ON public.client_portal_files TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_portal_activity TO authenticated;
GRANT ALL ON public.client_portal_activity TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_portal_billing TO authenticated;
GRANT ALL ON public.client_portal_billing TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_portal_roadmaps TO authenticated;
GRANT ALL ON public.client_portal_roadmaps TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_access TO authenticated;
GRANT ALL ON public.client_access TO service_role;

-- Client-facing SELECT policies on portal_projects and related tables
DO $$ BEGIN
  CREATE POLICY "Clients read own portal project" ON public.client_portal_projects
    FOR SELECT TO authenticated
    USING (id = public.current_client_portal_project_id() OR public.client_portal_is_operator(auth.email()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Operators manage portal projects" ON public.client_portal_projects
    FOR ALL TO authenticated
    USING (public.client_portal_is_operator(auth.email()))
    WITH CHECK (public.client_portal_is_operator(auth.email()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Clients read own onboarding" ON public.client_portal_onboarding
    FOR SELECT TO authenticated
    USING (project_id = public.current_client_portal_project_id() OR public.client_portal_is_operator(auth.email()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Operators manage onboarding" ON public.client_portal_onboarding
    FOR ALL TO authenticated
    USING (public.client_portal_is_operator(auth.email()))
    WITH CHECK (public.client_portal_is_operator(auth.email()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Clients read own approved roadmap" ON public.client_portal_roadmaps
    FOR SELECT TO authenticated
    USING ((project_id = public.current_client_portal_project_id() AND approved_at IS NOT NULL) OR public.client_portal_is_operator(auth.email()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Operators manage roadmaps" ON public.client_portal_roadmaps
    FOR ALL TO authenticated
    USING (public.client_portal_is_operator(auth.email()))
    WITH CHECK (public.client_portal_is_operator(auth.email()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Clients read own billing" ON public.client_portal_billing
    FOR SELECT TO authenticated
    USING (project_id = public.current_client_portal_project_id() OR public.client_portal_is_operator(auth.email()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Operators manage billing" ON public.client_portal_billing
    FOR ALL TO authenticated
    USING (public.client_portal_is_operator(auth.email()))
    WITH CHECK (public.client_portal_is_operator(auth.email()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Operators manage permissions" ON public.client_portal_permissions
    FOR ALL TO authenticated
    USING (public.client_portal_is_operator(auth.email()))
    WITH CHECK (public.client_portal_is_operator(auth.email()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Operators read all activity" ON public.client_portal_activity
    FOR ALL TO authenticated
    USING (public.client_portal_is_operator(auth.email()))
    WITH CHECK (public.client_portal_is_operator(auth.email()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
