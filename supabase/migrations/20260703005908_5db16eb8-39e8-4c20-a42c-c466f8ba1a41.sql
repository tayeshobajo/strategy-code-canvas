
-- 1. Telemetry columns
ALTER TABLE public.client_portal_files
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS download_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_downloaded_at timestamptz;

-- 2. Client-side helper: log a file view or download event.
CREATE OR REPLACE FUNCTION public.log_portal_file_event(
  _file_id uuid,
  _event text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_email text := lower(coalesce(auth.email(), ''));
  file_row public.client_portal_files%ROWTYPE;
  has_access boolean;
  now_ts timestamptz := now();
  summary_txt text;
BEGIN
  IF caller_email = '' THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF _event NOT IN ('viewed', 'downloaded') THEN
    RAISE EXCEPTION 'Invalid event: %', _event;
  END IF;

  SELECT * INTO file_row FROM public.client_portal_files WHERE id = _file_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'File not found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.client_portal_permissions
    WHERE project_id = file_row.project_id
      AND lower(email) = caller_email
      AND revoked_at IS NULL
  ) INTO has_access;
  IF NOT has_access THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF _event = 'viewed' THEN
    UPDATE public.client_portal_files
    SET view_count = view_count + 1,
        last_viewed_at = now_ts,
        updated_at = now_ts
    WHERE id = _file_id;
    summary_txt := 'You previewed ' || file_row.file_name;
  ELSE
    UPDATE public.client_portal_files
    SET download_count = download_count + 1,
        last_downloaded_at = now_ts,
        updated_at = now_ts
    WHERE id = _file_id;
    summary_txt := 'You downloaded ' || file_row.file_name;
  END IF;

  RETURN public.log_client_portal_activity(
    file_row.project_id,
    'client',
    caller_email,
    'file_' || _event,
    summary_txt,
    true,
    jsonb_build_object('file_id', _file_id, 'file_name', file_row.file_name, 'category', file_row.category)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_portal_file_event(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.log_portal_file_event(uuid, text) TO authenticated;

-- 3. Operator: mark workspace as needing client follow-up.
CREATE OR REPLACE FUNCTION public.mark_portal_follow_up_needed(
  _project_id uuid,
  _reason text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_email text := lower(coalesce(auth.email(), ''));
  message_id uuid;
  activity_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.client_portal_is_operator(caller_email)) THEN
    RAISE EXCEPTION 'Forbidden: operator role required';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'Reason is required';
  END IF;

  INSERT INTO public.client_portal_messages(
    project_id, sender_type, author_email, subject, body,
    message_type, action_required, visible_to_client,
    metadata
  ) VALUES (
    _project_id, 'tai', caller_email,
    'Action needed', _reason,
    'action_item', true, true,
    jsonb_build_object('kind', 'follow_up_needed')
  )
  RETURNING id INTO message_id;

  activity_id := public.log_client_portal_activity(
    _project_id, 'tai', caller_email,
    'follow_up_needed',
    'Trust Tai flagged an item that needs your attention.',
    true,
    jsonb_build_object('message_id', message_id, 'reason', _reason)
  );

  RETURN activity_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_portal_follow_up_needed(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_portal_follow_up_needed(uuid, text) TO authenticated;

-- 4. Client or operator: resolve a follow-up (completes linked action item).
CREATE OR REPLACE FUNCTION public.resolve_portal_follow_up(
  _message_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_email text := lower(coalesce(auth.email(), ''));
  msg public.client_portal_messages%ROWTYPE;
  has_access boolean;
BEGIN
  IF caller_email = '' THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  SELECT * INTO msg FROM public.client_portal_messages WHERE id = _message_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message not found';
  END IF;

  SELECT (public.client_portal_is_operator(caller_email)
       OR EXISTS (
        SELECT 1 FROM public.client_portal_permissions
         WHERE project_id = msg.project_id
           AND lower(email) = caller_email
           AND revoked_at IS NULL
      )) INTO has_access;
  IF NOT has_access THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.client_portal_messages
  SET action_completed_at = now(),
      updated_at = now()
  WHERE id = _message_id
    AND action_completed_at IS NULL;

  PERFORM public.log_client_portal_activity(
    msg.project_id, 'client', caller_email,
    'follow_up_resolved',
    'Follow-up item marked as resolved.',
    true,
    jsonb_build_object('message_id', _message_id)
  );

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_portal_follow_up(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.resolve_portal_follow_up(uuid) TO authenticated;
