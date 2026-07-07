-- Create intake_submissions table
CREATE TABLE IF NOT EXISTS public.intake_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  business text,
  website text,
  email text,
  answers jsonb DEFAULT '{}'::jsonb,
  authorizes_scan boolean DEFAULT false,
  source text DEFAULT 'build-my-roadmap',
  status text DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'review_pending', 'reviewed', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create roadmap_intake_reviews table
CREATE TABLE IF NOT EXISTS public.roadmap_intake_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.intake_submissions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'needs_review'
    CHECK (status IN ('needs_review', 'in_review', 'approved', 'rejected', 'archived')),
  artifact jsonb NOT NULL DEFAULT '{}'::jsonb,
  approval_required boolean NOT NULL DEFAULT true,
  outbound_blocked boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id)
);

-- Enable RLS on both tables
ALTER TABLE public.intake_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roadmap_intake_reviews ENABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT ALL ON public.intake_submissions TO service_role;
GRANT ALL ON public.roadmap_intake_reviews TO service_role;

-- Create indexes
CREATE INDEX IF NOT EXISTS intake_submissions_status_created_at_idx
  ON public.intake_submissions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS roadmap_intake_reviews_status_created_at_idx
  ON public.roadmap_intake_reviews (status, created_at DESC);

-- Create updated_at trigger for intake_submissions
CREATE OR REPLACE FUNCTION public.touch_intake_submissions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS intake_submissions_touch_updated_at ON public.intake_submissions;
CREATE TRIGGER intake_submissions_touch_updated_at
  BEFORE UPDATE ON public.intake_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_intake_submissions_updated_at();

-- Create updated_at trigger for roadmap_intake_reviews
CREATE OR REPLACE FUNCTION public.touch_roadmap_intake_reviews_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS roadmap_intake_reviews_touch_updated_at ON public.roadmap_intake_reviews;
CREATE TRIGGER roadmap_intake_reviews_touch_updated_at
  BEFORE UPDATE ON public.roadmap_intake_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_roadmap_intake_reviews_updated_at();

-- Create review queue view
DROP VIEW IF EXISTS public.roadmap_intake_review_queue;
CREATE VIEW public.roadmap_intake_review_queue AS
SELECT
  r.id AS review_id,
  r.submission_id,
  r.status AS review_status,
  r.approval_required,
  r.outbound_blocked,
  r.artifact,
  r.created_at AS queued_at,
  r.updated_at AS review_updated_at,
  s.name,
  s.business,
  s.website,
  s.email,
  s.status AS submission_status,
  s.created_at AS submitted_at
FROM public.roadmap_intake_reviews r
JOIN public.intake_submissions s ON s.id = r.submission_id
WHERE r.status IN ('needs_review', 'in_review')
ORDER BY r.created_at ASC;

REVOKE ALL ON public.roadmap_intake_review_queue FROM anon, authenticated;
GRANT SELECT ON public.roadmap_intake_review_queue TO service_role;

-- Create RLS policies: anon can only INSERT into intake_submissions
CREATE POLICY intake_submissions_anon_insert ON public.intake_submissions
  FOR INSERT
  WITH CHECK (true);

-- service_role can do everything
CREATE POLICY intake_submissions_service_role ON public.intake_submissions
  FOR ALL
  TO service_role
  USING (true);

CREATE POLICY roadmap_intake_reviews_service_role ON public.roadmap_intake_reviews
  FOR ALL
  TO service_role
  USING (true);
