
-- 1. Add event_type to chat events for proposal audit trail
ALTER TABLE public.engine_project_chat_events
  ADD COLUMN IF NOT EXISTS event_type text;
CREATE INDEX IF NOT EXISTS engine_project_chat_events_event_type_idx
  ON public.engine_project_chat_events(event_type, created_at DESC);

-- 2. Proposals table
CREATE TABLE public.engine_project_chat_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.engine_project_chat_threads(id) ON DELETE SET NULL,
  source_message_id uuid REFERENCES public.engine_project_chat_messages(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  proposal_type text NOT NULL,
  title text NOT NULL,
  summary text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  target_route text,
  converted_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT engine_project_chat_proposals_type_chk
    CHECK (proposal_type IN (
      'client_clarification','review_item','suggested_task',
      'implementation_prompt','qa_checklist','milestone_brief'
    )),
  CONSTRAINT engine_project_chat_proposals_status_chk
    CHECK (status IN (
      'draft','saved','submitted_for_review','converted','dismissed'
    ))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_project_chat_proposals TO authenticated;
GRANT ALL ON public.engine_project_chat_proposals TO service_role;

ALTER TABLE public.engine_project_chat_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "engine_chat_proposals_staff_select"
  ON public.engine_project_chat_proposals
  FOR SELECT TO authenticated
  USING (public.is_engine_staff());

CREATE POLICY "engine_chat_proposals_staff_insert"
  ON public.engine_project_chat_proposals
  FOR INSERT TO authenticated
  WITH CHECK (public.is_engine_staff());

CREATE POLICY "engine_chat_proposals_staff_update"
  ON public.engine_project_chat_proposals
  FOR UPDATE TO authenticated
  USING (public.is_engine_staff())
  WITH CHECK (public.is_engine_staff());

CREATE POLICY "engine_chat_proposals_staff_delete"
  ON public.engine_project_chat_proposals
  FOR DELETE TO authenticated
  USING (public.is_engine_staff());

CREATE INDEX engine_chat_proposals_project_created_idx
  ON public.engine_project_chat_proposals(project_id, created_at DESC);
CREATE INDEX engine_chat_proposals_thread_idx
  ON public.engine_project_chat_proposals(thread_id, created_at);
CREATE INDEX engine_chat_proposals_source_message_idx
  ON public.engine_project_chat_proposals(source_message_id);
CREATE INDEX engine_chat_proposals_status_idx
  ON public.engine_project_chat_proposals(status);

CREATE TRIGGER engine_chat_proposals_touch
  BEFORE UPDATE ON public.engine_project_chat_proposals
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
