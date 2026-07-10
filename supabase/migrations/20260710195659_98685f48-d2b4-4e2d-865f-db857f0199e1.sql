-- ============================================================
-- Watchdog timeout: 20 minutes → 30 minutes
-- ============================================================
CREATE OR REPLACE FUNCTION public.engine_extraction_watchdog()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  stuck_run RECORD;
  reset_count integer := 0;
BEGIN
  FOR stuck_run IN
    SELECT id, project_id, started_at
    FROM public.engine_extraction_runs
    WHERE status = 'running'
      AND started_at IS NOT NULL
      AND started_at < now() - interval '30 minutes'
  LOOP
    UPDATE public.engine_extraction_runs
    SET status = 'failed',
        error = COALESCE(error, 'Watchdog: run exceeded 30-minute timeout without completion.'),
        finished_at = now(),
        updated_at = now()
    WHERE id = stuck_run.id
      AND status = 'running';

    UPDATE public.engine_sources
    SET status = 'failed',
        error = COALESCE(error, 'Watchdog: linked extraction run exceeded 30-minute timeout.'),
        updated_at = now()
    WHERE project_id = stuck_run.project_id
      AND status = 'processing';

    UPDATE public.engine_projects
    SET status = 'intake',
        last_activity_at = now(),
        updated_at = now()
    WHERE id = stuck_run.project_id
      AND status = 'source_processing';

    INSERT INTO public.engine_activity (project_id, kind, title, body, severity)
    VALUES (
      stuck_run.project_id,
      'pipeline_timed_out',
      'Intelligence run auto-failed by watchdog',
      format('Extraction run %s exceeded 30 minutes without completion and was marked failed.', stuck_run.id),
      'critical'
    );

    reset_count := reset_count + 1;
  END LOOP;

  RETURN reset_count;
END;
$$;

REVOKE ALL ON FUNCTION public.engine_extraction_watchdog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.engine_extraction_watchdog() TO service_role;

-- ============================================================
-- New extraction run row whenever a source is reset to 'queued'
-- ============================================================
CREATE OR REPLACE FUNCTION public.engine_source_reset_new_run()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'queued' AND (OLD.status IS DISTINCT FROM 'queued') THEN
    INSERT INTO public.engine_extraction_runs (project_id, source_id, status)
    VALUES (NEW.project_id, NEW.id, 'pending');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.engine_source_reset_new_run() FROM PUBLIC;

DROP TRIGGER IF EXISTS engine_source_reset_new_run_trg ON public.engine_sources;
CREATE TRIGGER engine_source_reset_new_run_trg
AFTER UPDATE OF status ON public.engine_sources
FOR EACH ROW
EXECUTE FUNCTION public.engine_source_reset_new_run();