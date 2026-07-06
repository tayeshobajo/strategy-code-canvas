-- Pillar 2 — durable intake-failure log that survives project rollback.
CREATE TABLE public.engine_project_intake_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempted_project_id uuid,  -- NO FK: must survive rollback of engine_projects
  attempted_project_name text,
  attempted_client_id uuid,
  actor_email text,
  delivery_mode text,
  failure_reason text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX engine_project_intake_failures_created_at_idx
  ON public.engine_project_intake_failures (created_at DESC);

GRANT SELECT ON public.engine_project_intake_failures TO authenticated;
GRANT ALL ON public.engine_project_intake_failures TO service_role;

ALTER TABLE public.engine_project_intake_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and operators read intake failures"
  ON public.engine_project_intake_failures
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'operator'::public.app_role)
  );

CREATE POLICY "Service role manages intake failures"
  ON public.engine_project_intake_failures
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);