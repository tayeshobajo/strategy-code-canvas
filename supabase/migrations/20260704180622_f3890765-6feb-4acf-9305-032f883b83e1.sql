
ALTER TABLE public.client_portal_roadmaps
  ADD COLUMN IF NOT EXISTS visible_modules jsonb NOT NULL DEFAULT
    '["executive_summary","current_diagnosis","strategic_priorities","sequence_30_60_90","risks_dependencies","recommended_next_move","supporting_notes"]'::jsonb,
  ADD COLUMN IF NOT EXISTS published_by text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

UPDATE public.client_portal_roadmaps
SET published_at = COALESCE(published_at, approved_at),
    published_by = COALESCE(published_by, NULLIF(metadata->>'published_by', ''))
WHERE published_at IS NULL OR published_by IS NULL;
