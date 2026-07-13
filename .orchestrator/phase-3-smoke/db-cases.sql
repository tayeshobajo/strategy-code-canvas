-- Phase 3 v4 — DB smoke suite (30 cases)
-- Run each block in its own transaction; expected result annotated.
-- These are executable snippets, not a self-checking harness. Run manually
-- against a scratch project row after seeding fixtures.

-- Fixtures assumed:
--   :proj_a, :proj_b   = two client_portal_projects.id values
--   :rmA1, :rmA2       = two roadmap ids under :proj_a
--   :rmB1              = one roadmap id under :proj_b

-- ============================================================
-- BACKFILL / STATE
-- ============================================================

-- S01 Backfill: latest published_at per project → published; older → superseded.
--     (Verified in production preflight: 7 projects → 7 published rows.)
SELECT project_id, count(*) FILTER (WHERE status='published') AS pub
  FROM public.client_portal_roadmaps GROUP BY project_id;
-- expect: pub = 1 per project

-- S02 Post-backfill preflight aborts synthesized dual-published.
--     (Covered by DO block inside migration; smoke = re-run backfill query.)

-- S03 Unique index rejects a second published row per project.
INSERT INTO public.client_portal_roadmaps
  (project_id, title, version_label, status, published_at, published_by)
VALUES (:proj_a, 't', 'v', 'published', now(), 'x@y');
-- expect: unique_violation on client_portal_roadmaps_one_published_per_project

-- ============================================================
-- STATUS / CHECK CONSTRAINTS
-- ============================================================

-- S04 published without published_at → CHECK
INSERT INTO public.client_portal_roadmaps (project_id, title, version_label, status)
VALUES (:proj_b, 't', 'v', 'published');
-- expect: client_portal_roadmaps_published_at_required

-- S05 retracted without retraction fields → CHECK
INSERT INTO public.client_portal_roadmaps
  (project_id, title, version_label, status, published_at)
VALUES (:proj_b, 't', 'v', 'retracted', now());
-- expect: client_portal_roadmaps_retraction_fields_consistent

-- S06 non-retracted with retraction fields → CHECK
UPDATE public.client_portal_roadmaps SET retraction_reason='x' WHERE id=:rmA1;
-- expect: client_portal_roadmaps_retraction_fields_consistent

-- S07 retracted with empty reason → CHECK
-- (requires row already retracted-shape; simulated via UPDATE with all fields blank/empty)

-- ============================================================
-- IMMUTABILITY (post-publish rows)
-- ============================================================

-- S08 UPDATE client_safe_canvas on published → immutability
UPDATE public.client_portal_roadmaps SET client_safe_canvas='{}'::jsonb WHERE id=:rmA1;
-- expect: snapshot fields immutable once published

-- S09 UPDATE publish_diff on superseded → immutability (after superseding row exists)

-- S10 UPDATE approved_roadmap_version_id on retracted → immutability

-- S11 UPDATE acknowledged_at / acknowledged_by_email on published → ALLOWED
UPDATE public.client_portal_roadmaps
   SET acknowledged_at=now(), acknowledged_by_email='c@x'
 WHERE id=:rmA1;
-- expect: success

-- ============================================================
-- TRANSITIONS
-- ============================================================

-- S12 published → superseded ALLOWED; published → retracted ALLOWED (with fields)

-- S13 Concurrent status='retracted' + retraction fields ALLOWED

-- ============================================================
-- SCRUB (top-level)
-- ============================================================

-- S14 metadata top-level ceremony_id → rejected, error names 'ceremony_id'
-- S15 publish_diff top-level epistemic → rejected
-- S16 client_safe_canvas top-level provenance → rejected
-- S17 visible_modules top-level agent_costs → rejected

-- ============================================================
-- LINEAGE
-- ============================================================

-- S18 previous_publication_id = id → trigger error
-- S19 previous_publication_id from different project → error
-- S20 valid prior row same project → ALLOWED

-- ============================================================
-- EVENTS
-- ============================================================

-- S21 ON DELETE RESTRICT: deleting roadmap referenced by event → FK violation
-- S22 Events RLS: non-staff authenticated → zero rows
-- S23 Events RLS: staff sees all
-- S24 acknowledged event insert succeeds, filterable in history, passes ref trigger

-- ============================================================
-- v3 additions: RECURSIVE SCRUB
-- ============================================================

-- S25 banned key nested 3 levels deep in client_safe_canvas.phases[0].items[0].provenance
UPDATE public.client_portal_roadmaps
   SET client_safe_canvas =
     '{"phases":[{"items":[{"provenance":"x"}]}]}'::jsonb
 WHERE id=:rmA2;  -- pre-publish row
-- expect: client_safe_canvas carries internal key: provenance

-- S26 metadata.publish.debug.agent_costs → rejected, names 'agent_costs'
UPDATE public.client_portal_roadmaps
   SET metadata = '{"publish":{"debug":{"agent_costs":1}}}'::jsonb
 WHERE id=:rmA2;
-- expect: metadata carries internal key: agent_costs

-- ============================================================
-- v4 additions: TRANSITION WHITELIST
-- ============================================================

-- S27 Rejected transitions (each own txn):
--   published → approved
--   superseded → in_progress
--   retracted → delivered
--   published → in_progress
-- expect: invalid_status_transition

-- S28 DB layer ALLOWS (no metadata reason):
--   superseded → published
--   retracted → published (with retraction fields cleared)
-- expect: success at DB. Pairing enforced by app smoke A1/A2.

-- ============================================================
-- v4: IMMUTABILITY of project_id
-- ============================================================

-- S29 UPDATE project_id on published/superseded/retracted row → immutability error
UPDATE public.client_portal_roadmaps SET project_id=:proj_b WHERE id=:rmA1;
-- expect: snapshot fields immutable once published
-- Pre-publish row (in_progress/approved) may change project_id but re-runs lineage trigger.

-- ============================================================
-- v4: PUBLISH-EVENT REF VALIDATION
-- ============================================================

-- S30a portal_roadmap_id whose project_id ≠ portal_project_id → rejected
INSERT INTO public.client_portal_publish_events
  (portal_project_id, portal_roadmap_id, engine_project_id, event_type, actor_email)
VALUES (:proj_b, :rmA1, gen_random_uuid(), 'published', 'x@y');
-- expect: portal_roadmap_id belongs to different portal project

-- S30b previous_portal_roadmap_id from different project → rejected
INSERT INTO public.client_portal_publish_events
  (portal_project_id, portal_roadmap_id, previous_portal_roadmap_id,
   engine_project_id, event_type, actor_email)
VALUES (:proj_a, :rmA1, :rmB1, gen_random_uuid(), 'rolled_back', 'x@y');
-- expect: previous_portal_roadmap_id belongs to different portal project

-- S30c previous_portal_roadmap_id = portal_roadmap_id → rejected
INSERT INTO public.client_portal_publish_events
  (portal_project_id, portal_roadmap_id, previous_portal_roadmap_id,
   engine_project_id, event_type, actor_email)
VALUES (:proj_a, :rmA1, :rmA1, gen_random_uuid(), 'rolled_back', 'x@y');
-- expect: previous_portal_roadmap_id cannot equal portal_roadmap_id

-- S30d UPDATE existing event to swap portal_roadmap_id to foreign-project row → rejected
-- (insert a valid event first, then UPDATE its portal_roadmap_id to :rmB1)

-- S30e valid rolled_back event with same-project previous ref → ALLOWED
-- (insert with proj_a + rmA1 + previous=rmA2)

-- ============================================================
-- APP-LEVEL SMOKE (deferred to next turn)
-- ============================================================

-- A1 rollbackPortalPublication writes exactly one rolled_back event
--    referencing the target roadmap in the same txn as the superseded→published
--    UPDATE. If event insert fails, the status flip rolls back.
--
-- A2 restorePortalPublication same shape, event_type='restored',
--    retracted→published transition, retraction fields cleared.
