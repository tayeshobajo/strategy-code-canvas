
-- P2-8: Per-step state machine on engine_projects
ALTER TABLE public.engine_projects
  ADD COLUMN IF NOT EXISTS step_states jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.engine_projects.step_states IS
  'Per-step state map: { "<step-key>": { "state": "draft|review|approved", "updated_at": iso, "updated_by": email, "note": text? } }';

-- P2-9: Source evidence for milestones + reorder log
ALTER TABLE public.engine_milestones
  ADD COLUMN IF NOT EXISTS source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.engine_milestones.source_evidence IS
  'Array of { source_id?, signal_id?, snippet, category? } linking a milestone back to raw intelligence.';

-- P2-10: Extend signal category enum with two spec-required categories
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'business_model'
                 AND enumtypid = 'public.engine_signal_category'::regtype) THEN
    ALTER TYPE public.engine_signal_category ADD VALUE 'business_model';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'current_system'
                 AND enumtypid = 'public.engine_signal_category'::regtype) THEN
    ALTER TYPE public.engine_signal_category ADD VALUE 'current_system';
  END IF;
END $$;
