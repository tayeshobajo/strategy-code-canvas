-- G-3: Add a direct FK from engine_review_items -> engine_roadmap_versions.
-- Prior to this, decideReviewItem matched review items to versions by label
-- and fell back to rows[0] when the label didn't match. With two co-existing
-- drafts, that could approve the wrong version.
--
-- The new column is nullable so:
--   - Legacy review items keep working (label fallback still runs).
--   - Non-version review items (Intake Ready, decision responses, etc.)
--     don't need to carry a version reference.
--
-- ON DELETE SET NULL: if a version is ever hard-deleted, we keep the audit
-- history of the review item and simply lose the link.

ALTER TABLE public.engine_review_items
  ADD COLUMN IF NOT EXISTS version_id uuid
    REFERENCES public.engine_roadmap_versions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS engine_review_items_version_id_idx
  ON public.engine_review_items(version_id);

COMMENT ON COLUMN public.engine_review_items.version_id IS
  'FK to engine_roadmap_versions when item_type is roadmap_version. Populated on AI-pipeline insert. decideReviewItem approves this exact version — no label matching.';
