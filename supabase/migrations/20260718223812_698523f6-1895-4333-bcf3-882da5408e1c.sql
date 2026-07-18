
CREATE TABLE public.engine_execution_drift_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  milestone_id UUID REFERENCES public.engine_milestones(id) ON DELETE SET NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('task','evidence','delivery','publish','milestone')),
  source_id TEXT NOT NULL,
  anchor_kind TEXT NOT NULL CHECK (anchor_kind IN ('thesis','rationale','boundary','capability','delivery_scope')),
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high')),
  classification TEXT NOT NULL CHECK (classification IN ('drift','out_of_scope','contradicts','missing_capability','unmapped')),
  summary TEXT NOT NULL,
  suggested_action TEXT,
  rationale_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved','dismissed')),
  created_by_kind TEXT NOT NULL DEFAULT 'ai' CHECK (created_by_kind IN ('ai','human','detector')),
  created_by_email TEXT,
  resolved_by_email TEXT,
  resolved_at TIMESTAMPTZ,
  resolution_action TEXT,
  resolution_note TEXT,
  detector_version TEXT NOT NULL DEFAULT 'rt6.v1',
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT engine_execution_drift_signals_dedup UNIQUE (project_id, source_kind, source_id, anchor_kind)
);

CREATE INDEX engine_execution_drift_signals_project_idx
  ON public.engine_execution_drift_signals (project_id, status, severity);
CREATE INDEX engine_execution_drift_signals_milestone_idx
  ON public.engine_execution_drift_signals (milestone_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_execution_drift_signals TO authenticated;
GRANT ALL ON public.engine_execution_drift_signals TO service_role;

ALTER TABLE public.engine_execution_drift_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drift_signals_admin_operator_read"
  ON public.engine_execution_drift_signals
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'));

CREATE POLICY "drift_signals_admin_operator_write"
  ON public.engine_execution_drift_signals
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'));

-- No self-resolution: the AI/detector that wrote the signal cannot be the resolver.
CREATE OR REPLACE FUNCTION public.enforce_no_ai_self_resolve_drift()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('resolved','dismissed') AND NEW.resolved_by_email IS NULL THEN
    RAISE EXCEPTION 'Drift signals must be resolved by an authenticated reviewer (resolved_by_email required)';
  END IF;
  IF NEW.status IN ('resolved','dismissed') AND NEW.created_by_kind IN ('ai','detector')
     AND NEW.resolved_by_email IS NOT NULL
     AND lower(NEW.resolved_by_email) = lower(COALESCE(NEW.created_by_email,''))
  THEN
    RAISE EXCEPTION 'A signal authored by AI cannot be resolved by the same actor';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER engine_execution_drift_signals_before_update
  BEFORE UPDATE ON public.engine_execution_drift_signals
  FOR EACH ROW EXECUTE FUNCTION public.enforce_no_ai_self_resolve_drift();
