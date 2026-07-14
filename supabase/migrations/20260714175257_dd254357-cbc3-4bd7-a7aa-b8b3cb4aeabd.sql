-- 1. Small helper that flips the transaction-local GUC so governed writes go through.
CREATE OR REPLACE FUNCTION public.begin_proposal_apply()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('engine.proposal_apply', 'on', true);
END $$;

REVOKE ALL ON FUNCTION public.begin_proposal_apply() FROM public;
GRANT EXECUTE ON FUNCTION public.begin_proposal_apply() TO authenticated;

-- 2. Atomic apply RPC — validates the proposal, sets the GUC, and performs
--    the governed UPDATE inside one transaction.
CREATE OR REPLACE FUNCTION public.apply_approved_proposal(_proposal_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p           public.engine_project_chat_proposals%ROWTYPE;
  payload     jsonb;
  target_lbl  text := NULL;
  caller_uid  uuid := auth.uid();
BEGIN
  IF caller_uid IS NULL THEN
    RAISE EXCEPTION 'apply_approved_proposal: not authenticated';
  END IF;
  IF NOT public.has_role(caller_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'apply_approved_proposal: admin role required';
  END IF;

  SELECT * INTO p FROM public.engine_project_chat_proposals WHERE id = _proposal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'apply_approved_proposal: proposal not found';
  END IF;
  IF p.status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'apply_approved_proposal: proposal % is not in approved status', _proposal_id;
  END IF;
  IF p.target_id IS NULL OR p.target_kind IS NULL THEN
    RAISE EXCEPTION 'apply_approved_proposal: proposal % is missing target_kind / target_id', _proposal_id;
  END IF;
  IF p.created_by IS NOT NULL AND p.created_by = p.approved_by THEN
    RAISE EXCEPTION 'apply_approved_proposal: created_by = approved_by is forbidden (no AI self-approval)';
  END IF;

  payload := COALESCE(p.payload, '{}'::jsonb);
  PERFORM set_config('engine.proposal_apply', 'on', true);

  IF p.target_kind = 'milestone' THEN
    UPDATE public.engine_milestones
       SET brief_md = COALESCE(payload->>'brief_md', brief_md),
           acceptance_criteria = CASE
             WHEN payload ? 'acceptance_criteria' THEN payload->'acceptance_criteria'
             ELSE acceptance_criteria
           END,
           developer_prompt = COALESCE(payload->>'developer_prompt', developer_prompt),
           client_safe_md = COALESCE(payload->>'client_safe_md', client_safe_md)
     WHERE id = p.target_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'apply_approved_proposal: target milestone % not found', p.target_id;
    END IF;
    target_lbl := 'engine_milestones:' || p.target_id::text;

  ELSIF p.target_kind = 'implementation_plan' THEN
    UPDATE public.engine_project_implementation_plans
       SET summary = COALESCE(payload->>'summary', summary),
           payload = CASE
             WHEN payload ? 'payload' THEN payload->'payload'
             ELSE payload
           END
     WHERE id = p.target_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'apply_approved_proposal: target implementation_plan % not found', p.target_id;
    END IF;
    target_lbl := 'engine_project_implementation_plans:' || p.target_id::text;

  ELSE
    RAISE EXCEPTION 'apply_approved_proposal: unsupported target_kind %', p.target_kind;
  END IF;

  RETURN target_lbl;
END $$;

REVOKE ALL ON FUNCTION public.apply_approved_proposal(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_approved_proposal(uuid) TO authenticated;

-- 3. Milestone trigger — governs brief_md / acceptance_criteria / developer_prompt / client_safe_md.
CREATE OR REPLACE FUNCTION public.tg_engine_milestones_require_proposal()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('engine.proposal_apply', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.brief_md IS DISTINCT FROM OLD.brief_md
     OR NEW.acceptance_criteria IS DISTINCT FROM OLD.acceptance_criteria
     OR NEW.developer_prompt IS DISTINCT FROM OLD.developer_prompt
     OR NEW.client_safe_md IS DISTINCT FROM OLD.client_safe_md THEN
    RAISE EXCEPTION 'Milestone body edits (brief_md / acceptance_criteria / developer_prompt / client_safe_md) must go through an approved chat proposal applied via public.apply_approved_proposal().';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS engine_milestones_require_proposal ON public.engine_milestones;
CREATE TRIGGER engine_milestones_require_proposal
  BEFORE UPDATE ON public.engine_milestones
  FOR EACH ROW EXECUTE FUNCTION public.tg_engine_milestones_require_proposal();

-- 4. Implementation-plan trigger — governs summary + payload.
CREATE OR REPLACE FUNCTION public.tg_engine_impl_plans_require_proposal()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('engine.proposal_apply', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.summary IS DISTINCT FROM OLD.summary
     OR NEW.payload IS DISTINCT FROM OLD.payload THEN
    RAISE EXCEPTION 'Implementation-plan body edits (summary / payload) must go through an approved chat proposal applied via public.apply_approved_proposal().';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS engine_impl_plans_require_proposal ON public.engine_project_implementation_plans;
CREATE TRIGGER engine_impl_plans_require_proposal
  BEFORE UPDATE ON public.engine_project_implementation_plans
  FOR EACH ROW EXECUTE FUNCTION public.tg_engine_impl_plans_require_proposal();

-- 5. Admin-only atomic writer for governed milestone columns.
CREATE OR REPLACE FUNCTION public.admin_edit_milestone_governed(_id uuid, _patch jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_uid uuid := auth.uid();
BEGIN
  IF caller_uid IS NULL THEN
    RAISE EXCEPTION 'admin_edit_milestone_governed: not authenticated';
  END IF;
  IF NOT public.has_role(caller_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin_edit_milestone_governed: admin role required';
  END IF;
  IF _patch IS NULL OR jsonb_typeof(_patch) <> 'object' THEN
    RAISE EXCEPTION 'admin_edit_milestone_governed: _patch must be a JSON object';
  END IF;

  PERFORM set_config('engine.proposal_apply', 'on', true);

  UPDATE public.engine_milestones
     SET brief_md = CASE WHEN _patch ? 'brief_md' THEN NULLIF(_patch->>'brief_md', '') ELSE brief_md END,
         acceptance_criteria = CASE WHEN _patch ? 'acceptance_criteria' THEN _patch->'acceptance_criteria' ELSE acceptance_criteria END,
         developer_prompt = CASE WHEN _patch ? 'developer_prompt' THEN NULLIF(_patch->>'developer_prompt', '') ELSE developer_prompt END,
         client_safe_md = CASE WHEN _patch ? 'client_safe_md' THEN NULLIF(_patch->>'client_safe_md', '') ELSE client_safe_md END
   WHERE id = _id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_edit_milestone_governed: milestone % not found', _id;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.admin_edit_milestone_governed(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_edit_milestone_governed(uuid, jsonb) TO authenticated;

-- 6. Sibling admin-editor for implementation plans (summary + payload).
--    Callable by admins OR service_role (used from server code via supabaseAdmin,
--    which already runs behind assertStaff gates in the app).
CREATE OR REPLACE FUNCTION public.admin_edit_impl_plan_governed(_id uuid, _patch jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_uid uuid := auth.uid();
  caller_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  -- Allow when caller is an authenticated admin OR when running as service_role
  -- (server-side supabaseAdmin path — assertStaff already gated in app code).
  IF caller_role = 'service_role' THEN
    NULL;
  ELSIF caller_uid IS NOT NULL AND public.has_role(caller_uid, 'admin'::public.app_role) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'admin_edit_impl_plan_governed: admin role or service_role required';
  END IF;

  IF _patch IS NULL OR jsonb_typeof(_patch) <> 'object' THEN
    RAISE EXCEPTION 'admin_edit_impl_plan_governed: _patch must be a JSON object';
  END IF;

  PERFORM set_config('engine.proposal_apply', 'on', true);

  UPDATE public.engine_project_implementation_plans
     SET summary = CASE WHEN _patch ? 'summary' THEN NULLIF(_patch->>'summary', '') ELSE summary END,
         payload = CASE WHEN _patch ? 'payload' THEN _patch->'payload' ELSE payload END
   WHERE id = _id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_edit_impl_plan_governed: implementation plan % not found', _id;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.admin_edit_impl_plan_governed(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_edit_impl_plan_governed(uuid, jsonb) TO authenticated, service_role;