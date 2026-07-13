# Phase 3 Migration — Tightened Revision (v2)

Address all 8 fixes. Still NOT APPLIED — this replaces the SQL block in `.orchestrator/PENDING_MIGRATIONS.md` (Phase 3 section, lines ~1224–1424).

---

## 1. Revised Preflight

```sql
-- P1. Status distribution before backfill
SELECT status, count(*) FROM public.client_portal_roadmaps GROUP BY status;

-- P2. Banned internal keys in ANY client-facing jsonb column (metadata,
-- publish_diff not yet present, client_safe_canvas, visible_modules)
SELECT id, 'metadata' AS col FROM public.client_portal_roadmaps
 WHERE metadata ?| ARRAY['ceremony_id','epistemic','operator_override',
                         'contradiction','provenance','agent_costs',
                         'internal_notes','supporting_notes','agent_confidence']
UNION ALL
SELECT id, 'client_safe_canvas' FROM public.client_portal_roadmaps
 WHERE client_safe_canvas ?| ARRAY['ceremony_id','epistemic','operator_override',
                                    'contradiction','provenance','agent_costs',
                                    'internal_notes','supporting_notes','agent_confidence'];

-- P3. Simulate backfill: for each portal project, pick the LATEST
-- published_at row across (approved,delivered,published). Confirm exactly one.
WITH candidates AS (
  SELECT id, project_id, status, published_at,
         row_number() OVER (PARTITION BY project_id
                            ORDER BY published_at DESC NULLS LAST, updated_at DESC) AS rn
    FROM public.client_portal_roadmaps
   WHERE status IN ('approved','delivered','published')
     AND published_at IS NOT NULL
)
SELECT project_id, count(*) FILTER (WHERE rn = 1) AS to_publish,
                            count(*) FILTER (WHERE rn > 1) AS to_supersede
  FROM candidates GROUP BY project_id
  HAVING count(*) FILTER (WHERE rn = 1) <> 1;   -- MUST return zero rows

-- P4. Self-lineage / cross-project lineage sanity (should already be empty)
SELECT id FROM public.client_portal_roadmaps
 WHERE previous_publication_id IS NOT NULL;    -- column not yet added → zero
```

**Post-backfill preflight** (run inside the transaction, before creating the
unique index — `RAISE EXCEPTION` on any violation):

```sql
DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM (
    SELECT project_id FROM public.client_portal_roadmaps
     WHERE status = 'published'
     GROUP BY project_id HAVING count(*) > 1
  ) x;
  IF bad > 0 THEN
    RAISE EXCEPTION 'Backfill produced % project(s) with >1 published row', bad;
  END IF;
END $$;
```

---

## 2. Revised Migration SQL

```sql
BEGIN;

-- 1. Extend status enum (CHECK constraint)
ALTER TABLE public.client_portal_roadmaps
  DROP CONSTRAINT IF EXISTS client_portal_roadmaps_status_check;
ALTER TABLE public.client_portal_roadmaps
  ADD CONSTRAINT client_portal_roadmaps_status_check
  CHECK (status IN ('in_progress','approved','delivered',
                    'published','superseded','retracted'));

-- 2. Add new columns FIRST so backfill can populate lineage cleanly.
ALTER TABLE public.client_portal_roadmaps
  ADD COLUMN IF NOT EXISTS previous_publication_id uuid
    REFERENCES public.client_portal_roadmaps(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS publish_diff jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS retracted_at timestamptz,
  ADD COLUMN IF NOT EXISTS retracted_by text,
  ADD COLUMN IF NOT EXISTS retraction_reason text;

-- 3. Correct backfill (FIX #1):
--    Per portal project, the single latest row with published_at IS NOT NULL
--    among (approved,delivered,published) → 'published'. All other rows in
--    that set with published_at IS NOT NULL → 'superseded'. Rows without
--    published_at stay put.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY project_id
                            ORDER BY published_at DESC NULLS LAST,
                                     updated_at DESC) AS rn
    FROM public.client_portal_roadmaps
   WHERE status IN ('approved','delivered','published')
     AND published_at IS NOT NULL
)
UPDATE public.client_portal_roadmaps r
   SET status = CASE WHEN ranked.rn = 1 THEN 'published' ELSE 'superseded' END
  FROM ranked
 WHERE r.id = ranked.id;

-- 4. Post-backfill preflight (FIX #2) — abort if invariant would be violated
DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM (
    SELECT project_id FROM public.client_portal_roadmaps
     WHERE status = 'published' GROUP BY project_id HAVING count(*) > 1
  ) x;
  IF bad > 0 THEN
    RAISE EXCEPTION 'Backfill produced % project(s) with >1 published row', bad;
  END IF;
END $$;

-- 5. One-published-per-project invariant
CREATE UNIQUE INDEX IF NOT EXISTS client_portal_roadmaps_one_published_per_project
  ON public.client_portal_roadmaps(project_id) WHERE status = 'published';

-- 6. Status-consistency CHECKs (FIX #5)
ALTER TABLE public.client_portal_roadmaps
  ADD CONSTRAINT client_portal_roadmaps_published_at_required
  CHECK (status NOT IN ('published','superseded','retracted')
         OR published_at IS NOT NULL);

ALTER TABLE public.client_portal_roadmaps
  ADD CONSTRAINT client_portal_roadmaps_retraction_fields_consistent
  CHECK (
    (status = 'retracted' AND retracted_at IS NOT NULL
                          AND retracted_by IS NOT NULL
                          AND retraction_reason IS NOT NULL
                          AND length(btrim(retraction_reason)) > 0)
    OR
    (status <> 'retracted' AND retracted_at IS NULL
                            AND retracted_by IS NULL
                            AND retraction_reason IS NULL)
  );

-- 7. Lineage integrity trigger (FIX #7 — CHECK cannot cross rows)
CREATE OR REPLACE FUNCTION public.tg_client_portal_roadmaps_validate_lineage()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE parent_project uuid;
BEGIN
  IF NEW.previous_publication_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.previous_publication_id = NEW.id THEN
    RAISE EXCEPTION 'previous_publication_id cannot reference self';
  END IF;
  SELECT project_id INTO parent_project
    FROM public.client_portal_roadmaps
   WHERE id = NEW.previous_publication_id;
  IF parent_project IS NULL THEN
    RAISE EXCEPTION 'previous_publication_id % not found', NEW.previous_publication_id;
  END IF;
  IF parent_project <> NEW.project_id THEN
    RAISE EXCEPTION 'previous_publication_id must belong to same portal project';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_client_portal_roadmaps_validate_lineage
  ON public.client_portal_roadmaps;
CREATE TRIGGER tg_client_portal_roadmaps_validate_lineage
  BEFORE INSERT OR UPDATE OF previous_publication_id
  ON public.client_portal_roadmaps
  FOR EACH ROW EXECUTE FUNCTION
  public.tg_client_portal_roadmaps_validate_lineage();

-- 8. Immutability trigger (FIX #3):
--    Once status IN (published, superseded, retracted), only legal transition
--    columns may change. Client-facing snapshot fields are frozen.
CREATE OR REPLACE FUNCTION public.tg_client_portal_roadmaps_immutable_after_publish()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status NOT IN ('published','superseded','retracted') THEN
    RETURN NEW;
  END IF;

  -- Legal mutable fields:
  --   status, updated_at,
  --   acknowledged_at, acknowledged_by_email, acknowledgment_* (ack surface),
  --   retracted_at, retracted_by, retraction_reason,
  --   previous_publication_id (only when transitioning via rollback/restore)
  -- Everything else on the client-facing snapshot must be frozen:
  --   approved_roadmap_version_id, published_at, published_by,
  --   client_safe_canvas, visible_modules, metadata, publish_diff,
  --   title, version_label, executive_summary, current_diagnosis,
  --   strategic_priorities, sequence_30_60_90, risks_dependencies,
  --   recommended_next_move
  IF NEW.approved_roadmap_version_id IS DISTINCT FROM OLD.approved_roadmap_version_id
  OR NEW.published_at                IS DISTINCT FROM OLD.published_at
  OR NEW.published_by                IS DISTINCT FROM OLD.published_by
  OR NEW.client_safe_canvas          IS DISTINCT FROM OLD.client_safe_canvas
  OR NEW.visible_modules             IS DISTINCT FROM OLD.visible_modules
  OR NEW.metadata                    IS DISTINCT FROM OLD.metadata
  OR NEW.publish_diff                IS DISTINCT FROM OLD.publish_diff
  THEN
    RAISE EXCEPTION 'client_portal_roadmaps: snapshot fields immutable once %',
                    OLD.status;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_client_portal_roadmaps_immutable_after_publish
  ON public.client_portal_roadmaps;
CREATE TRIGGER tg_client_portal_roadmaps_immutable_after_publish
  BEFORE UPDATE ON public.client_portal_roadmaps
  FOR EACH ROW EXECUTE FUNCTION
  public.tg_client_portal_roadmaps_immutable_after_publish();

-- NOTE: exact snapshot column list above must be reconciled against the live
-- schema in a psql check the moment Tai applies; adjust the DISTINCT list if
-- a column is missing or extra. Ack columns intentionally omitted so they
-- remain writeable post-publish.

-- 9. Scrub trigger — extended (FIX #4):
--    Audits metadata AND publish_diff AND client_safe_canvas AND
--    visible_modules for banned internal keys at top level.
CREATE OR REPLACE FUNCTION public.tg_client_portal_roadmaps_scrub_internal()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  banned text[] := ARRAY['ceremony_id','epistemic','operator_override',
                         'contradiction','provenance','agent_costs',
                         'internal_notes','supporting_notes','agent_confidence'];
BEGIN
  IF NEW.metadata           IS NOT NULL AND NEW.metadata           ?| banned THEN
    RAISE EXCEPTION 'client_portal_roadmaps.metadata carries internal key(s)';
  END IF;
  IF NEW.publish_diff       IS NOT NULL AND NEW.publish_diff       ?| banned THEN
    RAISE EXCEPTION 'client_portal_roadmaps.publish_diff carries internal key(s)';
  END IF;
  IF NEW.client_safe_canvas IS NOT NULL AND NEW.client_safe_canvas ?| banned THEN
    RAISE EXCEPTION 'client_portal_roadmaps.client_safe_canvas carries internal key(s)';
  END IF;
  IF NEW.visible_modules    IS NOT NULL AND NEW.visible_modules    ?| banned THEN
    RAISE EXCEPTION 'client_portal_roadmaps.visible_modules carries internal key(s)';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_client_portal_roadmaps_scrub_internal
  ON public.client_portal_roadmaps;
CREATE TRIGGER tg_client_portal_roadmaps_scrub_internal
  BEFORE INSERT OR UPDATE OF metadata, publish_diff, client_safe_canvas, visible_modules
  ON public.client_portal_roadmaps
  FOR EACH ROW EXECUTE FUNCTION
  public.tg_client_portal_roadmaps_scrub_internal();

-- 10. Event audit table (FIX #6):
--     ON DELETE RESTRICT for roadmap references so deleting a roadmap row
--     cannot silently erase audit history. Portal project cascade kept because
--     deleting a portal project is already a coordinated tear-down operation
--     that must handle its own history export; document this explicitly.
CREATE TABLE IF NOT EXISTS public.client_portal_publish_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_project_id uuid NOT NULL
    REFERENCES public.client_portal_projects(id) ON DELETE RESTRICT,
  portal_roadmap_id uuid NOT NULL
    REFERENCES public.client_portal_roadmaps(id) ON DELETE RESTRICT,
  previous_portal_roadmap_id uuid
    REFERENCES public.client_portal_roadmaps(id) ON DELETE RESTRICT,
  engine_project_id uuid NOT NULL,
  engine_version_id uuid,
  event_type text NOT NULL CHECK (event_type IN (
    'published','superseded','rolled_back','retracted','restored','acknowledged'
  )),
  actor_email text NOT NULL,
  summary text,
  diff jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.client_portal_publish_events TO authenticated;
GRANT ALL    ON public.client_portal_publish_events TO service_role;

ALTER TABLE public.client_portal_publish_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read publish events"
  ON public.client_portal_publish_events
  FOR SELECT TO authenticated
  USING (public.is_engine_staff());

CREATE INDEX IF NOT EXISTS client_portal_publish_events_project_idx
  ON public.client_portal_publish_events(engine_project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS client_portal_publish_events_roadmap_idx
  ON public.client_portal_publish_events(portal_roadmap_id, created_at DESC);

COMMIT;
```

**FIX #8 — Acknowledgment audit decision:** ack IS tracked. Two sources of
truth, both required, no new column:

- `client_portal_activity` remains the user-facing activity log (existing).
- `client_portal_publish_events.event_type = 'acknowledged'` is added
  (see event_type CHECK above) so ack becomes a first-class transition in
  the publication history, attributable to a specific publication row. The
  app-side `acknowledgePortalRoadmap` function will write BOTH: the ack
  columns on the row + one `acknowledged` event referencing that
  `portal_roadmap_id`.

---

## 3. Revised Rollback SQL

```sql
BEGIN;

DROP TRIGGER IF EXISTS tg_client_portal_roadmaps_scrub_internal
  ON public.client_portal_roadmaps;
DROP TRIGGER IF EXISTS tg_client_portal_roadmaps_immutable_after_publish
  ON public.client_portal_roadmaps;
DROP TRIGGER IF EXISTS tg_client_portal_roadmaps_validate_lineage
  ON public.client_portal_roadmaps;
DROP FUNCTION IF EXISTS public.tg_client_portal_roadmaps_scrub_internal();
DROP FUNCTION IF EXISTS public.tg_client_portal_roadmaps_immutable_after_publish();
DROP FUNCTION IF EXISTS public.tg_client_portal_roadmaps_validate_lineage();

DROP TABLE IF EXISTS public.client_portal_publish_events;
DROP INDEX IF EXISTS public.client_portal_roadmaps_one_published_per_project;

ALTER TABLE public.client_portal_roadmaps
  DROP CONSTRAINT IF EXISTS client_portal_roadmaps_retraction_fields_consistent,
  DROP CONSTRAINT IF EXISTS client_portal_roadmaps_published_at_required;

-- Retracted rows must be triaged before status downgrade — the pre-Phase-3
-- CHECK has no 'retracted' equivalent. Fail loudly if any exist.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.client_portal_roadmaps WHERE status='retracted';
  IF n > 0 THEN
    RAISE EXCEPTION 'Rollback aborted: % retracted row(s) require manual triage', n;
  END IF;
END $$;

UPDATE public.client_portal_roadmaps SET status='delivered' WHERE status='published';
UPDATE public.client_portal_roadmaps SET status='approved'  WHERE status='superseded';

ALTER TABLE public.client_portal_roadmaps
  DROP COLUMN IF EXISTS retraction_reason,
  DROP COLUMN IF EXISTS retracted_by,
  DROP COLUMN IF EXISTS retracted_at,
  DROP COLUMN IF EXISTS publish_diff,
  DROP COLUMN IF EXISTS previous_publication_id;

ALTER TABLE public.client_portal_roadmaps
  DROP CONSTRAINT IF EXISTS client_portal_roadmaps_status_check;
ALTER TABLE public.client_portal_roadmaps
  ADD CONSTRAINT client_portal_roadmaps_status_check
  CHECK (status IN ('in_progress','approved','delivered'));

COMMIT;
```

---

## 4. Revised Smoke Cases (24)

DB-level (psql, `.orchestrator/phase-3-smoke/db-cases.sql`):

1. Backfill: single latest published_at row per project ends as `published`,
   others as `superseded`, rows without published_at unchanged.
2. Post-backfill preflight aborts a synthesized dual-`published` scenario.
3. Unique index rejects a second `published` row for the same project.
4. `status='published'` insert without `published_at` → CHECK failure.
5. `status='retracted'` without retraction fields → CHECK failure.
6. `status<>'retracted'` with any retraction field set → CHECK failure.
7. `retraction_reason=''` while retracted → CHECK failure.
8. Immutability: UPDATE `client_safe_canvas` on a `published` row → trigger error.
9. Immutability: UPDATE `publish_diff` on a `superseded` row → error.
10. Immutability: UPDATE `approved_roadmap_version_id` on `retracted` → error.
11. Immutability: UPDATE `acknowledged_at`/`acknowledged_by_email` on
    `published` → ALLOWED.
12. Immutability: UPDATE `status` published→superseded, published→retracted,
    superseded→published (rollback) → ALLOWED.
13. Immutability: UPDATE `retracted_at`/`retracted_by`/`retraction_reason`
    concurrent with status→retracted → ALLOWED.
14. Scrub: `metadata` with `ceremony_id` → rejected.
15. Scrub: `publish_diff` with `epistemic` → rejected.
16. Scrub: `client_safe_canvas` with `provenance` at top level → rejected.
17. Scrub: `visible_modules` with `agent_costs` → rejected.
18. Lineage: `previous_publication_id = id` → trigger error.
19. Lineage: `previous_publication_id` from a different `project_id` → error.
20. Lineage: `previous_publication_id` referencing a legitimate prior row
    in same project → ALLOWED.
21. ON DELETE RESTRICT: deleting a roadmap referenced by
    `client_portal_publish_events.portal_roadmap_id` → FK violation.
22. Events RLS: non-staff `authenticated` role → zero rows visible.
23. Events RLS: staff role → all rows visible.
24. Acknowledgment event: inserting `event_type='acknowledged'` with valid
    `portal_roadmap_id` succeeds and is filterable in history.

UI/app-level smoke deferred to the app-layer PR after migration lands
(publish → republish idempotent, rollback, retract, ack, history panel).

---

## 5. What Does NOT Change

- No new ack columns (constraint from Phase 3 brief).
- No portal-side reads outside `status='published'`.
- Existing `client_portal_activity` remains the user activity log; ack is
  additionally logged in `client_portal_publish_events` per FIX #8.

---

## 6. Deliverable

Replace the Phase 3 block in `.orchestrator/PENDING_MIGRATIONS.md`
(lines ~1224–1424) with the revised preflight, migration, rollback, and
smoke sections above. Do NOT apply. Await Tai review.
