CREATE TABLE public.intake_drafts (
  resume_token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  contact jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.intake_drafts TO service_role;

ALTER TABLE public.intake_drafts ENABLE ROW LEVEL SECURITY;

-- No public policies: all access goes through server functions using the service role.
CREATE INDEX intake_drafts_updated_at_idx ON public.intake_drafts (updated_at);