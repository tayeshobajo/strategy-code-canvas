-- Drop every legacy internal table not used by the public website.
DO $$
DECLARE
  keep text[] := ARRAY[
    'website_intake_sessions','website_event_outbox',
    'email_send_log','email_send_state','email_unsubscribe_tokens','suppressed_emails',
    'orders','subscriptions','processed_stripe_events'
  ];
  t record;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname='public' AND NOT (tablename = ANY(keep))
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', t.tablename);
  END LOOP;
END $$;

-- Drop legacy functions, keeping only what the website still calls.
DO $$
DECLARE
  keep text[] := ARRAY[
    'enqueue_email','read_email_batch','delete_email','move_to_dlq',
    'email_queue_dispatch','email_queue_wake',
    'set_updated_at_now','tg_touch_updated_at','touch_updated_at','update_updated_at_column'
  ];
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f' AND NOT (p.proname = ANY(keep))
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', f.sig);
  END LOOP;
END $$;

-- Drop legacy enum types left behind by the removed tables.
DO $$
DECLARE ty record;
BEGIN
  FOR ty IN
    SELECT t.typname
    FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typtype='e'
  LOOP
    EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', ty.typname);
  END LOOP;
END $$;
