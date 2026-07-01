
-- Harden SECURITY DEFINER functions: revoke EXECUTE from PUBLIC and anon on all,
-- and from authenticated on functions only intended for service_role / internal cron use.
-- Keep authenticated EXECUTE only on functions the signed-in user actually calls
-- through the Data API (portal features).

-- ============================
-- Internal email queue plumbing — service_role only
-- ============================
REVOKE ALL ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;

REVOKE ALL ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_queue_wake() TO service_role;

REVOKE ALL ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO service_role;

-- ============================
-- Portal / client-facing DEFINER helpers — keep authenticated, drop anon+PUBLIC
-- These are called by the signed-in user's session through server functions
-- and each has internal access checks (auth.uid()/auth.email()) or safe reads.
-- ============================
REVOKE ALL ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.sync_client_access_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_client_access_user() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.log_client_portal_activity(uuid, text, text, text, text, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_client_portal_activity(uuid, text, text, text, text, boolean, jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.has_client_access(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_client_access(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.current_client_portal_project_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_client_portal_project_id() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.client_portal_is_operator(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_portal_is_operator(text) TO authenticated, service_role;
