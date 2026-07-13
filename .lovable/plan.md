# Phase 3 — Governed Portal Publication

Turn "publish to portal" from a single INSERT into `client_portal_roadmaps` into a governed system transition with an explicit state machine, immutable published snapshots, diff-aware republish, reversible rollback, and a full audit trail. Reuse existing ack columns; keep portal strictly downstream.

---

## 1. Current-state audit (what exists today)

**Publish path**
- `publishVersionToPortal` (src/lib/engine-ops.functions.ts:1043) requires `version.status='approved'`, `client_preview_status='approved'`, `investment_confirmed_at`, and a linked `client_portal_project_id`.
- Writes: sets any prior `delivered` row on the same portal project to `approved`, inserts a NEW `client_portal_roadmaps` row with `status='delivered'`, `approved_at=now`, `published_at=now`, and a `buildClientSafePayload(...)` projection. Stamps `engine_roadmap_versions.published_to_portal_at` + `published_portal_roadmap_id`. Writes one `engine_audit_log` row.
- `sendProjectDelivery` (engine-execution) mirrors the same insert pattern for the delivery flow.

**Ack columns already on `client_portal_roadmaps`** (do NOT duplicate):
`status`, `approved_roadmap_version_id`, `approved_at`, `published_at`, `published_by`, `acknowledged_at`, `acknowledged_by_email`, `visible_modules`, `client_safe_canvas`, `metadata`, plus module fields.

**Portal read path**
- `getPortalContext` / `getPortalRoadmapDocs` project explicit columns, filter `status IN (approved, delivered)` AND `published_at IS NOT NULL` (locked by `portal-context-leaks.test.ts` and `publish-column-integrity.test.ts`).
- Portal never reads `engine_*` tables.

**Gaps Phase 3 must close**
- No formal state machine — status transitions live implicitly across two RPCs.
- "Supersede" is a soft mutation of the prior row (`delivered → approved`); no immutable historical snapshot of what the client actually saw.
- No republish diff — every publish is a full row; the client has no way to see "what changed since last version".
- No rollback / unpublish primitive; the only way to revoke is to flip `status` manually.
- Audit is single-row per publish; no linkage between successive publications; no rollback events; ceremony/epistemic state can theoretically leak through `metadata` or future payload additions (allow-list is enforced in `buildClientSafePayload` but not at DB layer).
- No republish guard when the underlying engine version hasn't changed.

---

## 2. Proposed state machine

`client_portal_roadmaps.status` becomes the state; the current CHECK is extended.

```text
                (publishVersionToPortal)
     [none] ─────────────────────────────► published
                                             │
        (new approved version published)     │
              ┌──────────────────────────────┤
              ▼                               │
        superseded  ◄──── (rollback) ─────► published   (client acknowledges → still 'published', ack fields set)
              │                               │
              │        (rollback picks prior) │
              └──── restored_as_current ──────┘
                                              │
                                    (admin retracts, no replacement)
                                              ▼
                                          retracted
```

Terminal-ish: `retracted` (client sees nothing). `superseded` = historical snapshot (immutable, kept for audit + diff). `published` = the single current row per portal project.

Invariant: **exactly one row per `project_id` may have `status='published'`** — enforced by partial unique index.

---

## 3. Proposed migration (single file, additive + safe)

Written to `.orchestrator/PENDING_MIGRATIONS.md` per doctrine; not applied autonomously.

```sql
-- 1. Extend status enum values
ALTER TABLE public.client_portal_roadmaps
  DROP CONSTRAINT IF EXISTS client_portal_roadmaps_status_check;
ALTER TABLE public.client_portal_roadmaps
  ADD CONSTRAINT client_portal_roadmaps_status_check
  CHECK (status IN ('in_progress','approved','delivered','published','superseded','retracted'));

-- 2. Backfill: existing 'delivered' rows → 'published'; 'approved' historical → 'superseded'
UPDATE public.client_portal_roadmaps SET status='published'
  WHERE status='delivered' AND published_at IS NOT NULL;
UPDATE public.client_portal_roadmaps SET status='superseded'
  WHERE status='approved' AND published_at IS NOT NULL;

-- 3. Enforce one 'published' row per portal project
CREATE UNIQUE INDEX client_portal_roadmaps_one_published_per_project
  ON public.client_portal_roadmaps(project_id) WHERE status='published';

-- 4. Publish lineage + diff snapshot
ALTER TABLE public.client_portal_roadmaps
  ADD COLUMN previous_publication_id uuid REFERENCES public.client_portal_roadmaps(id),
  ADD COLUMN publish_diff jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {added,removed,changed} at module level
  ADD COLUMN retracted_at timestamptz,
  ADD COLUMN retracted_by text,
  ADD COLUMN retraction_reason text;

-- 5. New audit table: every publish / rollback / retract event
CREATE TABLE public.client_portal_publish_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_project_id uuid NOT NULL REFERENCES public.client_portal_projects(id) ON DELETE CASCADE,
  portal_roadmap_id uuid NOT NULL REFERENCES public.client_portal_roadmaps(id) ON DELETE CASCADE,
  engine_project_id uuid NOT NULL,
  engine_version_id uuid,
  event_type text NOT NULL CHECK (event_type IN ('published','superseded','rolled_back','retracted','restored')),
  actor_email text NOT NULL,
  summary text,
  diff jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.client_portal_publish_events TO authenticated;
GRANT ALL ON public.client_portal_publish_events TO service_role;
ALTER TABLE public.client_portal_publish_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read publish events" ON public.client_portal_publish_events
  FOR SELECT TO authenticated USING (public.is_engine_staff());

-- 6. Trigger guard: block portal-facing columns from carrying internal keys
CREATE OR REPLACE FUNCTION public.tg_client_portal_roadmaps_scrub_internal()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- metadata may only contain a whitelisted key set
  IF NEW.metadata ?| ARRAY['ceremony_id','epistemic','operator_override','contradiction','provenance','agent_costs'] THEN
    RAISE EXCEPTION 'Internal-only key present in client_portal_roadmaps.metadata';
  END IF;
  RETURN NEW;
END$$;
CREATE TRIGGER tg_client_portal_roadmaps_scrub_internal
  BEFORE INSERT OR UPDATE ON public.client_portal_roadmaps
  FOR EACH ROW EXECUTE FUNCTION public.tg_client_portal_roadmaps_scrub_internal();
```

No column drops. No changes to ack fields. RLS on publish events read-only to staff.

---

## 4. App-layer functions (all `createServerFn` + `requireSupabaseAuth` + admin gate)

New / reworked in `src/lib/engine-ops.functions.ts` (and a small helper in `src/lib/roadmap-publish.ts`):

- `publishVersionToPortal({ versionId })` — reworked:
  1. Compute `safe = buildClientSafePayload(...)`.
  2. Load current `published` row (if any) for that portal project.
  3. If `previous.approved_roadmap_version_id === versionId` AND diff is empty → no-op with `{ ok:true, unchanged:true }` (prevents accidental republish spam).
  4. Compute `publish_diff` (module-level added/removed/changed against the previous published snapshot).
  5. Transaction: `UPDATE previous → status='superseded'`, `INSERT new row status='published'` with `previous_publication_id`, `publish_diff`.
  6. Insert `client_portal_publish_events(event_type='published', diff=...)` AND `client_portal_publish_events(event_type='superseded', ...)` for the prior row.
  7. Existing `engine_audit_log` write kept.
- `rollbackPortalPublication({ portalRoadmapId, reason })` — new:
  - Requires admin. Loads the target published row's `previous_publication_id`.
  - Marks current `retracted` (or `superseded` if a prior exists) and promotes the prior back to `published` (clears its `retracted_*`).
  - Writes `event_type='rolled_back'` + `restored` events; mirrors into `engine_audit_log`.
- `retractPortalPublication({ portalRoadmapId, reason })` — new:
  - Sets current `published` → `retracted` with reason and actor. No replacement promoted. Writes event + audit.
- `getPortalPublicationHistory({ engineProjectId })` — admin-only read: joins `client_portal_publish_events` + snapshots for the Publish History panel.

Portal-side reads (`portal.functions.ts`, `getPortalContext`, `getPortalRoadmapDocs`):
- Change status filter from `IN ('approved','delivered')` to `= 'published'`.
- Keep the `published_at IS NOT NULL` filter for defense-in-depth.
- No new columns exposed to portal (retraction reason, diff, lineage stay internal).

`sendProjectDelivery` reuses `publishVersionToPortal` under the hood so there is one publish primitive.

---

## 5. UI changes (internal only)

- `src/routes/engine.projects.$projectId.preview.tsx` (or the existing Publish surface): add
  - "Publish diff vs current portal version" preview before confirming.
  - "Publish History" panel listing snapshots with actor / timestamp / event type / diff summary.
  - "Roll back to previous version" and "Retract publication" buttons (admin-only, confirm modal, reason required for retract).
- `WorkspaceHeader` / stepper: badge showing portal state (`Published v3`, `Retracted`, `Superseded`) sourced from `getPortalPublicationHistory`.
- No changes to any file under `src/routes/portal/*` beyond what the read-path filter change surfaces naturally (only `published` rows appear).

---

## 6. RLS / security implications

- New `client_portal_publish_events` table: SELECT for staff only (`is_engine_staff()`); no anon, no portal-member access.
- New scrub trigger blocks internal keys from ever landing in `client_portal_roadmaps.metadata`.
- Partial unique index guarantees invariant "one published row per portal project".
- Portal read filter narrows from `IN(approved,delivered)` → `= 'published'`, tightening the client surface. Existing `portal-context-leaks.test.ts` gets a new assertion for the tighter filter.
- No new anon grants.

---

## 7. Smoke plan (16 cases, Playwright + DB, mirrors Phase 2 harness)

Under `.orchestrator/phase-3-smoke/` — `db-cases.sql` + `ui-run.py` + `results.json`.

1. Publish from clean state → row is `published`, event `published`, diff shows all-added.
2. Republish with identical version+payload → `{unchanged:true}`, no new row, no new event.
3. Republish with modified `client_preview` → new `published` row, previous → `superseded`, `publish_diff` reflects changed modules, two events written.
4. `previous_publication_id` correctly chains across three successive publishes.
5. Partial unique index blocks a second `status='published'` insert on same portal project.
6. Rollback: promotes prior, current becomes `superseded`, both events written.
7. Rollback with no prior → clean error, no state change.
8. Retract: sets `retracted`, `retracted_by`/`_at`/`reason` populated, portal read returns 0 rows.
9. Retract then rollback fails cleanly (no prior published available).
10. `metadata` containing `ceremony_id` → trigger raises, insert aborts.
11. Portal read (`getPortalRoadmapDocs`) returns only rows where `status='published'`.
12. `superseded` and `retracted` rows never leak to portal reads.
13. Ack columns (`acknowledged_at`, `acknowledged_by_email`) survive supersede — set on old row, still present after new publish (immutable history).
14. `engine_roadmap_versions.published_portal_roadmap_id` re-points to newest `published` row.
15. `client_portal_publish_events` SELECT denied to portal-member session.
16. Non-admin operator cannot call `rollbackPortalPublication` / `retractPortalPublication`.

Plus a `vitest` guard test extending `publish-column-integrity.test.ts` and `portal-context-leaks.test.ts` for the new filter and event table.

---

## 8. Rollback plan (for the migration itself)

Migration is additive; rollback SQL kept alongside in `PENDING_MIGRATIONS.md`:

```sql
DROP TRIGGER tg_client_portal_roadmaps_scrub_internal ON public.client_portal_roadmaps;
DROP FUNCTION public.tg_client_portal_roadmaps_scrub_internal();
DROP TABLE public.client_portal_publish_events;
DROP INDEX public.client_portal_roadmaps_one_published_per_project;
ALTER TABLE public.client_portal_roadmaps
  DROP COLUMN retraction_reason, DROP COLUMN retracted_by, DROP COLUMN retracted_at,
  DROP COLUMN publish_diff, DROP COLUMN previous_publication_id;
UPDATE public.client_portal_roadmaps SET status='delivered' WHERE status='published';
UPDATE public.client_portal_roadmaps SET status='approved'  WHERE status='superseded';
-- restore original status CHECK
```

App-level rollback: revert portal read filter to `IN('approved','delivered')`. The rework of `publishVersionToPortal` stays behind a feature check on the extended CHECK constraint so pre-migration code paths still function if the migration is reverted.

---

## 9. Capabilities this phase moves to CONFIRMED

- Portal publication is a governed state machine with one authoritative current row.
- Every published version is immutable and historically inspectable.
- Republish is diff-aware and idempotent.
- Rollback and retract are first-class, audited primitives.
- Internal state (ceremony, epistemic, operator overrides, contradictions, provenance) is blocked at the DB layer from reaching portal rows.
- Client acknowledgment survives superseding — ack becomes an attribute of a specific historical publication, not a rolling flag.

---

## Deliverables / order of operations

1. Write the migration + rollback SQL to `.orchestrator/PENDING_MIGRATIONS.md` (do NOT apply).
2. Land app-layer changes gated to the new CHECK values behind a runtime probe so preview keeps building until Tai applies the migration.
3. Add UI (Publish diff, History, Rollback, Retract) — admin-only.
4. Ship guard tests + `.orchestrator/phase-3-smoke/` harness.
5. Await Tai's migration approval, run the 16-case smoke, write `.orchestrator/phase-3-output.md`, commit.
