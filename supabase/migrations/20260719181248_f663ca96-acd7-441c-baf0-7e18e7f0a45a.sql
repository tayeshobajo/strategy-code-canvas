ALTER TABLE public.engine_projects ADD COLUMN IF NOT EXISTS intake_summary text;

-- Backfill from the most recent completed extraction run per project
UPDATE public.engine_projects p
SET intake_summary = sub.intake_summary
FROM (
  SELECT DISTINCT ON (project_id) project_id, intake_summary
  FROM public.engine_extraction_runs
  WHERE intake_summary IS NOT NULL AND length(trim(intake_summary)) > 0
  ORDER BY project_id, created_at DESC
) sub
WHERE p.id = sub.project_id
  AND (p.intake_summary IS NULL OR length(trim(p.intake_summary)) = 0);