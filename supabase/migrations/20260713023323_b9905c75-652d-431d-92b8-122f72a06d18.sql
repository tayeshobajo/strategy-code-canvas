BEGIN;

CREATE OR REPLACE FUNCTION public.jsonb_contains_banned_key(
  doc jsonb,
  banned text[]
) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  k text;
  v jsonb;
  hit text;
BEGIN
  IF doc IS NULL THEN RETURN NULL; END IF;
  CASE jsonb_typeof(doc)
    WHEN 'object' THEN
      FOR k, v IN SELECT * FROM jsonb_each(doc) LOOP
        IF k = ANY(banned) THEN RETURN k; END IF;
        hit := public.jsonb_contains_banned_key(v, banned);
        IF hit IS NOT NULL THEN RETURN hit; END IF;
      END LOOP;
    WHEN 'array' THEN
      FOR v IN SELECT jsonb_array_elements(doc) LOOP
        hit := public.jsonb_contains_banned_key(v, banned);
        IF hit IS NOT NULL THEN RETURN hit; END IF;
      END LOOP;
    ELSE
      RETURN NULL;
  END CASE;
  RETURN NULL;
END $$;

ALTER TABLE public.client_portal_roadmaps
  DROP CONSTRAINT IF EXISTS client_portal_roadmaps_status_check;
ALTER TABLE public.client_portal_roadmaps
  ADD CONSTRAINT client_portal_roadmaps_status_check
  CHECK (status IN ('in_progress','approved','delivered',
                    'published','superseded','retracted'));

ALTER TABLE public.client_portal_roadmaps
  ADD COLUMN IF NOT EXISTS previous_publication_id uuid
    REFERENCES public.client_portal_roadmaps(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS publish_diff jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS retracted_at timestamptz,
  ADD COLUMN IF NOT EXISTS retracted_by text,
  ADD COLUMN IF NOT EXISTS retraction_reason text;

WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY project_id
                            ORDER BY published_at DESC NULLS LAST,
                                     updated_at DESC) AS rn
    FROM public.client_portal_roadmaps
   WHERE status IN ('approved','delivered','published')
     AND published_at IS NOT NULL
)
UPDATE public.client_portal_roadmaps r
   SET status = CASE WHEN ranked.rn = 1 THEN 'published' ELSE 'superseded' END
  FROM ranked
 WHERE r.id = ranked.id;

DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM (
    SELECT project_id FROM public.client_portal_roadmaps
     WHERE status = 'published' GROUP BY project_id HAVING count(*) > 1
  ) x;
  IF bad > 0 THEN
    RAISE EXCEPTION 'Backfill produced % project(s) with >1 published row', bad;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS client_portal_roadmaps_one_published_per_project
  ON public.client_portal_roadmaps(project_id) WHERE status = 'published';

ALTER TABLE public.client_portal_roadmaps
  ADD CONSTRAINT client_portal_roadmaps_published_at_required
  CHECK (status NOT IN ('published','superseded','retracted')
         OR published_at IS NOT NULL);

ALTER TABLE public.client_portal_roadmaps
  ADD CONSTRAINT client_portal_roadmaps_retraction_fields_consistent
  CHECK (
    (status = 'retracted' AND retracted_at IS NOT NULL
                          AND retracted_by IS NOT NULL
                          AND retraction_reason IS NOT NULL
                          AND length(btrim(retraction_reason)) > 0)
    OR
    (status <> 'retracted' AND retracted_at IS NULL
                            AND retracted_by IS NULL
                            AND retraction_reason IS NULL)
  );

CREATE OR REPLACE FUNCTION public.tg_client_portal_roadmaps_validate_lineage()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE parent_project uuid;
BEGIN
  IF NEW.previous_publication_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.previous_publication_id = NEW.id THEN
    RAISE EXCEPTION 'previous_publication_id cannot reference self';
  END IF;
  SELECT project_id INTO parent_project
    FROM public.client_portal_roadmaps
   WHERE id = NEW.previous_publication_id;
  IF parent_project IS NULL THEN
    RAISE EXCEPTION 'previous_publication_id % not found', NEW.previous_publication_id;
  END IF;
  IF parent_project <> NEW.project_id THEN
    RAISE EXCEPTION 'previous_publication_id must belong to same portal project';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_client_portal_roadmaps_validate_lineage
  ON public.client_portal_roadmaps;
CREATE TRIGGER tg_client_portal_roadmaps_validate_lineage
  BEFORE INSERT OR UPDATE OF previous_publication_id, project_id
  ON public.client_portal_roadmaps
  FOR EACH ROW EXECUTE FUNCTION
  public.tg_client_portal_roadmaps_validate_lineage();

CREATE OR REPLACE FUNCTION public.tg_client_portal_roadmaps_status_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  IF (OLD.status = 'in_progress' AND NEW.status = 'approved')
  OR (OLD.status = 'approved'    AND NEW.status = 'published')
  OR (OLD.status = 'delivered'   AND NEW.status = 'published')
  OR (OLD.status = 'published'   AND NEW.status = 'superseded')
  OR (OLD.status = 'published'   AND NEW.status = 'retracted')
  OR (OLD.status = 'superseded'  AND NEW.status = 'published')
  OR (OLD.status = 'retracted'   AND NEW.status = 'published')
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'invalid_status_transition: % → % not permitted', OLD.status, NEW.status;
END $$;

DROP TRIGGER IF EXISTS tg_client_portal_roadmaps_status_transition
  ON public.client_portal_roadmaps;
CREATE TRIGGER tg_client_portal_roadmaps_status_transition
  BEFORE UPDATE OF status
  ON public.client_portal_roadmaps
  FOR EACH ROW EXECUTE FUNCTION
  public.tg_client_portal_roadmaps_status_transition();

CREATE OR REPLACE FUNCTION public.tg_client_portal_roadmaps_immutable_after_publish()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status NOT IN ('published','superseded','retracted') THEN
    RETURN NEW;
  END IF;
  IF NEW.title                       IS DISTINCT FROM OLD.title
  OR NEW.version_label               IS DISTINCT FROM OLD.version_label
  OR NEW.executive_summary           IS DISTINCT FROM OLD.executive_summary
  OR NEW.current_diagnosis           IS DISTINCT FROM OLD.current_diagnosis
  OR NEW.strategic_priorities        IS DISTINCT FROM OLD.strategic_priorities
  OR NEW.sequence_30_60_90           IS DISTINCT FROM OLD.sequence_30_60_90
  OR NEW.risks_dependencies          IS DISTINCT FROM OLD.risks_dependencies
  OR NEW.recommended_next_move       IS DISTINCT FROM OLD.recommended_next_move
  OR NEW.current_focus               IS DISTINCT FROM OLD.current_focus
  OR NEW.owner_name                  IS DISTINCT FROM OLD.owner_name
  OR NEW.next_milestone              IS DISTINCT FROM OLD.next_milestone
  OR NEW.next_meeting_at             IS DISTINCT FROM OLD.next_meeting_at
  OR NEW.pdf_file_id                 IS DISTINCT FROM OLD.pdf_file_id
  OR NEW.one_pager_file_id           IS DISTINCT FROM OLD.one_pager_file_id
  OR NEW.share_url                   IS DISTINCT FROM OLD.share_url
  OR NEW.visible_modules             IS DISTINCT FROM OLD.visible_modules
  OR NEW.client_safe_canvas          IS DISTINCT FROM OLD.client_safe_canvas
  OR NEW.approved_roadmap_version_id IS DISTINCT FROM OLD.approved_roadmap_version_id
  OR NEW.source_submission_id        IS DISTINCT FROM OLD.source_submission_id
  OR NEW.source_review_id            IS DISTINCT FROM OLD.source_review_id
  OR NEW.roadmap_document_id         IS DISTINCT FROM OLD.roadmap_document_id
  OR NEW.publish_diff                IS DISTINCT FROM OLD.publish_diff
  OR NEW.previous_publication_id     IS DISTINCT FROM OLD.previous_publication_id
  OR NEW.published_by                IS DISTINCT FROM OLD.published_by
  OR NEW.published_at                IS DISTINCT FROM OLD.published_at
  OR NEW.approved_at                 IS DISTINCT FROM OLD.approved_at
  OR NEW.project_id                  IS DISTINCT FROM OLD.project_id
  OR NEW.metadata                    IS DISTINCT FROM OLD.metadata
  THEN
    RAISE EXCEPTION 'client_portal_roadmaps: snapshot fields immutable once %',
                    OLD.status;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_client_portal_roadmaps_immutable_after_publish
  ON public.client_portal_roadmaps;
CREATE TRIGGER tg_client_portal_roadmaps_immutable_after_publish
  BEFORE UPDATE ON public.client_portal_roadmaps
  FOR EACH ROW EXECUTE FUNCTION
  public.tg_client_portal_roadmaps_immutable_after_publish();

CREATE OR REPLACE FUNCTION public.tg_client_portal_roadmaps_scrub_internal()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  banned text[] := ARRAY[
    'ceremony_id','ceremony_state','epistemic','epistemic_status',
    'operator_override','operator_lock','contradiction','contradictions',
    'provenance','source_ids','agent_costs','ai_confidence','confidence',
    'internal_notes','supporting_notes_internal','review_state',
    'intelligence_memory'
  ];
  hit text;
BEGIN
  hit := public.jsonb_contains_banned_key(NEW.metadata, banned);
  IF hit IS NOT NULL THEN
    RAISE EXCEPTION 'client_portal_roadmaps.metadata carries internal key: %', hit;
  END IF;
  hit := public.jsonb_contains_banned_key(NEW.publish_diff, banned);
  IF hit IS NOT NULL THEN
    RAISE EXCEPTION 'client_portal_roadmaps.publish_diff carries internal key: %', hit;
  END IF;
  hit := public.jsonb_contains_banned_key(NEW.client_safe_canvas, banned);
  IF hit IS NOT NULL THEN
    RAISE EXCEPTION 'client_portal_roadmaps.client_safe_canvas carries internal key: %', hit;
  END IF;
  hit := public.jsonb_contains_banned_key(NEW.visible_modules, banned);
  IF hit IS NOT NULL THEN
    RAISE EXCEPTION 'client_portal_roadmaps.visible_modules carries internal key: %', hit;
  END IF;
  hit := public.jsonb_contains_banned_key(NEW.strategic_priorities, banned);
  IF hit IS NOT NULL THEN
    RAISE EXCEPTION 'client_portal_roadmaps.strategic_priorities carries internal key: %', hit;
  END IF;
  hit := public.jsonb_contains_banned_key(NEW.sequence_30_60_90, banned);
  IF hit IS NOT NULL THEN
    RAISE EXCEPTION 'client_portal_roadmaps.sequence_30_60_90 carries internal key: %', hit;
  END IF;
  hit := public.jsonb_contains_banned_key(NEW.risks_dependencies, banned);
  IF hit IS NOT NULL THEN
    RAISE EXCEPTION 'client_portal_roadmaps.risks_dependencies carries internal key: %', hit;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_client_portal_roadmaps_scrub_internal
  ON public.client_portal_roadmaps;
CREATE TRIGGER tg_client_portal_roadmaps_scrub_internal
  BEFORE INSERT OR UPDATE OF metadata, publish_diff, client_safe_canvas,
                             visible_modules, strategic_priorities,
                             sequence_30_60_90, risks_dependencies
  ON public.client_portal_roadmaps
  FOR EACH ROW EXECUTE FUNCTION
  public.tg_client_portal_roadmaps_scrub_internal();

CREATE TABLE IF NOT EXISTS public.client_portal_publish_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_project_id uuid NOT NULL
    REFERENCES public.client_portal_projects(id) ON DELETE RESTRICT,
  portal_roadmap_id uuid NOT NULL
    REFERENCES public.client_portal_roadmaps(id) ON DELETE RESTRICT,
  previous_portal_roadmap_id uuid
    REFERENCES public.client_portal_roadmaps(id) ON DELETE RESTRICT,
  engine_project_id uuid NOT NULL,
  engine_version_id uuid,
  event_type text NOT NULL CHECK (event_type IN (
    'published','superseded','rolled_back','retracted','restored','acknowledged'
  )),
  actor_email text NOT NULL,
  summary text,
  diff jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.client_portal_publish_events TO authenticated;
GRANT ALL    ON public.client_portal_publish_events TO service_role;

ALTER TABLE public.client_portal_publish_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read publish events"
  ON public.client_portal_publish_events
  FOR SELECT TO authenticated
  USING (public.is_engine_staff());

CREATE INDEX IF NOT EXISTS client_portal_publish_events_project_idx
  ON public.client_portal_publish_events(engine_project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS client_portal_publish_events_roadmap_idx
  ON public.client_portal_publish_events(portal_roadmap_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.tg_client_portal_publish_events_validate_refs()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  cur_project uuid;
  prev_project uuid;
BEGIN
  SELECT project_id INTO cur_project
    FROM public.client_portal_roadmaps
   WHERE id = NEW.portal_roadmap_id;
  IF cur_project IS NULL THEN
    RAISE EXCEPTION 'publish_events: portal_roadmap_id % not found', NEW.portal_roadmap_id;
  END IF;
  IF cur_project <> NEW.portal_project_id THEN
    RAISE EXCEPTION 'publish_events: portal_roadmap_id belongs to different portal project';
  END IF;

  IF NEW.previous_portal_roadmap_id IS NOT NULL THEN
    IF NEW.previous_portal_roadmap_id = NEW.portal_roadmap_id THEN
      RAISE EXCEPTION 'publish_events: previous_portal_roadmap_id cannot equal portal_roadmap_id';
    END IF;
    SELECT project_id INTO prev_project
      FROM public.client_portal_roadmaps
     WHERE id = NEW.previous_portal_roadmap_id;
    IF prev_project IS NULL THEN
      RAISE EXCEPTION 'publish_events: previous_portal_roadmap_id % not found', NEW.previous_portal_roadmap_id;
    END IF;
    IF prev_project <> NEW.portal_project_id THEN
      RAISE EXCEPTION 'publish_events: previous_portal_roadmap_id belongs to different portal project';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_client_portal_publish_events_validate_refs
  ON public.client_portal_publish_events;
CREATE TRIGGER tg_client_portal_publish_events_validate_refs
  BEFORE INSERT OR UPDATE OF portal_project_id, portal_roadmap_id,
                             previous_portal_roadmap_id
  ON public.client_portal_publish_events
  FOR EACH ROW EXECUTE FUNCTION
  public.tg_client_portal_publish_events_validate_refs();

COMMIT;