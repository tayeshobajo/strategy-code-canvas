REVOKE EXECUTE ON FUNCTION public.has_client_access(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_client_access(text) TO service_role;