
-- Revoke EXECUTE on SECURITY DEFINER functions from anon (never needed) and from authenticated for trigger functions (never invoked directly).

-- Anon-executable SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.compute_engine_next_best_action FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.engine_extraction_watchdog FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recompute_engine_project_state FROM anon, PUBLIC;

-- Trigger functions do not need direct EXECUTE grants (triggers run as table owner)
REVOKE EXECUTE ON FUNCTION public.tg_client_portal_files_fanout_engine FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_client_portal_messages_notify_operators FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_engine_activity_notify_operators FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_extraction_run_notify_failure FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_recompute_project_state_from_portal_row FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_recompute_project_state_from_project_id FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_task_notify_blocked FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_user_roles_backfill_user_id FROM anon, authenticated, PUBLIC;

-- Email queue internals are called by pg_cron/service_role only
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_email FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_email_batch FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_email FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq FROM anon, authenticated, PUBLIC;
