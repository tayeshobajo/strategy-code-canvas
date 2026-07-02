
-- Per-change decisions on Version Compare
CREATE TABLE public.engine_version_change_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.engine_roadmap_versions(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  change_id text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('accept','edit','reject')),
  note text,
  actor_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.engine_version_change_decisions TO authenticated;
GRANT ALL ON public.engine_version_change_decisions TO service_role;
ALTER TABLE public.engine_version_change_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and operators read change decisions"
  ON public.engine_version_change_decisions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role)
      OR public.has_role(auth.uid(),'operator'::public.app_role));
CREATE POLICY "Admins and operators insert change decisions"
  ON public.engine_version_change_decisions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role)
           OR public.has_role(auth.uid(),'operator'::public.app_role));
CREATE INDEX engine_version_change_decisions_version_idx
  ON public.engine_version_change_decisions(version_id, module_key);

-- Reserve team-member role for future team assignment
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'team_member';
