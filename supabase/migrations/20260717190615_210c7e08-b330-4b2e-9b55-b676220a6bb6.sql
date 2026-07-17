ALTER TABLE public.engine_activity
  ADD COLUMN IF NOT EXISTS actor_email TEXT;