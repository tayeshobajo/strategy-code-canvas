
-- Enum for extracted signal categories
CREATE TYPE public.engine_signal_category AS ENUM (
  'goal','pain','opportunity','deadline','constraint','decision_maker',
  'hidden_asset','risk','required_system','milestone_candidate',
  'investment_signal','client_language','open_question'
);

-- Enum for source visibility
CREATE TYPE public.engine_source_visibility AS ENUM (
  'internal_only','operator_only','client_safe'
);

-- Enum for extraction run status
CREATE TYPE public.engine_extraction_run_status AS ENUM (
  'pending','running','succeeded','failed'
);

-- Extend engine_project_status enum
ALTER TYPE public.engine_project_status ADD VALUE IF NOT EXISTS 'intake' BEFORE 'active';
ALTER TYPE public.engine_project_status ADD VALUE IF NOT EXISTS 'source_processing' BEFORE 'draft';

-- Extend engine_sources
ALTER TABLE public.engine_sources
  ADD COLUMN IF NOT EXISTS visibility public.engine_source_visibility NOT NULL DEFAULT 'internal_only',
  ADD COLUMN IF NOT EXISTS used_in_version_ids uuid[] NOT NULL DEFAULT '{}';

-- Extend engine_roadmap_versions
ALTER TABLE public.engine_roadmap_versions
  ADD COLUMN IF NOT EXISTS generation_provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS label text;

-- engine_extraction_runs
CREATE TABLE public.engine_extraction_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  source_id uuid REFERENCES public.engine_sources(id) ON DELETE SET NULL,
  provider_intake text,
  provider_structured text,
  model_intake text,
  model_structured text,
  status public.engine_extraction_run_status NOT NULL DEFAULT 'pending',
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  signals_count integer NOT NULL DEFAULT 0,
  cost_cents integer NOT NULL DEFAULT 0,
  produced_version_id uuid REFERENCES public.engine_roadmap_versions(id) ON DELETE SET NULL,
  intake_summary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX engine_extraction_runs_project_idx ON public.engine_extraction_runs(project_id, created_at DESC);
CREATE INDEX engine_extraction_runs_source_idx ON public.engine_extraction_runs(source_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_extraction_runs TO authenticated;
GRANT ALL ON public.engine_extraction_runs TO service_role;

ALTER TABLE public.engine_extraction_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "engine_extraction_runs admin all"
  ON public.engine_extraction_runs
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role));

CREATE POLICY "Team members read extraction runs"
  ON public.engine_extraction_runs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'team_member'::public.app_role));

CREATE TRIGGER engine_extraction_runs_touch
  BEFORE UPDATE ON public.engine_extraction_runs
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- engine_extracted_signals
CREATE TABLE public.engine_extracted_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  source_id uuid REFERENCES public.engine_sources(id) ON DELETE SET NULL,
  extraction_run_id uuid REFERENCES public.engine_extraction_runs(id) ON DELETE SET NULL,
  category public.engine_signal_category NOT NULL,
  label text NOT NULL,
  detail text,
  confidence smallint NOT NULL DEFAULT 70,
  client_safe boolean NOT NULL DEFAULT false,
  used_in_version_id uuid REFERENCES public.engine_roadmap_versions(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX engine_extracted_signals_project_idx ON public.engine_extracted_signals(project_id, created_at DESC);
CREATE INDEX engine_extracted_signals_source_idx ON public.engine_extracted_signals(source_id);
CREATE INDEX engine_extracted_signals_category_idx ON public.engine_extracted_signals(project_id, category);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_extracted_signals TO authenticated;
GRANT ALL ON public.engine_extracted_signals TO service_role;

ALTER TABLE public.engine_extracted_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "engine_extracted_signals admin all"
  ON public.engine_extracted_signals
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role));

CREATE POLICY "Team members read extracted signals"
  ON public.engine_extracted_signals FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'team_member'::public.app_role));

CREATE TRIGGER engine_extracted_signals_touch
  BEFORE UPDATE ON public.engine_extracted_signals
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
