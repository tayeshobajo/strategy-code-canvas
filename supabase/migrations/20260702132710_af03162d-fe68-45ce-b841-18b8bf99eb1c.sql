
-- Milestones table
CREATE TABLE public.engine_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.engine_projects(id) on delete cascade,
  name text not null,
  phase text,
  status text not null default 'draft',
  owner_email text,
  priority text default 'medium',
  deadline_relevance text,
  due_date date,
  related_system_node text,
  related_gap text,
  related_hidden_asset text,
  estimated_effort text,
  estimated_cost_cents integer default 0,
  brief_md text,
  acceptance_criteria jsonb not null default '[]'::jsonb,
  developer_prompt text,
  qa_checklist jsonb not null default '[]'::jsonb,
  dependencies jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  decisions jsonb not null default '[]'::jsonb,
  client_safe_md text,
  approval_status text not null default 'draft',
  approved_at timestamptz,
  approved_by_email text,
  confidence integer default 0,
  sort_index integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_milestones TO authenticated;
GRANT ALL ON public.engine_milestones TO service_role;
ALTER TABLE public.engine_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "engine_milestones_admin_all" ON public.engine_milestones
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER engine_milestones_touch BEFORE UPDATE ON public.engine_milestones
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE INDEX engine_milestones_project_idx ON public.engine_milestones(project_id, sort_index);

-- Tasks table
CREATE TABLE public.engine_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.engine_projects(id) on delete cascade,
  milestone_id uuid references public.engine_milestones(id) on delete set null,
  name text not null,
  description text,
  source text,
  priority text not null default 'P2',
  owner_email text,
  status text not null default 'suggested',
  estimated_effort_hours numeric,
  estimated_cost_cents integer default 0,
  due_date date,
  blocked_decision text,
  acceptance_criteria jsonb not null default '[]'::jsonb,
  created_by text not null default 'agent',
  agent_task_id uuid references public.engine_agent_tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_tasks TO authenticated;
GRANT ALL ON public.engine_tasks TO service_role;
ALTER TABLE public.engine_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "engine_tasks_admin_all" ON public.engine_tasks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER engine_tasks_touch BEFORE UPDATE ON public.engine_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE INDEX engine_tasks_project_idx ON public.engine_tasks(project_id, status);

-- Agent permissions
CREATE TABLE public.engine_agent_permissions (
  project_id uuid primary key references public.engine_projects(id) on delete cascade,
  permission_mode text not null default 'draft_only',
  action_permissions jsonb not null default '{}'::jsonb,
  safety_rules jsonb not null default '[]'::jsonb,
  monthly_cap_cents integer default 15000,
  warning_threshold_pct integer default 80,
  hard_stop_pct integer default 100,
  require_approval_above_cents integer default 500,
  preferred_model text default 'google/gemini-3-flash-preview',
  auto_pause_when_exceeded boolean default true,
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_agent_permissions TO authenticated;
GRANT ALL ON public.engine_agent_permissions TO service_role;
ALTER TABLE public.engine_agent_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "engine_agent_permissions_admin_all" ON public.engine_agent_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER engine_agent_permissions_touch BEFORE UPDATE ON public.engine_agent_permissions
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- Add category to agent tasks for cost center rollups
ALTER TABLE public.engine_agent_tasks ADD COLUMN IF NOT EXISTS category text;
