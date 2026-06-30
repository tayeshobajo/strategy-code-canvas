
-- Subscriptions table (Stripe webhook-managed)
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_email text,
  stripe_subscription_id text NOT NULL UNIQUE,
  stripe_customer_id text NOT NULL,
  product_id text NOT NULL,
  price_id text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  pause_collection text,
  environment text NOT NULL DEFAULT 'sandbox',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_subs_user ON public.subscriptions(user_id);
CREATE INDEX idx_subs_email ON public.subscriptions(customer_email);
CREATE INDEX idx_subs_stripe ON public.subscriptions(stripe_subscription_id);

GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own subs by user_id or email"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR customer_email = auth.email());

-- Client access table (email-keyed, links purchases to portal)
CREATE TABLE public.client_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'roadmap',
  stripe_session_id text,
  stripe_subscription_id text,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(email, source, stripe_session_id)
);
CREATE INDEX idx_client_access_email ON public.client_access(lower(email));
CREATE INDEX idx_client_access_user ON public.client_access(user_id);

GRANT SELECT ON public.client_access TO authenticated;
GRANT ALL ON public.client_access TO service_role;
ALTER TABLE public.client_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own client_access by email"
  ON public.client_access FOR SELECT TO authenticated
  USING (lower(email) = lower(auth.email()));

-- Roadmap documents Tai uploads per client
CREATE TABLE public.roadmap_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_email text NOT NULL,
  title text NOT NULL,
  body_md text,
  file_url text,
  published_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_roadmap_docs_email ON public.roadmap_documents(lower(client_email));

GRANT SELECT ON public.roadmap_documents TO authenticated;
GRANT ALL ON public.roadmap_documents TO service_role;
ALTER TABLE public.roadmap_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients read their roadmap"
  ON public.roadmap_documents FOR SELECT TO authenticated
  USING (lower(client_email) = lower(auth.email()));

-- Portal messages (client <-> Tai)
CREATE TABLE public.portal_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_email text NOT NULL,
  sender text NOT NULL CHECK (sender IN ('client','tai')),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_email ON public.portal_messages(lower(client_email), created_at);

GRANT SELECT, INSERT ON public.portal_messages TO authenticated;
GRANT ALL ON public.portal_messages TO service_role;
ALTER TABLE public.portal_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients read their thread"
  ON public.portal_messages FOR SELECT TO authenticated
  USING (lower(client_email) = lower(auth.email()));

CREATE POLICY "Clients send as themselves"
  ON public.portal_messages FOR INSERT TO authenticated
  WITH CHECK (lower(client_email) = lower(auth.email()) AND sender = 'client');

-- updated_at trigger fn
CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_subs_touch BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER trg_client_access_touch BEFORE UPDATE ON public.client_access
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER trg_roadmap_docs_touch BEFORE UPDATE ON public.roadmap_documents
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- Helper: does the signed-in user have any client_access?
CREATE OR REPLACE FUNCTION public.has_client_access(_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.client_access
    WHERE lower(email) = lower(_email) AND revoked_at IS NULL
  );
$$;
REVOKE EXECUTE ON FUNCTION public.has_client_access(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_client_access(text) TO authenticated, service_role;
