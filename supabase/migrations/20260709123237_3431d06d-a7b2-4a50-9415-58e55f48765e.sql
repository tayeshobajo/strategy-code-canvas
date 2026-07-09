
-- Action Mode v3
-- 1. Project-level opt-in flag
ALTER TABLE public.engine_projects
  ADD COLUMN IF NOT EXISTS action_mode_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS action_mode_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS action_mode_updated_by text;

-- 2. Internal artifact table (staff-only, mutations via server functions only)
CREATE TABLE IF NOT EXISTS public.engine_project_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  thread_id uuid,
  source_proposal_id uuid REFERENCES public.engine_project_chat_proposals(id) ON DELETE SET NULL,
  artifact_type text NOT NULL CHECK (artifact_type IN (
    'client_clarification_draft',
    'implementation_prompt',
    'qa_checklist',
    'milestone_brief',
    'decision_note'
  )),
  title text NOT NULL,
  summary text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'saved' CHECK (status IN ('draft','saved','submitted_for_review','archived')),
  created_by_user_id uuid,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Grants: read for authenticated (RLS narrows to staff); no writes for
-- authenticated (mutations happen through server functions using the
-- service role, matching the hardened chat-proposal pattern).
GRANT SELECT ON public.engine_project_artifacts TO authenticated;
GRANT ALL ON public.engine_project_artifacts TO service_role;

REVOKE INSERT, UPDATE, DELETE ON public.engine_project_artifacts FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.engine_project_artifacts FROM anon;

ALTER TABLE public.engine_project_artifacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view artifacts" ON public.engine_project_artifacts;
CREATE POLICY "Staff can view artifacts"
  ON public.engine_project_artifacts
  FOR SELECT
  TO authenticated
  USING (public.is_engine_staff());

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_engine_project_artifacts_updated_at ON public.engine_project_artifacts;
CREATE TRIGGER trg_engine_project_artifacts_updated_at
  BEFORE UPDATE ON public.engine_project_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_engine_project_artifacts_project_created
  ON public.engine_project_artifacts (project_id, artifact_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_engine_project_artifacts_proposal
  ON public.engine_project_artifacts (source_proposal_id)
  WHERE source_proposal_id IS NOT NULL;
