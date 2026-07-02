
ALTER TABLE public.engine_delivery_items
  ADD COLUMN IF NOT EXISTS client_portal_roadmap_id uuid REFERENCES public.client_portal_roadmaps(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_downloaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_acknowledged_by_email text;

CREATE INDEX IF NOT EXISTS idx_engine_delivery_items_portal_roadmap
  ON public.engine_delivery_items(client_portal_roadmap_id);
