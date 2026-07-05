-- 1) Add stronger roadmap context columns to canonical client_portal_messages
ALTER TABLE public.client_portal_messages
  ADD COLUMN IF NOT EXISTS related_project_id uuid,
  ADD COLUMN IF NOT EXISTS related_milestone_id uuid,
  ADD COLUMN IF NOT EXISTS related_decision_id uuid,
  ADD COLUMN IF NOT EXISTS related_deliverable_id uuid,
  ADD COLUMN IF NOT EXISTS related_phase_id uuid;

CREATE INDEX IF NOT EXISTS idx_cpm_related_project ON public.client_portal_messages(related_project_id) WHERE related_project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cpm_related_milestone ON public.client_portal_messages(related_milestone_id) WHERE related_milestone_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cpm_related_decision ON public.client_portal_messages(related_decision_id) WHERE related_decision_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cpm_related_deliverable ON public.client_portal_messages(related_deliverable_id) WHERE related_deliverable_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cpm_related_phase ON public.client_portal_messages(related_phase_id) WHERE related_phase_id IS NOT NULL;

-- 2) Backfill any rows from the legacy portal_messages table into client_portal_messages.
-- Legacy rows only carry client_email; resolve to the most recent portal project for that email.
DO $$
DECLARE
  legacy_count integer;
BEGIN
  SELECT count(*) INTO legacy_count FROM public.portal_messages;
  IF legacy_count > 0 THEN
    INSERT INTO public.client_portal_messages(
      project_id, sender_type, author_email, body, message_type,
      visible_to_client, action_required, related_file_ids, metadata, created_at
    )
    SELECT
      cpp.id,
      CASE WHEN pm.sender = 'tai' THEN 'tai' ELSE 'client' END,
      pm.client_email,
      pm.body,
      'reply',
      true,
      false,
      ARRAY[]::uuid[],
      jsonb_build_object('migrated_from', 'portal_messages', 'legacy_id', pm.id),
      pm.created_at
    FROM public.portal_messages pm
    JOIN LATERAL (
      SELECT cpp.id
      FROM public.client_portal_projects cpp
      JOIN public.client_portal_permissions perm ON perm.project_id = cpp.id
      WHERE lower(perm.email) = lower(pm.client_email)
        AND perm.revoked_at IS NULL
      ORDER BY perm.granted_at DESC
      LIMIT 1
    ) cpp ON true
    WHERE NOT EXISTS (
      SELECT 1 FROM public.client_portal_messages existing
      WHERE existing.metadata->>'legacy_id' = pm.id::text
    );
    RAISE NOTICE 'Backfilled % legacy portal_messages rows', legacy_count;
  END IF;
END $$;

-- 3) Deprecate legacy portal_messages table.
DROP TABLE IF EXISTS public.portal_messages;