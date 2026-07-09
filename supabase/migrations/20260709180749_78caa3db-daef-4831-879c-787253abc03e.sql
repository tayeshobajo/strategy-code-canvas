REVOKE ALL ON public.engine_project_mockups FROM anon, authenticated;
GRANT SELECT ON public.engine_project_mockups TO authenticated;
GRANT ALL ON public.engine_project_mockups TO service_role;