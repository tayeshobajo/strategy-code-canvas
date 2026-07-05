
-- Operator in-app notifications
CREATE TABLE public.operator_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  submission_id UUID,
  title TEXT NOT NULL,
  body TEXT,
  href TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX operator_notifications_created_at_idx ON public.operator_notifications (created_at DESC);
CREATE INDEX operator_notifications_submission_id_idx ON public.operator_notifications (submission_id);

GRANT SELECT ON public.operator_notifications TO authenticated;
GRANT ALL ON public.operator_notifications TO service_role;

ALTER TABLE public.operator_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators and admins can view notifications"
  ON public.operator_notifications
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'operator'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Per-recipient read state
CREATE TABLE public.operator_notification_reads (
  notification_id UUID NOT NULL REFERENCES public.operator_notifications(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, email)
);

GRANT SELECT, INSERT, DELETE ON public.operator_notification_reads TO authenticated;
GRANT ALL ON public.operator_notification_reads TO service_role;

ALTER TABLE public.operator_notification_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators can see their own reads"
  ON public.operator_notification_reads
  FOR SELECT
  TO authenticated
  USING (lower(email) = lower(coalesce(auth.email(), '')));

CREATE POLICY "Operators can mark their own reads"
  ON public.operator_notification_reads
  FOR INSERT
  TO authenticated
  WITH CHECK (
    lower(email) = lower(coalesce(auth.email(), ''))
    AND (
      public.has_role(auth.uid(), 'operator'::public.app_role)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );

CREATE POLICY "Operators can clear their own reads"
  ON public.operator_notification_reads
  FOR DELETE
  TO authenticated
  USING (lower(email) = lower(coalesce(auth.email(), '')));
