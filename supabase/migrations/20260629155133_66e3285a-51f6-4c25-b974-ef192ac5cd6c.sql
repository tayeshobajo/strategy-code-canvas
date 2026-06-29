
CREATE TABLE public.intake_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'website/build-my-roadmap',
  name text,
  business text,
  website text,
  email text,
  authorizes_scan boolean NOT NULL DEFAULT false,
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.intake_submissions TO service_role;

ALTER TABLE public.intake_submissions ENABLE ROW LEVEL SECURITY;
