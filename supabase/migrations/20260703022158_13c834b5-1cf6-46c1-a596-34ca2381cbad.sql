
-- 1) intake_drafts: make service-role-only intent explicit
REVOKE ALL ON public.intake_drafts FROM anon, authenticated;
GRANT ALL ON public.intake_drafts TO service_role;
-- Explicit deny policies so scanners see intent (service_role bypasses RLS)
DROP POLICY IF EXISTS "Deny all client access to intake_drafts" ON public.intake_drafts;
CREATE POLICY "Deny all client access to intake_drafts"
  ON public.intake_drafts
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- 2) intake_submissions: admins/operators can read
GRANT SELECT ON public.intake_submissions TO authenticated;
GRANT ALL ON public.intake_submissions TO service_role;
DROP POLICY IF EXISTS "Admins and operators can read intake submissions" ON public.intake_submissions;
CREATE POLICY "Admins and operators can read intake submissions"
  ON public.intake_submissions
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'operator'::public.app_role)
  );

-- 3) Storage: portal bucket update/delete must also require active project membership
DROP POLICY IF EXISTS "Portal bucket update own objects" ON storage.objects;
CREATE POLICY "Portal bucket update own objects"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'client-portal-files'
    AND owner = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.client_portal_files f
      JOIN public.client_portal_permissions perm ON perm.project_id = f.project_id
      WHERE f.bucket_id = objects.bucket_id
        AND f.storage_path = objects.name
        AND lower(perm.email) = lower(auth.email())
        AND perm.revoked_at IS NULL
    )
  )
  WITH CHECK (
    bucket_id = 'client-portal-files'
    AND owner = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.client_portal_files f
      JOIN public.client_portal_permissions perm ON perm.project_id = f.project_id
      WHERE f.bucket_id = objects.bucket_id
        AND f.storage_path = objects.name
        AND lower(perm.email) = lower(auth.email())
        AND perm.revoked_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Portal bucket delete own objects" ON storage.objects;
CREATE POLICY "Portal bucket delete own objects"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'client-portal-files'
    AND owner = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.client_portal_files f
      JOIN public.client_portal_permissions perm ON perm.project_id = f.project_id
      WHERE f.bucket_id = objects.bucket_id
        AND f.storage_path = objects.name
        AND lower(perm.email) = lower(auth.email())
        AND perm.revoked_at IS NULL
    )
  );
