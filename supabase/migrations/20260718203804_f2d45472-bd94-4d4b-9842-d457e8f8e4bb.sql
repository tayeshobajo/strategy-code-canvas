-- RT-1: Roadmap Synthesis persistence
CREATE TABLE public.engine_project_synthesis_step_state (
  project_id uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  step_id text NOT NULL,
  state text NOT NULL,
  reason text,
  current_input_hash text,
  latest_attempt_id uuid,
  latest_candidate_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, step_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_project_synthesis_step_state TO authenticated;
GRANT ALL ON public.engine_project_synthesis_step_state TO service_role;
ALTER TABLE public.engine_project_synthesis_step_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage synthesis step state"
  ON public.engine_project_synthesis_step_state FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.engine_project_synthesis_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_group_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  step_id text NOT NULL,
  trigger text NOT NULL,
  actor_email text,
  input_manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  input_hash text NOT NULL,
  prompt_version text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL,
  error_message text
);
CREATE INDEX ON public.engine_project_synthesis_attempts (project_id, step_id, started_at DESC);
GRANT SELECT, INSERT ON public.engine_project_synthesis_attempts TO authenticated;
GRANT ALL ON public.engine_project_synthesis_attempts TO service_role;
ALTER TABLE public.engine_project_synthesis_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read attempts"
  ON public.engine_project_synthesis_attempts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins insert attempts"
  ON public.engine_project_synthesis_attempts FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.engine_project_synthesis_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  step_id text NOT NULL,
  attempt_id uuid REFERENCES public.engine_project_synthesis_attempts(id) ON DELETE SET NULL,
  payload jsonb NOT NULL,
  materiality text NOT NULL,
  qualification jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'awaiting_review',
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewer_email text,
  decision text,
  decision_reason text
);
CREATE INDEX ON public.engine_project_synthesis_candidates (project_id, step_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.engine_project_synthesis_candidates TO authenticated;
GRANT ALL ON public.engine_project_synthesis_candidates TO service_role;
ALTER TABLE public.engine_project_synthesis_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage candidates"
  ON public.engine_project_synthesis_candidates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RT-2: Widen spine_check to allow doctrine gate keys
ALTER TABLE public.engine_spine_field_truth
  DROP CONSTRAINT IF EXISTS engine_spine_field_truth_spine_check;

ALTER TABLE public.engine_spine_field_truth
  ADD CONSTRAINT engine_spine_field_truth_spine_check
  CHECK (spine = ANY (ARRAY[
    'point-a'::text,
    'point-b'::text,
    'world-entry'::text,
    'execution-boundary'::text,
    'strategic-thesis'::text,
    'drift-assessment'::text
  ]));