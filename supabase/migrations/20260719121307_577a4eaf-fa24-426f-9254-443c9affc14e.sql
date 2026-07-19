ALTER TABLE public.engine_projects
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by text;

CREATE INDEX IF NOT EXISTS engine_projects_deleted_at_idx
  ON public.engine_projects (deleted_at)
  WHERE deleted_at IS NOT NULL;