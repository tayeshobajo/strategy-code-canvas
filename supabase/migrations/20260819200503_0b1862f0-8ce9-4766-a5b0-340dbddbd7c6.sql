CREATE POLICY "Intake buckets server-only"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id IN ('intake-voice','intake-attachments'))
WITH CHECK (bucket_id IN ('intake-voice','intake-attachments'));