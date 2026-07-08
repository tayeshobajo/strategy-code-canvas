
-- Revoke EXECUTE from public/anon/authenticated on internal helpers that are
-- only called by trusted server code (service role), webhooks, RLS policies,
-- or other SECURITY DEFINER functions. Preserves service_role access.

REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_list_email_dlq(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_retry_email_dlq(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_client_access(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.client_portal_is_operator(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_client_portal_project_id() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_email_dlq(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_retry_email_dlq(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_client_access(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.client_portal_is_operator(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.current_client_portal_project_id() TO service_role;
