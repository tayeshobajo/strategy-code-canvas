# Pending Migrations — Require Tai Review Before Applying

## Phase 6C — Roadmap Acknowledgment Columns

Status: REJECTED (2026-07-12) — superseded by existing columns on `public.client_portal_roadmaps`.

The proposed `engine_projects.acknowledged_*` columns duplicate data that already
lives on `client_portal_roadmaps.approved_roadmap_version_id` / `acknowledged_at`
/ `acknowledged_by_email`. Every current reader already uses that surface.
Adding a second copy on `engine_projects` would drift with no writer and no reader.

If an engine-side joined read is needed later, add a read-only view
`public.engine_project_acknowledgments` that joins `engine_projects` to
`client_portal_roadmaps` on `client_portal_project_id`, instead of duplicating columns.

---

## Phase 4B — Spine Governance Version History

Status: REJECTED (2026-07-12) — no new table needed. Reused `engine_audit_log`.

The proposed `engine_spine_versions` table duplicated `engine_audit_log`, which
already has `field_changed`, `old_value`, `new_value`, `reason`, `actor_email`,
`metadata`, and per-project scoping. Adding a second history table would create
two write paths and two readers for the same concept.

What shipped instead:
- `updateProjectStep` now writes one `engine_audit_log` row per changed
  top-level key when the step is `point-a` or `point-b`, with
  `action='spine_field_changed'`, `field_changed`, `old_value`, `new_value`,
  optional `reason`, and an accompanying `engine_activity` entry.
- New server function `getSpineFieldHistory(projectId)` reads those rows.
- `SpineVersionHistory` component now renders real diffs, actor, timestamp,
  and reason — replaces the placeholder banner.

No migration required.

---

## Phase 9C — AI Self-Assessment Prevention

Status: APPLIED (2026-07-12).

Preflight (ran against live DB before applying):
- AI-created approved milestones missing human approver: **0 rows**
- AI-generated terminal-status tasks missing owner: **0 rows**
- AI-created completed milestones missing human approver: **0 rows**

Applied SQL (table-qualified idempotency via `conrelid`):

```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'no_ai_self_approval'
      AND conrelid = 'public.engine_milestones'::regclass
  ) THEN
    ALTER TABLE public.engine_milestones
      ADD CONSTRAINT no_ai_self_approval CHECK (
        NOT (
          created_by_kind IN ('ai','captain','agent','system_agent','pipeline')
          AND approval_status = 'approved'
          AND (approved_by_email IS NULL OR approved_by_email = '')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'no_ai_self_complete'
      AND conrelid = 'public.engine_milestones'::regclass
  ) THEN
    ALTER TABLE public.engine_milestones
      ADD CONSTRAINT no_ai_self_complete CHECK (
        NOT (
          created_by_kind IN ('ai','captain','agent','system_agent','pipeline')
          AND status IN ('complete','completed','done')
          AND (approved_by_email IS NULL OR approved_by_email = '')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'no_ai_self_completion'
      AND conrelid = 'public.engine_tasks'::regclass
  ) THEN
    ALTER TABLE public.engine_tasks
      ADD CONSTRAINT no_ai_self_completion CHECK (
        NOT (
          ai_generated = true
          AND status IN ('done','accepted','verified','complete','completed')
          AND (owner_email IS NULL OR owner_email = '')
        )
      );
  END IF;
END $$;
```

App-layer follow-ups shipped in the same turn:
- `updateMilestone` now auto-backfills `approved_by_email` (and `approved_at`
  on approval) with the acting admin's email when an AI-created milestone is
  moved to approved or terminal status, so callers never hit a raw CHECK error.
- `updateTaskStatus` now auto-backfills `owner_email` with the acting admin's
  email when an AI-generated task transitions to terminal status.
- `approveMilestone` already set `approved_by_email` from the staff session —
  confirmed unchanged.

---

## Phase 1 — Epistemic-Status Taxonomy (Truth Model)

Status: **PENDING TAI REVIEW** — do not apply until reviewed.

Purpose. Introduce a first-class epistemic-status label + source provenance
on every extracted signal and every Point A / Point B field. Downstream
phases (ceremonies, portal transitions, evidence gate, specialist agents)
all depend on this contract.

### Design decisions

1. **New enum `epistemic_status`** with five values: `stated`, `inferred`,
   `assumed`, `contradicted`, `verified`.
   - `stated` — the client (or an operator on their behalf) said it.
   - `inferred` — AI derived it from other stated facts; explainable.
   - `assumed` — AI guessed with no direct source; must be resolved.
   - `contradicted` — a newer signal conflicts with a prior `stated`/`verified` value.
   - `verified` — an operator or admin has personally confirmed it.

2. **`engine_extracted_signals` gains columns.** `status` (enum, default
   `inferred`), `source_ref` (jsonb `{kind, id, quote?, timestamp?}`),
   `superseded_by` (uuid FK to the same table, `ON DELETE SET NULL`).
   All existing rows backfill to `inferred` with `source_ref='{}'::jsonb`.

3. **Sidecar status columns on `engine_projects`.** Rather than mutating the
   existing `point_a`/`point_b` jsonb shape (which the whole UI reads), we
   add two new jsonb columns: `point_a_status` and `point_b_status`. Each is
   an object keyed by the same top-level keys as the payload, with values of
   `{status: epistemic_status, source_ref: jsonb, updated_at: timestamptz,
   updated_by_email: text}`. Default `'{}'::jsonb`. Same-shape sidecar keeps
   the fix reversible and never breaks existing readers.

4. **`engine_project_chat_events` gains `epistemic_delta` jsonb.** Default
   `'{}'::jsonb`. Populated when a chat event promotes / demotes / flags a
   field so the chat feed shows "Tai marked customer_segment as stated."

5. **New RPC `has_contradictions(_project_id uuid)`** — SECURITY DEFINER,
   returns boolean, used by ceremony gate (Phase 2) to block approval when
   any `contradicted` signal is unresolved.

### Non-goals for the migration

- No change to RLS policies. Existing `Team members read extracted signals`
  policy continues to apply; new columns inherit.
- No change to portal-facing tables — the `buildClientSafePayload` allowlist
  in code decides what leaks; sidecar columns are internal-only by default.
- No data migration to *label* existing signals — everything defaults to
  `inferred`. Reclassification happens through the new server functions.

### Proposed SQL

```sql
-- 1. Enum
CREATE TYPE public.epistemic_status AS ENUM (
  'stated', 'inferred', 'assumed', 'contradicted', 'verified'
);

-- 2. Signal columns
ALTER TABLE public.engine_extracted_signals
  ADD COLUMN status public.epistemic_status NOT NULL DEFAULT 'inferred',
  ADD COLUMN source_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN superseded_by uuid REFERENCES public.engine_extracted_signals(id) ON DELETE SET NULL;

CREATE INDEX engine_extracted_signals_status_idx
  ON public.engine_extracted_signals (project_id, status);

-- 3. Spine sidecar columns
ALTER TABLE public.engine_projects
  ADD COLUMN point_a_status jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN point_b_status jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 4. Chat event delta
ALTER TABLE public.engine_project_chat_events
  ADD COLUMN epistemic_delta jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 5. Contradiction detector RPC
CREATE OR REPLACE FUNCTION public.has_contradictions(_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.engine_extracted_signals
    WHERE project_id = _project_id
      AND status = 'contradicted'
      AND superseded_by IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.has_contradictions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_contradictions(uuid) TO authenticated;
```

### Preflight checks Tai should run before applying

```sql
-- 1. Count of signals that would default to 'inferred'
SELECT count(*) FROM public.engine_extracted_signals;

-- 2. Confirm no existing column name collision
SELECT column_name FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('engine_extracted_signals','engine_projects','engine_project_chat_events')
  AND column_name IN ('status','source_ref','superseded_by',
                      'point_a_status','point_b_status','epistemic_delta');
```

Expected result of query 2: **zero rows**. Any hit means an in-flight
migration already claimed the name — resolve before applying.

### App-layer code shipped in the same turn (does NOT require migration)

- `src/lib/engine-epistemic.functions.ts` — server-function stubs
  (`markSpineFieldStatus`, `promoteSignalToSpine`, `detectContradictions`,
  `getSpineFieldStatus`). All admin-gated. They target the columns above
  and will surface a clear `column "..." does not exist` error until the
  migration is applied — this is intentional so the failure is loud, not
  silent.
- `src/components/engine/EpistemicStatusChip.tsx` — presentation-only
  chip. Renders `inferred` (default) when sidecar is empty, so it works
  before and after the migration.
- Chip wired into `engine.projects.$projectId.point-a.tsx` diagnosis cards
  and `engine.projects.$projectId.point-b.tsx` section cards.

### Risk if applied without review

Low. All columns are additive with safe defaults. Rollback = drop the four
columns, the enum, and the RPC — all reversible in a single migration.

### Follow-ups (NOT in this migration)

- Ceremony tables (Phase 2) reference `epistemic_status` in their acceptance
  criteria; do not add them here.
- Portal payload allowlist audit — confirm sidecar status is stripped from
  `buildClientSafePayload`. Ships in Phase 3 (portal transitions).
- Contradiction UI (list view + resolver) — Phase 1B, tracked in phase output.

