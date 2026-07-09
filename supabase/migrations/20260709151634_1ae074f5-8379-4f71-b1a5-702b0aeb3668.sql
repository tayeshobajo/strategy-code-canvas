
-- === engine_project_frames =============================================
CREATE TABLE public.engine_project_frames (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  source_version_id UUID REFERENCES public.engine_roadmap_versions(id) ON DELETE SET NULL,
  source_artifact_id UUID REFERENCES public.engine_project_artifacts(id) ON DELETE SET NULL,
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

CREATE INDEX idx_engine_project_frames_project_status
  ON public.engine_project_frames (project_id, status);
CREATE INDEX idx_engine_project_frames_project_created
  ON public.engine_project_frames (project_id, created_at DESC);

GRANT SELECT ON public.engine_project_frames TO authenticated;
GRANT ALL ON public.engine_project_frames TO service_role;

ALTER TABLE public.engine_project_frames ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view frames"
  ON public.engine_project_frames
  FOR SELECT
  TO authenticated
  USING (public.is_engine_staff());

-- No INSERT/UPDATE/DELETE policies. All writes go through server functions
-- using supabaseAdmin (service role), same pattern as engine_project_artifacts.

-- touch updated_at
CREATE OR REPLACE FUNCTION public.tg_touch_engine_project_frames()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_engine_project_frames_touch
  BEFORE UPDATE ON public.engine_project_frames
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_engine_project_frames();

-- transition guard + protect-approved
CREATE OR REPLACE FUNCTION public.tg_engine_project_frames_enforce()
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
    RAISE EXCEPTION 'Frame % is approved and cannot be modified; archive first', OLD.id
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
    RAISE EXCEPTION 'Invalid frame status transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_engine_project_frames_enforce
  BEFORE UPDATE ON public.engine_project_frames
  FOR EACH ROW EXECUTE FUNCTION public.tg_engine_project_frames_enforce();

-- === QA operator seed ==================================================
-- Assign 'operator' role to qa-operator-lite@trust-tai.com IF that auth
-- user exists. Password provisioning is intentionally out-of-band (Supabase
-- Auth Admin API) — this migration only ensures the role mapping is ready.
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users
    WHERE lower(email) = 'qa-operator-lite@trust-tai.com'
    LIMIT 1;
  IF v_uid IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_uid, 'operator'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;
