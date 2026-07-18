CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.engine_work_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.engine_tasks(id) ON DELETE CASCADE,
  milestone_id uuid,
  evidence_type text NOT NULL,
  title text NOT NULL,
  summary text,
  url text,
  verdict text NOT NULL DEFAULT 'pending',
  review_note text,
  reviewed_by_email text,
  reviewed_at timestamptz,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT engine_work_evidence_verdict_chk CHECK (verdict IN ('pending','accepted','rejected'))
);

CREATE INDEX engine_work_evidence_task_idx ON public.engine_work_evidence(task_id);
CREATE INDEX engine_work_evidence_project_idx ON public.engine_work_evidence(project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_work_evidence TO authenticated;
GRANT ALL ON public.engine_work_evidence TO service_role;

ALTER TABLE public.engine_work_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators and admins manage work evidence"
  ON public.engine_work_evidence
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'operator') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'operator') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER engine_work_evidence_touch_updated_at
  BEFORE UPDATE ON public.engine_work_evidence
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();