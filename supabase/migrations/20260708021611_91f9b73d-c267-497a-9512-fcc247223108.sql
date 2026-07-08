GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_client_access(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_portal_is_operator(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_client_portal_project_id() TO authenticated;