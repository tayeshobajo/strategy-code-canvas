
-- Delivery Room persistence
CREATE TABLE public.engine_delivery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.engine_projects(id) ON DELETE SET NULL,
  client text NOT NULL,
  roadmap text NOT NULL,
  version text NOT NULL DEFAULT 'v1.0',
  status text NOT NULL DEFAULT 'ready',
  channel text NOT NULL DEFAULT 'Email + Portal',
  recipient text,
  recipient_role text,
  prepared_by text,
  approved_by text,
  last_action text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_delivery_items TO authenticated;
GRANT ALL ON public.engine_delivery_items TO service_role;
ALTER TABLE public.engine_delivery_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "engine_delivery_items admin all" ON public.engine_delivery_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role));
CREATE TRIGGER trg_engine_delivery_items_touch BEFORE UPDATE ON public.engine_delivery_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE TABLE public.engine_delivery_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES public.engine_delivery_items(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  note text,
  actor text,
  at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_delivery_history TO authenticated;
GRANT ALL ON public.engine_delivery_history TO service_role;
ALTER TABLE public.engine_delivery_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "engine_delivery_history admin all" ON public.engine_delivery_history FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role));
CREATE INDEX idx_engine_delivery_history_delivery ON public.engine_delivery_history(delivery_id, at DESC);

-- Review & Approvals audit
CREATE TABLE public.engine_review_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.engine_projects(id) ON DELETE SET NULL,
  project text NOT NULL,
  item_type text NOT NULL,
  title text NOT NULL,
  impact text NOT NULL DEFAULT 'medium',
  source text,
  requested_by text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_review_items TO authenticated;
GRANT ALL ON public.engine_review_items TO service_role;
ALTER TABLE public.engine_review_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "engine_review_items admin all" ON public.engine_review_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role));
CREATE TRIGGER trg_engine_review_items_touch BEFORE UPDATE ON public.engine_review_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE TABLE public.engine_review_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_item_id uuid REFERENCES public.engine_review_items(id) ON DELETE SET NULL,
  project text NOT NULL,
  item_type text NOT NULL,
  title text NOT NULL,
  action text NOT NULL,
  reason text,
  routed_to text,
  actor text,
  at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_review_audit TO authenticated;
GRANT ALL ON public.engine_review_audit TO service_role;
ALTER TABLE public.engine_review_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "engine_review_audit admin all" ON public.engine_review_audit FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role));
CREATE INDEX idx_engine_review_audit_at ON public.engine_review_audit(at DESC);

-- Global project agents registry
CREATE TABLE public.engine_project_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.engine_projects(id) ON DELETE SET NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'Draft',
  health text NOT NULL DEFAULT 'Healthy',
  template text,
  model text,
  policy text NOT NULL DEFAULT 'Draft only',
  monthly_budget_cents integer NOT NULL DEFAULT 10000,
  spend_month_cents integer NOT NULL DEFAULT 0,
  tasks_count integer NOT NULL DEFAULT 0,
  approval_pct integer,
  last_active_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_project_agents TO authenticated;
GRANT ALL ON public.engine_project_agents TO service_role;
ALTER TABLE public.engine_project_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "engine_project_agents admin all" ON public.engine_project_agents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role));
CREATE TRIGGER trg_engine_project_agents_touch BEFORE UPDATE ON public.engine_project_agents
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- Seed initial delivery items so page has data on first load
INSERT INTO public.engine_delivery_items (client, roadmap, version, status, channel, recipient, recipient_role, prepared_by, approved_by, last_action) VALUES
('Mental Dental Academy', 'Scale Dental Board Prep', 'v1.0', 'ready', 'Email + Portal', 'Ryan Driscoll', 'Founder & CEO', 'Tai Shobajo', 'Tai Shobajo', 'Approved today'),
('Gradient Group', 'Job Board Growth Engine', 'v2.1', 'scheduled', 'Live Presentation', 'Love Malone', 'COO', 'Tai Shobajo', 'Tai Shobajo', 'Scheduled tomorrow'),
('SBREADS', 'Digital Platform Upgrade', 'v1.3', 'sent', 'Email', 'Andrew M.', 'Executive Director', 'Tai Shobajo', 'Tai Shobajo', 'Sent Jun 10, 2025'),
('Temple Emanu-El', 'Event & Community Hub', 'v1.0', 'viewed', 'Client Portal', 'Kim Cohen', 'Ops Director', 'Tai Shobajo', 'Tai Shobajo', 'Viewed Jun 11, 2025'),
('SpaExecutive', 'Magazine Platform', 'v1.2', 'follow_up', 'Email', 'Elizabeth H.', 'Publisher', 'Tai Shobajo', 'Tai Shobajo', 'Opened Jun 10, 2025');

-- Seed initial review items
INSERT INTO public.engine_review_items (project, item_type, title, impact, source, requested_by, status) VALUES
('Mental Dental Academy', 'Version Change', 'Roadmap v1.2 → v1.3 (Q-Bank scope revision)', 'high', 'Agent draft', 'Agent (auto)', 'pending'),
('Gradient Group', 'Milestone Brief', 'Job Board Growth Engine — Phase 2 brief', 'medium', 'Milestone Workspace', 'Tai Shobajo', 'in_review'),
('SBREADS', 'Investment Change', 'Range shift $180k → $220k top-end', 'high', 'Investment Builder', 'Agent (auto)', 'pending'),
('Thriving Minds AZ', 'Client Preview', 'Preview copy update — Phase 1 outcomes', 'low', 'Client Preview editor', 'Tai Shobajo', 'pending'),
('Temple Emanu-El', 'Delivery Approval', 'Event & Community Hub v1.0 → ready to send', 'high', 'Delivery Prep', 'Tai Shobajo', 'pending');

-- Seed initial project agents
INSERT INTO public.engine_project_agents (name, status, health, template, model, policy, monthly_budget_cents, spend_month_cents, tasks_count, approval_pct, last_active_at) VALUES
('Mental Dental Academy', 'Active', 'Healthy', 'Discovery Analyst', 'Gemini 2.5 Pro', 'Propose updates', 15000, 4218, 48, 84, now() - interval '2 hours'),
('Greenridge Learning', 'Active', 'Healthy', 'Roadmap Drafter', 'Gemini 2.5 Flash', 'Propose updates', 12000, 3877, 42, 88, now() - interval '3 hours'),
('Elevate Coaching', 'Active', 'Healthy', 'Delivery Coordinator', 'Claude Sonnet 4.5', 'Draft only', 10000, 3122, 36, 90, now() - interval '5 hours'),
('BuildRight Systems', 'Paused', 'Warning', 'Milestone Brief Writer', 'GPT-5 Mini', 'Draft only', 8000, 2461, 19, 75, now() - interval '2 days');
