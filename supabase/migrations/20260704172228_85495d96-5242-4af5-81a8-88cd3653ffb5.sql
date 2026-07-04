
-- 1. Remove orphaned review items (no matching engine_projects row).
DELETE FROM public.engine_review_items
WHERE project_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.engine_projects ep WHERE ep.name = engine_review_items.project);

-- 2. Enforce project_id and switch the FK to CASCADE (was SET NULL).
ALTER TABLE public.engine_review_items
  DROP CONSTRAINT IF EXISTS engine_review_items_project_id_fkey;

ALTER TABLE public.engine_review_items
  ALTER COLUMN project_id SET NOT NULL;

ALTER TABLE public.engine_review_items
  ADD CONSTRAINT engine_review_items_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.engine_projects(id) ON DELETE CASCADE;

-- 3. Add dedicated portal project link column with FK + index.
ALTER TABLE public.engine_review_items
  ADD COLUMN IF NOT EXISTS client_portal_project_id UUID
  REFERENCES public.client_portal_projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS engine_review_items_client_portal_project_id_idx
  ON public.engine_review_items(client_portal_project_id);

CREATE INDEX IF NOT EXISTS engine_review_items_project_id_idx
  ON public.engine_review_items(project_id);

-- 4. Backfill from engine_projects.client_portal_project_id when linked.
UPDATE public.engine_review_items ri
SET client_portal_project_id = ep.client_portal_project_id
FROM public.engine_projects ep
WHERE ri.project_id = ep.id
  AND ep.client_portal_project_id IS NOT NULL
  AND ri.client_portal_project_id IS NULL;
