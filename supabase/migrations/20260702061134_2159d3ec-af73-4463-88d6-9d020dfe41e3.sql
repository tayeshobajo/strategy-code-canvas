
ALTER TABLE public.engine_projects
  ADD COLUMN IF NOT EXISTS approved_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by_email text;

ALTER TABLE public.engine_agent_tasks
  ADD COLUMN IF NOT EXISTS applied_module text,
  ADD COLUMN IF NOT EXISTS applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS pending_approval boolean NOT NULL DEFAULT false;

ALTER TABLE public.engine_roadmap_versions
  ADD COLUMN IF NOT EXISTS parent_version_id uuid REFERENCES public.engine_roadmap_versions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_engine_agent_tasks_pending
  ON public.engine_agent_tasks(project_id) WHERE pending_approval = true;
