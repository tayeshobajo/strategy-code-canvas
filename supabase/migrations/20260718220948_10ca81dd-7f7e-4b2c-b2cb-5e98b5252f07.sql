CREATE UNIQUE INDEX IF NOT EXISTS engine_roadmap_amendment_dedup_pending
  ON public.engine_project_synthesis_candidates (
    project_id,
    step_id,
    ((payload->'target'->>'truthId')),
    ((payload->'sourceIds'->>0))
  )
  WHERE status = 'pending' AND step_id = 'roadmap_amendment';