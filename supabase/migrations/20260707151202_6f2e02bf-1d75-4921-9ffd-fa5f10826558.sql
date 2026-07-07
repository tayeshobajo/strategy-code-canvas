-- S11: Document that writes to roadmap_documents go through server functions
-- with the service-role client. No client-facing INSERT/UPDATE/DELETE policy
-- exists on purpose.
COMMENT ON TABLE public.roadmap_documents IS
  'Roadmap PDFs and attachments. Clients have SELECT via RLS. All writes go through server functions using the service-role client — no client-facing INSERT/UPDATE/DELETE policy is granted by design (S11 audit).';

-- S12: Document that role changes must go through the admin RPCs. No direct
-- writes to user_roles are allowed via PostgREST.
COMMENT ON TABLE public.user_roles IS
  'Role assignments. Reads via authenticated SELECT (used by has_role). Writes must go through admin_grant_role() / admin_revoke_role() SECURITY DEFINER RPCs — no client-facing INSERT/UPDATE/DELETE policy is granted by design (S12 audit).';

-- Explicit deny-all guard so any accidental future GRANT of INSERT/UPDATE/DELETE
-- on user_roles doesn't silently open a privilege-escalation path.
DROP POLICY IF EXISTS "user_roles no direct writes" ON public.user_roles;
CREATE POLICY "user_roles no direct writes"
  ON public.user_roles
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- Note: an existing SELECT policy remains in effect (RLS uses the union of
-- policies per command — a deny-all FOR ALL policy only blocks INSERT/UPDATE/
-- DELETE unless a permissive policy for that command also exists).

-- S13: Document that operator_notifications and portal_access_events are
-- populated by triggers / server-side writes only.
COMMENT ON TABLE public.operator_notifications IS
  'Operator alert feed. Rows are inserted by triggers and server functions. Clients only read (via existing SELECT policies). No client-facing INSERT/UPDATE/DELETE policy is granted by design (S13 audit).';

COMMENT ON TABLE public.portal_access_events IS
  'Portal access audit trail. Rows are inserted by triggers and server functions. Clients only read their own events. No client-facing INSERT/UPDATE/DELETE policy is granted by design (S13 audit).';
