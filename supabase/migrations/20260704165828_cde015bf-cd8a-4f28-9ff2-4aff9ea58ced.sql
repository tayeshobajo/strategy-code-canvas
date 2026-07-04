ALTER TABLE public.intake_drafts
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Anonymous visitors on /build-my-roadmap can upload into intake-uploads,
-- constrained to <resume_token>/<filename>. Reads/updates/deletes remain
-- service-role only.
DROP POLICY IF EXISTS "Anon may upload intake wizard files" ON storage.objects;
CREATE POLICY "Anon may upload intake wizard files"
  ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (
    bucket_id = 'intake-uploads'
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
  );