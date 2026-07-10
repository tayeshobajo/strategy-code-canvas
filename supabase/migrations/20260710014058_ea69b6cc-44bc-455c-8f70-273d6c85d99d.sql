
-- ============================================================================
-- OpenClaw v3 Supervised Run Queue
-- ============================================================================

-- 1) engine_project_openclaw_queues
CREATE TABLE public.engine_project_openclaw_queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  run_mode text NOT NULL DEFAULT 'supervised',
  failure_policy text NOT NULL DEFAULT 'stop_queue',
  simulated boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_by_email text,
  started_by uuid,
  started_by_email text,
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT engine_openclaw_queues_status_chk CHECK (
    status IN ('draft','ready','running','paused','completed','failed','cancelled','archived')
  ),
  CONSTRAINT engine_openclaw_queues_mode_chk CHECK (run_mode IN ('supervised')),
  CONSTRAINT engine_openclaw_queues_policy_chk CHECK (
    failure_policy IN ('stop_queue','continue_after_review')
  )
);

CREATE INDEX engine_openclaw_queues_project_idx
  ON public.engine_project_openclaw_queues (project_id, created_at DESC);
CREATE INDEX engine_openclaw_queues_status_idx
  ON public.engine_project_openclaw_queues (status);

GRANT SELECT ON public.engine_project_openclaw_queues TO authenticated;
GRANT ALL ON public.engine_project_openclaw_queues TO service_role;

ALTER TABLE public.engine_project_openclaw_queues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view openclaw queues"
  ON public.engine_project_openclaw_queues
  FOR SELECT TO authenticated
  USING (public.is_engine_staff());


-- 2) engine_project_openclaw_queue_items
CREATE TABLE public.engine_project_openclaw_queue_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  queue_id uuid NOT NULL REFERENCES public.engine_project_openclaw_queues(id) ON DELETE CASCADE,
  build_packet_id uuid NOT NULL REFERENCES public.engine_project_build_packets(id) ON DELETE CASCADE,
  openclaw_run_id uuid REFERENCES public.engine_project_openclaw_runs(id) ON DELETE SET NULL,
  sequence_number int NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  failure_policy text NOT NULL DEFAULT 'stop_queue',
  requires_confirmation boolean NOT NULL DEFAULT true,
  started_at timestamptz,
  completed_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT engine_openclaw_queue_items_status_chk CHECK (
    status IN ('queued','running','completed','failed','skipped','cancelled','blocked')
  ),
  CONSTRAINT engine_openclaw_queue_items_policy_chk CHECK (
    failure_policy IN ('stop_queue','continue_after_review')
  ),
  CONSTRAINT engine_openclaw_queue_items_seq_uniq UNIQUE (queue_id, sequence_number)
);

CREATE INDEX engine_openclaw_queue_items_project_idx
  ON public.engine_project_openclaw_queue_items (project_id);
CREATE INDEX engine_openclaw_queue_items_queue_idx
  ON public.engine_project_openclaw_queue_items (queue_id, sequence_number);
CREATE INDEX engine_openclaw_queue_items_packet_idx
  ON public.engine_project_openclaw_queue_items (build_packet_id);
CREATE INDEX engine_openclaw_queue_items_status_idx
  ON public.engine_project_openclaw_queue_items (queue_id, status);

GRANT SELECT ON public.engine_project_openclaw_queue_items TO authenticated;
GRANT ALL ON public.engine_project_openclaw_queue_items TO service_role;

ALTER TABLE public.engine_project_openclaw_queue_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view openclaw queue items"
  ON public.engine_project_openclaw_queue_items
  FOR SELECT TO authenticated
  USING (public.is_engine_staff());


-- 3) updated_at touch triggers
CREATE TRIGGER tg_touch_openclaw_queues_updated_at
  BEFORE UPDATE ON public.engine_project_openclaw_queues
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE TRIGGER tg_touch_openclaw_queue_items_updated_at
  BEFORE UPDATE ON public.engine_project_openclaw_queue_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();


-- 4) Transition guard for queues
CREATE OR REPLACE FUNCTION public.tg_engine_openclaw_queues_enforce()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  ok boolean := false;
BEGIN
  -- Archive only from a terminal (or draft) state.
  IF NEW.status = 'archived' AND OLD.status <> 'archived' THEN
    IF OLD.status IN ('draft','completed','failed','cancelled') THEN
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'OpenClaw queue % cannot be archived from status %', OLD.id, OLD.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF OLD.status = 'archived' THEN
    RAISE EXCEPTION 'OpenClaw queue % is archived and cannot be modified', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status = NEW.status THEN
    ok := true;
  ELSIF OLD.status = 'draft'     AND NEW.status IN ('ready','cancelled')                 THEN ok := true;
  ELSIF OLD.status = 'ready'     AND NEW.status IN ('running','cancelled')               THEN ok := true;
  ELSIF OLD.status = 'running'   AND NEW.status IN ('paused','completed','failed','cancelled') THEN ok := true;
  ELSIF OLD.status = 'paused'    AND NEW.status IN ('running','cancelled','failed')      THEN ok := true;
  END IF;

  IF NOT ok THEN
    RAISE EXCEPTION 'Invalid OpenClaw queue status transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_engine_openclaw_queues_enforce
  BEFORE UPDATE ON public.engine_project_openclaw_queues
  FOR EACH ROW EXECUTE FUNCTION public.tg_engine_openclaw_queues_enforce();


-- 5) Transition guard for queue items
CREATE OR REPLACE FUNCTION public.tg_engine_openclaw_queue_items_enforce()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  ok boolean := false;
BEGIN
  -- Terminal states are immutable.
  IF OLD.status IN ('completed','skipped','cancelled') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'OpenClaw queue item % is terminal (%) and cannot change', OLD.id, OLD.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status = NEW.status THEN
    ok := true;
  ELSIF OLD.status = 'queued'   AND NEW.status IN ('running','skipped','cancelled','blocked')       THEN ok := true;
  ELSIF OLD.status = 'running'  AND NEW.status IN ('completed','failed','cancelled','blocked')      THEN ok := true;
  ELSIF OLD.status = 'blocked'  AND NEW.status IN ('queued','skipped','cancelled')                  THEN ok := true;
  ELSIF OLD.status = 'failed'   AND NEW.status IN ('queued','skipped','cancelled')                  THEN ok := true;
  END IF;

  IF NOT ok THEN
    RAISE EXCEPTION 'Invalid OpenClaw queue item transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_engine_openclaw_queue_items_enforce
  BEFORE UPDATE ON public.engine_project_openclaw_queue_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_engine_openclaw_queue_items_enforce();


-- 6) Prevent double-queueing a packet across active queues.
CREATE UNIQUE INDEX engine_openclaw_queue_items_active_packet_uniq
  ON public.engine_project_openclaw_queue_items (build_packet_id)
  WHERE status IN ('queued','running','blocked');
