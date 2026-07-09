
REVOKE EXECUTE ON FUNCTION public.is_engine_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_engine_staff() TO authenticated, service_role;
