
CREATE TABLE IF NOT EXISTS public.engine_agent_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  agent_task_id UUID REFERENCES public.engine_agent_tasks(id) ON DELETE SET NULL,
  roadmap_version_id UUID REFERENCES public.engine_roadmap_versions(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  category TEXT,
  related_module TEXT,
  model TEXT,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'recorded',
  actor_email TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS engine_agent_costs_project_idx
  ON public.engine_agent_costs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS engine_agent_costs_version_idx
  ON public.engine_agent_costs(roadmap_version_id);

GRANT SELECT ON public.engine_agent_costs TO authenticated;
GRANT ALL ON public.engine_agent_costs TO service_role;

ALTER TABLE public.engine_agent_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read agent costs" ON public.engine_agent_costs;
CREATE POLICY "Admins read agent costs"
  ON public.engine_agent_costs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'operator'::public.app_role));

-- Backfill ledger from historical agent tasks
INSERT INTO public.engine_agent_costs
  (project_id, agent_task_id, roadmap_version_id, kind, category,
   related_module, tokens_in, tokens_out, cost_cents, status, actor_email, created_at)
SELECT
  t.project_id,
  t.id,
  t.roadmap_version_id,
  COALESCE(t.kind::text, 'other'),
  COALESCE(t.category, t.kind::text),
  t.related_module,
  COALESCE(t.tokens_in, 0),
  COALESCE(t.tokens_out, 0),
  COALESCE(t.cost_cents, 0),
  COALESCE(t.status::text, 'recorded'),
  t.created_by_email,
  t.created_at
FROM public.engine_agent_tasks t
LEFT JOIN public.engine_agent_costs c ON c.agent_task_id = t.id
WHERE c.id IS NULL
  AND COALESCE(t.cost_cents, 0) > 0;

-- Backfill roadmap_version_id on downstream rows
WITH latest AS (
  SELECT DISTINCT ON (project_id) project_id, id AS version_id
  FROM public.engine_roadmap_versions
  WHERE status = 'approved'
  ORDER BY project_id, approved_at DESC NULLS LAST, created_at DESC
),
fallback AS (
  SELECT DISTINCT ON (project_id) project_id, id AS version_id
  FROM public.engine_roadmap_versions
  ORDER BY project_id, created_at DESC
),
resolved AS (
  SELECT p.id AS project_id,
         COALESCE(l.version_id, f.version_id) AS version_id
  FROM public.engine_projects p
  LEFT JOIN latest l ON l.project_id = p.id
  LEFT JOIN fallback f ON f.project_id = p.id
)
UPDATE public.engine_milestones m
SET roadmap_version_id = r.version_id
FROM resolved r
WHERE m.project_id = r.project_id AND m.roadmap_version_id IS NULL AND r.version_id IS NOT NULL;

WITH latest AS (
  SELECT DISTINCT ON (project_id) project_id, id AS version_id
  FROM public.engine_roadmap_versions
  WHERE status = 'approved'
  ORDER BY project_id, approved_at DESC NULLS LAST, created_at DESC
),
fallback AS (
  SELECT DISTINCT ON (project_id) project_id, id AS version_id
  FROM public.engine_roadmap_versions
  ORDER BY project_id, created_at DESC
),
resolved AS (
  SELECT p.id AS project_id,
         COALESCE(l.version_id, f.version_id) AS version_id
  FROM public.engine_projects p
  LEFT JOIN latest l ON l.project_id = p.id
  LEFT JOIN fallback f ON f.project_id = p.id
)
UPDATE public.engine_tasks t
SET roadmap_version_id = r.version_id
FROM resolved r
WHERE t.project_id = r.project_id AND t.roadmap_version_id IS NULL AND r.version_id IS NOT NULL;

WITH latest AS (
  SELECT DISTINCT ON (project_id) project_id, id AS version_id
  FROM public.engine_roadmap_versions
  WHERE status = 'approved'
  ORDER BY project_id, approved_at DESC NULLS LAST, created_at DESC
),
fallback AS (
  SELECT DISTINCT ON (project_id) project_id, id AS version_id
  FROM public.engine_roadmap_versions
  ORDER BY project_id, created_at DESC
),
resolved AS (
  SELECT p.id AS project_id,
         COALESCE(l.version_id, f.version_id) AS version_id
  FROM public.engine_projects p
  LEFT JOIN latest l ON l.project_id = p.id
  LEFT JOIN fallback f ON f.project_id = p.id
)
UPDATE public.engine_agent_tasks a
SET roadmap_version_id = r.version_id
FROM resolved r
WHERE a.project_id = r.project_id AND a.roadmap_version_id IS NULL AND r.version_id IS NOT NULL;

WITH latest AS (
  SELECT DISTINCT ON (project_id) project_id, id AS version_id
  FROM public.engine_roadmap_versions
  WHERE status = 'approved'
  ORDER BY project_id, approved_at DESC NULLS LAST, created_at DESC
),
fallback AS (
  SELECT DISTINCT ON (project_id) project_id, id AS version_id
  FROM public.engine_roadmap_versions
  ORDER BY project_id, created_at DESC
),
resolved AS (
  SELECT p.id AS project_id,
         COALESCE(l.version_id, f.version_id) AS version_id
  FROM public.engine_projects p
  LEFT JOIN latest l ON l.project_id = p.id
  LEFT JOIN fallback f ON f.project_id = p.id
)
UPDATE public.engine_agent_costs c
SET roadmap_version_id = r.version_id
FROM resolved r
WHERE c.project_id = r.project_id AND c.roadmap_version_id IS NULL AND r.version_id IS NOT NULL;
