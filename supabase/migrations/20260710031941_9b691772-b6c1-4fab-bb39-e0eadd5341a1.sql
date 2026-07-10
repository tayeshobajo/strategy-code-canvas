-- OpenClaw v6 Delivery Readiness Reviews
CREATE TABLE public.engine_project_delivery_readiness_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  implementation_plan_id uuid REFERENCES public.engine_project_implementation_plans(id) ON DELETE SET NULL,
  qa_plan_id uuid REFERENCES public.engine_project_qa_plans(id) ON DELETE SET NULL,
  title text NOT NULL,
  summary text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','in_review','approved','rejected','archived')),
  readiness text NOT NULL DEFAULT 'not_ready'
    CHECK (readiness IN ('not_ready','needs_review','ready_for_delivery_package','blocked')),
  recommendation text NOT NULL DEFAULT 'hold'
    CHECK (recommendation IN ('hold','request_more_work','prepare_delivery_package','escalate_to_operator')),
  confidence text NOT NULL DEFAULT 'medium'
    CHECK (confidence IN ('low','medium','high')),
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

CREATE INDEX idx_delivery_readiness_reviews_project
  ON public.engine_project_delivery_readiness_reviews(project_id, created_at DESC);
CREATE INDEX idx_delivery_readiness_reviews_status
  ON public.engine_project_delivery_readiness_reviews(project_id, status);

GRANT SELECT ON public.engine_project_delivery_readiness_reviews TO authenticated;
GRANT ALL ON public.engine_project_delivery_readiness_reviews TO service_role;

ALTER TABLE public.engine_project_delivery_readiness_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read delivery readiness reviews"
  ON public.engine_project_delivery_readiness_reviews
  FOR SELECT
  TO authenticated
  USING (public.is_engine_staff());

-- Enforcement trigger: mirror QA evidence review rules.
CREATE OR REPLACE FUNCTION public.tg_engine_delivery_readiness_reviews_enforce()
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
    RAISE EXCEPTION 'Delivery readiness review % is archived and cannot be modified', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status = 'approved' AND NEW.status <> 'archived' THEN
    RAISE EXCEPTION 'Delivery readiness review % is approved and cannot be modified; archive first', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status = 'rejected' AND NEW.status NOT IN ('rejected','draft','archived') THEN
    RAISE EXCEPTION 'Rejected delivery readiness review % must be reopened to draft before further changes', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status = NEW.status THEN
    ok := true;
  ELSIF OLD.status = 'draft'     AND NEW.status IN ('in_review','archived') THEN ok := true;
  ELSIF OLD.status = 'in_review' AND NEW.status IN ('approved','rejected','draft','archived') THEN ok := true;
  ELSIF OLD.status = 'rejected'  AND NEW.status IN ('draft','archived') THEN ok := true;
  END IF;

  IF NOT ok THEN
    RAISE EXCEPTION 'Invalid delivery readiness review status transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_engine_delivery_readiness_reviews_enforce
  BEFORE UPDATE ON public.engine_project_delivery_readiness_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_engine_delivery_readiness_reviews_enforce();

CREATE TRIGGER trg_engine_delivery_readiness_reviews_touch
  BEFORE UPDATE ON public.engine_project_delivery_readiness_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();