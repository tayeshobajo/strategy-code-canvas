-- Revoke public EXECUTE on internal trigger functions (SECURITY DEFINER) so anon cannot call them directly.
REVOKE EXECUTE ON FUNCTION public.tg_client_portal_files_fanout_engine() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_client_portal_messages_notify_operators() FROM PUBLIC, anon, authenticated;

-- Add explicit operator management policy on client_portal_files, matching sibling client_portal_* tables.
CREATE POLICY "Operators manage portal files"
ON public.client_portal_files
FOR ALL
TO authenticated
USING (public.client_portal_is_operator(auth.email()))
WITH CHECK (public.client_portal_is_operator(auth.email()));