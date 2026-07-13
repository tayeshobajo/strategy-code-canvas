-- ========================================================================
-- Phase 4 — Multi-Solution Decomposition + Business Engines + Command Center
-- ========================================================================

-- 1) Enums --------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.milestone_solution_status AS ENUM
    ('candidate','selected','deferred','rejected','superseded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.business_engine_kind AS ENUM
    ('content_authority','lead_followup','review_reputation','client_success',
     'founder_rhythm','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.business_engine_status AS ENUM
    ('draft','proposed','approved','active','paused','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.business_engine_cadence AS ENUM
    ('daily','weekly','biweekly','monthly','quarterly','ad_hoc');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.engine_run_status AS ENUM
    ('scheduled','running','awaiting_approval','completed','failed','skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.engine_exception_severity AS ENUM
    ('low','medium','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.engine_exception_status AS ENUM
    ('open','acknowledged','resolved','dismissed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) engine_milestone_solutions -----------------------------------------

CREATE TABLE public.engine_milestone_solutions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id    uuid NOT NULL REFERENCES public.engine_milestones(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  title           text NOT NULL,
  summary         text,
  rationale       text,
  status          public.milestone_solution_status NOT NULL DEFAULT 'candidate',
  effort_estimate text,
  investment_estimate_cents integer,
  assumptions     jsonb NOT NULL DEFAULT '[]'::jsonb,
  depends_on_solution_ids  uuid[] NOT NULL DEFAULT '{}',
  depends_on_milestone_ids uuid[] NOT NULL DEFAULT '{}',
  evidence_source_ids      uuid[] NOT NULL DEFAULT '{}',
  created_by      text,
  approved_by     text,
  approved_at     timestamptz,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.engine_milestone_solutions TO authenticated;
GRANT ALL ON public.engine_milestone_solutions TO service_role;

ALTER TABLE public.engine_milestone_solutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read solutions"
  ON public.engine_milestone_solutions FOR SELECT TO authenticated
  USING (public.is_engine_staff());
CREATE POLICY "Staff write solutions"
  ON public.engine_milestone_solutions FOR ALL TO authenticated
  USING (public.is_engine_staff()) WITH CHECK (public.is_engine_staff());

CREATE INDEX idx_solutions_milestone ON public.engine_milestone_solutions(milestone_id);
CREATE INDEX idx_solutions_project   ON public.engine_milestone_solutions(project_id);
CREATE INDEX idx_solutions_status    ON public.engine_milestone_solutions(status);

CREATE TRIGGER touch_engine_milestone_solutions
  BEFORE UPDATE ON public.engine_milestone_solutions
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- Single-selected-per-milestone invariant.
CREATE OR REPLACE FUNCTION public.tg_engine_solutions_single_selected()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'selected' THEN
    UPDATE public.engine_milestone_solutions
      SET status = 'superseded', updated_at = now()
      WHERE milestone_id = NEW.milestone_id
        AND id <> NEW.id
        AND status = 'selected';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER engine_solutions_single_selected
  AFTER INSERT OR UPDATE OF status ON public.engine_milestone_solutions
  FOR EACH ROW WHEN (NEW.status = 'selected')
  EXECUTE FUNCTION public.tg_engine_solutions_single_selected();

-- AI-self-approve prevention on solutions.
CREATE OR REPLACE FUNCTION public.tg_engine_solutions_no_self_approve()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.approved_by IS NOT NULL
     AND NEW.created_by IS NOT NULL
     AND NEW.approved_by = NEW.created_by
     AND NEW.created_by ILIKE 'agent:%' THEN
    RAISE EXCEPTION 'AI-created solution % cannot self-approve (created_by=%, approved_by=%)',
      NEW.id, NEW.created_by, NEW.approved_by USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER engine_solutions_no_self_approve
  BEFORE INSERT OR UPDATE OF approved_by ON public.engine_milestone_solutions
  FOR EACH ROW EXECUTE FUNCTION public.tg_engine_solutions_no_self_approve();

-- 3) engine_business_engines --------------------------------------------

CREATE TABLE public.engine_business_engines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  milestone_id    uuid REFERENCES public.engine_milestones(id) ON DELETE SET NULL,
  kind            public.business_engine_kind NOT NULL,
  name            text NOT NULL,
  outcome         text NOT NULL,
  workflow        jsonb NOT NULL DEFAULT '[]'::jsonb,
  cadence         public.business_engine_cadence NOT NULL DEFAULT 'weekly',
  cron_expression text,
  owner_email     text,
  triggers        jsonb NOT NULL DEFAULT '{}'::jsonb,
  approval_rules  jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics         jsonb NOT NULL DEFAULT '[]'::jsonb,
  exception_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  status          public.business_engine_status NOT NULL DEFAULT 'draft',
  last_run_at     timestamptz,
  next_run_at     timestamptz,
  missed_cycles   integer NOT NULL DEFAULT 0,
  approved_by     text,
  approved_at     timestamptz,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.engine_business_engines TO authenticated;
GRANT ALL ON public.engine_business_engines TO service_role;

ALTER TABLE public.engine_business_engines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read engines"
  ON public.engine_business_engines FOR SELECT TO authenticated
  USING (public.is_engine_staff());
CREATE POLICY "Staff write engines"
  ON public.engine_business_engines FOR ALL TO authenticated
  USING (public.is_engine_staff()) WITH CHECK (public.is_engine_staff());

CREATE INDEX idx_engines_project  ON public.engine_business_engines(project_id);
CREATE INDEX idx_engines_status   ON public.engine_business_engines(status);
CREATE INDEX idx_engines_next_run ON public.engine_business_engines(next_run_at) WHERE status='active';

CREATE TRIGGER touch_engine_business_engines
  BEFORE UPDATE ON public.engine_business_engines
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- 4) engine_business_engine_runs ----------------------------------------

CREATE TABLE public.engine_business_engine_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_id       uuid NOT NULL REFERENCES public.engine_business_engines(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  cycle_key       text NOT NULL,
  status          public.engine_run_status NOT NULL DEFAULT 'scheduled',
  scheduled_for   timestamptz NOT NULL,
  started_at      timestamptz,
  completed_at    timestamptz,
  inputs          jsonb NOT NULL DEFAULT '{}'::jsonb,
  outputs         jsonb NOT NULL DEFAULT '{}'::jsonb,
  decisions       jsonb NOT NULL DEFAULT '[]'::jsonb,
  model           text,
  tokens_input    integer,
  tokens_output   integer,
  cost_cents      integer,
  latency_ms      integer,
  evidence_ids    uuid[] NOT NULL DEFAULT '{}',
  approval_ids    uuid[] NOT NULL DEFAULT '{}',
  proposal_ids    uuid[] NOT NULL DEFAULT '{}',
  error           text,
  actor_email     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (engine_id, cycle_key)
);

GRANT SELECT, INSERT, UPDATE ON public.engine_business_engine_runs TO authenticated;
GRANT ALL ON public.engine_business_engine_runs TO service_role;

ALTER TABLE public.engine_business_engine_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read engine runs"
  ON public.engine_business_engine_runs FOR SELECT TO authenticated
  USING (public.is_engine_staff());
CREATE POLICY "Staff write engine runs"
  ON public.engine_business_engine_runs FOR ALL TO authenticated
  USING (public.is_engine_staff()) WITH CHECK (public.is_engine_staff());

CREATE INDEX idx_runs_engine    ON public.engine_business_engine_runs(engine_id);
CREATE INDEX idx_runs_project   ON public.engine_business_engine_runs(project_id);
CREATE INDEX idx_runs_status    ON public.engine_business_engine_runs(status);
CREATE INDEX idx_runs_scheduled ON public.engine_business_engine_runs(scheduled_for);

-- Immutability: seal once completed/failed/skipped.
CREATE OR REPLACE FUNCTION public.tg_engine_business_engine_runs_seal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.completed_at IS NOT NULL
     AND OLD.status IN ('completed','failed','skipped') THEN
    RAISE EXCEPTION 'Engine run % is sealed and cannot be modified', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER engine_business_engine_runs_seal
  BEFORE UPDATE ON public.engine_business_engine_runs
  FOR EACH ROW EXECUTE FUNCTION public.tg_engine_business_engine_runs_seal();

-- 5) engine_business_engine_exceptions ----------------------------------

CREATE TABLE public.engine_business_engine_exceptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_id     uuid REFERENCES public.engine_business_engines(id) ON DELETE CASCADE,
  run_id        uuid REFERENCES public.engine_business_engine_runs(id) ON DELETE SET NULL,
  project_id    uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  kind          text NOT NULL,
  severity      public.engine_exception_severity NOT NULL DEFAULT 'medium',
  summary       text NOT NULL,
  detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
  urgency_score integer NOT NULL DEFAULT 50 CHECK (urgency_score BETWEEN 0 AND 100),
  impact_score  integer NOT NULL DEFAULT 50 CHECK (impact_score  BETWEEN 0 AND 100),
  deadline_at   timestamptz,
  client_risk   boolean NOT NULL DEFAULT false,
  next_action   text,
  next_action_owner text,
  status        public.engine_exception_status NOT NULL DEFAULT 'open',
  resolved_by   text,
  resolved_at   timestamptz,
  resolution_note text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.engine_business_engine_exceptions TO authenticated;
GRANT ALL ON public.engine_business_engine_exceptions TO service_role;

ALTER TABLE public.engine_business_engine_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read engine exceptions"
  ON public.engine_business_engine_exceptions FOR SELECT TO authenticated
  USING (public.is_engine_staff());
CREATE POLICY "Staff write engine exceptions"
  ON public.engine_business_engine_exceptions FOR ALL TO authenticated
  USING (public.is_engine_staff()) WITH CHECK (public.is_engine_staff());

CREATE INDEX idx_exceptions_status   ON public.engine_business_engine_exceptions(status);
CREATE INDEX idx_exceptions_severity ON public.engine_business_engine_exceptions(severity);
CREATE INDEX idx_exceptions_project  ON public.engine_business_engine_exceptions(project_id);
CREATE INDEX idx_exceptions_deadline ON public.engine_business_engine_exceptions(deadline_at);

CREATE TRIGGER touch_engine_business_engine_exceptions
  BEFORE UPDATE ON public.engine_business_engine_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- 6) spine_points_approved(_project_id) helper --------------------------

CREATE OR REPLACE FUNCTION public.spine_points_approved(_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  point_a_required text[];
  point_b_required text[];
  point_a_missing  text[];
  point_b_missing  text[];
  contradictions   boolean;
  allowed          boolean;
BEGIN
  SELECT public.is_engine_staff()
      OR EXISTS (
        SELECT 1
          FROM public.client_portal_projects cpp
          JOIN public.client_portal_permissions perm ON perm.project_id = cpp.id
          JOIN public.engine_projects ep ON ep.client_portal_project_id = cpp.id
         WHERE ep.id = _project_id
           AND lower(perm.email) = lower(coalesce(auth.email(), ''))
           AND perm.revoked_at IS NULL
      )
    INTO allowed;
  IF NOT allowed THEN
    RAISE EXCEPTION 'Forbidden: access to project % not permitted', _project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(array_agg(field_key), '{}')
    INTO point_a_required
    FROM public.internal_spine_field_keys(_project_id, 'point-a');
  SELECT COALESCE(array_agg(field_key), '{}')
    INTO point_b_required
    FROM public.internal_spine_field_keys(_project_id, 'point-b');

  SELECT COALESCE(array_agg(k), '{}')
    INTO point_a_missing
    FROM unnest(point_a_required) AS k
   WHERE NOT EXISTS (
     SELECT 1 FROM public.engine_spine_field_truth t
      WHERE t.project_id = _project_id
        AND t.spine      = 'point-a'
        AND t.field_key  = k
        AND t.status     = 'approved_truth'
   );

  SELECT COALESCE(array_agg(k), '{}')
    INTO point_b_missing
    FROM unnest(point_b_required) AS k
   WHERE NOT EXISTS (
     SELECT 1 FROM public.engine_spine_field_truth t
      WHERE t.project_id = _project_id
        AND t.spine      = 'point-b'
        AND t.field_key  = k
        AND t.status     = 'approved_truth'
   );

  contradictions := public.internal_project_has_contradictions(_project_id);

  RETURN jsonb_build_object(
    'ready', (
      array_length(point_a_missing, 1) IS NULL
      AND array_length(point_b_missing, 1) IS NULL
      AND NOT contradictions
    ),
    'point_a', jsonb_build_object(
      'required', to_jsonb(point_a_required),
      'missing',  to_jsonb(point_a_missing),
      'approved', array_length(point_a_missing, 1) IS NULL
    ),
    'point_b', jsonb_build_object(
      'required', to_jsonb(point_b_required),
      'missing',  to_jsonb(point_b_missing),
      'approved', array_length(point_b_missing, 1) IS NULL
    ),
    'has_active_contradictions', contradictions
  );
END;
$$;

REVOKE ALL ON FUNCTION public.spine_points_approved(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spine_points_approved(uuid) TO authenticated, service_role;

-- 7) Business-engine approval gate --------------------------------------

CREATE OR REPLACE FUNCTION public.tg_engine_business_engines_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a_missing jsonb;
  b_missing jsonb;
  has_contra boolean;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    has_contra := public.internal_project_has_contradictions(NEW.project_id);
    IF has_contra THEN
      RAISE EXCEPTION 'Cannot approve engine %: project % has unresolved contradictions',
        NEW.id, NEW.project_id USING ERRCODE = 'check_violation';
    END IF;

    SELECT COALESCE(jsonb_agg(k), '[]'::jsonb) INTO a_missing
      FROM (
        SELECT field_key AS k
          FROM public.internal_spine_field_keys(NEW.project_id, 'point-a') s
         WHERE NOT EXISTS (
           SELECT 1 FROM public.engine_spine_field_truth t
            WHERE t.project_id = NEW.project_id
              AND t.spine      = 'point-a'
              AND t.field_key  = s.field_key
              AND t.status     = 'approved_truth'
         )
      ) x;

    SELECT COALESCE(jsonb_agg(k), '[]'::jsonb) INTO b_missing
      FROM (
        SELECT field_key AS k
          FROM public.internal_spine_field_keys(NEW.project_id, 'point-b') s
         WHERE NOT EXISTS (
           SELECT 1 FROM public.engine_spine_field_truth t
            WHERE t.project_id = NEW.project_id
              AND t.spine      = 'point-b'
              AND t.field_key  = s.field_key
              AND t.status     = 'approved_truth'
         )
      ) x;

    IF jsonb_array_length(a_missing) > 0 OR jsonb_array_length(b_missing) > 0 THEN
      RAISE EXCEPTION 'Cannot approve engine %: spine not fully approved. point_a_missing=%, point_b_missing=%',
        NEW.id, a_missing, b_missing USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.approved_at IS NULL THEN NEW.approved_at := now(); END IF;
    IF NEW.approved_by IS NULL THEN
      RAISE EXCEPTION 'approved_by required when approving engine %', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.status = 'active' AND (OLD.status IS DISTINCT FROM 'active') THEN
    IF NEW.approved_at IS NULL OR COALESCE(TRIM(NEW.owner_email),'') = '' THEN
      RAISE EXCEPTION 'Engine % cannot activate without approved_at and owner_email', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER engine_business_engines_gate
  BEFORE UPDATE OF status ON public.engine_business_engines
  FOR EACH ROW EXECUTE FUNCTION public.tg_engine_business_engines_gate();

-- AI-self-approve prevention on engines.
CREATE OR REPLACE FUNCTION public.tg_engine_business_engines_no_self_approve()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.approved_by IS NOT NULL
     AND NEW.created_by IS NOT NULL
     AND NEW.approved_by = NEW.created_by
     AND NEW.created_by ILIKE 'agent:%' THEN
    RAISE EXCEPTION 'AI-created engine % cannot self-approve (created_by=%, approved_by=%)',
      NEW.id, NEW.created_by, NEW.approved_by USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER engine_business_engines_no_self_approve
  BEFORE INSERT OR UPDATE OF approved_by ON public.engine_business_engines
  FOR EACH ROW EXECUTE FUNCTION public.tg_engine_business_engines_no_self_approve();
