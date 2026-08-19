CREATE TABLE public.website_intake_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed')),
  attribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  person jsonb NOT NULL DEFAULT '{}'::jsonb,
  company jsonb NOT NULL DEFAULT '{}'::jsonb,
  consent jsonb NOT NULL DEFAULT '{}'::jsonb,
  verbatim jsonb NOT NULL DEFAULT '[]'::jsonb,
  structured jsonb NOT NULL DEFAULT '{}'::jsonb,
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  scout_status text NOT NULL DEFAULT 'not_ready' CHECK (scout_status IN ('not_ready','pending','delivered','failed')),
  scout_attempts integer NOT NULL DEFAULT 0,
  scout_last_error text,
  scout_delivered_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.website_intake_sessions TO service_role;

ALTER TABLE public.website_intake_sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX website_intake_sessions_scout_status_idx
  ON public.website_intake_sessions (scout_status, updated_at);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER website_intake_sessions_updated_at
  BEFORE UPDATE ON public.website_intake_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();