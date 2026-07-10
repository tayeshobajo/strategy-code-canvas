
CREATE TABLE public.engine_project_openclaw_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  build_packet_id UUID NOT NULL REFERENCES public.engine_project_build_packets(id) ON DELETE CASCADE,
  implementation_plan_id UUID NULL REFERENCES public.engine_project_implementation_plans(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','running','completed','failed','cancelled','timed_out','returned_for_review')),
  provider TEXT NOT NULL DEFAULT 'openclaw',
  run_mode TEXT NOT NULL DEFAULT 'manual' CHECK (run_mode IN ('manual')),
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_summary TEXT NULL,
  error_code TEXT NULL,
  error_message TEXT NULL,
  started_by UUID NULL,
  started_by_email TEXT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_openclaw_runs_project ON public.engine_project_openclaw_runs(project_id, created_at DESC);
CREATE INDEX idx_openclaw_runs_packet ON public.engine_project_openclaw_runs(build_packet_id, created_at DESC);

GRANT SELECT ON public.engine_project_openclaw_runs TO authenticated;
GRANT ALL ON public.engine_project_openclaw_runs TO service_role;

ALTER TABLE public.engine_project_openclaw_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read openclaw runs" ON public.engine_project_openclaw_runs
  FOR SELECT TO authenticated USING (public.is_engine_staff());

CREATE TRIGGER trg_touch_openclaw_runs BEFORE UPDATE ON public.engine_project_openclaw_runs
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE TABLE public.engine_project_openclaw_artifacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  openclaw_run_id UUID NOT NULL REFERENCES public.engine_project_openclaw_runs(id) ON DELETE CASCADE,
  build_packet_id UUID NOT NULL REFERENCES public.engine_project_build_packets(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL CHECK (artifact_type IN ('log','diff_summary','screenshot','file_reference','url','note','qa_report')),
  title TEXT NOT NULL,
  summary TEXT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NULL,
  created_by_email TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_openclaw_artifacts_run ON public.engine_project_openclaw_artifacts(openclaw_run_id, created_at DESC);
CREATE INDEX idx_openclaw_artifacts_packet ON public.engine_project_openclaw_artifacts(build_packet_id, created_at DESC);

GRANT SELECT ON public.engine_project_openclaw_artifacts TO authenticated;
GRANT ALL ON public.engine_project_openclaw_artifacts TO service_role;

ALTER TABLE public.engine_project_openclaw_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read openclaw artifacts" ON public.engine_project_openclaw_artifacts
  FOR SELECT TO authenticated USING (public.is_engine_staff());
