
-- Rename source_version_id → approved_roadmap_version_id for clarity.
ALTER TABLE public.client_portal_roadmaps
  RENAME COLUMN source_version_id TO approved_roadmap_version_id;

-- Rename the FK index if present
ALTER INDEX IF EXISTS client_portal_roadmaps_source_version_id_idx
  RENAME TO client_portal_roadmaps_approved_roadmap_version_id_idx;

-- Update the validation trigger function to reference the new column name.
CREATE OR REPLACE FUNCTION public.tg_client_portal_roadmaps_require_source_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('approved', 'delivered') THEN
    IF NEW.approved_roadmap_version_id IS NULL THEN
      RAISE EXCEPTION 'client_portal_roadmaps.approved_roadmap_version_id is required when status is approved or delivered';
    END IF;
    IF NEW.approved_at IS NULL THEN
      RAISE EXCEPTION 'client_portal_roadmaps.approved_at is required when status is approved or delivered';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
