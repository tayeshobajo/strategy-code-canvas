-- ============================================================
-- Phase 2B — Reversal + downstream invalidation cascade
-- ============================================================

-- 1. Stale markers on ceremonies (Point B is the downstream surface)
ALTER TABLE public.engine_spine_ceremonies
  ADD COLUMN IF NOT EXISTS stale_reason TEXT,
  ADD COLUMN IF NOT EXISTS stale_since TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS re_review_required BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS engine_spine_ceremonies_stale_idx
  ON public.engine_spine_ceremonies (project_id, spine)
  WHERE re_review_required = true;

-- 2. Stale markers on truth rows
ALTER TABLE public.engine_spine_field_truth
  ADD COLUMN IF NOT EXISTS stale_reason TEXT,
  ADD COLUMN IF NOT EXISTS stale_since TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS engine_spine_field_truth_stale_idx
  ON public.engine_spine_field_truth (project_id, spine)
  WHERE stale_since IS NOT NULL;

-- 3. Invalidation records (unlock reopen of a completed Point A)
CREATE TABLE IF NOT EXISTS public.engine_spine_ceremony_invalidations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  ceremony_id UUID NOT NULL REFERENCES public.engine_spine_ceremonies(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  reversed_field_keys TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  created_by_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  CHECK (length(btrim(reason)) > 0)
);

CREATE INDEX IF NOT EXISTS engine_spine_ceremony_invalidations_active_idx
  ON public.engine_spine_ceremony_invalidations (ceremony_id)
  WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS engine_spine_ceremony_invalidations_project_idx
  ON public.engine_spine_ceremony_invalidations (project_id, created_at DESC);

GRANT SELECT, INSERT ON public.engine_spine_ceremony_invalidations TO authenticated;
GRANT ALL ON public.engine_spine_ceremony_invalidations TO service_role;

ALTER TABLE public.engine_spine_ceremony_invalidations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ceremony_invalidations_select_staff"
  ON public.engine_spine_ceremony_invalidations
  FOR SELECT TO authenticated USING (
    public.has_role_email(auth.jwt() ->> 'email', 'admin')
    OR public.has_role_email(auth.jwt() ->> 'email', 'operator')
    OR public.has_role_email(auth.jwt() ->> 'email', 'team_member')
  );

CREATE POLICY "ceremony_invalidations_insert_admin_op"
  ON public.engine_spine_ceremony_invalidations
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role_email(auth.jwt() ->> 'email', 'admin')
    OR public.has_role_email(auth.jwt() ->> 'email', 'operator')
  );

-- 4. Update Point A precedence trigger to permit reopen with an active invalidation
CREATE OR REPLACE FUNCTION public.enforce_point_a_before_point_b()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.spine = 'point-b' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.engine_spine_ceremonies
      WHERE project_id = NEW.project_id AND spine = 'point-a' AND status = 'completed'
    ) THEN
      RAISE EXCEPTION 'Point B ceremony cannot open before a Point A ceremony is completed for project %', NEW.project_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Reopen/abandon of a completed Point A now requires an unresolved
  -- invalidation record documenting the reason. This is the Phase 2B lock.
  IF TG_OP = 'UPDATE'
     AND OLD.spine = 'point-a'
     AND OLD.status = 'completed'
     AND NEW.status <> 'completed' THEN
    IF EXISTS (
      SELECT 1 FROM public.engine_spine_ceremonies
      WHERE project_id = OLD.project_id AND spine = 'point-b'
    ) AND NOT EXISTS (
      SELECT 1 FROM public.engine_spine_ceremony_invalidations
      WHERE ceremony_id = OLD.id AND resolved_at IS NULL
    ) THEN
      RAISE EXCEPTION
        'Cannot reopen/abandon completed Point A ceremony % while Point B ceremonies exist without an active invalidation record',
        OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Cascade helper: mark all Point B ceremonies + truth for a project stale.
CREATE OR REPLACE FUNCTION public.mark_point_b_stale(
  _project_id uuid,
  _reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.engine_spine_ceremonies
     SET re_review_required = true,
         stale_reason = _reason,
         stale_since = now()
   WHERE project_id = _project_id
     AND spine = 'point-b'
     AND status IN ('in_progress','completed')
     AND (stale_since IS NULL OR stale_reason IS DISTINCT FROM _reason);

  UPDATE public.engine_spine_field_truth
     SET stale_reason = _reason,
         stale_since = now()
   WHERE project_id = _project_id
     AND spine = 'point-b'
     AND (stale_since IS NULL OR stale_reason IS DISTINCT FROM _reason);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_point_b_stale(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_point_b_stale(uuid, text) TO service_role;

-- 6. Trigger: Point A approved_truth truth-row reversal cascades to Point B
CREATE OR REPLACE FUNCTION public.cascade_point_a_truth_reversal()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.spine = 'point-a'
     AND OLD.status = 'approved_truth'
     AND NEW.status <> 'approved_truth' THEN
    PERFORM public.mark_point_b_stale(
      NEW.project_id,
      'Point A field "' || NEW.field_key || '" reversed from approved_truth to ' || NEW.status::text
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_cascade_point_a_truth_reversal
  AFTER UPDATE ON public.engine_spine_field_truth
  FOR EACH ROW EXECUTE FUNCTION public.cascade_point_a_truth_reversal();

-- 7. Trigger: inserting an invalidation record cascades staleness
CREATE OR REPLACE FUNCTION public.cascade_ceremony_invalidation_insert()
RETURNS TRIGGER AS $$
DECLARE
  cer_spine text;
BEGIN
  SELECT spine INTO cer_spine
    FROM public.engine_spine_ceremonies
   WHERE id = NEW.ceremony_id;

  -- Only Point A ceremony invalidations cascade downstream to Point B.
  IF cer_spine = 'point-a' THEN
    PERFORM public.mark_point_b_stale(
      NEW.project_id,
      'Point A ceremony invalidated: ' || NEW.reason
    );
  END IF;

  -- Audit log
  INSERT INTO public.engine_audit_log
    (project_id, action, field_changed, old_value, new_value, actor_email, metadata)
  VALUES (
    NEW.project_id,
    'spine_ceremony_invalidated',
    'ceremony_id',
    NULL,
    to_jsonb(NEW.ceremony_id::text),
    NEW.created_by_email,
    jsonb_build_object(
      'reason', NEW.reason,
      'reversed_field_keys', to_jsonb(NEW.reversed_field_keys),
      'ceremony_spine', cer_spine
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_cascade_ceremony_invalidation_insert
  AFTER INSERT ON public.engine_spine_ceremony_invalidations
  FOR EACH ROW EXECUTE FUNCTION public.cascade_ceremony_invalidation_insert();

-- 8. Trigger: re-completing a Point A ceremony auto-resolves active invalidations
CREATE OR REPLACE FUNCTION public.resolve_ceremony_invalidations_on_complete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed'
     AND OLD.status <> 'completed' THEN
    UPDATE public.engine_spine_ceremony_invalidations
       SET resolved_at = now()
     WHERE ceremony_id = NEW.id
       AND resolved_at IS NULL;

    -- Clear the ceremony's own stale flags when it re-completes.
    IF NEW.re_review_required = true OR NEW.stale_since IS NOT NULL THEN
      UPDATE public.engine_spine_ceremonies
         SET re_review_required = false,
             stale_reason = NULL,
             stale_since = NULL
       WHERE id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_resolve_ceremony_invalidations_on_complete
  AFTER UPDATE ON public.engine_spine_ceremonies
  FOR EACH ROW EXECUTE FUNCTION public.resolve_ceremony_invalidations_on_complete();