
ALTER TABLE public.intake_drafts
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS frame text,
  ADD COLUMN IF NOT EXISTS subtype text,
  ADD COLUMN IF NOT EXISTS objective_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS open_objectives jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS current_question text,
  ADD COLUMN IF NOT EXISTS current_objective text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS intake_drafts_id_key ON public.intake_drafts(id);
CREATE INDEX IF NOT EXISTS intake_drafts_status_idx ON public.intake_drafts(status);
CREATE INDEX IF NOT EXISTS intake_drafts_contact_email_idx ON public.intake_drafts(contact_email);
