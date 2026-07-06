ALTER TABLE public.engine_projects
  ADD COLUMN IF NOT EXISTS investment_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS investment_confirmed_by TEXT;