CREATE TABLE IF NOT EXISTS public.published_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  seo_title text NOT NULL,
  meta_description text NOT NULL,
  body_markdown text NOT NULL,
  category text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  image_url text,
  image_alt text,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.published_insights FROM anon, authenticated;
GRANT ALL ON public.published_insights TO service_role;

ALTER TABLE public.published_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages published insights"
  ON public.published_insights
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS published_insights_published_at_idx
  ON public.published_insights (published_at DESC);