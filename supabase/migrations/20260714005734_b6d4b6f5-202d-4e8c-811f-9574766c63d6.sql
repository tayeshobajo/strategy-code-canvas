-- Runtime schema drift hotfix (independent of Phase 5D)
-- 1) Restore missing column referenced by engine-nba / engine-execution / engine-completion
ALTER TABLE public.engine_projects
  ADD COLUMN IF NOT EXISTS current_phase text NULL;

-- 2) Restore Data API grants on client_portal_roadmaps.
--    Preflight (2026-07-14): RLS is ENABLED and scoped by client_portal_permissions
--    (client reads) + client_portal_is_operator (staff writes). No USING(true) policies.
GRANT SELECT ON public.client_portal_roadmaps TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_portal_roadmaps TO authenticated;
GRANT ALL ON public.client_portal_roadmaps TO service_role;
