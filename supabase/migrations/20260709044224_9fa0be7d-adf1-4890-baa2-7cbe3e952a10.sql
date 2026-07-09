
CREATE TABLE public.engine_project_chat_threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'New conversation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX engine_project_chat_threads_project_idx
  ON public.engine_project_chat_threads (project_id, updated_at DESC);

CREATE TABLE public.engine_project_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.engine_project_chat_threads(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system_note')),
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX engine_project_chat_messages_thread_idx
  ON public.engine_project_chat_messages (thread_id, created_at);
CREATE INDEX engine_project_chat_messages_project_idx
  ON public.engine_project_chat_messages (project_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_project_chat_threads TO authenticated;
GRANT ALL ON public.engine_project_chat_threads TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_project_chat_messages TO authenticated;
GRANT ALL ON public.engine_project_chat_messages TO service_role;

ALTER TABLE public.engine_project_chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engine_project_chat_messages ENABLE ROW LEVEL SECURITY;

-- Helper: caller is operator or admin (via email allowlist role check).
CREATE OR REPLACE FUNCTION public.is_engine_staff()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN auth.users u ON u.id = ur.user_id
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin','operator')
  );
$$;

CREATE POLICY "Engine staff can read chat threads"
  ON public.engine_project_chat_threads
  FOR SELECT
  TO authenticated
  USING (public.is_engine_staff());

CREATE POLICY "Engine staff can create chat threads"
  ON public.engine_project_chat_threads
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_engine_staff() AND created_by = auth.uid());

CREATE POLICY "Engine staff can update chat threads"
  ON public.engine_project_chat_threads
  FOR UPDATE
  TO authenticated
  USING (public.is_engine_staff())
  WITH CHECK (public.is_engine_staff());

CREATE POLICY "Engine staff can delete chat threads"
  ON public.engine_project_chat_threads
  FOR DELETE
  TO authenticated
  USING (public.is_engine_staff());

CREATE POLICY "Engine staff can read chat messages"
  ON public.engine_project_chat_messages
  FOR SELECT
  TO authenticated
  USING (public.is_engine_staff());

CREATE POLICY "Engine staff can create chat messages"
  ON public.engine_project_chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_engine_staff());
