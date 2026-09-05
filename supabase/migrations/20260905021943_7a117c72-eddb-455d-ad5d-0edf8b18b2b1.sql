CREATE TABLE public.client_roadmap_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_slug text NOT NULL,
  email text NOT NULL,
  granted_by text,
  granted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (roadmap_slug, email)
);

GRANT SELECT ON public.client_roadmap_access TO authenticated;
GRANT ALL ON public.client_roadmap_access TO service_role;

ALTER TABLE public.client_roadmap_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients read their own roadmap access"
ON public.client_roadmap_access
FOR SELECT
TO authenticated
USING (lower(email) = lower(auth.email()));

CREATE POLICY "Service role manages roadmap access"
ON public.client_roadmap_access
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE TRIGGER client_roadmap_access_updated_at
BEFORE UPDATE ON public.client_roadmap_access
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX client_roadmap_access_email_idx ON public.client_roadmap_access (lower(email));

CREATE TABLE public.portal_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text NOT NULL,
  roadmap_slug text,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'received',
  core_status text NOT NULL DEFAULT 'pending',
  core_error text,
  core_delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.portal_questions TO authenticated;
GRANT ALL ON public.portal_questions TO service_role;

ALTER TABLE public.portal_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients read their own portal questions"
ON public.portal_questions
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR lower(email) = lower(auth.email()));

CREATE POLICY "Service role manages portal questions"
ON public.portal_questions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE TRIGGER portal_questions_updated_at
BEFORE UPDATE ON public.portal_questions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX portal_questions_email_idx ON public.portal_questions (lower(email), created_at DESC);