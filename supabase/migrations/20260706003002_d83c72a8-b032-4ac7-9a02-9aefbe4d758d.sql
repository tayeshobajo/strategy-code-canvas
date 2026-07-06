-- Pillar 10: fanout inbound client portal activity into the engine so operators
-- see files/messages inside mission control (not just inside the portal).

-- ── Files: on client upload, log to engine_activity + notify operators ──────
CREATE OR REPLACE FUNCTION public.tg_client_portal_files_fanout_engine()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  engine_proj RECORD;
  notif_title text;
  notif_body text;
  notif_href text;
BEGIN
  -- Only fanout inbound client uploads; skip operator/tai uploads.
  IF NEW.uploaded_by_role IS DISTINCT FROM 'client' THEN
    RETURN NEW;
  END IF;

  SELECT id, name
    INTO engine_proj
    FROM public.engine_projects
   WHERE client_portal_project_id = NEW.project_id
   LIMIT 1;

  IF engine_proj.id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 1. Mission control activity feed
  INSERT INTO public.engine_activity(project_id, kind, title, body, severity)
  VALUES (
    engine_proj.id,
    'client_file_uploaded',
    'Client uploaded: ' || NEW.file_name,
    COALESCE(NEW.category, 'client_uploads'),
    'info'
  );

  -- 2. Operator bell notification
  notif_title := engine_proj.name || ' — client uploaded a file';
  notif_body  := NEW.file_name
                  || COALESCE(' (' || NEW.category || ')', '')
                  || COALESCE(' by ' || NEW.uploaded_by_email, '');
  notif_href  := '/engine/projects/' || engine_proj.id || '/signal-room';

  INSERT INTO public.operator_notifications(kind, title, body, href, metadata)
  VALUES (
    'portal_client_file_uploaded',
    notif_title,
    notif_body,
    notif_href,
    jsonb_build_object(
      'portal_project_id', NEW.project_id,
      'engine_project_id', engine_proj.id,
      'file_id', NEW.id,
      'file_name', NEW.file_name,
      'category', NEW.category,
      'uploaded_by_email', NEW.uploaded_by_email
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never break the client's upload if the fanout fails.
  RAISE WARNING 'tg_client_portal_files_fanout_engine failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS client_portal_files_fanout_engine
  ON public.client_portal_files;
CREATE TRIGGER client_portal_files_fanout_engine
  AFTER INSERT ON public.client_portal_files
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_client_portal_files_fanout_engine();

-- ── Messages: on inbound client message, notify operators ──────────────────
-- engine_activity mirror is already handled by sendPortalMessage /
-- respondToPortalDecision, so this trigger only fans out to the bell.
CREATE OR REPLACE FUNCTION public.tg_client_portal_messages_notify_operators()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  engine_proj RECORD;
  notif_title text;
  notif_body text;
  notif_href text;
  preview text;
  kind_label text;
BEGIN
  -- Only inbound client-authored messages; skip tai/operator/system.
  IF NEW.sender_type IS DISTINCT FROM 'client' THEN
    RETURN NEW;
  END IF;

  SELECT id, name
    INTO engine_proj
    FROM public.engine_projects
   WHERE client_portal_project_id = NEW.project_id
   LIMIT 1;

  IF engine_proj.id IS NULL THEN
    RETURN NEW;
  END IF;

  preview := left(COALESCE(NEW.body, ''), 240);
  kind_label := CASE COALESCE(NEW.message_type, 'reply')
    WHEN 'decision'      THEN 'client decision'
    WHEN 'clarification' THEN 'client clarification'
    WHEN 'action_item'   THEN 'client action item'
    ELSE 'client message'
  END;

  notif_title := engine_proj.name || ' — ' || kind_label;
  notif_body  := COALESCE(NEW.subject, preview);
  notif_href  := '/engine/projects/' || engine_proj.id || '/overview';

  INSERT INTO public.operator_notifications(kind, title, body, href, metadata)
  VALUES (
    'portal_client_' || COALESCE(NEW.message_type, 'reply'),
    notif_title,
    notif_body,
    notif_href,
    jsonb_build_object(
      'portal_project_id', NEW.project_id,
      'engine_project_id', engine_proj.id,
      'message_id', NEW.id,
      'message_type', NEW.message_type,
      'author_email', NEW.author_email,
      'action_required', NEW.action_required
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_client_portal_messages_notify_operators failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS client_portal_messages_notify_operators
  ON public.client_portal_messages;
CREATE TRIGGER client_portal_messages_notify_operators
  AFTER INSERT ON public.client_portal_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_client_portal_messages_notify_operators();