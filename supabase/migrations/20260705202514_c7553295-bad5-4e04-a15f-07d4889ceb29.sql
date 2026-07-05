ALTER TABLE public.client_portal_roadmaps
  ADD COLUMN IF NOT EXISTS client_safe_canvas jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.client_portal_roadmaps.client_safe_canvas IS
  'Typed, allowlisted canvas snapshot generated at publish time from the approved engine roadmap version. Portal reads prefer this over sequence_30_60_90 for higher-fidelity rendering. Never contains internal engine data.';