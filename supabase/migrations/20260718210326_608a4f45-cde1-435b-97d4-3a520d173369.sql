
CREATE POLICY "Operators read world entry evidence files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'world-entry-evidence'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator')));
CREATE POLICY "Operators upload world entry evidence files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'world-entry-evidence'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator')));
CREATE POLICY "Operators delete world entry evidence files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'world-entry-evidence'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator')));
