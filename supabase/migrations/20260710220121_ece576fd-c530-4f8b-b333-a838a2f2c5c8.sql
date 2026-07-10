-- Tighten EXECUTE grants on public SECURITY DEFINER functions.
-- Trigger functions must never be called directly; revoke from all app roles.
REVOKE EXECUTE ON FUNCTION public.engine_source_reset_new_run() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_client_access_user() FROM PUBLIC, anon;

-- Cron-only maintenance function; not for direct callers.
REVOKE EXECUTE ON FUNCTION public.engine_extraction_watchdog() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.engine_extraction_watchdog() TO service_role;

-- Revoke anon EXECUTE from all remaining public SECURITY DEFINER functions;
-- authenticated retains EXECUTE only where RLS helpers or RPC callers require it.
REVOKE EXECUTE ON FUNCTION public.admin_grant_role(text, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_user_roles() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_role(text, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.client_portal_is_operator(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.compute_engine_next_best_action(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.count_recent_chat_events(uuid, uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_client_portal_project_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_client_access(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role_email(text, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_engine_staff() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_client_portal_activity(uuid, text, text, text, text, boolean, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_portal_file_event(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_portal_follow_up_needed(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.recompute_engine_project_state(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resolve_portal_follow_up(uuid) FROM PUBLIC, anon;