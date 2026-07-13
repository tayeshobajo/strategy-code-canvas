-- 1) Enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'engine_project_kind') THEN
    CREATE TYPE public.engine_project_kind AS ENUM ('standalone','parent','child');
  END IF;
END $$;

-- 2) Columns + index
ALTER TABLE public.engine_projects
  ADD COLUMN IF NOT EXISTS project_kind public.engine_project_kind NOT NULL DEFAULT 'standalone',
  ADD COLUMN IF NOT EXISTS parent_project_id uuid NULL
    REFERENCES public.engine_projects(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS engine_projects_parent_idx
  ON public.engine_projects(parent_project_id);

-- 3) Backfill
UPDATE public.engine_projects
   SET project_kind='standalone'
 WHERE project_kind IS NULL;

-- 4) Shape trigger
CREATE OR REPLACE FUNCTION public.tg_engine_projects_kind_shape()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_row public.engine_projects%ROWTYPE;
  child_count int;
BEGIN
  IF NEW.project_kind = 'child' AND NEW.parent_project_id IS NULL THEN
    RAISE EXCEPTION 'project_kind=child requires parent_project_id' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.project_kind IN ('standalone','parent') AND NEW.parent_project_id IS NOT NULL THEN
    RAISE EXCEPTION 'project_kind=% must not set parent_project_id', NEW.project_kind USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.project_kind = 'parent' THEN
    IF COALESCE(NEW.point_a, '{}'::jsonb) <> '{}'::jsonb
       OR COALESCE(NEW.point_b, '{}'::jsonb) <> '{}'::jsonb THEN
      RAISE EXCEPTION 'Parent projects must not carry Spine data (point_a/point_b locked empty)'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.project_kind = 'child' THEN
    SELECT * INTO parent_row FROM public.engine_projects WHERE id = NEW.parent_project_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'parent_project_id % not found', NEW.parent_project_id USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF parent_row.client_id IS DISTINCT FROM NEW.client_id THEN
      RAISE EXCEPTION 'Child client_id % must match parent client_id %', NEW.client_id, parent_row.client_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF parent_row.project_kind = 'child' THEN
      RAISE EXCEPTION 'Depth > 1 not allowed: parent % is itself a child', parent_row.id
        USING ERRCODE = 'check_violation';
    END IF;
    IF parent_row.project_kind = 'standalone' THEN
      RAISE EXCEPTION 'Cannot attach child to standalone project %; promote to parent first', parent_row.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.project_kind IS DISTINCT FROM NEW.project_kind THEN
    IF OLD.project_kind = 'parent' AND NEW.project_kind = 'child' THEN
      RAISE EXCEPTION 'parent → child transition forbidden; demote to standalone first' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.project_kind = 'child' AND NEW.project_kind = 'parent' THEN
      RAISE EXCEPTION 'child → parent transition forbidden; demote to standalone first' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.project_kind = 'parent' AND NEW.project_kind = 'standalone' THEN
      SELECT count(*) INTO child_count FROM public.engine_projects WHERE parent_project_id = NEW.id;
      IF child_count > 0 THEN
        RAISE EXCEPTION 'Cannot demote parent → standalone: % children still attached', child_count
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS engine_projects_kind_shape ON public.engine_projects;
CREATE TRIGGER engine_projects_kind_shape
BEFORE INSERT OR UPDATE ON public.engine_projects
FOR EACH ROW EXECUTE FUNCTION public.tg_engine_projects_kind_shape();

-- 5) Rollup helpers
CREATE OR REPLACE FUNCTION public.internal_all_children_approved(_parent_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.engine_projects WHERE parent_project_id = _parent_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.engine_projects
     WHERE parent_project_id = _parent_id
       AND status NOT IN ('approved','completed')
  );
$$;

CREATE OR REPLACE FUNCTION public.internal_all_children_completed(_parent_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.engine_projects WHERE parent_project_id = _parent_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.engine_projects
     WHERE parent_project_id = _parent_id
       AND (completed_at IS NULL AND status <> 'completed')
  );
$$;

-- 6) Child-side stale-rollup guard
CREATE OR REPLACE FUNCTION public.tg_engine_projects_child_rollup_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_parent public.engine_projects%ROWTYPE;
  new_parent public.engine_projects%ROWTYPE;
  old_parent_locked boolean := false;
  new_parent_locked boolean := false;
  old_parent_completed boolean := false;
  new_parent_completed boolean := false;
  old_child_completed boolean := false;
  new_child_completed boolean := false;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.parent_project_id IS NOT NULL THEN
    SELECT * INTO old_parent FROM public.engine_projects WHERE id = OLD.parent_project_id;
    old_parent_locked    := old_parent.status IN ('approved','completed') OR old_parent.completed_at IS NOT NULL;
    old_parent_completed := old_parent.status = 'completed' OR old_parent.completed_at IS NOT NULL;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.parent_project_id IS NOT NULL THEN
    SELECT * INTO new_parent FROM public.engine_projects WHERE id = NEW.parent_project_id;
    new_parent_locked    := new_parent.status IN ('approved','completed') OR new_parent.completed_at IS NOT NULL;
    new_parent_completed := new_parent.status = 'completed' OR new_parent.completed_at IS NOT NULL;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.parent_project_id IS NOT NULL AND new_parent_locked THEN
    RAISE EXCEPTION 'Cannot attach child to approved/completed parent %; demote parent first', new_parent.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.parent_project_id IS DISTINCT FROM NEW.parent_project_id THEN
    IF OLD.parent_project_id IS NOT NULL AND old_parent_locked THEN
      RAISE EXCEPTION 'Cannot detach child from approved/completed parent %; demote parent first', old_parent.id
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.parent_project_id IS NOT NULL AND new_parent_locked THEN
      RAISE EXCEPTION 'Cannot attach child to approved/completed parent %; demote parent first', new_parent.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.parent_project_id IS NOT NULL THEN
    old_child_completed := OLD.status = 'completed' OR OLD.completed_at IS NOT NULL;
    new_child_completed := NEW.status = 'completed' OR NEW.completed_at IS NOT NULL;

    IF OLD.status IN ('approved','completed')
       AND NEW.status NOT IN ('approved','completed')
       AND new_parent_locked THEN
      RAISE EXCEPTION 'Cannot regress child % from % under approved/completed parent %; demote parent first',
        NEW.id, OLD.status, new_parent.id USING ERRCODE = 'check_violation';
    END IF;

    IF new_parent_completed AND old_child_completed AND NOT new_child_completed THEN
      RAISE EXCEPTION 'Cannot un-complete child % under completed parent %; demote parent first',
        NEW.id, new_parent.id USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' AND OLD.parent_project_id IS NOT NULL AND old_parent_locked THEN
    RAISE EXCEPTION 'Cannot delete child % under approved/completed parent %; demote parent first',
      OLD.id, old_parent.id USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS engine_projects_child_rollup_guard ON public.engine_projects;
CREATE TRIGGER engine_projects_child_rollup_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.engine_projects
FOR EACH ROW EXECUTE FUNCTION public.tg_engine_projects_child_rollup_guard();

-- 7) Extend engine_projects gate
CREATE OR REPLACE FUNCTION public.tg_engine_projects_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a_missing jsonb;
  b_missing jsonb;
  has_contra boolean;
BEGIN
  IF (NEW.status = 'approved'
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved'))
     OR (
       NEW.project_kind <> 'parent'
       AND NEW.status = 'completed'
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed')
       AND (TG_OP = 'INSERT' OR OLD.approved_at IS NULL)
     ) THEN

    IF NEW.project_kind = 'parent' THEN
      IF NOT public.internal_all_children_approved(NEW.id) THEN
        RAISE EXCEPTION 'Cannot approve parent project %: not all children approved', NEW.id
          USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      has_contra := public.internal_project_has_contradictions(NEW.id);
      IF has_contra THEN
        RAISE EXCEPTION 'Cannot approve/complete project %: unresolved contradictions', NEW.id
          USING ERRCODE = 'check_violation';
      END IF;
      SELECT COALESCE(jsonb_agg(s.field_key),'[]'::jsonb) INTO a_missing
        FROM public.internal_spine_field_keys(NEW.id,'point-a') AS s(field_key)
       WHERE NOT EXISTS (SELECT 1 FROM public.engine_spine_field_truth t
         WHERE t.project_id=NEW.id AND t.spine='point-a'
           AND t.field_key=s.field_key AND t.status='approved_truth');
      SELECT COALESCE(jsonb_agg(s.field_key),'[]'::jsonb) INTO b_missing
        FROM public.internal_spine_field_keys(NEW.id,'point-b') AS s(field_key)
       WHERE NOT EXISTS (SELECT 1 FROM public.engine_spine_field_truth t
         WHERE t.project_id=NEW.id AND t.spine='point-b'
           AND t.field_key=s.field_key AND t.status='approved_truth');
      IF jsonb_array_length(a_missing) > 0 OR jsonb_array_length(b_missing) > 0 THEN
        RAISE EXCEPTION 'Cannot approve/complete project %: spine not fully approved. point_a_missing=%, point_b_missing=%',
          NEW.id, a_missing, b_missing USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  IF NEW.project_kind = 'parent' THEN
    IF (NEW.status = 'completed'
        AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed'))
       OR (NEW.completed_at IS NOT NULL
        AND (TG_OP = 'INSERT' OR OLD.completed_at IS NULL)) THEN
      IF NOT public.internal_all_children_approved(NEW.id)
         OR NOT public.internal_all_children_completed(NEW.id) THEN
        RAISE EXCEPTION 'Cannot complete parent project %: children must be both approved and completed', NEW.id
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS engine_projects_gate ON public.engine_projects;
CREATE TRIGGER engine_projects_gate
BEFORE INSERT OR UPDATE ON public.engine_projects
FOR EACH ROW EXECUTE FUNCTION public.tg_engine_projects_gate();

-- 8) Staff-only family summary view
CREATE OR REPLACE VIEW public.engine_project_family_summary
WITH (security_invoker = true)
AS
SELECT
  p.id AS parent_id,
  p.name AS parent_name,
  p.status AS parent_status,
  c.id AS child_id,
  c.name AS child_name,
  c.status AS child_status,
  c.current_step,
  c.progress_pct,
  c.approved_at,
  c.completed_at,
  c.client_portal_project_id
FROM public.engine_projects p
LEFT JOIN public.engine_projects c ON c.parent_project_id = p.id
WHERE p.project_kind = 'parent';

REVOKE ALL ON public.engine_project_family_summary FROM PUBLIC;
REVOKE ALL ON public.engine_project_family_summary FROM authenticated;
GRANT SELECT ON public.engine_project_family_summary TO service_role;