-- ============================================================
-- Watchdog timeout increase: 10 minutes → 20 minutes
--
-- The Gemini+Claude hybrid intelligence pipeline can take longer
-- than 10 minutes on projects with many sources. The 10-minute
-- watchdog was prematurely killing legitimate in-flight runs
-- and marking them failed, causing operators to retry work that
-- was actually still progressing.
--
-- This migration recreates engine_extraction_watchdog() with a
-- 20-minute threshold. The cron schedule (*/5 * * * *) and all
-- other logic are preserved verbatim from:
--   20260708174603_017bfb5d-c8e2-49a3-8170-1e56d9f2e9dc.sql
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
      AND started_at < now() - interval '20 minutes'
  LOOP
    UPDATE public.engine_extraction_runs
    SET status = 'failed',
        error = COALESCE(error, 'Watchdog: run exceeded 20-minute timeout without completion.'),
        finished_at = now(),
        updated_at = now()
    WHERE id = stuck_run.id
      AND status = 'running';

    UPDATE public.engine_sources
    SET status = 'failed',
        error = COALESCE(error, 'Watchdog: linked extraction run exceeded 20-minute timeout.'),
        updated_at = now()
    WHERE project_id = stuck_run.project_id
      AND status = 'processing';

    -- Return the project to intake only if it's still in the transitional
    -- state the pipeline set — never override an operator-truthful state.
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
      format('Extraction run %s exceeded 20 minutes without completion and was marked failed.', stuck_run.id),
      'critical'
    );

    reset_count := reset_count + 1;
  END LOOP;

  RETURN reset_count;
END;
$$;

-- Only the DB itself (and service_role for manual invocation) should call this
REVOKE ALL ON FUNCTION public.engine_extraction_watchdog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.engine_extraction_watchdog() TO service_role;

-- Reschedule the watchdog (unschedule any prior version first, then arm)
DO $$
BEGIN
  PERFORM cron.unschedule('engine-extraction-watchdog');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'engine-extraction-watchdog',
  '*/5 * * * *',
  $cron$ SELECT public.engine_extraction_watchdog(); $cron$
);
