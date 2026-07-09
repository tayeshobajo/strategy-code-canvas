-- === engine_project_mockups =============================================
CREATE TABLE public.engine_project_mockups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  frame_id UUID REFERENCES public.engine_project_frames(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','in_review','approved','archived')),
  generated_by TEXT NOT NULL DEFAULT 'ai'
    CHECK (generated_by IN ('ai','human','hybrid')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID,
  created_by_email TEXT,
  approved_by_user_id UUID,
  approved_by_email TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_engine_project_mockups_project_status
  ON public.engine_project_mockups (project_id, status);
CREATE INDEX idx_engine_project_mockups_project_created
  ON public.engine_project_mockups (project_id, created_at DESC);
CREATE INDEX idx_engine_project_mockups_frame
  ON public.engine_project_mockups (frame_id);

GRANT SELECT ON public.engine_project_mockups TO authenticated;
GRANT ALL ON public.engine_project_mockups TO service_role;

ALTER TABLE public.engine_project_mockups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view mockups"
  ON public.engine_project_mockups
  FOR SELECT
  TO authenticated
  USING (public.is_engine_staff());

-- No INSERT/UPDATE/DELETE policies. All writes go through server functions
-- using supabaseAdmin (service role), same pattern as engine_project_frames.

-- touch updated_at
CREATE OR REPLACE FUNCTION public.tg_touch_engine_project_mockups()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_engine_project_mockups_touch
  BEFORE UPDATE ON public.engine_project_mockups
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_engine_project_mockups();

-- transition guard + protect-approved
CREATE OR REPLACE FUNCTION public.tg_engine_project_mockups_enforce()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  ok boolean := false;
BEGIN
  -- Archive is always allowed
  IF NEW.status = 'archived' THEN
    RETURN NEW;
  END IF;

  -- Silent overwrite of approved payload is forbidden. Once approved,
  -- payload/title/summary/status may not change except to 'archived'.
  IF OLD.status = 'approved' AND NEW.status <> 'archived' THEN
    RAISE EXCEPTION 'Mockup % is approved and cannot be modified; archive first', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Valid transitions
  IF OLD.status = NEW.status THEN
    ok := true;
  ELSIF OLD.status = 'draft' AND NEW.status = 'in_review' THEN
    ok := true;
  ELSIF OLD.status = 'in_review' AND NEW.status = 'approved' THEN
    ok := true;
  ELSIF OLD.status = 'in_review' AND NEW.status = 'draft' THEN
    ok := true;
  END IF;

  IF NOT ok THEN
    RAISE EXCEPTION 'Invalid mockup status transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_engine_project_mockups_enforce
  BEFORE UPDATE ON public.engine_project_mockups
  FOR EACH ROW EXECUTE FUNCTION public.tg_engine_project_mockups_enforce();
