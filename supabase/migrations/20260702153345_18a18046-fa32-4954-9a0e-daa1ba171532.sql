
CREATE OR REPLACE FUNCTION public.admin_list_email_dlq(_queue text, _limit int DEFAULT 100)
RETURNS TABLE(msg_id bigint, enqueued_at timestamptz, read_ct int, message jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq, pg_temp
AS $$
DECLARE
  caller_email text := lower(coalesce(auth.email(), ''));
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'operator'::public.app_role)
       OR caller_email IN ('tai@trusttai.com','henry@trusttai.com','hello@trusttai.com','tai@trust-tai.com','henry@trust-tai.com','hello@trust-tai.com')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _queue NOT IN ('auth_emails_dlq','transactional_emails_dlq') THEN
    RAISE EXCEPTION 'Invalid queue';
  END IF;
  RETURN QUERY EXECUTE format(
    'SELECT msg_id, enqueued_at, read_ct, message FROM pgmq.q_%I ORDER BY enqueued_at DESC LIMIT %L',
    _queue, _limit
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_retry_email_dlq(_dlq text, _msg_id bigint)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq, pg_temp
AS $$
DECLARE
  caller_email text := lower(coalesce(auth.email(), ''));
  target_queue text;
  payload jsonb;
  new_id bigint;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'operator'::public.app_role)
       OR caller_email IN ('tai@trusttai.com','henry@trusttai.com','hello@trusttai.com','tai@trust-tai.com','henry@trust-tai.com','hello@trust-tai.com')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _dlq = 'transactional_emails_dlq' THEN
    target_queue := 'transactional_emails';
  ELSIF _dlq = 'auth_emails_dlq' THEN
    target_queue := 'auth_emails';
  ELSE
    RAISE EXCEPTION 'Invalid dlq';
  END IF;

  SELECT message INTO payload FROM pgmq.read(_dlq, 5, 1) WHERE msg_id = _msg_id LIMIT 1;
  IF payload IS NULL THEN
    -- fallback: direct read (pgmq.read hides read messages)
    EXECUTE format('SELECT message FROM pgmq.q_%I WHERE msg_id = $1', _dlq)
      INTO payload USING _msg_id;
  END IF;
  IF payload IS NULL THEN
    RAISE EXCEPTION 'Message not found';
  END IF;

  -- Refresh queued_at so TTL restarts and mint an unsubscribe_token if missing
  payload := jsonb_set(payload, '{queued_at}', to_jsonb(now()::text), true);
  IF (payload->>'unsubscribe_token') IS NULL AND (payload->>'to') IS NOT NULL THEN
    DECLARE
      tok text;
      recipient text := lower(payload->>'to');
    BEGIN
      SELECT token INTO tok FROM public.email_unsubscribe_tokens WHERE lower(email) = recipient LIMIT 1;
      IF tok IS NULL THEN
        tok := gen_random_uuid()::text;
        INSERT INTO public.email_unsubscribe_tokens(token, email) VALUES (tok, recipient)
        ON CONFLICT DO NOTHING;
      END IF;
      payload := jsonb_set(payload, '{unsubscribe_token}', to_jsonb(tok), true);
    END;
  END IF;

  new_id := pgmq.send(target_queue, payload);
  PERFORM pgmq.delete(_dlq, _msg_id);

  INSERT INTO public.email_send_log(message_id, template_name, recipient_email, status, error_message, metadata)
  VALUES (payload->>'message_id', COALESCE(payload->>'label', target_queue), payload->>'to', 'pending',
          'retried from ' || _dlq || ' by ' || caller_email,
          jsonb_build_object('retried_by', caller_email, 'source_dlq', _dlq, 'source_msg_id', _msg_id));

  RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_email_dlq(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_retry_email_dlq(text, bigint) TO authenticated;
