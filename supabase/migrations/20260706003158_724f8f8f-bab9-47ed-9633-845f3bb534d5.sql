-- Pillar 11: enforce task→milestone linkage.
-- Zero orphan rows exist today; safe to tighten in-place.

ALTER TABLE public.engine_tasks
  ALTER COLUMN milestone_id SET NOT NULL;

ALTER TABLE public.engine_tasks
  DROP CONSTRAINT IF EXISTS engine_tasks_milestone_id_fkey;

ALTER TABLE public.engine_tasks
  ADD CONSTRAINT engine_tasks_milestone_id_fkey
  FOREIGN KEY (milestone_id)
  REFERENCES public.engine_milestones(id)
  ON DELETE CASCADE;