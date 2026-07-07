-- Gap 10 (audit): supporting_notes is internal-engine doctrine.
-- The column lives in client-RLS-readable client_portal_roadmaps, so any
-- value stored here is readable by portal clients via direct PostgREST
-- queries even though no server read path selects it. The publish pipeline
-- no longer writes it (removed from CLIENT_SAFE_KEYS + publishVersionToPortal).
-- Null historical values — each is recoverable from the source
-- engine_roadmap_versions.payload — and drop the module from the
-- visible_modules default and existing rows.

UPDATE public.client_portal_roadmaps
   SET supporting_notes = NULL
 WHERE supporting_notes IS NOT NULL;

ALTER TABLE public.client_portal_roadmaps
  ALTER COLUMN visible_modules SET DEFAULT
    '["executive_summary","current_diagnosis","strategic_priorities","sequence_30_60_90","risks_dependencies","recommended_next_move"]'::jsonb;

UPDATE public.client_portal_roadmaps
   SET visible_modules = visible_modules - 'supporting_notes'
 WHERE visible_modules ? 'supporting_notes';

COMMENT ON COLUMN public.client_portal_roadmaps.supporting_notes IS
  'DEPRECATED (audit Gap 10): internal-engine doctrine — never written by the publish pipeline. Kept for schema compatibility; always NULL.';
