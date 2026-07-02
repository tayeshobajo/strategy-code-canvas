
-- Roadmap approvals ledger
CREATE TABLE public.roadmap_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.engine_roadmap_versions(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  snapshot_version text NOT NULL,
  approver_email text,
  notes text,
  review_item_id uuid REFERENCES public.engine_review_items(id) ON DELETE SET NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.roadmap_approvals TO authenticated;
GRANT ALL ON public.roadmap_approvals TO service_role;
ALTER TABLE public.roadmap_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and operators read approvals" ON public.roadmap_approvals
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'operator'::public.app_role));
CREATE POLICY "Admins insert approvals" ON public.roadmap_approvals
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE INDEX roadmap_approvals_project_idx ON public.roadmap_approvals(project_id, approved_at DESC);
CREATE INDEX roadmap_approvals_version_idx ON public.roadmap_approvals(version_id);

-- Intelligence memory store (Global Memory page)
CREATE TABLE public.engine_intelligence_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  summary text,
  type text NOT NULL DEFAULT 'Insight',
  source text,
  source_date date,
  captured_at timestamptz NOT NULL DEFAULT now(),
  confidence integer NOT NULL DEFAULT 80 CHECK (confidence BETWEEN 0 AND 100),
  tags text[] NOT NULL DEFAULT '{}',
  used_in text,
  promoted_by text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_intelligence_memory TO authenticated;
GRANT ALL ON public.engine_intelligence_memory TO service_role;
ALTER TABLE public.engine_intelligence_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and operators read memory" ON public.engine_intelligence_memory
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'operator'::public.app_role));
CREATE POLICY "Admins and operators insert memory" ON public.engine_intelligence_memory
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role)
           OR public.has_role(auth.uid(), 'operator'::public.app_role));
CREATE POLICY "Admins and operators update memory" ON public.engine_intelligence_memory
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'operator'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role)
           OR public.has_role(auth.uid(), 'operator'::public.app_role));
CREATE POLICY "Admins delete memory" ON public.engine_intelligence_memory
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE INDEX engine_intelligence_memory_project_idx ON public.engine_intelligence_memory(project_id);
CREATE INDEX engine_intelligence_memory_type_idx ON public.engine_intelligence_memory(type);
CREATE TRIGGER touch_engine_intelligence_memory
  BEFORE UPDATE ON public.engine_intelligence_memory
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- Versioning lineage on downstream records
ALTER TABLE public.engine_milestones ADD COLUMN IF NOT EXISTS roadmap_version_id uuid REFERENCES public.engine_roadmap_versions(id) ON DELETE SET NULL;
ALTER TABLE public.engine_milestones ADD COLUMN IF NOT EXISTS created_by_kind text NOT NULL DEFAULT 'human' CHECK (created_by_kind IN ('ai','human'));
CREATE INDEX IF NOT EXISTS engine_milestones_version_idx ON public.engine_milestones(roadmap_version_id);

ALTER TABLE public.engine_tasks ADD COLUMN IF NOT EXISTS roadmap_version_id uuid REFERENCES public.engine_roadmap_versions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS engine_tasks_version_idx ON public.engine_tasks(roadmap_version_id);

ALTER TABLE public.engine_agent_tasks ADD COLUMN IF NOT EXISTS roadmap_version_id uuid REFERENCES public.engine_roadmap_versions(id) ON DELETE SET NULL;
ALTER TABLE public.engine_agent_tasks ADD COLUMN IF NOT EXISTS created_by_kind text NOT NULL DEFAULT 'ai' CHECK (created_by_kind IN ('ai','human'));
CREATE INDEX IF NOT EXISTS engine_agent_tasks_version_idx ON public.engine_agent_tasks(roadmap_version_id);
