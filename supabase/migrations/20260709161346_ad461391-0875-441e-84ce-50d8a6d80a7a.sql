-- Defense-in-depth: RLS blocks direct writes on engine_project_frames, and all
-- server mutations run through supabaseAdmin. Strip the misleading write
-- grants from anon/authenticated so the table's advertised capability
-- matches its enforced capability.
REVOKE INSERT, UPDATE, DELETE ON public.engine_project_frames FROM authenticated, anon;
-- keep SELECT on authenticated (staff RLS policy still gates row visibility);
-- anon SELECT stays revoked below.
REVOKE SELECT ON public.engine_project_frames FROM anon;
GRANT ALL ON public.engine_project_frames TO service_role;