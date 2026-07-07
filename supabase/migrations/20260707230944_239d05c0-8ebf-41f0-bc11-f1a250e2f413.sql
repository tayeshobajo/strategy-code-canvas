UPDATE public.engine_projects
SET investment_confirmed_at = now(),
    investment_confirmed_by = 'qa-operator@trust-tai.com'
WHERE id = '4dd1d519-b56c-4e2e-bfce-d49b208527a4';
INSERT INTO public.engine_audit_log (project_id, actor_email, action, summary, affected_modules)
VALUES ('4dd1d519-b56c-4e2e-bfce-d49b208527a4', 'qa-operator@trust-tai.com', 'investment_confirmed',
        'Phase 12 QA: investment confirmed to unlock version approval on Event Site project.',
        ARRAY['investment']);