
-- Enable idempotent upserts on billing rows by Stripe identifiers.
CREATE UNIQUE INDEX IF NOT EXISTS client_portal_billing_stripe_invoice_uidx
  ON public.client_portal_billing (stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS client_portal_billing_stripe_session_uidx
  ON public.client_portal_billing (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

-- Ensure billing + subscriptions rows stream over Realtime so the portal reflects
-- Stripe webhook updates instantly.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.client_portal_billing;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

ALTER TABLE public.client_portal_billing REPLICA IDENTITY FULL;
ALTER TABLE public.subscriptions REPLICA IDENTITY FULL;
