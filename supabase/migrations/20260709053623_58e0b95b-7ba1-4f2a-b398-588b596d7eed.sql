-- Chat tables: explicit lockdown. RLS policies already restrict to engine staff
-- via is_engine_staff(); these statements just make sure anon/PUBLIC have no
-- direct table privileges regardless of PostgREST default grants.
REVOKE ALL ON public.engine_project_chat_threads FROM PUBLIC;
REVOKE ALL ON public.engine_project_chat_threads FROM anon;
REVOKE ALL ON public.engine_project_chat_messages FROM PUBLIC;
REVOKE ALL ON public.engine_project_chat_messages FROM anon;
REVOKE ALL ON public.engine_project_chat_events   FROM PUBLIC;
REVOKE ALL ON public.engine_project_chat_events   FROM anon;

-- Re-affirm the intended grants (idempotent).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_project_chat_threads  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_project_chat_messages TO authenticated;
GRANT SELECT                        ON public.engine_project_chat_events   TO authenticated;
GRANT ALL ON public.engine_project_chat_threads  TO service_role;
GRANT ALL ON public.engine_project_chat_messages TO service_role;
GRANT ALL ON public.engine_project_chat_events   TO service_role;

-- Rate-limit helper: revoke default PUBLIC execute, grant to authenticated only.
-- Function body only reads aggregate counts scoped by _user_id/_project_id;
-- no PII leakage and no writes.
REVOKE ALL ON FUNCTION public.count_recent_chat_events(uuid, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_recent_chat_events(uuid, uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.count_recent_chat_events(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_recent_chat_events(uuid, uuid, integer) TO service_role;