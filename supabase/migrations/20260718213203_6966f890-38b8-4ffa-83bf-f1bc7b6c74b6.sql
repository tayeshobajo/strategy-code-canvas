-- RT-3: Capability registry + execution boundary tables

CREATE TABLE public.engine_capability_registry (
  id text PRIMARY KEY,
  label text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'positioning','content','audience_capture','intelligence','product_ai','operations'
  )),
  execution_mode text NOT NULL CHECK (execution_mode IN ('trust_tai_build','trust_tai_coordinate')),
  description text NOT NULL,
  version int NOT NULL DEFAULT 1,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.engine_capability_registry TO authenticated;
GRANT ALL ON public.engine_capability_registry TO service_role;
ALTER TABLE public.engine_capability_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "capability_registry_read_authenticated"
  ON public.engine_capability_registry FOR SELECT TO authenticated USING (true);
CREATE POLICY "capability_registry_admin_write"
  ON public.engine_capability_registry FOR ALL TO authenticated
  USING (public.has_role_email(auth.jwt() ->> 'email', 'admin'))
  WITH CHECK (public.has_role_email(auth.jwt() ->> 'email', 'admin'));

CREATE TABLE public.engine_project_execution_boundary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  version int NOT NULL,
  status text NOT NULL CHECK (status IN ('draft','proposed','approved','superseded')),
  capability_ids text[] NOT NULL DEFAULT '{}',
  client_owned_areas text[] NOT NULL DEFAULT '{}',
  exclusions text[] NOT NULL DEFAULT '{}',
  notes text NOT NULL DEFAULT '',
  proposed_by_email text NOT NULL,
  proposed_by_actor text NOT NULL CHECK (proposed_by_actor IN ('human','ai')),
  approved_by_email text,
  approved_at timestamptz,
  rejected_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);
CREATE INDEX engine_project_execution_boundary_project_idx
  ON public.engine_project_execution_boundary (project_id, version DESC);
GRANT SELECT, INSERT, UPDATE ON public.engine_project_execution_boundary TO authenticated;
GRANT ALL ON public.engine_project_execution_boundary TO service_role;
ALTER TABLE public.engine_project_execution_boundary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "execution_boundary_admin_operator_all"
  ON public.engine_project_execution_boundary FOR ALL TO authenticated
  USING (
    public.has_role_email(auth.jwt() ->> 'email', 'admin')
    OR public.has_role_email(auth.jwt() ->> 'email', 'operator')
  )
  WITH CHECK (
    public.has_role_email(auth.jwt() ->> 'email', 'admin')
    OR public.has_role_email(auth.jwt() ->> 'email', 'operator')
  );

CREATE OR REPLACE FUNCTION public.enforce_execution_boundary_second_reviewer()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'approved' AND NEW.approved_by_email IS NOT NULL
     AND lower(NEW.approved_by_email) = lower(NEW.proposed_by_email) THEN
    RAISE EXCEPTION 'second-reviewer rule: approver must differ from proposer';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_execution_boundary_second_reviewer
  BEFORE INSERT OR UPDATE ON public.engine_project_execution_boundary
  FOR EACH ROW EXECUTE FUNCTION public.enforce_execution_boundary_second_reviewer();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_capability_registry_updated_at
  BEFORE UPDATE ON public.engine_capability_registry
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_execution_boundary_updated_at
  BEFORE UPDATE ON public.engine_project_execution_boundary
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();