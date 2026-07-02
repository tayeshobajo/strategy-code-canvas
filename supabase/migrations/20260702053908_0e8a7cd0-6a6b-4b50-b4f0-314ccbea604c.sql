-- RLS policies for engine-signals storage bucket (created via storage_create_bucket tool)
-- Admin-only read/write of files under engine-signals/{projectId}/...

CREATE POLICY "engine_signals_admin_read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'engine-signals' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "engine_signals_admin_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'engine-signals' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "engine_signals_admin_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'engine-signals' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "engine_signals_admin_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'engine-signals' AND public.has_role(auth.uid(), 'admin'::public.app_role));