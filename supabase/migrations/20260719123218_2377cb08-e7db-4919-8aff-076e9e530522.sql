
CREATE TABLE public.engine_pm_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  known_facts JSONB NOT NULL DEFAULT '[]'::jsonb,
  working_assumptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  open_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  decisions_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  ingested_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_synthesis_at TIMESTAMPTZ,
  last_readiness_score NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_pm_memory TO authenticated;
GRANT ALL ON public.engine_pm_memory TO service_role;

ALTER TABLE public.engine_pm_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read pm memory"
  ON public.engine_pm_memory FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator') OR public.has_role(auth.uid(), 'team_member'));

CREATE POLICY "Staff can write pm memory"
  ON public.engine_pm_memory FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator') OR public.has_role(auth.uid(), 'team_member'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator') OR public.has_role(auth.uid(), 'team_member'));

CREATE INDEX idx_engine_pm_memory_project ON public.engine_pm_memory(project_id);

CREATE OR REPLACE FUNCTION public.update_pm_memory_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_engine_pm_memory_updated_at
BEFORE UPDATE ON public.engine_pm_memory
FOR EACH ROW EXECUTE FUNCTION public.update_pm_memory_updated_at();
