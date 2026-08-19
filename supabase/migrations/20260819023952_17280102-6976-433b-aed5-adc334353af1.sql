ALTER TABLE public.website_intake_sessions ADD COLUMN IF NOT EXISTS scout_prospect_id text;

CREATE TABLE IF NOT EXISTS public.website_event_outbox (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.website_event_outbox TO service_role;
ALTER TABLE public.website_event_outbox ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (server code) may touch the outbox.

CREATE INDEX IF NOT EXISTS website_event_outbox_pending_idx
  ON public.website_event_outbox (status, created_at);