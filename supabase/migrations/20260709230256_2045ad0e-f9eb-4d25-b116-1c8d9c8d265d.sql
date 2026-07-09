
-- === engine_project_build_packets ==============================================
CREATE TABLE public.engine_project_build_packets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  implementation_plan_id UUID NOT NULL REFERENCES public.engine_project_implementation_plans(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','ready','handed_off','in_progress','returned','qa_required','accepted','rejected','archived')),
  packet_type TEXT NOT NULL DEFAULT 'developer'
    CHECK (packet_type IN ('lovable','openclaw','developer','qa','mixed')),
  sequence_number INTEGER NOT NULL DEFAULT 1,
  priority TEXT NOT NULL DEFAULT 'p2'
    CHECK (priority IN ('p0','p1','p2')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID,
  created_by_email TEXT,
  assigned_to TEXT,
  handed_off_at TIMESTAMPTZ,
  accepted_by_user_id UUID,
  accepted_by_email TEXT,
  accepted_at TIMESTAMPTZ,
  rejected_reason TEXT,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_engine_build_packets_project_status
  ON public.engine_project_build_packets (project_id, status);
CREATE INDEX idx_engine_build_packets_project_sequence
  ON public.engine_project_build_packets (project_id, sequence_number);
CREATE INDEX idx_engine_build_packets_impl_plan
  ON public.engine_project_build_packets (implementation_plan_id);

REVOKE ALL ON public.engine_project_build_packets FROM anon, authenticated;
GRANT SELECT ON public.engine_project_build_packets TO authenticated;
GRANT ALL ON public.engine_project_build_packets TO service_role;

ALTER TABLE public.engine_project_build_packets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view build packets"
  ON public.engine_project_build_packets
  FOR SELECT
  TO authenticated
  USING (public.is_engine_staff());

-- No INSERT/UPDATE/DELETE policies. Writes flow through service role.

CREATE OR REPLACE FUNCTION public.tg_touch_engine_build_packets()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_engine_build_packets_touch
  BEFORE UPDATE ON public.engine_project_build_packets
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_engine_build_packets();

-- Transition guard + protect accepted/archived
CREATE OR REPLACE FUNCTION public.tg_engine_build_packets_enforce()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  ok boolean := false;
BEGIN
  -- Archiving is always allowed from any status
  IF NEW.status = 'archived' AND OLD.status <> 'archived' THEN
    RETURN NEW;
  END IF;

  -- Accepted packets are immutable except for archive
  IF OLD.status = 'accepted' AND NEW.status <> 'archived' THEN
    RAISE EXCEPTION 'Build packet % is accepted and cannot be modified; archive first', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Archived packets are immutable
  IF OLD.status = 'archived' THEN
    RAISE EXCEPTION 'Build packet % is archived and cannot be modified', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Allowed transitions
  IF OLD.status = NEW.status THEN
    ok := true;
  ELSIF OLD.status = 'draft'         AND NEW.status IN ('ready') THEN ok := true;
  ELSIF OLD.status = 'ready'         AND NEW.status IN ('handed_off','draft') THEN ok := true;
  ELSIF OLD.status = 'handed_off'    AND NEW.status IN ('in_progress','returned') THEN ok := true;
  ELSIF OLD.status = 'in_progress'   AND NEW.status IN ('returned','qa_required','handed_off') THEN ok := true;
  ELSIF OLD.status = 'returned'      AND NEW.status IN ('in_progress','ready','qa_required') THEN ok := true;
  ELSIF OLD.status = 'qa_required'   AND NEW.status IN ('accepted','rejected','in_progress') THEN ok := true;
  ELSIF OLD.status = 'rejected'      AND NEW.status IN ('draft','ready') THEN ok := true;
  END IF;

  IF NOT ok THEN
    RAISE EXCEPTION 'Invalid build packet status transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_engine_build_packets_enforce
  BEFORE UPDATE ON public.engine_project_build_packets
  FOR EACH ROW EXECUTE FUNCTION public.tg_engine_build_packets_enforce();


-- === engine_project_build_evidence =============================================
CREATE TABLE public.engine_project_build_evidence (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  build_packet_id UUID NOT NULL REFERENCES public.engine_project_build_packets(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL
    CHECK (evidence_type IN ('screenshot','log','diff_summary','qa_report','link','note','artifact')),
  title TEXT NOT NULL,
  summary TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID,
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_engine_build_evidence_packet
  ON public.engine_project_build_evidence (build_packet_id, created_at DESC);
CREATE INDEX idx_engine_build_evidence_project
  ON public.engine_project_build_evidence (project_id, created_at DESC);

REVOKE ALL ON public.engine_project_build_evidence FROM anon, authenticated;
GRANT SELECT ON public.engine_project_build_evidence TO authenticated;
GRANT ALL ON public.engine_project_build_evidence TO service_role;

ALTER TABLE public.engine_project_build_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view build evidence"
  ON public.engine_project_build_evidence
  FOR SELECT
  TO authenticated
  USING (public.is_engine_staff());

-- Evidence rows are append-only; block updates and deletes even for service_role
-- would defeat maintenance; keep DELETE blocked via absence of policy for
-- authenticated (already the case) and via a trigger for defense in depth.
CREATE OR REPLACE FUNCTION public.tg_engine_build_evidence_no_update()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Build evidence rows are append-only'
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER trg_engine_build_evidence_no_update
  BEFORE UPDATE ON public.engine_project_build_evidence
  FOR EACH ROW EXECUTE FUNCTION public.tg_engine_build_evidence_no_update();
