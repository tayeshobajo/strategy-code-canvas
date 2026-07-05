-- G-4: delivery_mode on engine_projects
CREATE TYPE public.engine_delivery_mode AS ENUM ('internal_only', 'client_portal_required');

ALTER TABLE public.engine_projects
  ADD COLUMN IF NOT EXISTS delivery_mode public.engine_delivery_mode NOT NULL DEFAULT 'client_portal_required';

-- Backfill: rows without any portal linkage AND whose client has no contact_email
-- become internal_only. Everything else stays on the default.
UPDATE public.engine_projects p
   SET delivery_mode = 'internal_only'
  WHERE p.client_portal_project_id IS NULL
    AND (
      p.client_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.engine_clients c
         WHERE c.id = p.client_id
           AND coalesce(nullif(btrim(c.contact_email), ''), NULL) IS NOT NULL
      )
    );

CREATE INDEX IF NOT EXISTS engine_projects_delivery_mode_idx
  ON public.engine_projects(delivery_mode);

COMMENT ON COLUMN public.engine_projects.delivery_mode IS
  'G-4: internal_only skips portal linkage requirement; client_portal_required makes portal project + owner permission mandatory at creation.';