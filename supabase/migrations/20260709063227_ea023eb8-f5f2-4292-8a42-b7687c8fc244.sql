-- 1. Lock down direct client mutations on chat proposals.
-- Server functions perform UPDATE/DELETE via the service role (supabaseAdmin);
-- browser sessions (role `authenticated`) must go through those functions so
-- audit + activity rows are guaranteed.
REVOKE UPDATE, DELETE ON public.engine_project_chat_proposals FROM authenticated;
REVOKE UPDATE, DELETE ON public.engine_project_chat_proposals FROM anon;

-- 2. Defense-in-depth: enforce allowed status transitions at the DB layer,
-- regardless of caller (blocks even a compromised staff session or a stray
-- service_role UPDATE that skips the state machine).
CREATE OR REPLACE FUNCTION public.tg_engine_chat_proposals_enforce_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  old_status text := OLD.status;
  new_status text := NEW.status;
  allowed boolean := false;
BEGIN
  IF old_status = new_status THEN
    RETURN NEW;
  END IF;

  -- Terminal states cannot move.
  IF old_status IN ('dismissed','submitted_for_review','converted') THEN
    RAISE EXCEPTION 'engine_project_chat_proposals: cannot transition from terminal status % to %', old_status, new_status;
  END IF;

  -- Only the conversion function (which sets converted_ref.table = engine_tasks)
  -- may write status = converted. The check is a soft signal — the real gate is
  -- the REVOKE above plus the server function's role check.
  IF new_status = 'converted' THEN
    IF NEW.converted_ref IS NULL
       OR (NEW.converted_ref->>'table') IS DISTINCT FROM 'engine_tasks'
       OR (NEW.converted_ref->>'id') IS NULL THEN
      RAISE EXCEPTION 'engine_project_chat_proposals: converted status requires converted_ref.table=engine_tasks with id';
    END IF;
  END IF;

  IF old_status = 'draft' AND new_status IN ('saved','dismissed','submitted_for_review','converted') THEN
    allowed := true;
  ELSIF old_status = 'saved' AND new_status IN ('dismissed','submitted_for_review','converted') THEN
    allowed := true;
  END IF;

  IF NOT allowed THEN
    RAISE EXCEPTION 'engine_project_chat_proposals: invalid transition % → %', old_status, new_status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS engine_chat_proposals_enforce_transition
  ON public.engine_project_chat_proposals;
CREATE TRIGGER engine_chat_proposals_enforce_transition
  BEFORE UPDATE OF status ON public.engine_project_chat_proposals
  FOR EACH ROW EXECUTE FUNCTION public.tg_engine_chat_proposals_enforce_transition();

-- 3. Drop the now-redundant staff UPDATE/DELETE policies. Without table-level
-- UPDATE/DELETE grants they were unreachable, but keeping them around implies
-- direct client edits are supported. Server functions use the service role,
-- which bypasses RLS.
DROP POLICY IF EXISTS "engine_chat_proposals_staff_update"
  ON public.engine_project_chat_proposals;
DROP POLICY IF EXISTS "engine_chat_proposals_staff_delete"
  ON public.engine_project_chat_proposals;