
-- 1. engine_intelligence_decisions: append-only merge/clean/reject audit for intelligence items
CREATE TABLE public.engine_intelligence_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id uuid REFERENCES public.engine_intelligence_memory(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('merge','clean','reject','promote','archive','restore','accept')),
  actor_email text NOT NULL,
  actor_user_id uuid,
  before_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX intel_decisions_memory_idx ON public.engine_intelligence_decisions(memory_id);
CREATE INDEX intel_decisions_project_idx ON public.engine_intelligence_decisions(project_id);
CREATE INDEX intel_decisions_created_idx ON public.engine_intelligence_decisions(created_at DESC);
GRANT SELECT, INSERT ON public.engine_intelligence_decisions TO authenticated;
GRANT ALL ON public.engine_intelligence_decisions TO service_role;
ALTER TABLE public.engine_intelligence_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins operators insert intel decisions" ON public.engine_intelligence_decisions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'operator'::public.app_role)
  );
CREATE POLICY "Admins operators team members read intel decisions" ON public.engine_intelligence_decisions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'operator'::public.app_role)
    OR public.has_role(auth.uid(), 'team_member'::public.app_role)
  );

-- 2. Intelligence memory traceability: link items to sources, milestones, signals, module keys
ALTER TABLE public.engine_intelligence_memory
  ADD COLUMN IF NOT EXISTS source_id uuid REFERENCES public.engine_sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS milestone_id uuid REFERENCES public.engine_milestones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS module_ref text,
  ADD COLUMN IF NOT EXISTS signal_id uuid REFERENCES public.engine_signals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS intel_memory_source_idx ON public.engine_intelligence_memory(source_id);
CREATE INDEX IF NOT EXISTS intel_memory_milestone_idx ON public.engine_intelligence_memory(milestone_id);
CREATE INDEX IF NOT EXISTS intel_memory_module_idx ON public.engine_intelligence_memory(module_ref);

-- 3. team_member read-only RLS across audit/approvals surfaces
CREATE POLICY "Team members read roadmap approvals" ON public.roadmap_approvals
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'team_member'::public.app_role));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Team members read audit log' AND tablename='engine_audit_log') THEN
    CREATE POLICY "Team members read audit log" ON public.engine_audit_log
      FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'team_member'::public.app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Team members read review items' AND tablename='engine_review_items') THEN
    CREATE POLICY "Team members read review items" ON public.engine_review_items
      FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'team_member'::public.app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Team members read review audit' AND tablename='engine_review_audit') THEN
    CREATE POLICY "Team members read review audit" ON public.engine_review_audit
      FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'team_member'::public.app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Team members read version decisions' AND tablename='engine_version_change_decisions') THEN
    CREATE POLICY "Team members read version decisions" ON public.engine_version_change_decisions
      FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'team_member'::public.app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Team members read agent tasks' AND tablename='engine_agent_tasks') THEN
    CREATE POLICY "Team members read agent tasks" ON public.engine_agent_tasks
      FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'team_member'::public.app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Team members read agent costs' AND tablename='engine_agent_costs') THEN
    CREATE POLICY "Team members read agent costs" ON public.engine_agent_costs
      FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'team_member'::public.app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Team members read projects' AND tablename='engine_projects') THEN
    CREATE POLICY "Team members read projects" ON public.engine_projects
      FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'team_member'::public.app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Team members read milestones' AND tablename='engine_milestones') THEN
    CREATE POLICY "Team members read milestones" ON public.engine_milestones
      FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'team_member'::public.app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Team members read tasks' AND tablename='engine_tasks') THEN
    CREATE POLICY "Team members read tasks" ON public.engine_tasks
      FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'team_member'::public.app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Team members read roadmap versions' AND tablename='engine_roadmap_versions') THEN
    CREATE POLICY "Team members read roadmap versions" ON public.engine_roadmap_versions
      FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'team_member'::public.app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Team members read intel memory' AND tablename='engine_intelligence_memory') THEN
    CREATE POLICY "Team members read intel memory" ON public.engine_intelligence_memory
      FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'team_member'::public.app_role));
  END IF;
END $$;
