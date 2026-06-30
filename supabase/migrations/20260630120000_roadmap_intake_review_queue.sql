CREATE TABLE public.roadmap_intake_reviews (
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

GRANT ALL ON public.roadmap_intake_reviews TO service_role;

ALTER TABLE public.roadmap_intake_reviews ENABLE ROW LEVEL SECURITY;

-- No public policies: all access goes through trusted server functions using the service role.
CREATE INDEX roadmap_intake_reviews_status_created_at_idx
  ON public.roadmap_intake_reviews (status, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_roadmap_intake_reviews_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER roadmap_intake_reviews_touch_updated_at
  BEFORE UPDATE ON public.roadmap_intake_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_roadmap_intake_reviews_updated_at();

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
