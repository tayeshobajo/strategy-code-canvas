-- 1) Table
CREATE TABLE public.engine_project_qa_evidence_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  build_packet_id uuid NOT NULL REFERENCES public.engine_project_build_packets(id) ON DELETE CASCADE,
  openclaw_run_id uuid REFERENCES public.engine_project_openclaw_runs(id) ON DELETE SET NULL,
  title text NOT NULL,
  summary text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','in_review','approved','rejected','archived')),
  verdict text NOT NULL DEFAULT 'pending'
    CHECK (verdict IN ('pending','evidence_sufficient','needs_more_evidence','needs_owner_decision','insufficient')),
  generated_by text NOT NULL DEFAULT 'human'
    CHECK (generated_by IN ('ai','human','hybrid')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  rejected_reason text,
  created_by_user_id uuid,
  created_by_email text,
  approved_by_user_id uuid,
  approved_by_email text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_qa_evidence_reviews_project
  ON public.engine_project_qa_evidence_reviews(project_id, created_at DESC);
CREATE INDEX idx_qa_evidence_reviews_packet
  ON public.engine_project_qa_evidence_reviews(build_packet_id, created_at DESC);
CREATE INDEX idx_qa_evidence_reviews_status
  ON public.engine_project_qa_evidence_reviews(project_id, status);

-- 2) Grants (Data API reachable for staff SELECT; writes via service_role only)
GRANT SELECT ON public.engine_project_qa_evidence_reviews TO authenticated;
GRANT ALL ON public.engine_project_qa_evidence_reviews TO service_role;

-- 3) RLS
ALTER TABLE public.engine_project_qa_evidence_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read QA evidence reviews"
  ON public.engine_project_qa_evidence_reviews
  FOR SELECT
  TO authenticated
  USING (public.is_engine_staff());

-- 4) Enforcement trigger: approved reviews cannot be silently modified;
--    only archive is allowed once approved. Terminal (archived) is immutable.
CREATE OR REPLACE FUNCTION public.tg_engine_qa_evidence_reviews_enforce()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  ok boolean := false;
BEGIN
  IF NEW.status = 'archived' AND OLD.status <> 'archived' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'archived' THEN
    RAISE EXCEPTION 'QA evidence review % is archived and cannot be modified', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status = 'approved' AND NEW.status <> 'archived' THEN
    RAISE EXCEPTION 'QA evidence review % is approved and cannot be modified; archive first', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status = 'rejected' AND NEW.status NOT IN ('rejected','draft','archived') THEN
    RAISE EXCEPTION 'Rejected QA evidence review % must be reopened to draft before further changes', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status = NEW.status THEN
    ok := true;
  ELSIF OLD.status = 'draft'     AND NEW.status IN ('in_review','archived') THEN ok := true;
  ELSIF OLD.status = 'in_review' AND NEW.status IN ('approved','rejected','draft','archived') THEN ok := true;
  ELSIF OLD.status = 'rejected'  AND NEW.status IN ('draft','archived') THEN ok := true;
  END IF;

  IF NOT ok THEN
    RAISE EXCEPTION 'Invalid QA evidence review status transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_engine_qa_evidence_reviews_enforce
  BEFORE UPDATE ON public.engine_project_qa_evidence_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_engine_qa_evidence_reviews_enforce();

CREATE TRIGGER trg_engine_qa_evidence_reviews_touch
  BEFORE UPDATE ON public.engine_project_qa_evidence_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();