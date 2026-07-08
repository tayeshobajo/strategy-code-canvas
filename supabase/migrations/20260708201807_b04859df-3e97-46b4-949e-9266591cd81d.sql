-- ============================================================================
-- P0 Safety Trio: (1) notification fan-out, (2) portal view cleanup,
-- (3) state-driven Next Best Action
-- ============================================================================

-- ---------------------------------------------------------------------------
-- (2) Rebuild portal_roadmaps_v to drop deprecated supporting_notes column
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.portal_roadmaps_v;

CREATE VIEW public.portal_roadmaps_v
WITH (security_invoker = on) AS
SELECT
  id,
  project_id,
  title,
  version_label,
  status,
  approved_at,
  executive_summary,
  current_diagnosis,
  strategic_priorities,
  sequence_30_60_90,
  risks_dependencies,
  recommended_next_move,
  current_focus,
  owner_name,
  next_milestone,
  next_meeting_at,
  pdf_file_id,
  one_pager_file_id,
  share_url,
  acknowledged_at,
  acknowledged_by_email,
  created_at,
  updated_at
FROM public.client_portal_roadmaps
WHERE status = ANY (ARRAY['approved'::text, 'delivered'::text])
  AND approved_at IS NOT NULL
  AND approved_roadmap_version_id IS NOT NULL;

GRANT SELECT ON public.portal_roadmaps_v TO authenticated;

COMMENT ON VIEW public.portal_roadmaps_v IS
  'Client-safe read of approved/delivered roadmaps. Excludes supporting_notes (internal doctrine only), approved_roadmap_version_id, and any operator/cost/AI-reasoning fields.';

-- ---------------------------------------------------------------------------
-- (1) Notification fan-out from engine_activity + extraction failures
-- ---------------------------------------------------------------------------

-- Any critical/warning engine_activity row becomes an operator notification.
CREATE OR REPLACE FUNCTION public.tg_engine_activity_notify_operators()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj RECORD;
  notif_title text;
BEGIN
  IF NEW.severity NOT IN ('critical', 'warning') THEN
    RETURN NEW;
  END IF;

  SELECT id, name INTO proj FROM public.engine_projects WHERE id = NEW.project_id LIMIT 1;
  IF proj.id IS NULL THEN
    RETURN NEW;
  END IF;

  notif_title := proj.name || ' — ' || COALESCE(NEW.title, NEW.kind);

  INSERT INTO public.operator_notifications(kind, title, body, href, metadata)
  VALUES (
    'engine_activity_' || COALESCE(NEW.severity, 'info'),
    notif_title,
    NEW.body,
    '/engine/projects/' || proj.id || '/overview',
    jsonb_build_object(
      'engine_project_id', proj.id,
      'activity_id', NEW.id,
      'activity_kind', NEW.kind,
      'severity', NEW.severity
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_engine_activity_notify_operators failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS engine_activity_notify_operators ON public.engine_activity;
CREATE TRIGGER engine_activity_notify_operators
AFTER INSERT ON public.engine_activity
FOR EACH ROW EXECUTE FUNCTION public.tg_engine_activity_notify_operators();

-- Failed extraction runs become an operator notification, even if no
-- accompanying engine_activity row is written.
CREATE OR REPLACE FUNCTION public.tg_extraction_run_notify_failure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj RECORD;
BEGIN
  IF NEW.status <> 'failed' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'failed' THEN
    RETURN NEW;
  END IF;

  SELECT id, name INTO proj FROM public.engine_projects WHERE id = NEW.project_id LIMIT 1;
  IF proj.id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.operator_notifications(kind, title, body, href, metadata)
  VALUES (
    'extraction_run_failed',
    proj.name || ' — extraction run failed',
    COALESCE(NEW.error, 'Extraction run marked failed without error message.'),
    '/engine/projects/' || proj.id || '/intake',
    jsonb_build_object(
      'engine_project_id', proj.id,
      'run_id', NEW.id
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_extraction_run_notify_failure failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS extraction_run_notify_failure ON public.engine_extraction_runs;
CREATE TRIGGER extraction_run_notify_failure
AFTER INSERT OR UPDATE OF status ON public.engine_extraction_runs
FOR EACH ROW EXECUTE FUNCTION public.tg_extraction_run_notify_failure();

-- Blocked agent tasks become an operator notification (silent-block fix).
CREATE OR REPLACE FUNCTION public.tg_agent_task_notify_blocked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj RECORD;
BEGIN
  IF NEW.status <> 'blocked' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'blocked' THEN
    RETURN NEW;
  END IF;

  SELECT id, name INTO proj FROM public.engine_projects WHERE id = NEW.project_id LIMIT 1;
  IF proj.id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.operator_notifications(kind, title, body, href, metadata)
  VALUES (
    'agent_task_blocked',
    proj.name || ' — agent task blocked',
    COALESCE(NEW.title, 'An agent task is blocked and needs operator input.'),
    '/engine/projects/' || proj.id || '/agent/tasks',
    jsonb_build_object(
      'engine_project_id', proj.id,
      'task_id', NEW.id
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_agent_task_notify_blocked failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agent_task_notify_blocked ON public.engine_agent_tasks;
CREATE TRIGGER agent_task_notify_blocked
AFTER INSERT OR UPDATE OF status ON public.engine_agent_tasks
FOR EACH ROW EXECUTE FUNCTION public.tg_agent_task_notify_blocked();

-- ---------------------------------------------------------------------------
-- (3) State-driven Next Best Action recompute
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_engine_next_best_action(_project_id uuid)
RETURNS TABLE (
  action text,
  reason text,
  href text,
  severity text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj                RECORD;
  latest_run          RECORD;
  pending_sources     integer;
  failed_sources      integer;
  signals_count       integer;
  pending_review      integer;
  blocked_tasks       integer;
  needs_review_tasks  integer;
  client_action       integer;
  latest_version      RECORD;
  publish_row         RECORD;
BEGIN
  SELECT id, name, status, current_step_num, client_portal_project_id,
         approved_version, roadmap_version, investment_confirmed_at
    INTO proj
    FROM public.engine_projects
   WHERE id = _project_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'Project not found'::text,
      'No project row for this id.'::text,
      NULL::text,
      'critical'::text;
    RETURN;
  END IF;

  -- 1. Failed / stalled extraction takes priority
  SELECT id, status, error, started_at, finished_at
    INTO latest_run
    FROM public.engine_extraction_runs
   WHERE project_id = _project_id
   ORDER BY started_at DESC NULLS LAST, created_at DESC
   LIMIT 1;

  IF latest_run.id IS NOT NULL AND latest_run.status = 'failed' THEN
    RETURN QUERY SELECT
      'Retry the failed extraction run'::text,
      COALESCE('Last run failed: ' || latest_run.error, 'Last extraction run failed.'),
      ('/engine/projects/' || _project_id || '/intake')::text,
      'critical'::text;
    RETURN;
  END IF;

  IF latest_run.id IS NOT NULL
     AND latest_run.status = 'running'
     AND latest_run.started_at < now() - interval '10 minutes' THEN
    RETURN QUERY SELECT
      'Investigate stalled extraction run'::text,
      'Extraction run has been running longer than 10 minutes.'::text,
      ('/engine/projects/' || _project_id || '/intake')::text,
      'critical'::text;
    RETURN;
  END IF;

  -- 2. Blocked agent tasks
  SELECT count(*) INTO blocked_tasks
    FROM public.engine_agent_tasks
   WHERE project_id = _project_id AND status = 'blocked';
  IF blocked_tasks > 0 THEN
    RETURN QUERY SELECT
      'Unblock ' || blocked_tasks || ' agent task' || CASE WHEN blocked_tasks = 1 THEN '' ELSE 's' END,
      'Agent tasks are blocked and need operator input.'::text,
      ('/engine/projects/' || _project_id || '/agent/tasks')::text,
      'warning'::text;
    RETURN;
  END IF;

  -- 3. Client action required in portal
  IF proj.client_portal_project_id IS NOT NULL THEN
    SELECT count(*) INTO client_action
      FROM public.client_portal_messages
     WHERE project_id = proj.client_portal_project_id
       AND sender_type = 'client'
       AND action_required IS TRUE
       AND action_completed_at IS NULL;
    IF client_action > 0 THEN
      RETURN QUERY SELECT
        'Respond to ' || client_action || ' client message' || CASE WHEN client_action = 1 THEN '' ELSE 's' END,
        'Client is waiting for a response in the portal.'::text,
        ('/engine/projects/' || _project_id || '/overview')::text,
        'warning'::text;
      RETURN;
    END IF;
  END IF;

  -- 4. Pending review items
  SELECT count(*) INTO pending_review
    FROM public.engine_review_items
   WHERE project_id = _project_id AND status = 'pending';
  IF pending_review > 0 THEN
    RETURN QUERY SELECT
      'Review ' || pending_review || ' pending item' || CASE WHEN pending_review = 1 THEN '' ELSE 's' END,
      'Review items are waiting for a decision.'::text,
      ('/engine/projects/' || _project_id || '/reviews')::text,
      'warning'::text;
    RETURN;
  END IF;

  -- 5. Extraction still pending / sources unprocessed
  SELECT count(*) FILTER (WHERE status IN ('queued','processing','pending','running')),
         count(*) FILTER (WHERE status = 'failed')
    INTO pending_sources, failed_sources
    FROM public.engine_sources
   WHERE project_id = _project_id;

  IF failed_sources > 0 THEN
    RETURN QUERY SELECT
      'Retry ' || failed_sources || ' failed source' || CASE WHEN failed_sources = 1 THEN '' ELSE 's' END,
      'One or more intake sources failed to extract.'::text,
      ('/engine/projects/' || _project_id || '/signal-room')::text,
      'critical'::text;
    RETURN;
  END IF;

  IF pending_sources > 0 THEN
    RETURN QUERY SELECT
      'Waiting on extraction'::text,
      pending_sources || ' source' || CASE WHEN pending_sources = 1 THEN '' ELSE 's' END || ' still processing.',
      ('/engine/projects/' || _project_id || '/intake')::text,
      'info'::text;
    RETURN;
  END IF;

  -- 6. If no extracted signals yet, need to run pipeline
  SELECT count(*) INTO signals_count
    FROM public.engine_extracted_signals
   WHERE project_id = _project_id;

  IF signals_count = 0 THEN
    RETURN QUERY SELECT
      'Run the intelligence pipeline'::text,
      'No extracted signals yet — run pipeline to generate a draft roadmap.'::text,
      ('/engine/projects/' || _project_id || '/intelligence')::text,
      'info'::text;
    RETURN;
  END IF;

  -- 7. AI draft roadmap version exists but unapproved?
  SELECT id, status, version_label
    INTO latest_version
    FROM public.engine_roadmap_versions
   WHERE project_id = _project_id
   ORDER BY created_at DESC
   LIMIT 1;

  IF latest_version.id IS NOT NULL AND latest_version.status = 'ai_generated' THEN
    RETURN QUERY SELECT
      'Review AI-drafted roadmap'::text,
      'Draft ' || COALESCE(latest_version.version_label, '') || ' is waiting for review.',
      ('/engine/projects/' || _project_id || '/reviews')::text,
      'warning'::text;
    RETURN;
  END IF;

  -- 8. Approved roadmap not yet published to portal
  IF latest_version.id IS NOT NULL AND latest_version.status = 'approved' THEN
    IF proj.client_portal_project_id IS NOT NULL THEN
      SELECT id, status INTO publish_row
        FROM public.client_portal_roadmaps
       WHERE project_id = proj.client_portal_project_id
       ORDER BY updated_at DESC
       LIMIT 1;
      IF publish_row.id IS NULL OR publish_row.status NOT IN ('approved','delivered') THEN
        RETURN QUERY SELECT
          'Publish approved roadmap to client portal'::text,
          'Roadmap version ' || COALESCE(latest_version.version_label, '') || ' is approved but not yet published.',
          ('/engine/projects/' || _project_id || '/delivery')::text,
          'warning'::text;
        RETURN;
      END IF;
    ELSE
      RETURN QUERY SELECT
        'Link a client portal project'::text,
        'Approved roadmap has no client portal project to publish to.'::text,
        ('/engine/projects/' || _project_id || '/delivery')::text,
        'warning'::text;
      RETURN;
    END IF;
  END IF;

  -- 9. Investment not yet confirmed
  IF proj.investment_confirmed_at IS NULL THEN
    RETURN QUERY SELECT
      'Confirm investment plan'::text,
      'Investment budget has not been confirmed yet.'::text,
      ('/engine/projects/' || _project_id || '/investment')::text,
      'info'::text;
    RETURN;
  END IF;

  -- Default: nothing to do
  RETURN QUERY SELECT
    'Nothing waiting'::text,
    'All gates clear — move to the next execution milestone.'::text,
    ('/engine/projects/' || _project_id || '/overview')::text,
    'info'::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_engine_next_best_action(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_engine_next_best_action(uuid) TO service_role;

COMMENT ON FUNCTION public.compute_engine_next_best_action(uuid) IS
  'Live Next Best Action for an engine project. Considers extraction status, sources, review items, blocked agent tasks, client actions, roadmap version, publish status, and investment. Callers must role-gate — SECURITY DEFINER is used only to bypass RLS on internal tables.';