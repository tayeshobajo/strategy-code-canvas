
-- Phase 1: publish pipeline gates
ALTER TABLE public.engine_roadmap_versions
  ADD COLUMN IF NOT EXISTS client_preview_status text NOT NULL DEFAULT 'none'
    CHECK (client_preview_status IN ('none','draft','approved')),
  ADD COLUMN IF NOT EXISTS client_preview_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_preview_approved_by text,
  ADD COLUMN IF NOT EXISTS published_to_portal_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_portal_roadmap_id uuid REFERENCES public.client_portal_roadmaps(id) ON DELETE SET NULL;

-- Link engine_projects to client_portal_projects so publish knows the destination
ALTER TABLE public.engine_projects
  ADD COLUMN IF NOT EXISTS client_portal_project_id uuid REFERENCES public.client_portal_projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_engine_projects_portal_project
  ON public.engine_projects (client_portal_project_id);

CREATE INDEX IF NOT EXISTS idx_engine_roadmap_versions_status_created
  ON public.engine_roadmap_versions (status, created_at DESC);
