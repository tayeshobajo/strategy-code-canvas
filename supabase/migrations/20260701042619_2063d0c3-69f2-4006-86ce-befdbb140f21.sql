
CREATE TABLE IF NOT EXISTS public.processed_stripe_events (
  event_id TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox','live')),
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, environment)
);

GRANT SELECT, INSERT ON public.processed_stripe_events TO service_role;
ALTER TABLE public.processed_stripe_events ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS; deny everyone else explicitly by having no policies.
CREATE POLICY "no direct client access" ON public.processed_stripe_events
  FOR SELECT TO authenticated USING (false);
