-- H1.1: pause-state columns
ALTER TABLE public.engine_projects
  ADD COLUMN IF NOT EXISTS cost_paused_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS cost_paused_reason text NULL;

CREATE INDEX IF NOT EXISTS engine_projects_cost_paused_idx
  ON public.engine_projects (cost_paused_at)
  WHERE cost_paused_at IS NOT NULL;

-- H1.2: guard function
CREATE OR REPLACE FUNCTION public.tg_engine_agent_costs_cap_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_budget integer;
  v_spend integer;
  v_already_paused timestamptz;
  v_project_name text;
BEGIN
  SELECT agent_budget_monthly_cents, cost_paused_at, name
    INTO v_budget, v_already_paused, v_project_name
  FROM public.engine_projects WHERE id = NEW.project_id;

  IF v_budget IS NULL OR v_budget <= 0 THEN
    RETURN NEW;
  END IF;
  IF v_already_paused IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(cost_cents), 0) INTO v_spend
  FROM public.engine_agent_costs
  WHERE project_id = NEW.project_id
    AND created_at >= date_trunc('month', now());

  IF v_spend > v_budget THEN
    UPDATE public.engine_projects
       SET cost_paused_at = now(),
           cost_paused_reason = format(
             'Month-to-date spend $%s exceeded budget $%s',
             to_char(v_spend/100.0, 'FM999,999,990.00'),
             to_char(v_budget/100.0, 'FM999,999,990.00'))
     WHERE id = NEW.project_id;

    INSERT INTO public.engine_review_items
      (project_id, project, item_type, title, impact, source, status)
    VALUES
      (NEW.project_id, v_project_name, 'cost_overrun',
       format('Cost cap exceeded — project auto-paused ($%s / $%s)',
              to_char(v_spend/100.0, 'FM999,999,990.00'),
              to_char(v_budget/100.0, 'FM999,999,990.00')),
       'high', 'cost_guard_auto', 'pending');

    INSERT INTO public.engine_audit_log
      (project_id, action, actor_email, field_changed, old_value, new_value, reason, metadata)
    VALUES
      (NEW.project_id, 'project.cost.autopause', 'system:cost_guard',
       'cost_paused_at', NULL, now()::text,
       format('spend_cents=%s budget_cents=%s', v_spend, v_budget),
       jsonb_build_object('spend_cents', v_spend, 'budget_cents', v_budget,
                          'triggering_cost_id', NEW.id));
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS engine_agent_costs_cap_guard ON public.engine_agent_costs;
CREATE TRIGGER engine_agent_costs_cap_guard
  AFTER INSERT ON public.engine_agent_costs
  FOR EACH ROW EXECUTE FUNCTION public.tg_engine_agent_costs_cap_guard();