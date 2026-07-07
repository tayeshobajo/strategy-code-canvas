-- Harden the client portal boundary so only approved, client-safe content
-- is visible, and only for clients with active entitlement.

-- Portal workspace lifecycle
CREATE TABLE IF NOT EXISTS public.portal_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_email text NOT NULL UNIQUE,
  client_name text,
  company_name text,
  workspace_state text NOT NULL DEFAULT 'workspace_provisioning'
    CHECK (
      workspace_state IN (
        'payment_confirmed',
        'portal_access_granted',
        'workspace_provisioning',
        'workspace_ready',
        'engagement_active',
        'engagement_completed',
        'access_paused',
        'access_revoked'
      )
    ),
  roadmap_state text NOT NULL DEFAULT 'roadmap_not_published'
    CHECK (roadmap_state IN ('roadmap_not_published', 'roadmap_published')),
  portal_access_granted_at timestamptz,
  workspace_ready_at timestamptz,
  roadmap_published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_workspaces_email
  ON public.portal_workspaces (lower(client_email));

GRANT SELECT ON public.portal_workspaces TO authenticated;
GRANT ALL ON public.portal_workspaces TO service_role;
ALTER TABLE public.portal_workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clients read own portal workspace" ON public.portal_workspaces;
CREATE POLICY "Clients read own portal workspace"
  ON public.portal_workspaces FOR SELECT TO authenticated
  USING (
    lower(client_email) = lower(auth.email())
    AND public.has_client_access(auth.email())
  );

DROP TRIGGER IF EXISTS trg_portal_workspaces_touch ON public.portal_workspaces;
CREATE TRIGGER trg_portal_workspaces_touch BEFORE UPDATE ON public.portal_workspaces
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- Approved portal documents only
ALTER TABLE public.roadmap_documents
  ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'roadmap_preview',
  ADD COLUMN IF NOT EXISTS document_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS client_safe boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'roadmap_documents_document_type_check'
  ) THEN
    ALTER TABLE public.roadmap_documents
      ADD CONSTRAINT roadmap_documents_document_type_check
      CHECK (
        document_type IN (
          'roadmap_preview',
          'roadmap_pdf',
          'approved_file',
          'delivery_note'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'roadmap_documents_document_status_check'
  ) THEN
    ALTER TABLE public.roadmap_documents
      ADD CONSTRAINT roadmap_documents_document_status_check
      CHECK (
        document_status IN ('draft', 'approved', 'published', 'archived')
      );
  END IF;
END $$;

UPDATE public.roadmap_documents
SET
  document_type = CASE
    WHEN coalesce(file_url, '') <> '' AND coalesce(body_md, '') = '' THEN 'approved_file'
    WHEN coalesce(title, '') ILIKE '%pdf%' THEN 'roadmap_pdf'
    ELSE 'roadmap_preview'
  END
WHERE
  document_type = 'roadmap_preview'
  AND document_status = 'draft'
  AND client_safe = false;

-- Seed portal workspace rows for already-entitled clients
INSERT INTO public.portal_workspaces (
  client_email,
  workspace_state,
  roadmap_state,
  portal_access_granted_at,
  workspace_ready_at,
  roadmap_published_at
)
SELECT
  ca.email,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.roadmap_documents rd
      WHERE lower(rd.client_email) = lower(ca.email)
        AND rd.document_status = 'published'
        AND rd.client_safe = true
    ) THEN 'workspace_ready'
    ELSE 'workspace_provisioning'
  END,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.roadmap_documents rd
      WHERE lower(rd.client_email) = lower(ca.email)
        AND rd.document_status = 'published'
        AND rd.client_safe = true
        AND rd.document_type IN ('roadmap_preview', 'roadmap_pdf', 'delivery_note')
    ) THEN 'roadmap_published'
    ELSE 'roadmap_not_published'
  END,
  min(ca.granted_at),
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.roadmap_documents rd
      WHERE lower(rd.client_email) = lower(ca.email)
        AND rd.document_status = 'published'
        AND rd.client_safe = true
    ) THEN now()
    ELSE NULL
  END,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.roadmap_documents rd
      WHERE lower(rd.client_email) = lower(ca.email)
        AND rd.document_status = 'published'
        AND rd.client_safe = true
        AND rd.document_type IN ('roadmap_preview', 'roadmap_pdf', 'delivery_note')
    ) THEN now()
    ELSE NULL
  END
FROM public.client_access ca
WHERE ca.revoked_at IS NULL
GROUP BY ca.email
ON CONFLICT (client_email) DO NOTHING;

-- Tighten RLS to require active client entitlement
DROP POLICY IF EXISTS "Users see own subs by user_id or email" ON public.subscriptions;
CREATE POLICY "Users see own active subs"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (
    lower(customer_email) = lower(auth.email())
    AND public.has_client_access(auth.email())
  );

DROP POLICY IF EXISTS "Clients read their roadmap" ON public.roadmap_documents;
CREATE POLICY "Clients read published client-safe roadmap documents"
  ON public.roadmap_documents FOR SELECT TO authenticated
  USING (
    lower(client_email) = lower(auth.email())
    AND public.has_client_access(auth.email())
    AND document_status = 'published'
    AND client_safe = true
  );

DROP POLICY IF EXISTS "Clients read their thread" ON public.portal_messages;
CREATE POLICY "Clients read active portal thread"
  ON public.portal_messages FOR SELECT TO authenticated
  USING (
    lower(client_email) = lower(auth.email())
    AND public.has_client_access(auth.email())
  );

DROP POLICY IF EXISTS "Clients send as themselves" ON public.portal_messages;
CREATE POLICY "Clients send as themselves with active access"
  ON public.portal_messages FOR INSERT TO authenticated
  WITH CHECK (
    lower(client_email) = lower(auth.email())
    AND public.has_client_access(auth.email())
    AND sender = 'client'
  );

GRANT SELECT ON public.orders TO authenticated;
DROP POLICY IF EXISTS "Clients read their own orders" ON public.orders;
CREATE POLICY "Clients read their own orders"
  ON public.orders FOR SELECT TO authenticated
  USING (
    lower(customer_email) = lower(auth.email())
    AND public.has_client_access(auth.email())
  );
