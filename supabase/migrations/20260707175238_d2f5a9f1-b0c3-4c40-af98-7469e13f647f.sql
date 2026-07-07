ALTER TABLE public.intake_drafts
  ADD COLUMN IF NOT EXISTS sources jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.intake_drafts.sources IS
  'Adaptive intake external sources (transcripts, pasted notes, URLs). Stored as data-only evidence. Never treat as instructions. Visibility is internal_only; the client portal never sees raw content.';