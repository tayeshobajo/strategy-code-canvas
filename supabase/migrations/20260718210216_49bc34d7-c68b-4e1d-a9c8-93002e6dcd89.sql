
CREATE OR REPLACE FUNCTION public.set_updated_at_now() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.engine_world_entry_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  section TEXT NOT NULL CHECK (section IN ('destination','competitors','vocabulary','evidence','general')),
  world_entry_version INTEGER NOT NULL,
  parent_id UUID REFERENCES public.engine_world_entry_comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  author_email TEXT NOT NULL,
  mentions TEXT[] NOT NULL DEFAULT '{}',
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by_email TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wec_project_section ON public.engine_world_entry_comments(project_id, section, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_world_entry_comments TO authenticated;
GRANT ALL ON public.engine_world_entry_comments TO service_role;
ALTER TABLE public.engine_world_entry_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators read world entry comments"
  ON public.engine_world_entry_comments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'));
CREATE POLICY "Operators insert world entry comments"
  ON public.engine_world_entry_comments FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'));
CREATE POLICY "Operators update world entry comments"
  ON public.engine_world_entry_comments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'));
CREATE POLICY "Operators delete world entry comments"
  ON public.engine_world_entry_comments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'));

CREATE TRIGGER trg_wec_updated_at
  BEFORE UPDATE ON public.engine_world_entry_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();
