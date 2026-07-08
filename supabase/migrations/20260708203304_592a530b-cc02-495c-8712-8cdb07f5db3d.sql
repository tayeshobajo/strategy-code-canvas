-- ============================================================================
-- Momentum triad — backend (retry #3)
-- Fix: replace RECORD locals that may stay unassigned with scalar locals.
-- ============================================================================

ALTER TABLE public.engine_tasks
  ADD COLUMN IF NOT EXISTS purpose text,
  ADD COLUMN IF NOT EXISTS expected_artifact text,
  ADD COLUMN IF NOT EXISTS qa_checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS dependency_notes text,
  ADD COLUMN IF NOT EXISTS risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_generated boolean NOT NULL DEFAULT false;

DROP TRIGGER IF EXISTS agent_task_notify_blocked ON public.engine_agent_tasks;
DROP FUNCTION IF EXISTS public.tg_agent_task_notify_blocked();

CREATE OR REPLACE FUNCTION public.tg_task_notify_blocked()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE proj_id uuid; proj_name text;
BEGIN
  IF NEW.status <> 'blocked' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'blocked' THEN RETURN NEW; END IF;
  SELECT id, name INTO proj_id, proj_name FROM public.engine_projects WHERE id = NEW.project_id LIMIT 1;
  IF proj_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.operator_notifications(kind, title, body, href, metadata)
  VALUES ('task_blocked', proj_name || ' — task blocked',
          COALESCE(NEW.name, 'A task is blocked and needs operator input.'),
          '/engine/projects/' || proj_id || '/agent/tasks',
          jsonb_build_object('engine_project_id', proj_id, 'task_id', NEW.id));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_task_notify_blocked failed: %', SQLERRM;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS task_notify_blocked ON public.engine_tasks;
CREATE TRIGGER task_notify_blocked
AFTER INSERT OR UPDATE OF status ON public.engine_tasks
FOR EACH ROW EXECUTE FUNCTION public.tg_task_notify_blocked();

CREATE OR REPLACE FUNCTION public.compute_engine_next_best_action(_project_id uuid)
RETURNS TABLE (action text, reason text, href text, severity text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
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

  SELECT id, status, label INTO ver_id, ver_status, ver_label
    FROM public.engine_roadmap_versions WHERE project_id = _project_id ORDER BY created_at DESC LIMIT 1;

  IF ver_id IS NOT NULL AND ver_status IN ('ai_generated','draft','tai_edited') THEN
    RETURN QUERY SELECT 'Review AI-drafted roadmap'::text,
      'Draft ' || COALESCE(ver_label, '') || ' is waiting for review.',
      ('/engine/projects/' || _project_id || '/reviews')::text, 'warning'::text; RETURN;
  END IF;

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

  IF investment_at IS NULL THEN
    RETURN QUERY SELECT 'Confirm investment plan'::text,
      'Investment budget has not been confirmed yet.'::text,
      ('/engine/projects/' || _project_id || '/investment')::text, 'info'::text; RETURN;
  END IF;

  RETURN QUERY SELECT 'Nothing waiting'::text,
    'All gates clear — move to the next execution milestone.'::text,
    ('/engine/projects/' || _project_id || '/overview')::text, 'info'::text;
END; $$;

GRANT EXECUTE ON FUNCTION public.compute_engine_next_best_action(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.recompute_engine_project_state(_project_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  cur_status public.engine_project_status;
  portal_pid uuid; investment_at timestamptz;
  new_status public.engine_project_status; new_step_num smallint; new_step_label text;
  run_id uuid; run_status text; run_started timestamptz;
  pending_sources int := 0; failed_sources int := 0; total_sources int := 0;
  signals_count int := 0; pending_review int := 0; blocked_tasks int := 0;
  ver_id uuid; ver_status text;
  publish_id uuid; publish_status text;
  has_phased_ms boolean;
BEGIN
  SELECT status, client_portal_project_id, investment_confirmed_at
    INTO cur_status, portal_pid, investment_at
    FROM public.engine_projects WHERE id = _project_id;
  IF cur_status IS NULL THEN RETURN; END IF;
  IF cur_status = 'archived' THEN RETURN; END IF;

  SELECT id, status, started_at INTO run_id, run_status, run_started
    FROM public.engine_extraction_runs WHERE project_id = _project_id
    ORDER BY started_at DESC NULLS LAST, created_at DESC LIMIT 1;

  SELECT count(*),
         count(*) FILTER (WHERE status IN ('queued','processing')),
         count(*) FILTER (WHERE status = 'failed')
    INTO total_sources, pending_sources, failed_sources
    FROM public.engine_sources WHERE project_id = _project_id;

  SELECT count(*) INTO signals_count FROM public.engine_extracted_signals WHERE project_id = _project_id;
  SELECT count(*) INTO pending_review FROM public.engine_review_items WHERE project_id = _project_id AND status = 'pending';
  SELECT count(*) INTO blocked_tasks FROM public.engine_tasks WHERE project_id = _project_id AND status = 'blocked';

  SELECT id, status INTO ver_id, ver_status FROM public.engine_roadmap_versions
    WHERE project_id = _project_id ORDER BY created_at DESC LIMIT 1;

  IF portal_pid IS NOT NULL THEN
    SELECT id, status INTO publish_id, publish_status FROM public.client_portal_roadmaps
      WHERE project_id = portal_pid ORDER BY updated_at DESC LIMIT 1;
  END IF;

  IF blocked_tasks > 0 OR (run_id IS NOT NULL AND run_status = 'failed') OR failed_sources > 0 THEN
    new_status := 'blocked';
  ELSIF publish_id IS NOT NULL AND publish_status = 'delivered' THEN
    new_status := 'delivered';
  ELSIF publish_id IS NOT NULL AND publish_status = 'approved' THEN
    new_status := 'in_execution';
  ELSIF ver_id IS NOT NULL AND ver_status = 'approved' THEN
    new_status := 'approved';
  ELSIF pending_review > 0 OR (ver_id IS NOT NULL AND ver_status IN ('ai_generated','draft','tai_edited')) THEN
    new_status := 'needs_review';
  ELSIF signals_count > 0 THEN
    new_status := 'active';
  ELSIF total_sources > 0 AND (pending_sources > 0 OR (run_id IS NOT NULL AND run_status = 'running')) THEN
    new_status := 'source_processing';
  ELSE
    new_status := 'intake';
  END IF;

  IF publish_id IS NOT NULL AND publish_status IN ('approved','delivered') THEN
    new_step_num := 14; new_step_label := 'Delivery Prep';
  ELSIF ver_id IS NOT NULL AND ver_status = 'approved' THEN
    new_step_num := 13; new_step_label := 'Client Preview';
  ELSIF investment_at IS NOT NULL THEN
    new_step_num := 13; new_step_label := 'Client Preview';
  ELSIF ver_id IS NOT NULL AND ver_status IN ('ai_generated','draft','tai_edited') THEN
    SELECT EXISTS (SELECT 1 FROM public.engine_milestones WHERE project_id = _project_id AND phase IS NOT NULL) INTO has_phased_ms;
    IF has_phased_ms THEN new_step_num := 10; new_step_label := 'Sequencing';
    ELSE new_step_num := 9; new_step_label := 'Roadmap Builder'; END IF;
  ELSIF signals_count > 0 THEN
    new_step_num := 4; new_step_label := 'Point A Diagnosis';
  ELSIF run_id IS NOT NULL AND run_status = 'succeeded' THEN
    new_step_num := 3; new_step_label := 'Signal Extraction';
  ELSIF total_sources > 0 THEN
    new_step_num := 2; new_step_label := 'Signal Room';
  ELSE
    new_step_num := 1; new_step_label := 'Intelligence Layer';
  END IF;

  UPDATE public.engine_projects
     SET status = new_status,
         current_step_num = new_step_num,
         current_step = new_step_label,
         last_activity_at = now(),
         updated_at = now()
   WHERE id = _project_id
     AND (status IS DISTINCT FROM new_status
       OR current_step_num IS DISTINCT FROM new_step_num
       OR current_step IS DISTINCT FROM new_step_label);
END; $$;

GRANT EXECUTE ON FUNCTION public.recompute_engine_project_state(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_recompute_project_state_from_project_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE pid uuid;
BEGIN
  pid := COALESCE((NEW).project_id, (OLD).project_id);
  IF pid IS NOT NULL THEN PERFORM public.recompute_engine_project_state(pid); END IF;
  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_recompute_project_state failed: %', SQLERRM; RETURN COALESCE(NEW, OLD);
END; $$;

CREATE OR REPLACE FUNCTION public.tg_recompute_project_state_from_portal_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE epid uuid; portal_pid uuid;
BEGIN
  portal_pid := COALESCE((NEW).project_id, (OLD).project_id);
  IF portal_pid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT id INTO epid FROM public.engine_projects WHERE client_portal_project_id = portal_pid LIMIT 1;
  IF epid IS NOT NULL THEN PERFORM public.recompute_engine_project_state(epid); END IF;
  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_recompute_project_state_from_portal failed: %', SQLERRM; RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS recompute_state_sources ON public.engine_sources;
CREATE TRIGGER recompute_state_sources AFTER INSERT OR UPDATE OF status OR DELETE ON public.engine_sources
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_project_state_from_project_id();

DROP TRIGGER IF EXISTS recompute_state_extraction_runs ON public.engine_extraction_runs;
CREATE TRIGGER recompute_state_extraction_runs AFTER INSERT OR UPDATE OF status ON public.engine_extraction_runs
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_project_state_from_project_id();

DROP TRIGGER IF EXISTS recompute_state_signals ON public.engine_extracted_signals;
CREATE TRIGGER recompute_state_signals AFTER INSERT OR DELETE ON public.engine_extracted_signals
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_project_state_from_project_id();

DROP TRIGGER IF EXISTS recompute_state_versions ON public.engine_roadmap_versions;
CREATE TRIGGER recompute_state_versions AFTER INSERT OR UPDATE OF status, published_to_portal_at ON public.engine_roadmap_versions
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_project_state_from_project_id();

DROP TRIGGER IF EXISTS recompute_state_review_items ON public.engine_review_items;
CREATE TRIGGER recompute_state_review_items AFTER INSERT OR UPDATE OF status OR DELETE ON public.engine_review_items
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_project_state_from_project_id();

DROP TRIGGER IF EXISTS recompute_state_tasks ON public.engine_tasks;
CREATE TRIGGER recompute_state_tasks AFTER INSERT OR UPDATE OF status ON public.engine_tasks
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_project_state_from_project_id();

DROP TRIGGER IF EXISTS recompute_state_portal_roadmaps ON public.client_portal_roadmaps;
CREATE TRIGGER recompute_state_portal_roadmaps AFTER INSERT OR UPDATE OF status ON public.client_portal_roadmaps
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_project_state_from_portal_row();

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.engine_projects WHERE status <> 'archived' LOOP
    PERFORM public.recompute_engine_project_state(r.id);
  END LOOP;
END $$;