
CREATE TABLE public.engine_project_chat_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  user_id uuid,
  user_email text,
  thread_id uuid,
  message_id uuid,
  model text,
  provider text,
  success boolean NOT NULL DEFAULT true,
  error_code text,
  error_message text,
  tokens_in integer NOT NULL DEFAULT 0,
  tokens_out integer NOT NULL DEFAULT 0,
  cost_cents integer NOT NULL DEFAULT 0,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX engine_project_chat_events_project_created_idx
  ON public.engine_project_chat_events (project_id, created_at DESC);
CREATE INDEX engine_project_chat_events_user_created_idx
  ON public.engine_project_chat_events (user_id, created_at DESC);

GRANT SELECT ON public.engine_project_chat_events TO authenticated;
GRANT ALL ON public.engine_project_chat_events TO service_role;

ALTER TABLE public.engine_project_chat_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Engine staff can view chat events"
  ON public.engine_project_chat_events
  FOR SELECT
  TO authenticated
  USING (public.is_engine_staff());

-- No INSERT/UPDATE/DELETE policies: events are written by the server via the
-- authenticated user's client only through the count-guarded RPC below, or by
-- service_role. We keep a narrow INSERT policy for authenticated staff so the
-- server-fn (RLS as caller) can log its own events.
CREATE POLICY "Engine staff can insert chat events"
  ON public.engine_project_chat_events
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_engine_staff());

-- Rate limit helper: returns count of chat events for this user in the last
-- N seconds, optionally scoped to a project.
CREATE OR REPLACE FUNCTION public.count_recent_chat_events(
  _user_id uuid,
  _project_id uuid,
  _window_seconds integer
) RETURNS TABLE(user_count bigint, project_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*) FROM public.engine_project_chat_events
       WHERE user_id = _user_id
         AND created_at > now() - make_interval(secs => _window_seconds)) AS user_count,
    (SELECT count(*) FROM public.engine_project_chat_events
       WHERE project_id = _project_id
         AND created_at > now() - make_interval(secs => _window_seconds)) AS project_count;
$$;

GRANT EXECUTE ON FUNCTION public.count_recent_chat_events(uuid, uuid, integer) TO authenticated;
