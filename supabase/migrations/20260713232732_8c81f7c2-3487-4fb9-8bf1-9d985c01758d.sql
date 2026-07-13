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
  new_parent_completed boolean := false;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.parent_project_id IS NOT NULL THEN
    SELECT * INTO old_parent FROM public.engine_projects WHERE id = OLD.parent_project_id;
    old_parent_locked := old_parent.status IN ('approved','completed') OR old_parent.completed_at IS NOT NULL;
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

  IF TG_OP = 'UPDATE' AND OLD.parent_project_id IS DISTINCT FROM NEW.parent_project_id THEN
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
    -- Approval regression under an approved/completed parent
    IF OLD.status IN ('approved','completed')
       AND NEW.status NOT IN ('approved','completed')
       AND new_parent_locked THEN
      RAISE EXCEPTION 'Cannot regress child % from % under approved/completed parent %; demote parent first',
        NEW.id, OLD.status, new_parent.id USING ERRCODE = 'check_violation';
    END IF;

    -- Un-completion under a completed parent. Block EITHER signal being unwound
    -- so an inconsistent row (status=completed with completed_at=NULL, or vice
    -- versa) cannot bypass the predicate check.
    IF new_parent_completed AND (
         (OLD.completed_at IS NOT NULL AND NEW.completed_at IS NULL)
         OR (OLD.status = 'completed' AND NEW.status IS DISTINCT FROM 'completed')
       ) THEN
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