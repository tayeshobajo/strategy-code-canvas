-- Gap 15 (audit): document the ON DELETE CASCADE intent on
-- engine_tasks.milestone_id.
--
-- Decision: KEEP the cascade. The alternative (SET NULL) is impossible —
-- Pillar 11 (migration 20260706003158) made milestone_id NOT NULL to enforce
-- task→milestone linkage, so orphaned tasks cannot exist by design.
--
-- Why the cascade is safe today:
--   * No app code hard-deletes engine_milestones rows individually. The
--     intelligence pipeline never mutates approved milestones (it stashes
--     suggested_milestone_changes on the version payload for review), and
--     version apply "removes" milestones via soft-drop
--     (approval_status='dropped'), never DELETE.
--   * The only DELETE paths are project-level (engine_projects FK cascade)
--     and intake rollback of a half-born project — in both, deleting the
--     tasks along with their milestones is exactly the intent.
--
-- If a future feature adds individual milestone deletion, it MUST either
-- soft-drop (preferred, matches version apply) or explicitly migrate the
-- milestone's tasks first — the cascade will otherwise delete them silently.

COMMENT ON COLUMN public.engine_tasks.milestone_id IS
  'NOT NULL + ON DELETE CASCADE (intentional, audit Gap 15): tasks cannot outlive their milestone. Milestone removal is only ever a soft-drop (approval_status=dropped) or a whole-project cascade; never hard-delete an individual milestone without first migrating its tasks.';
