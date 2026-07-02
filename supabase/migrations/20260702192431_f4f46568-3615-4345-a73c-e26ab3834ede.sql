
-- P0.1: link client portal roadmaps to internal approved engine version
ALTER TABLE public.client_portal_roadmaps
  ADD COLUMN IF NOT EXISTS source_version_id uuid
    REFERENCES public.engine_roadmap_versions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_client_portal_roadmaps_source_version
  ON public.client_portal_roadmaps(source_version_id);

-- Enforce that approved/delivered rows must carry an approval + version link.
CREATE OR REPLACE FUNCTION public.tg_client_portal_roadmaps_require_source_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('approved', 'delivered') THEN
    IF NEW.source_version_id IS NULL THEN
      RAISE EXCEPTION 'client_portal_roadmaps.source_version_id is required when status is approved or delivered';
    END IF;
    IF NEW.approved_at IS NULL THEN
      RAISE EXCEPTION 'client_portal_roadmaps.approved_at is required when status is approved or delivered';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_client_portal_roadmaps_require_source_version
  ON public.client_portal_roadmaps;
CREATE TRIGGER trg_client_portal_roadmaps_require_source_version
  BEFORE INSERT OR UPDATE ON public.client_portal_roadmaps
  FOR EACH ROW EXECUTE FUNCTION public.tg_client_portal_roadmaps_require_source_version();

-- Tighten client read policies so unlinked approved rows never leak.
DROP POLICY IF EXISTS "Clients read approved roadmaps" ON public.client_portal_roadmaps;
CREATE POLICY "Clients read approved roadmaps"
  ON public.client_portal_roadmaps FOR SELECT
  TO authenticated
  USING (
    status IN ('approved', 'delivered')
    AND source_version_id IS NOT NULL
    AND approved_at IS NOT NULL
    AND project_id IN (
      SELECT p.project_id FROM public.client_portal_permissions p
      WHERE lower(p.email) = lower(auth.email()) AND p.revoked_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Clients read own approved roadmap" ON public.client_portal_roadmaps;
CREATE POLICY "Clients read own approved roadmap"
  ON public.client_portal_roadmaps FOR SELECT
  TO authenticated
  USING (
    (
      project_id = public.current_client_portal_project_id()
      AND approved_at IS NOT NULL
      AND source_version_id IS NOT NULL
    )
    OR public.client_portal_is_operator(auth.email())
  );

-- P0.2: audit trail for portal file approval
ALTER TABLE public.client_portal_files
  ADD COLUMN IF NOT EXISTS approved_by_email text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- P0.3: client-safe views. security_invoker=on so client RLS still applies
-- through the base tables — the view is a column-level whitelist.

DROP VIEW IF EXISTS public.portal_project_v;
CREATE VIEW public.portal_project_v
WITH (security_invoker=on) AS
SELECT
  id,
  primary_email,
  contact_name,
  company_name,
  package_name,
  portal_status,
  payment_status,
  current_phase,
  next_milestone,
  next_milestone_due_at,
  scheduling_url,
  purchase_date,
  last_client_activity_at,
  access_granted_at,
  access_revoked_at,
  created_at,
  updated_at
FROM public.client_portal_projects;

DROP VIEW IF EXISTS public.portal_roadmaps_v;
CREATE VIEW public.portal_roadmaps_v
WITH (security_invoker=on) AS
SELECT
  id,
  project_id,
  title,
  version_label,
  status,
  approved_at,
  executive_summary,
  current_diagnosis,
  strategic_priorities,
  sequence_30_60_90,
  risks_dependencies,
  recommended_next_move,
  supporting_notes,
  current_focus,
  owner_name,
  next_milestone,
  next_meeting_at,
  pdf_file_id,
  one_pager_file_id,
  share_url,
  acknowledged_at,
  acknowledged_by_email,
  created_at,
  updated_at
FROM public.client_portal_roadmaps
WHERE status IN ('approved', 'delivered')
  AND approved_at IS NOT NULL
  AND source_version_id IS NOT NULL;

DROP VIEW IF EXISTS public.portal_files_v;
CREATE VIEW public.portal_files_v
WITH (security_invoker=on) AS
SELECT
  id,
  project_id,
  bucket_id,
  storage_path,
  file_name,
  category,
  file_type,
  mime_type,
  size_bytes,
  uploaded_by_role,
  linked_roadmap_document_id,
  created_at,
  updated_at
FROM public.client_portal_files
WHERE client_visible = true AND is_internal = false;

DROP VIEW IF EXISTS public.portal_activity_v;
CREATE VIEW public.portal_activity_v
WITH (security_invoker=on) AS
SELECT
  id,
  project_id,
  actor_type,
  event_type,
  summary,
  created_at
FROM public.client_portal_activity
WHERE client_visible = true;

GRANT SELECT ON public.portal_project_v   TO authenticated;
GRANT SELECT ON public.portal_roadmaps_v  TO authenticated;
GRANT SELECT ON public.portal_files_v     TO authenticated;
GRANT SELECT ON public.portal_activity_v  TO authenticated;

GRANT ALL ON public.portal_project_v   TO service_role;
GRANT ALL ON public.portal_roadmaps_v  TO service_role;
GRANT ALL ON public.portal_files_v     TO service_role;
GRANT ALL ON public.portal_activity_v  TO service_role;
