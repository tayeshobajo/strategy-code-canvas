-- ============= enums =============
CREATE TYPE public.engine_source_type AS ENUM (
  'transcript','brief','website_url','document','screenshot',
  'email_note','research_note','competitor_url','previous_roadmap'
);
CREATE TYPE public.engine_source_status AS ENUM ('queued','processing','processed','failed');
CREATE TYPE public.engine_version_status AS ENUM (
  'ai_generated','draft','needs_review','tai_edited','approved','client_facing','delivered','archived'
);
CREATE TYPE public.engine_change_kind AS ENUM (
  'new_info','conflict','opportunity','risk','deadline_change','scope_change','investment_impact','client_copy_affected'
);
CREATE TYPE public.engine_agent_task_kind AS ENUM (
  'milestone_brief','acceptance_criteria','lovable_prompt','missing_decisions',
  'update_from_source','version_compare','risk_estimate','client_summary','qa_checklist','free_form'
);
CREATE TYPE public.engine_agent_task_status AS ENUM ('draft','applied','saved_as_task','rejected');
CREATE TYPE public.engine_agent_permission AS ENUM ('draft_only','propose_updates','execute_approved');

-- ============= engine_sources =============
CREATE TABLE public.engine_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  type public.engine_source_type NOT NULL,
  storage_path text,
  url text,
  raw_text text,
  status public.engine_source_status NOT NULL DEFAULT 'queued',
  signals_count integer NOT NULL DEFAULT 0,
  confidence smallint NOT NULL DEFAULT 0,
  used_in_version text,
  error text,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX engine_sources_project_idx ON public.engine_sources(project_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_sources TO authenticated;
GRANT ALL ON public.engine_sources TO service_role;
ALTER TABLE public.engine_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "engine_sources admin all" ON public.engine_sources
  TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER engine_sources_touch BEFORE UPDATE ON public.engine_sources
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ============= engine_roadmap_versions =============
CREATE TABLE public.engine_roadmap_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  version text NOT NULL,
  status public.engine_version_status NOT NULL DEFAULT 'draft',
  created_by text NOT NULL DEFAULT 'ai',
  source_ids uuid[] NOT NULL DEFAULT '{}',
  summary text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);
CREATE INDEX engine_roadmap_versions_project_idx ON public.engine_roadmap_versions(project_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_roadmap_versions TO authenticated;
GRANT ALL ON public.engine_roadmap_versions TO service_role;
ALTER TABLE public.engine_roadmap_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "engine_roadmap_versions admin all" ON public.engine_roadmap_versions
  TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER engine_roadmap_versions_touch BEFORE UPDATE ON public.engine_roadmap_versions
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ============= engine_change_events =============
CREATE TABLE public.engine_change_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  kind public.engine_change_kind NOT NULL,
  title text NOT NULL,
  body text,
  severity text NOT NULL DEFAULT 'info',
  source_id uuid REFERENCES public.engine_sources(id) ON DELETE SET NULL,
  version_id uuid REFERENCES public.engine_roadmap_versions(id) ON DELETE SET NULL,
  affected_module text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX engine_change_events_project_idx ON public.engine_change_events(project_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_change_events TO authenticated;
GRANT ALL ON public.engine_change_events TO service_role;
ALTER TABLE public.engine_change_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "engine_change_events admin all" ON public.engine_change_events
  TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER engine_change_events_touch BEFORE UPDATE ON public.engine_change_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ============= engine_agent_tasks =============
CREATE TABLE public.engine_agent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  kind public.engine_agent_task_kind NOT NULL DEFAULT 'free_form',
  prompt text NOT NULL,
  output text,
  related_module text,
  confidence smallint NOT NULL DEFAULT 0,
  cost_cents integer NOT NULL DEFAULT 0,
  tokens_in integer NOT NULL DEFAULT 0,
  tokens_out integer NOT NULL DEFAULT 0,
  status public.engine_agent_task_status NOT NULL DEFAULT 'draft',
  attached_source_ids uuid[] NOT NULL DEFAULT '{}',
  used_project_context boolean NOT NULL DEFAULT true,
  created_by_email text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX engine_agent_tasks_project_idx ON public.engine_agent_tasks(project_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_agent_tasks TO authenticated;
GRANT ALL ON public.engine_agent_tasks TO service_role;
ALTER TABLE public.engine_agent_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "engine_agent_tasks admin all" ON public.engine_agent_tasks
  TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER engine_agent_tasks_touch BEFORE UPDATE ON public.engine_agent_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ============= engine_projects agent controls =============
ALTER TABLE public.engine_projects
  ADD COLUMN IF NOT EXISTS agent_permission_level public.engine_agent_permission NOT NULL DEFAULT 'propose_updates',
  ADD COLUMN IF NOT EXISTS agent_safety_rules jsonb NOT NULL DEFAULT '[
    "AI drafts, you approve.",
    "Approved roadmap versions are protected.",
    "Client-facing content requires final review.",
    "Delivery actions require explicit confirmation."
  ]'::jsonb,
  ADD COLUMN IF NOT EXISTS agent_allowed_modules text[] NOT NULL DEFAULT ARRAY[
    'extraction','point_a','point_b','hidden_assets','gap_map','blueprint',
    'roadmap','sequencing','deadlines','investment','client_preview'
  ]::text[];
