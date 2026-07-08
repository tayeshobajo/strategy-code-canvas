
-- ============================================================
-- 1. Unblock Mubo's project — data fixes only, no schema changes
-- ============================================================

-- Stuck extraction run: mark failed with a clear operator-facing reason
UPDATE public.engine_extraction_runs
SET status = 'failed',
    error = 'Pipeline abandoned by worker before completion (fire-and-forget lost). Marked failed by operator; project will be re-processed.',
    finished_at = now(),
    updated_at = now()
WHERE id = '3655cb9a-e65f-4088-92a9-7369a4093ddc'
  AND status = 'running';

-- Sources on that project stuck in `processing`
UPDATE public.engine_sources
SET status = 'failed',
    error = COALESCE(error, 'Extraction run was abandoned; source reset.'),
    updated_at = now()
WHERE project_id = '3ade32db-1496-4a34-98ad-b63d3ad522f9'
  AND status = 'processing';

-- Delete the leftover G-3 visibility-test source that landed on this real project
DELETE FROM public.engine_sources
WHERE id = '7ab57976-4442-4cee-a8fc-007661fcd52b'
  AND project_id = '3ade32db-1496-4a34-98ad-b63d3ad522f9';

-- Return the project to `intake` so operators can re-run cleanly
UPDATE public.engine_projects
SET status = 'intake',
    last_activity_at = now(),
    updated_at = now()
WHERE id = '3ade32db-1496-4a34-98ad-b63d3ad522f9'
  AND status = 'source_processing';

-- Audit trail entry so the fix is visible in the workspace activity feed
INSERT INTO public.engine_activity (project_id, kind, title, body, severity)
VALUES (
  '3ade32db-1496-4a34-98ad-b63d3ad522f9',
  'pipeline_recovered',
  'Stuck extraction cleared by operator',
  'The original 2026-07-08 02:05 extraction run was abandoned mid-flight. Row marked failed, source reset, project returned to intake for re-run.',
  'warn'
);

-- ============================================================
-- 2. Watchdog: auto-fail extraction runs that hang > 10 minutes
--    (Follows the same pattern as public.email_queue_dispatch.)
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
      AND started_at < now() - interval '10 minutes'
  LOOP
    UPDATE public.engine_extraction_runs
    SET status = 'failed',
        error = COALESCE(error, 'Watchdog: run exceeded 10-minute timeout without completion.'),
        finished_at = now(),
        updated_at = now()
    WHERE id = stuck_run.id
      AND status = 'running';

    UPDATE public.engine_sources
    SET status = 'failed',
        error = COALESCE(error, 'Watchdog: linked extraction run exceeded 10-minute timeout.'),
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
      format('Extraction run %s exceeded 10 minutes without completion and was marked failed.', stuck_run.id),
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

-- Schedule the watchdog: unschedule any prior version, then arm every 5 minutes
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
