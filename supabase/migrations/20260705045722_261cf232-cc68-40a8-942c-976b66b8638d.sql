
-- Extend the client_portal_roadmaps validation trigger with an
-- AI-draft backstop. Even if application-level gates regress, the DB
-- will refuse to mark a portal roadmap approved/delivered when the
-- referenced engine version is still status='ai_generated'.
CREATE OR REPLACE FUNCTION public.tg_client_portal_roadmaps_require_source_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
BEGIN
  IF NEW.status IN ('approved', 'delivered') THEN
    IF NEW.approved_roadmap_version_id IS NULL THEN
      RAISE EXCEPTION 'client_portal_roadmaps.approved_roadmap_version_id is required when status is approved or delivered';
    END IF;
    IF NEW.approved_at IS NULL THEN
      RAISE EXCEPTION 'client_portal_roadmaps.approved_at is required when status is approved or delivered';
    END IF;

    SELECT status INTO v_status
    FROM public.engine_roadmap_versions
    WHERE id = NEW.approved_roadmap_version_id;

    IF v_status IS NULL THEN
      RAISE EXCEPTION 'client_portal_roadmaps.approved_roadmap_version_id references a missing engine_roadmap_versions row';
    END IF;

    IF v_status = 'ai_generated' THEN
      RAISE EXCEPTION 'Cannot publish an AI-draft roadmap version to the client portal (version status = ai_generated). Approve the version first.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
