
CREATE TABLE public.engine_project_openclaw_monitor_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  queue_id UUID NULL REFERENCES public.engine_project_openclaw_queues(id) ON DELETE SET NULL,
  queue_item_id UUID NULL REFERENCES public.engine_project_openclaw_queue_items(id) ON DELETE SET NULL,
  openclaw_run_id UUID NULL REFERENCES public.engine_project_openclaw_runs(id) ON DELETE SET NULL,
  build_packet_id UUID NULL REFERENCES public.engine_project_build_packets(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  status_before TEXT NULL,
  status_after TEXT NULL,
  summary TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_at TIMESTAMPTZ NULL,
  acknowledged_by_email TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_openclaw_monitor_events_project ON public.engine_project_openclaw_monitor_events(project_id, created_at DESC);
CREATE INDEX idx_openclaw_monitor_events_unack ON public.engine_project_openclaw_monitor_events(project_id, acknowledged_at) WHERE acknowledged_at IS NULL;

GRANT SELECT ON public.engine_project_openclaw_monitor_events TO authenticated;
GRANT ALL ON public.engine_project_openclaw_monitor_events TO service_role;

ALTER TABLE public.engine_project_openclaw_monitor_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read monitor events"
  ON public.engine_project_openclaw_monitor_events
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'operator'::app_role)
    OR public.has_role(auth.uid(), 'team_member'::app_role)
  );

CREATE TABLE public.engine_project_openclaw_monitor_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL UNIQUE REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  stale_run_minutes INTEGER NOT NULL DEFAULT 15 CHECK (stale_run_minutes > 0),
  timeout_minutes INTEGER NOT NULL DEFAULT 30 CHECK (timeout_minutes > 0),
  notify_on_failure BOOLEAN NOT NULL DEFAULT true,
  notify_on_timeout BOOLEAN NOT NULL DEFAULT true,
  notify_on_stale BOOLEAN NOT NULL DEFAULT true,
  allow_auto_refresh BOOLEAN NOT NULL DEFAULT true,
  allow_auto_run_next BOOLEAN NOT NULL DEFAULT false,
  last_tick_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.engine_project_openclaw_monitor_settings TO authenticated;
GRANT ALL ON public.engine_project_openclaw_monitor_settings TO service_role;

ALTER TABLE public.engine_project_openclaw_monitor_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read monitor settings"
  ON public.engine_project_openclaw_monitor_settings
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'operator'::app_role)
    OR public.has_role(auth.uid(), 'team_member'::app_role)
  );

CREATE TRIGGER openclaw_monitor_settings_touch_updated_at
  BEFORE UPDATE ON public.engine_project_openclaw_monitor_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
