
-- D1
ALTER TYPE public.engine_version_status RENAME TO engine_version_status_old;

CREATE TYPE public.engine_version_status AS ENUM (
  'ai_generated',
  'draft',
  'tai_edited',
  'approved',
  'delivered',
  'archived'
);

ALTER TABLE public.engine_roadmap_versions
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE public.engine_version_status
    USING status::text::public.engine_version_status,
  ALTER COLUMN status SET DEFAULT 'ai_generated'::public.engine_version_status;

DROP TYPE public.engine_version_status_old;

-- D3
ALTER TABLE public.client_portal_roadmaps
  DROP CONSTRAINT client_portal_roadmaps_status_check;
ALTER TABLE public.client_portal_roadmaps
  ADD CONSTRAINT client_portal_roadmaps_status_check
  CHECK (status IN ('in_progress', 'draft', 'approved', 'delivered', 'archived'));
