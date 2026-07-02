
ALTER TABLE public.engine_sources
  ADD COLUMN IF NOT EXISTS current_stage text,
  ADD COLUMN IF NOT EXISTS processing_stages jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz;

CREATE TABLE IF NOT EXISTS public.engine_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  actor_email text,
  action text NOT NULL,
  summary text,
  affected_modules text[] NOT NULL DEFAULT '{}'::text[],
  version_id uuid,
  target_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_engine_audit_log_project_created
  ON public.engine_audit_log(project_id, created_at DESC);

GRANT SELECT, INSERT ON public.engine_audit_log TO authenticated;
GRANT ALL ON public.engine_audit_log TO service_role;

ALTER TABLE public.engine_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read audit log" ON public.engine_audit_log;
CREATE POLICY "Admins read audit log"
  ON public.engine_audit_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins insert audit log" ON public.engine_audit_log;
CREATE POLICY "Admins insert audit log"
  ON public.engine_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
