
-- 1) NBA precedence fix: check version status BEFORE source/signal branches so
--    an approved-but-unpublished or AI-drafted project surfaces the right next move.
-- 2) Add engine_tasks.phase (text) mirroring engine_milestones.phase, backfilled.

ALTER TABLE public.engine_tasks
  ADD COLUMN IF NOT EXISTS phase text;

UPDATE public.engine_tasks t
   SET phase = m.phase
  FROM public.engine_milestones m
 WHERE t.milestone_id = m.id
   AND t.phase IS DISTINCT FROM m.phase;

CREATE OR REPLACE FUNCTION public.compute_engine_next_best_action(_project_id uuid)
 RETURNS TABLE(action text, reason text, href text, severity text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  proj_name text; portal_pid uuid; investment_at timestamptz;
  run_id uuid; run_status text; run_error text; run_started timestamptz;
  pending_sources int := 0; failed_sources int := 0;
  signals_count int := 0; pending_review int := 0;
  blocked_tasks int := 0; client_action int := 0;
  ver_id uuid; ver_status text; ver_label text;
  publish_id uuid; publish_status text;
BEGIN
  SELECT name, client_portal_project_id, investment_confirmed_at
    INTO proj_name, portal_pid, investment_at
    FROM public.engine_projects WHERE id = _project_id;
  IF proj_name IS NULL THEN
    RETURN QUERY SELECT 'Project not found'::text, 'No project row.'::text, NULL::text, 'critical'::text; RETURN;
  END IF;

  SELECT id, status, error, started_at INTO run_id, run_status, run_error, run_started
    FROM public.engine_extraction_runs WHERE project_id = _project_id
    ORDER BY started_at DESC NULLS LAST, created_at DESC LIMIT 1;

  -- Critical operator-attention branches first (unchanged)
  IF run_id IS NOT NULL AND run_status = 'failed' THEN
    RETURN QUERY SELECT 'Retry the failed extraction run'::text,
      COALESCE('Last run failed: ' || run_error, 'Last extraction run failed.'),
      ('/engine/projects/' || _project_id || '/intake')::text, 'critical'::text; RETURN;
  END IF;
  IF run_id IS NOT NULL AND run_status = 'running' AND run_started < now() - interval '10 minutes' THEN
    RETURN QUERY SELECT 'Investigate stalled extraction run'::text,
      'Extraction run has been running longer than 10 minutes.'::text,
      ('/engine/projects/' || _project_id || '/intake')::text, 'critical'::text; RETURN;
  END IF;

  SELECT count(*) INTO blocked_tasks FROM public.engine_tasks WHERE project_id = _project_id AND status = 'blocked';
  IF blocked_tasks > 0 THEN
    RETURN QUERY SELECT 'Unblock ' || blocked_tasks || ' task' || CASE WHEN blocked_tasks = 1 THEN '' ELSE 's' END,
      'Tasks are blocked and need operator input.'::text,
      ('/engine/projects/' || _project_id || '/agent/tasks')::text, 'warning'::text; RETURN;
  END IF;

  IF portal_pid IS NOT NULL THEN
    SELECT count(*) INTO client_action FROM public.client_portal_messages
      WHERE project_id = portal_pid AND sender_type = 'client'
        AND action_required IS TRUE AND action_completed_at IS NULL;
    IF client_action > 0 THEN
      RETURN QUERY SELECT 'Respond to ' || client_action || ' client message' || CASE WHEN client_action = 1 THEN '' ELSE 's' END,
        'Client is waiting for a response in the portal.'::text,
        ('/engine/projects/' || _project_id || '/overview')::text, 'warning'::text; RETURN;
    END IF;
  END IF;

  SELECT count(*) INTO pending_review FROM public.engine_review_items
    WHERE project_id = _project_id AND status = 'pending';
  IF pending_review > 0 THEN
    RETURN QUERY SELECT 'Review ' || pending_review || ' pending item' || CASE WHEN pending_review = 1 THEN '' ELSE 's' END,
      'Review items are waiting for a decision.'::text,
      ('/engine/projects/' || _project_id || '/reviews')::text, 'warning'::text; RETURN;
  END IF;

  -- Version-status branches MOVED UP: an approved or AI-drafted version should
  -- drive the next move even if source/signal state is stale.
  SELECT id, status, label INTO ver_id, ver_status, ver_label
    FROM public.engine_roadmap_versions WHERE project_id = _project_id ORDER BY created_at DESC LIMIT 1;

  IF ver_id IS NOT NULL AND ver_status = 'approved' THEN
    IF portal_pid IS NOT NULL THEN
      SELECT id, status INTO publish_id, publish_status FROM public.client_portal_roadmaps
        WHERE project_id = portal_pid ORDER BY updated_at DESC LIMIT 1;
      IF publish_id IS NULL OR publish_status NOT IN ('approved','delivered') THEN
        RETURN QUERY SELECT 'Publish approved roadmap to client portal'::text,
          'Roadmap ' || COALESCE(ver_label, '') || ' is approved but not yet published.',
          ('/engine/projects/' || _project_id || '/delivery')::text, 'warning'::text; RETURN;
      END IF;
    ELSE
      RETURN QUERY SELECT 'Link a client portal project'::text,
        'Approved roadmap has no client portal project to publish to.'::text,
        ('/engine/projects/' || _project_id || '/delivery')::text, 'warning'::text; RETURN;
    END IF;
  END IF;

  IF ver_id IS NOT NULL AND ver_status IN ('ai_generated','draft','tai_edited') THEN
    RETURN QUERY SELECT 'Review AI-drafted roadmap'::text,
      'Draft ' || COALESCE(ver_label, '') || ' is waiting for review.',
      ('/engine/projects/' || _project_id || '/reviews')::text, 'warning'::text; RETURN;
  END IF;

  -- Source/signal branches only reached if no version exists yet.
  SELECT count(*) FILTER (WHERE status IN ('queued','processing')),
         count(*) FILTER (WHERE status = 'failed')
    INTO pending_sources, failed_sources
    FROM public.engine_sources WHERE project_id = _project_id;
  IF failed_sources > 0 THEN
    RETURN QUERY SELECT 'Retry ' || failed_sources || ' failed source' || CASE WHEN failed_sources = 1 THEN '' ELSE 's' END,
      'One or more intake sources failed to extract.'::text,
      ('/engine/projects/' || _project_id || '/signal-room')::text, 'critical'::text; RETURN;
  END IF;
  IF pending_sources > 0 THEN
    RETURN QUERY SELECT 'Waiting on extraction'::text,
      pending_sources || ' source' || CASE WHEN pending_sources = 1 THEN '' ELSE 's' END || ' still processing.',
      ('/engine/projects/' || _project_id || '/intake')::text, 'info'::text; RETURN;
  END IF;

  SELECT count(*) INTO signals_count FROM public.engine_extracted_signals WHERE project_id = _project_id;
  IF signals_count = 0 THEN
    RETURN QUERY SELECT 'Run the intelligence pipeline'::text,
      'No extracted signals yet — run pipeline to generate a draft roadmap.'::text,
      ('/engine/projects/' || _project_id || '/intelligence')::text, 'info'::text; RETURN;
  END IF;

  IF investment_at IS NULL THEN
    RETURN QUERY SELECT 'Confirm investment plan'::text,
      'Investment budget has not been confirmed yet.'::text,
      ('/engine/projects/' || _project_id || '/investment')::text, 'info'::text; RETURN;
  END IF;

  RETURN QUERY SELECT 'Nothing waiting'::text,
    'All gates clear — move to the next execution milestone.'::text,
    ('/engine/projects/' || _project_id || '/overview')::text, 'info'::text;
END; $function$;
