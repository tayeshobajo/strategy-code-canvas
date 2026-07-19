ALTER TABLE public.engine_spine_field_truth
  DROP CONSTRAINT IF EXISTS engine_spine_field_truth_spine_check;

ALTER TABLE public.engine_spine_field_truth
  ADD CONSTRAINT engine_spine_field_truth_spine_check
  CHECK (spine = ANY (ARRAY[
    'point-a',
    'point-b',
    'world-entry',
    'execution-boundary',
    'strategic-thesis',
    'drift-assessment',
    'constraints-risks',
    'assets-leverage',
    'hidden-assets',
    'gap-map',
    'blueprint',
    'approved-scope',
    'sequencing',
    'milestone-readiness'
  ]));