CREATE TABLE public.client_portal_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_email text NOT NULL UNIQUE,
  contact_name text,
  company_name text,
  package_name text,
  portal_status text NOT NULL DEFAULT 'payment_confirmed' CHECK (portal_status IN ('payment_confirmed','access_sent','onboarding_pending','onboarding_complete','roadmap_in_progress','roadmap_ready','roadmap_delivered','engagement_active','engagement_complete','access_revoked')),
  payment_status text NOT NULL DEFAULT 'paid',
  current_phase text NOT NULL DEFAULT 'Onboarding',
  next_milestone text,
  next_milestone_due_at timestamptz,
  stripe_customer_id text,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  stripe_subscription_id text,
  stripe_invoice_id text,
  payment_amount integer,
  currency text,
  purchased_package text,
  purchase_date timestamptz,
  intake_submission_id uuid,
  approved_roadmap_id uuid,
  scheduling_url text,
  owner_email text,
  last_client_activity_at timestamptz,
  access_granted_at timestamptz,
  access_revoked_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.client_portal_projects TO authenticated;
GRANT ALL ON public.client_portal_projects TO service_role;
ALTER TABLE public.client_portal_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clients read own portal project" ON public.client_portal_projects FOR SELECT TO authenticated USING (lower(primary_email) = lower(auth.email()));

CREATE TABLE public.client_portal_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.client_portal_projects(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'client' CHECK (role IN ('client','owner','admin')),
  can_view_billing boolean NOT NULL DEFAULT true,
  can_upload_files boolean NOT NULL DEFAULT true,
  can_message boolean NOT NULL DEFAULT true,
  can_view_roadmap boolean NOT NULL DEFAULT true,
  granted_by text,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, email)
);
GRANT SELECT ON public.client_portal_permissions TO authenticated;
GRANT ALL ON public.client_portal_permissions TO service_role;
ALTER TABLE public.client_portal_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clients read own portal permissions" ON public.client_portal_permissions FOR SELECT TO authenticated USING (lower(email) = lower(auth.email()));

CREATE TABLE public.client_portal_onboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES public.client_portal_projects(id) ON DELETE CASCADE,
  completion_percent integer NOT NULL DEFAULT 0,
  current_step integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted')),
  business_basics jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  goals_priorities jsonb NOT NULL DEFAULT '{}'::jsonb,
  assets_docs jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_submit jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamptz,
  last_saved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.client_portal_onboarding TO authenticated;
GRANT ALL ON public.client_portal_onboarding TO service_role;
ALTER TABLE public.client_portal_onboarding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clients manage own onboarding" ON public.client_portal_onboarding FOR ALL TO authenticated USING (project_id IN (SELECT p.project_id FROM public.client_portal_permissions p WHERE lower(p.email) = lower(auth.email()) AND p.revoked_at IS NULL)) WITH CHECK (project_id IN (SELECT p.project_id FROM public.client_portal_permissions p WHERE lower(p.email) = lower(auth.email()) AND p.revoked_at IS NULL));

CREATE TABLE public.client_portal_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.client_portal_projects(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('client','tai','system')),
  author_email text,
  subject text,
  body text NOT NULL,
  message_type text NOT NULL DEFAULT 'reply' CHECK (message_type IN ('update','reply','action_item','file_reference','meeting_update')),
  visible_to_client boolean NOT NULL DEFAULT true,
  action_required boolean NOT NULL DEFAULT false,
  action_completed_at timestamptz,
  related_file_ids uuid[] NOT NULL DEFAULT '{}',
  related_roadmap_section text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.client_portal_messages TO authenticated;
GRANT ALL ON public.client_portal_messages TO service_role;
ALTER TABLE public.client_portal_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clients read visible portal messages" ON public.client_portal_messages FOR SELECT TO authenticated USING (visible_to_client = true AND project_id IN (SELECT p.project_id FROM public.client_portal_permissions p WHERE lower(p.email) = lower(auth.email()) AND p.revoked_at IS NULL));
CREATE POLICY "Clients send own portal messages" ON public.client_portal_messages FOR INSERT TO authenticated WITH CHECK (sender_type = 'client' AND visible_to_client = true AND project_id IN (SELECT p.project_id FROM public.client_portal_permissions p WHERE lower(p.email) = lower(auth.email()) AND p.revoked_at IS NULL));
CREATE POLICY "Clients update own action items" ON public.client_portal_messages FOR UPDATE TO authenticated USING (visible_to_client = true AND project_id IN (SELECT p.project_id FROM public.client_portal_permissions p WHERE lower(p.email) = lower(auth.email()) AND p.revoked_at IS NULL)) WITH CHECK (visible_to_client = true AND project_id IN (SELECT p.project_id FROM public.client_portal_permissions p WHERE lower(p.email) = lower(auth.email()) AND p.revoked_at IS NULL));

CREATE TABLE public.client_portal_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.client_portal_projects(id) ON DELETE CASCADE,
  bucket_id text NOT NULL DEFAULT 'client-portal-files',
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  category text NOT NULL DEFAULT 'Client Uploads',
  file_type text,
  mime_type text,
  size_bytes bigint,
  uploaded_by_email text,
  uploaded_by_role text NOT NULL DEFAULT 'client' CHECK (uploaded_by_role IN ('client','tai','system')),
  client_visible boolean NOT NULL DEFAULT true,
  is_internal boolean NOT NULL DEFAULT false,
  linked_roadmap_document_id uuid REFERENCES public.roadmap_documents(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.client_portal_files TO authenticated;
GRANT ALL ON public.client_portal_files TO service_role;
ALTER TABLE public.client_portal_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clients read visible portal files" ON public.client_portal_files FOR SELECT TO authenticated USING (client_visible = true AND is_internal = false AND project_id IN (SELECT p.project_id FROM public.client_portal_permissions p WHERE lower(p.email) = lower(auth.email()) AND p.revoked_at IS NULL));
CREATE POLICY "Clients upload project files" ON public.client_portal_files FOR INSERT TO authenticated WITH CHECK (client_visible = true AND is_internal = false AND uploaded_by_role = 'client' AND project_id IN (SELECT p.project_id FROM public.client_portal_permissions p WHERE lower(p.email) = lower(auth.email()) AND p.revoked_at IS NULL));

CREATE TABLE public.client_portal_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.client_portal_projects(id) ON DELETE CASCADE,
  actor_type text NOT NULL CHECK (actor_type IN ('client','tai','system','stripe')),
  actor_email text,
  event_type text NOT NULL,
  summary text NOT NULL,
  client_visible boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.client_portal_activity TO authenticated;
GRANT ALL ON public.client_portal_activity TO service_role;
ALTER TABLE public.client_portal_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clients read visible activity" ON public.client_portal_activity FOR SELECT TO authenticated USING (client_visible = true AND project_id IN (SELECT p.project_id FROM public.client_portal_permissions p WHERE lower(p.email) = lower(auth.email()) AND p.revoked_at IS NULL));

CREATE TABLE public.client_portal_billing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.client_portal_projects(id) ON DELETE CASCADE,
  stripe_invoice_id text,
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  stripe_customer_id text,
  amount_total integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  payment_status text NOT NULL DEFAULT 'paid',
  purchased_package text,
  receipt_url text,
  invoice_url text,
  payment_confirmed_at timestamptz,
  next_payment_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.client_portal_billing TO authenticated;
GRANT ALL ON public.client_portal_billing TO service_role;
ALTER TABLE public.client_portal_billing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clients read own billing" ON public.client_portal_billing FOR SELECT TO authenticated USING (project_id IN (SELECT p.project_id FROM public.client_portal_permissions p WHERE lower(p.email) = lower(auth.email()) AND p.revoked_at IS NULL));

CREATE TABLE public.client_portal_roadmaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.client_portal_projects(id) ON DELETE CASCADE,
  source_submission_id uuid,
  source_review_id uuid,
  roadmap_document_id uuid REFERENCES public.roadmap_documents(id) ON DELETE SET NULL,
  title text NOT NULL,
  version_label text NOT NULL DEFAULT 'Version 1',
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','approved','delivered')),
  approved_at timestamptz,
  executive_summary text,
  current_diagnosis text,
  strategic_priorities jsonb NOT NULL DEFAULT '[]'::jsonb,
  sequence_30_60_90 jsonb NOT NULL DEFAULT '{}'::jsonb,
  risks_dependencies jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_next_move text,
  supporting_notes text,
  current_focus text,
  owner_name text,
  next_milestone text,
  next_meeting_at timestamptz,
  pdf_file_id uuid REFERENCES public.client_portal_files(id) ON DELETE SET NULL,
  one_pager_file_id uuid REFERENCES public.client_portal_files(id) ON DELETE SET NULL,
  share_url text,
  acknowledged_at timestamptz,
  acknowledged_by_email text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.client_portal_roadmaps TO authenticated;
GRANT ALL ON public.client_portal_roadmaps TO service_role;
ALTER TABLE public.client_portal_roadmaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clients read approved roadmaps" ON public.client_portal_roadmaps FOR SELECT TO authenticated USING (status IN ('approved','delivered') AND project_id IN (SELECT p.project_id FROM public.client_portal_permissions p WHERE lower(p.email) = lower(auth.email()) AND p.revoked_at IS NULL));

CREATE INDEX idx_client_portal_projects_status ON public.client_portal_projects(portal_status, updated_at DESC);
CREATE INDEX idx_client_portal_projects_email ON public.client_portal_projects(lower(primary_email));
CREATE INDEX idx_client_portal_permissions_email ON public.client_portal_permissions(lower(email), revoked_at);
CREATE INDEX idx_client_portal_messages_project ON public.client_portal_messages(project_id, created_at DESC);
CREATE INDEX idx_client_portal_files_project ON public.client_portal_files(project_id, created_at DESC);
CREATE INDEX idx_client_portal_activity_project ON public.client_portal_activity(project_id, created_at DESC);
CREATE INDEX idx_client_portal_billing_project ON public.client_portal_billing(project_id, created_at DESC);
CREATE INDEX idx_client_portal_roadmaps_project ON public.client_portal_roadmaps(project_id, approved_at DESC);

CREATE OR REPLACE FUNCTION public.client_portal_is_operator(_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(coalesce(_email, '')) IN ('hello@trust-tai.com');
$$;
REVOKE EXECUTE ON FUNCTION public.client_portal_is_operator(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_portal_is_operator(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sync_client_access_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_uid uuid := auth.uid();
  current_email text := auth.email();
BEGIN
  IF current_uid IS NULL OR current_email IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.client_access
  SET user_id = current_uid,
      updated_at = now()
  WHERE lower(email) = lower(current_email)
    AND revoked_at IS NULL
    AND (user_id IS NULL OR user_id <> current_uid);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sync_client_access_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_client_access_user() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.current_client_portal_project_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cpp.id
  FROM public.client_portal_projects cpp
  JOIN public.client_portal_permissions perm ON perm.project_id = cpp.id
  WHERE lower(perm.email) = lower(auth.email())
    AND perm.revoked_at IS NULL
  ORDER BY perm.granted_at DESC
  LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.current_client_portal_project_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_client_portal_project_id() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.log_client_portal_activity(
  _project_id uuid,
  _actor_type text,
  _actor_email text,
  _event_type text,
  _summary text,
  _client_visible boolean DEFAULT false,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_id uuid;
BEGIN
  INSERT INTO public.client_portal_activity(project_id, actor_type, actor_email, event_type, summary, client_visible, metadata)
  VALUES (_project_id, _actor_type, _actor_email, _event_type, _summary, _client_visible, coalesce(_metadata, '{}'::jsonb))
  RETURNING id INTO inserted_id;

  UPDATE public.client_portal_projects
  SET last_client_activity_at = CASE WHEN _client_visible THEN now() ELSE last_client_activity_at END,
      updated_at = now()
  WHERE id = _project_id;

  RETURN inserted_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.log_client_portal_activity(uuid, text, text, text, text, boolean, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_client_portal_activity(uuid, text, text, text, text, boolean, jsonb) TO service_role;

CREATE TRIGGER trg_client_portal_projects_touch BEFORE UPDATE ON public.client_portal_projects FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER trg_client_portal_permissions_touch BEFORE UPDATE ON public.client_portal_permissions FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER trg_client_portal_onboarding_touch BEFORE UPDATE ON public.client_portal_onboarding FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER trg_client_portal_messages_touch BEFORE UPDATE ON public.client_portal_messages FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER trg_client_portal_files_touch BEFORE UPDATE ON public.client_portal_files FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER trg_client_portal_billing_touch BEFORE UPDATE ON public.client_portal_billing FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER trg_client_portal_roadmaps_touch BEFORE UPDATE ON public.client_portal_roadmaps FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE POLICY "Portal bucket read own objects" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'client-portal-files' AND EXISTS (
    SELECT 1
    FROM public.client_portal_files f
    JOIN public.client_portal_permissions perm ON perm.project_id = f.project_id
    WHERE f.bucket_id = storage.objects.bucket_id
      AND f.storage_path = storage.objects.name
      AND f.client_visible = true
      AND f.is_internal = false
      AND lower(perm.email) = lower(auth.email())
      AND perm.revoked_at IS NULL
  )
);

CREATE POLICY "Portal bucket upload own objects" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'client-portal-files' AND owner = auth.uid() AND EXISTS (
    SELECT 1
    FROM public.client_portal_permissions perm
    WHERE perm.project_id = public.current_client_portal_project_id()
      AND lower(perm.email) = lower(auth.email())
      AND perm.revoked_at IS NULL
      AND perm.can_upload_files = true
  )
);

CREATE POLICY "Portal bucket update own objects" ON storage.objects FOR UPDATE TO authenticated USING (
  bucket_id = 'client-portal-files' AND owner = auth.uid()
) WITH CHECK (
  bucket_id = 'client-portal-files' AND owner = auth.uid()
);

CREATE POLICY "Portal bucket delete own objects" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'client-portal-files' AND owner = auth.uid()
);