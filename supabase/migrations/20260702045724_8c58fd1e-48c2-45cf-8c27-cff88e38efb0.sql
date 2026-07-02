
-- Status enum for engine_projects
DO $$ BEGIN
  CREATE TYPE public.engine_project_status AS ENUM (
    'active','draft','needs_review','approved','delivered','in_execution','blocked','archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Clients
CREATE TABLE public.engine_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company text NOT NULL,
  primary_contact text,
  contact_email text,
  industry text,
  status text NOT NULL DEFAULT 'active',
  owner_email text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_clients TO authenticated;
GRANT ALL ON public.engine_clients TO service_role;
ALTER TABLE public.engine_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "engine_clients admin all" ON public.engine_clients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Projects
CREATE TABLE public.engine_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.engine_clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  status public.engine_project_status NOT NULL DEFAULT 'active',
  current_step text NOT NULL DEFAULT 'signal',
  roadmap_version text,
  approved_version text,
  agent_status text NOT NULL DEFAULT 'inactive',
  agent_budget_monthly_cents integer NOT NULL DEFAULT 0,
  agent_spend_month_cents integer NOT NULL DEFAULT 0,
  open_decisions integer NOT NULL DEFAULT 0,
  next_action text,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX engine_projects_client_idx ON public.engine_projects(client_id);
CREATE INDEX engine_projects_status_idx ON public.engine_projects(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_projects TO authenticated;
GRANT ALL ON public.engine_projects TO service_role;
ALTER TABLE public.engine_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "engine_projects admin all" ON public.engine_projects FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Project critical dates
CREATE TABLE public.engine_project_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  label text NOT NULL,
  due_on date NOT NULL,
  kind text NOT NULL DEFAULT 'critical',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX engine_project_dates_project_idx ON public.engine_project_dates(project_id, due_on);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_project_dates TO authenticated;
GRANT ALL ON public.engine_project_dates TO service_role;
ALTER TABLE public.engine_project_dates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "engine_project_dates admin all" ON public.engine_project_dates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Signals
CREATE TABLE public.engine_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  source text,
  summary text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  triaged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX engine_signals_project_idx ON public.engine_signals(project_id, received_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_signals TO authenticated;
GRANT ALL ON public.engine_signals TO service_role;
ALTER TABLE public.engine_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "engine_signals admin all" ON public.engine_signals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Activity / alerts feed
CREATE TABLE public.engine_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  severity text NOT NULL DEFAULT 'info',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX engine_activity_created_idx ON public.engine_activity(created_at DESC);
CREATE INDEX engine_activity_project_idx ON public.engine_activity(project_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_activity TO authenticated;
GRANT ALL ON public.engine_activity TO service_role;
ALTER TABLE public.engine_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "engine_activity admin all" ON public.engine_activity FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- updated_at triggers (reuse existing tg_touch_updated_at)
CREATE TRIGGER engine_clients_touch BEFORE UPDATE ON public.engine_clients
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER engine_projects_touch BEFORE UPDATE ON public.engine_projects
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- Seed: Mental Dental Academy
DO $$
DECLARE
  v_client uuid;
  v_project uuid;
BEGIN
  INSERT INTO public.engine_clients (company, primary_contact, industry, status, owner_email, notes)
  VALUES ('Mental Dental Academy', 'Dr. Adaeze', 'Education', 'active', 'tai@trusttai.com',
    'INBDE & ADAT platform. Roadmap in active drafting.')
  RETURNING id INTO v_client;

  INSERT INTO public.engine_projects (
    client_id, name, status, current_step, roadmap_version, approved_version,
    agent_status, agent_budget_monthly_cents, agent_spend_month_cents, open_decisions, next_action, last_activity_at
  ) VALUES (
    v_client, 'INBDE & ADAT Platform', 'active', 'roadmap_drafting', 'v1.2 Draft', 'v1.0',
    'active', 15000, 4218, 2, 'Finalize System Blueprint', now()
  )
  RETURNING id INTO v_project;

  INSERT INTO public.engine_project_dates (project_id, label, due_on, kind) VALUES
    (v_project, 'Pre-Test Ready', DATE '2025-10-01', 'critical'),
    (v_project, 'First School Launch', DATE '2026-01-01', 'critical');

  INSERT INTO public.engine_signals (project_id, source, summary, triaged) VALUES
    (v_project, 'Intake', 'Founder wants pre-test coverage before Oct 1 cohort.', true),
    (v_project, 'Client call', 'Concern about pass-rate benchmarks for ADAT track.', false);

  INSERT INTO public.engine_activity (project_id, kind, title, body, severity) VALUES
    (v_project, 'agent', 'Diagnosis draft generated', 'Point A diagnosis draft ready for review.', 'info'),
    (v_project, 'decision', 'Pricing tier decision pending', 'Waiting on founder decision for launch tier.', 'warn'),
    (v_project, 'deadline', 'Pre-Test Ready deadline in <60 days', 'Oct 1 milestone approaching.', 'warn');
END $$;
