ALTER TABLE public.engine_audit_log
  ADD COLUMN IF NOT EXISTS field_changed text,
  ADD COLUMN IF NOT EXISTS old_value jsonb,
  ADD COLUMN IF NOT EXISTS new_value jsonb,
  ADD COLUMN IF NOT EXISTS reason text;