
CREATE TABLE public.portal_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  email text,
  user_id uuid,
  has_client_access boolean,
  has_permission boolean,
  has_project boolean,
  project_id uuid,
  route text,
  user_agent text,
  correlation_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX portal_access_events_email_idx ON public.portal_access_events (lower(email), created_at DESC);
CREATE INDEX portal_access_events_type_idx ON public.portal_access_events (event_type, created_at DESC);

GRANT SELECT ON public.portal_access_events TO authenticated;
GRANT ALL ON public.portal_access_events TO service_role;

ALTER TABLE public.portal_access_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators can read access events"
  ON public.portal_access_events
  FOR SELECT
  TO authenticated
  USING (public.client_portal_is_operator(auth.email()));
