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

## Phase 1 — Epistemic-Status Taxonomy (Truth Model) — **REVISION R3 (Variant B)**

Status: **PENDING TAI REVIEW** — do not apply. Supersedes R2 (never applied).

### What changed from R2

1. **Canonical truth store is a normalized table** —
   `public.engine_spine_field_truth`. The `point_a_status` /
   `point_b_status` jsonb sidecars from R2 are removed from the plan.
   Neither was ever applied to the DB, so nothing to migrate off.
2. **Evidence FK deferred.** Live-DB check confirmed **no** `engine_evidence`
   table exists (only `engine_project_build_evidence` and
   `engine_project_qa_evidence_reviews`, both purpose-specific). R3 does
   NOT add an FK; `verified.source_ref.evidence_id` remains a validated
   string. A dedicated spine-evidence store is a Phase 4 decision.
3. **Backfill included.** Existing Point A / Point B content in
   `engine_projects.point_a` / `point_b` gets seeded as
   `needs_confirmation` rows so Phase 2 ceremonies have real targets.
   `ON CONFLICT DO NOTHING` — safe to re-run.
4. **Audit path.** Every UPDATE writes a row into `engine_audit_log`
   (`action='spine_field_truth_changed'`). Reuses the Phase 4B pattern.
5. **Taxonomy unchanged.** Same 8-value enum from R2.

### Preflight (must return the documented shape before applying)

```sql
SELECT count(*) FROM pg_type WHERE typname = 'epistemic_status';  -- expect 0
SELECT to_regclass('public.engine_spine_field_truth');            -- expect NULL
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='engine_extracted_signals'
  AND column_name IN ('status','source_ref','superseded_by');     -- expect 0 rows
SELECT count(*) AS projects FROM public.engine_projects;
SELECT count(*) AS pointa_object_rows FROM public.engine_projects
  WHERE jsonb_typeof(point_a) = 'object';
SELECT count(*) AS pointb_object_rows FROM public.engine_projects
  WHERE jsonb_typeof(point_b) = 'object';
```

### Migration SQL (Variant B — canonical, R3-hardened)

```sql
-- 1. Enum (8 values)
CREATE TYPE public.epistemic_status AS ENUM (
  'stated','inferred','assumed','missing','contradicted','needs_confirmation','verified','approved_truth'
);

-- 2. Signal columns
ALTER TABLE public.engine_extracted_signals
  ADD COLUMN status public.epistemic_status NOT NULL DEFAULT 'inferred',
  ADD COLUMN source_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN superseded_by uuid REFERENCES public.engine_extracted_signals(id) ON DELETE SET NULL;

CREATE INDEX engine_extracted_signals_status_idx
  ON public.engine_extracted_signals (project_id, status);

-- 2b. FIX #5 — Legacy signal source_ref backfill.
--     Every pre-existing signal defaulted to status='inferred' with an
--     empty source_ref, which violates the new provenance rule for
--     'inferred'. Populate source_ref from source_id / extraction_run_id
--     when present, else mark 'legacy_extraction' with rationale.
UPDATE public.engine_extracted_signals
SET source_ref = jsonb_strip_nulls(jsonb_build_object(
  'kind',              'legacy_extraction',
  'model',             'pre-R3',
  'prompt_ref',        'legacy:signal:' || id::text,
  'source_id',         source_id,
  'extraction_run_id', extraction_run_id,
  'timestamp',         created_at::text,
  'rationale',         'Backfilled by Phase 1 R3 migration; original run predates the R3 truth model.'
))
WHERE source_ref = '{}'::jsonb OR source_ref IS NULL;

-- 3. Chat event delta
ALTER TABLE public.engine_project_chat_events
  ADD COLUMN epistemic_delta jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 4. Canonical spine-field truth table
CREATE TABLE public.engine_spine_field_truth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  spine text NOT NULL CHECK (spine IN ('point-a','point-b')),
  field_key text NOT NULL,
  status public.epistemic_status NOT NULL,
  source_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_email text,
  -- FIX #3 — extend actor kinds; backfill/system-side writes are neither
  -- interactive humans nor autonomous AI decisions.
  updated_by_actor text NOT NULL DEFAULT 'human'
    CHECK (updated_by_actor IN ('human','ai','system')),
  -- FIX #4 — human writes must carry an email (audit accountability).
  CONSTRAINT engine_spine_field_truth_human_needs_email CHECK (
    updated_by_actor <> 'human'
    OR (updated_by_email IS NOT NULL AND length(btrim(updated_by_email)) > 0)
  ),
  UNIQUE (project_id, spine, field_key)
);

CREATE INDEX engine_spine_field_truth_project_spine_idx
  ON public.engine_spine_field_truth (project_id, spine);
CREATE INDEX engine_spine_field_truth_status_idx
  ON public.engine_spine_field_truth (project_id, status);

-- FIX #1 — grant INSERT/UPDATE only; DELETE stays with service_role.
--          Truth rows are canonical state, not disposable UI cache.
GRANT SELECT, INSERT, UPDATE ON public.engine_spine_field_truth TO authenticated;
GRANT ALL                     ON public.engine_spine_field_truth TO service_role;

ALTER TABLE public.engine_spine_field_truth ENABLE ROW LEVEL SECURITY;

-- FIX #1 — split policies by verb; no DELETE policy is intentional.
CREATE POLICY "Team members read spine field truth"
  ON public.engine_spine_field_truth FOR SELECT
  TO authenticated USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'operator')
    OR public.has_role(auth.uid(), 'team_member')
  );

CREATE POLICY "Operators insert spine field truth"
  ON public.engine_spine_field_truth FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'));

CREATE POLICY "Operators update spine field truth"
  ON public.engine_spine_field_truth FOR UPDATE
  TO authenticated
  USING      (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'));
-- Intentionally NO delete policy.

-- 5. Audit trigger — FIX #2: audit INSERT as well as UPDATE.
--    Backfill rows (source_ref.kind = 'backfill') are exempted so we
--    don't flood the audit log with 11 projects × N fields on migration.
CREATE OR REPLACE FUNCTION public.tg_engine_spine_field_truth_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_backfill boolean := (NEW.source_ref ->> 'kind') = 'backfill';
BEGIN
  NEW.updated_at := now();

  IF TG_OP = 'INSERT' AND NOT is_backfill THEN
    INSERT INTO public.engine_audit_log (
      project_id, action, field_changed, old_value, new_value, actor_email, metadata
    ) VALUES (
      NEW.project_id,
      'spine_field_truth_created',
      NEW.spine || ':' || NEW.field_key,
      NULL,
      jsonb_build_object('status', NEW.status, 'source_ref', NEW.source_ref),
      NEW.updated_by_email,
      jsonb_build_object('actor_kind', NEW.updated_by_actor)
    );
  ELSIF TG_OP = 'UPDATE' AND (
    OLD.status IS DISTINCT FROM NEW.status
    OR OLD.source_ref IS DISTINCT FROM NEW.source_ref
  ) THEN
    INSERT INTO public.engine_audit_log (
      project_id, action, field_changed, old_value, new_value, actor_email, metadata
    ) VALUES (
      NEW.project_id,
      'spine_field_truth_changed',
      NEW.spine || ':' || NEW.field_key,
      jsonb_build_object('status', OLD.status, 'source_ref', OLD.source_ref),
      jsonb_build_object('status', NEW.status, 'source_ref', NEW.source_ref),
      NEW.updated_by_email,
      jsonb_build_object('actor_kind', NEW.updated_by_actor)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_engine_spine_field_truth_audit
  BEFORE INSERT OR UPDATE ON public.engine_spine_field_truth
  FOR EACH ROW EXECUTE FUNCTION public.tg_engine_spine_field_truth_audit();

-- 6. Contradiction detector RPC — FIX #6: keep SECURITY DEFINER (the
--    underlying signals table's SELECT policy is scoped to 'team_member'
--    only, which would silently return false for admin/operator callers
--    under SECURITY INVOKER), but add an explicit access check so an
--    authenticated stranger cannot probe arbitrary project ids.
CREATE OR REPLACE FUNCTION public.has_contradictions(_project_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed boolean := false;
BEGIN
  SELECT
    public.is_engine_staff()
    OR EXISTS (
      SELECT 1 FROM public.client_portal_projects cpp
      JOIN public.client_portal_permissions perm ON perm.project_id = cpp.id
      JOIN public.engine_projects ep ON ep.client_portal_project_id = cpp.id
      WHERE ep.id = _project_id
        AND lower(perm.email) = lower(coalesce(auth.email(), ''))
        AND perm.revoked_at IS NULL
    )
  INTO allowed;

  IF NOT allowed THEN
    RAISE EXCEPTION 'Forbidden: access to project % not permitted', _project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.engine_extracted_signals
    WHERE project_id = _project_id AND status = 'contradicted' AND superseded_by IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.engine_spine_field_truth
    WHERE project_id = _project_id AND status = 'contradicted'
  );
END;
$$;

REVOKE ALL     ON FUNCTION public.has_contradictions(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.has_contradictions(uuid) TO authenticated;

-- 7. Backfill — seed needs_confirmation rows for existing spine content.
--    FIX #3: use updated_by_actor='system' (backfill is neither an
--    interactive human nor an autonomous AI decision).
--    Rows carry source_ref.kind='backfill' so the audit trigger skips
--    the INSERT audit row per FIX #2.
INSERT INTO public.engine_spine_field_truth
  (project_id, spine, field_key, status, source_ref, updated_by_email, updated_by_actor)
SELECT p.id, 'point-b', k, 'needs_confirmation',
  jsonb_build_object(
    'kind','backfill',
    'reason','Phase 1 R3 backfill from existing spine content',
    'timestamp', now()::text
  ),
  NULL, 'system'
FROM public.engine_projects p
CROSS JOIN unnest(ARRAY[
  '24_month_destination','10_year_position','client_outcome','customer_outcome',
  'operational_outcome','revenue_outcome','brand_position'
]) AS k
WHERE jsonb_typeof(p.point_b) = 'object'
  AND (p.point_b -> k) IS NOT NULL
  AND (p.point_b ->> k) <> ''
ON CONFLICT (project_id, spine, field_key) DO NOTHING;

INSERT INTO public.engine_spine_field_truth
  (project_id, spine, field_key, status, source_ref, updated_by_email, updated_by_actor)
SELECT p.id, 'point-a', k, 'needs_confirmation',
  jsonb_build_object('kind','backfill','reason','Phase 1 R3 backfill','timestamp', now()::text),
  NULL, 'system'
FROM public.engine_projects p
CROSS JOIN unnest(ARRAY['lenses','diagnosis','key_diagnosis']) AS k
WHERE jsonb_typeof(p.point_a) = 'object'
  AND (p.point_a -> k) IS NOT NULL
ON CONFLICT (project_id, spine, field_key) DO NOTHING;

INSERT INTO public.engine_spine_field_truth
  (project_id, spine, field_key, status, source_ref, updated_by_email, updated_by_actor)
SELECT
  p.id, 'point-a',
  'diagnosis:' || btrim(card->>'title'),
  'needs_confirmation',
  jsonb_build_object('kind','backfill','reason','Phase 1 R3 backfill','timestamp', now()::text),
  NULL, 'system'
FROM public.engine_projects p
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(p.point_a -> 'diagnosis') = 'array'
       THEN p.point_a -> 'diagnosis' ELSE '[]'::jsonb END
) AS card
WHERE jsonb_typeof(p.point_a) = 'object'
  AND (card->>'title') IS NOT NULL
  AND length(btrim(card->>'title')) BETWEEN 1 AND 180
ON CONFLICT (project_id, spine, field_key) DO NOTHING;
```

### Rollback (Variant B, R3-hardened)

```sql
DROP FUNCTION IF EXISTS public.has_contradictions(uuid);
DROP TRIGGER IF EXISTS trg_engine_spine_field_truth_audit ON public.engine_spine_field_truth;
DROP FUNCTION IF EXISTS public.tg_engine_spine_field_truth_audit();
DROP TABLE IF EXISTS public.engine_spine_field_truth;
ALTER TABLE public.engine_project_chat_events DROP COLUMN IF EXISTS epistemic_delta;
DROP INDEX IF EXISTS engine_extracted_signals_status_idx;
ALTER TABLE public.engine_extracted_signals
  DROP COLUMN IF EXISTS superseded_by,
  DROP COLUMN IF EXISTS source_ref,
  DROP COLUMN IF EXISTS status;
DROP TYPE IF EXISTS public.epistemic_status;
```

### Confirmation — all seven fixes

1. **No DELETE.** `GRANT` drops DELETE; RLS policies are split by verb;
   there is deliberately no DELETE policy. Only `service_role` retains
   DELETE for maintenance.
2. **INSERT is audited.** Trigger now fires `BEFORE INSERT OR UPDATE`.
   INSERT writes `action='spine_field_truth_created'`; UPDATE keeps
   `action='spine_field_truth_changed'`. Rows with
   `source_ref.kind='backfill'` are exempted, so the 11-project seed
   does not flood the audit log.
3. **`system` actor added.** `updated_by_actor` CHECK now allows
   `human | ai | system`. Backfill inserts use `system`.
4. **Human writes require email.** Table-level CHECK
   `engine_spine_field_truth_human_needs_email` rejects any row where
   `updated_by_actor='human'` and `updated_by_email` is null or blank.
   `markSpineFieldStatus` already injects the operator's email
   server-side, so the app path always satisfies this.
5. **Legacy signal source_ref backfilled.** New `UPDATE` runs
   immediately after the `ADD COLUMN` and populates every pre-existing
   row with `kind='legacy_extraction'`, `source_id`,
   `extraction_run_id`, `timestamp`, and a rationale. Meets the
   `inferred`-status provenance rule without lying about the model.
6. **`has_contradictions` gated.** Rewritten in plpgsql. Still
   `SECURITY DEFINER` (needed because `engine_extracted_signals` SELECT
   is scoped to `team_member` only — SECURITY INVOKER would silently
   return false for admin/operator callers), but now performs an
   explicit access check: staff (`is_engine_staff()`) OR a live portal
   permission linking the caller's email to the project. Otherwise
   raises `insufficient_privilege`.
7. **`extracted_signal` kind consistency.** Documented follow-up: the
   R2 `assertEvidenceForStatus` for `stated` accepts only
   `intake_answer | transcript | operator_note`. `promoteSignalToSpine`
   sets `kind='extracted_signal'`, which today passes for `verified`
   (via `id + quote + timestamp`) and for `needs_confirmation` (via
   the human-operator override), but would fail for `stated`. Adding
   `extracted_signal` to the `stated` accepted-kind set is an
   app-layer change (in `src/lib/engine-epistemic.server.ts`) — no SQL
   impact. Will ship in the same commit as this migration once
   approved, before smoke tests run.



### App-layer that ships with this revision

- `src/lib/engine-epistemic.functions.ts` — reads/writes
  `engine_spine_field_truth` via upsert on `(project_id, spine, field_key)`;
  `detectContradictions` unions signals + truth-table rows; no references
  to `point_a_status` / `point_b_status`.
- `src/lib/engine-epistemic.server.ts` — unchanged taxonomy and evidence
  rules from R2.
- Chip UI + Point A / Point B route loaders — unchanged (same
  `Record<fieldKey, FieldStatusEntry>` contract).
- Tests — R2 schema-level tests still pass unchanged.

### Follow-ups (NOT in this migration)

- Phase 2: real `ceremony_id` FK on `approved_truth` entries; ceremony
  surface reads pending `needs_confirmation` rows and promotes them.
- Phase 4: dedicated spine-evidence store; real FK on `verified` rows.
- Phase 5: agent path that writes AI statuses with `updated_by_actor='ai'`.

### Smoke test plan (run after apply, before Phase 2 starts)

1. `getSpineFieldStatus({point-a})` on a backfilled project returns the
   seeded `needs_confirmation` rows.
2. `markSpineFieldStatus` sets one Point A base key to `stated` with an
   operator-note ref — chip re-renders as "Stated"; a row appears in
   `engine_audit_log` with `action='spine_field_truth_changed'`.
3. `markSpineFieldStatus` sets one Point B key to `needs_confirmation` +
   reason — succeeds.
4. `promoteSignalToSpine` on a live `engine_extracted_signals` row —
   upserts with `source_ref.kind='extracted_signal'`.
5. Insert a `contradicted` row via `markSpineFieldStatus` (operator
   override + reason). `has_contradictions(project)` returns true;
   `detectContradictions` returns the row.
6. Neutral fallback: a field with no truth row renders "No status".
7. Negative cases: unknown `field_key` rejected; AI actor blocked from
   `verified` / `approved_truth`; evidence-rule violations rejected.

Results append to `.orchestrator/phase-1-output.md` as "Phase 1 R3
verification".

---

## Phase 2 — Point A / Point B Approval Ceremonies (data model)

Status: **APPLIED (2026-07-12)** — R4 shipped. See `.orchestrator/phase-2-output.md`.

Notes on what changed vs the R4 plan text below:
- Static Point A / Point B allowlists in `internal_spine_field_keys` now mirror
  the real TS registry (`POINT_A_BASE_FIELD_KEYS` = `lenses, diagnosis, key_diagnosis`;
  `POINT_B_FIELD_KEYS` = destination/position/outcome keys) instead of the placeholder
  `current_state:*` / `target_state:*` keys.
- Preflight assumed `public.update_updated_at_column()` exists; it does not on this
  project. Ceremony `updated_at` trigger uses `public.tg_touch_updated_at()` instead.


Adds the ceremony spine so an operator can formally walk every allowlisted
Point A / Point B field, decide its epistemic status with evidence, and
promote the spine toward `approved_truth`. This is the write path that
finally consumes the R3 truth store built in Phase 1.

Revision history:
- R1: initial ceremony header + decisions tables, app-layer only completion.
- R2: 7 hardening fixes (enum on decisions, DB completion trigger, Point A
  gate before Point B, abandoned metadata, decision consistency trigger,
  completion rule redefined around `approved_truth`, downstream invalidation
  deferred to Phase 2B with explicit blocker).
- R3: project-aware field helper (`spine_field_keys(project_id, spine)`),
  internal contradiction check for the trigger, approved_truth provenance
  stamped in `source_ref` (approval_kind='ceremony' + ceremony_id +
  operator_confirmed_by), DB-side enforcement of that stamp.
- R4: split `spine_field_keys` into `internal_spine_field_keys` (trigger-only,
  no public grant) and public `spine_field_keys` (access-gated), mirroring
  the R3 contradictions split.

### Design principles

- No DELETE on ceremony state. Ceremonies are `abandoned`, not deleted.
- Ceremonies and decisions audit INSERT and UPDATE (Phase 1 R3 pattern).
- All writes on `engine_spine_field_truth` still go through the existing
  app-layer guards (`assertKnownFieldKey`, `assertStatusAllowedForActor`,
  `assertEvidenceForStatus`, `enrichSourceRefForHuman`).
- `ceremony_id` on the truth row is nullable so pre-ceremony history stays
  intact and non-ceremony operator writes remain legal.
- RLS gates writes to admin/operator via `has_role_email`. `team_member`
  reads only, matching Phase 1 R3.
- Completion is defined by `approved_truth`, not by absence of
  `needs_confirmation`. Explicit accepted-risk path exists for `assumed` /
  `missing`, requiring `approval_kind='operator_override'`, a `reason`, and
  (for `missing`) `accepted_as_risk=true`.
- DB triggers enforce completion, decision consistency, Point A precedence,
  and approved_truth provenance so direct SQL cannot bypass app-layer checks.
- Field universe is project-aware (static allowlist + dynamic `diagnosis:*`
  keys derived from truth rows for that project).
- Access-gated helpers are split into internal (SECURITY DEFINER, no public
  grant, called by triggers) and public (access-gated, called by UI/API).

### Completion rule (canonical)

A ceremony flips to `completed` only when, for its spine:

1. Every allowlisted field key (static + dynamic diagnosis:* for the project)
   has a truth row whose status is either:
   - `approved_truth`, OR
   - `assumed` with `source_ref.approval_kind='operator_override'`,
     non-empty `reason`, and `operator_confirmed_by`, OR
   - `missing` with `source_ref.approval_kind='operator_override'`,
     non-empty `reason`, `accepted_as_risk=true`, and
     `operator_confirmed_by`.
2. `internal_project_has_contradictions(project_id)` returns false.

Anything else (`needs_confirmation`, `stated`, `inferred`, `verified`,
`contradicted`, missing row, or `assumed`/`missing` without the accepted-risk
shape) blocks completion. Enforced in both the DB trigger and the app-layer
`completeCeremony`.

### Proposed SQL

```sql
-- ============================================================
-- 1. Ceremony header
-- ============================================================
CREATE TABLE IF NOT EXISTS public.engine_spine_ceremonies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  spine TEXT NOT NULL CHECK (spine IN ('point-a','point-b')),
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','completed','abandoned')),
  opened_by_email TEXT NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  completed_by_email TEXT,
  abandoned_at TIMESTAMPTZ,
  abandoned_by_email TEXT,
  abandon_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (status = 'completed'
      AND completed_at IS NOT NULL AND completed_by_email IS NOT NULL
      AND abandoned_at IS NULL AND abandoned_by_email IS NULL AND abandon_reason IS NULL)
    OR (status = 'abandoned'
      AND abandoned_at IS NOT NULL AND abandoned_by_email IS NOT NULL AND abandon_reason IS NOT NULL
      AND completed_at IS NULL AND completed_by_email IS NULL)
    OR (status = 'in_progress'
      AND completed_at IS NULL AND completed_by_email IS NULL
      AND abandoned_at IS NULL AND abandoned_by_email IS NULL AND abandon_reason IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS engine_spine_ceremonies_one_active
  ON public.engine_spine_ceremonies (project_id, spine)
  WHERE status = 'in_progress';

CREATE INDEX IF NOT EXISTS engine_spine_ceremonies_project_idx
  ON public.engine_spine_ceremonies (project_id, spine, opened_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.engine_spine_ceremonies TO authenticated;
GRANT ALL ON public.engine_spine_ceremonies TO service_role;

ALTER TABLE public.engine_spine_ceremonies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ceremonies_select_staff" ON public.engine_spine_ceremonies
  FOR SELECT TO authenticated
  USING (
    public.has_role_email(auth.jwt() ->> 'email', 'admin')
    OR public.has_role_email(auth.jwt() ->> 'email', 'operator')
    OR public.has_role_email(auth.jwt() ->> 'email', 'team_member')
  );

CREATE POLICY "ceremonies_insert_admin_op" ON public.engine_spine_ceremonies
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role_email(auth.jwt() ->> 'email', 'admin')
    OR public.has_role_email(auth.jwt() ->> 'email', 'operator')
  );

CREATE POLICY "ceremonies_update_admin_op" ON public.engine_spine_ceremonies
  FOR UPDATE TO authenticated
  USING (
    public.has_role_email(auth.jwt() ->> 'email', 'admin')
    OR public.has_role_email(auth.jwt() ->> 'email', 'operator')
  )
  WITH CHECK (
    public.has_role_email(auth.jwt() ->> 'email', 'admin')
    OR public.has_role_email(auth.jwt() ->> 'email', 'operator')
  );
-- No DELETE policy: use status='abandoned' instead.

-- ============================================================
-- 2. Per-field decisions (enum-typed statuses)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.engine_spine_ceremony_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ceremony_id UUID NOT NULL REFERENCES public.engine_spine_ceremonies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  spine TEXT NOT NULL CHECK (spine IN ('point-a','point-b')),
  field_key TEXT NOT NULL,
  prior_status public.epistemic_status,
  new_status public.epistemic_status NOT NULL,
  source_ref JSONB NOT NULL DEFAULT '{}'::jsonb,
  decided_by_email TEXT NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS engine_spine_ceremony_decisions_ceremony_idx
  ON public.engine_spine_ceremony_decisions (ceremony_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS engine_spine_ceremony_decisions_project_idx
  ON public.engine_spine_ceremony_decisions (project_id, spine, field_key, decided_at DESC);

GRANT SELECT, INSERT ON public.engine_spine_ceremony_decisions TO authenticated;
GRANT ALL ON public.engine_spine_ceremony_decisions TO service_role;

ALTER TABLE public.engine_spine_ceremony_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ceremony_decisions_select_staff" ON public.engine_spine_ceremony_decisions
  FOR SELECT TO authenticated
  USING (
    public.has_role_email(auth.jwt() ->> 'email', 'admin')
    OR public.has_role_email(auth.jwt() ->> 'email', 'operator')
    OR public.has_role_email(auth.jwt() ->> 'email', 'team_member')
  );

CREATE POLICY "ceremony_decisions_insert_admin_op" ON public.engine_spine_ceremony_decisions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role_email(auth.jwt() ->> 'email', 'admin')
    OR public.has_role_email(auth.jwt() ->> 'email', 'operator')
  );
-- No UPDATE/DELETE: decisions are append-only audit facts.

-- ============================================================
-- 3. Stamp ceremony provenance on the truth row
-- ============================================================
ALTER TABLE public.engine_spine_field_truth
  ADD COLUMN IF NOT EXISTS ceremony_id UUID
    REFERENCES public.engine_spine_ceremonies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS engine_spine_field_truth_ceremony_idx
  ON public.engine_spine_field_truth (ceremony_id)
  WHERE ceremony_id IS NOT NULL;

-- ============================================================
-- 4. updated_at trigger for ceremonies (decisions are append-only)
-- ============================================================
CREATE TRIGGER trg_engine_spine_ceremonies_updated
  BEFORE UPDATE ON public.engine_spine_ceremonies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 5. Audit (INSERT + UPDATE) via engine_audit_log
-- ============================================================
CREATE OR REPLACE FUNCTION public.audit_spine_ceremony_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.engine_audit_log
    (project_id, action, field_changed, old_value, new_value, actor_email, metadata)
  VALUES (
    NEW.project_id,
    CASE TG_OP WHEN 'INSERT' THEN 'spine_ceremony_opened' ELSE 'spine_ceremony_changed' END,
    'ceremony_status',
    CASE TG_OP WHEN 'UPDATE' THEN to_jsonb(OLD.status) ELSE NULL END,
    to_jsonb(NEW.status),
    COALESCE(NEW.completed_by_email, NEW.abandoned_by_email, NEW.opened_by_email),
    jsonb_build_object('ceremony_id', NEW.id, 'spine', NEW.spine)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_audit_spine_ceremony_ins
  AFTER INSERT ON public.engine_spine_ceremonies
  FOR EACH ROW EXECUTE FUNCTION public.audit_spine_ceremony_change();
CREATE TRIGGER trg_audit_spine_ceremony_upd
  AFTER UPDATE ON public.engine_spine_ceremonies
  FOR EACH ROW EXECUTE FUNCTION public.audit_spine_ceremony_change();

CREATE OR REPLACE FUNCTION public.audit_spine_ceremony_decision()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.engine_audit_log
    (project_id, action, field_changed, old_value, new_value, actor_email, metadata)
  VALUES (
    NEW.project_id,
    'spine_ceremony_decision',
    NEW.field_key,
    to_jsonb(NEW.prior_status),
    to_jsonb(NEW.new_status),
    NEW.decided_by_email,
    jsonb_build_object(
      'ceremony_id', NEW.ceremony_id,
      'spine', NEW.spine,
      'source_ref', NEW.source_ref
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_audit_spine_ceremony_decision_ins
  AFTER INSERT ON public.engine_spine_ceremony_decisions
  FOR EACH ROW EXECUTE FUNCTION public.audit_spine_ceremony_decision();

-- ============================================================
-- 6. Field-universe helpers (R4 split: internal + public)
-- ============================================================
CREATE OR REPLACE FUNCTION public.internal_spine_field_keys(
  _project_id uuid,
  _spine text
)
RETURNS SETOF text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _spine = 'point-a' THEN
    -- Static allowlist mirrored from src/lib/engine-spine-fields.ts.
    -- Vitest diff-fails if this drifts from the TS registry.
    RETURN QUERY SELECT unnest(ARRAY[
      'current_state:summary',
      'current_state:pain_points',
      'current_state:constraints',
      'current_state:stakeholders'
      -- ... full Point A static list mirrored from TS registry
    ]::text[]);

    -- Dynamic Point A: diagnosis:<title> keys derived per-project from
    -- existing truth rows. A diagnosis field only counts once it has
    -- been classified at least once.
    RETURN QUERY
      SELECT DISTINCT field_key
      FROM public.engine_spine_field_truth
      WHERE project_id = _project_id
        AND spine = 'point-a'
        AND field_key LIKE 'diagnosis:%';

  ELSIF _spine = 'point-b' THEN
    RETURN QUERY SELECT unnest(ARRAY[
      'target_state:summary',
      'target_state:success_metrics'
      -- ... full Point B static list
    ]::text[]);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.internal_spine_field_keys(uuid, text) FROM PUBLIC;
-- No grant to anon/authenticated. Callable only by SECURITY DEFINER code
-- in this schema (the completion trigger and the public wrapper below).
GRANT EXECUTE ON FUNCTION public.internal_spine_field_keys(uuid, text) TO service_role;


CREATE OR REPLACE FUNCTION public.spine_field_keys(
  _project_id uuid,
  _spine text
)
RETURNS SETOF text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  allowed boolean := false;
BEGIN
  SELECT
    public.is_engine_staff()
    OR public.has_role_email(coalesce(auth.email(), ''), 'team_member')
    OR EXISTS (
      SELECT 1
      FROM public.client_portal_projects cpp
      JOIN public.client_portal_permissions perm ON perm.project_id = cpp.id
      JOIN public.engine_projects ep ON ep.client_portal_project_id = cpp.id
      WHERE ep.id = _project_id
        AND lower(perm.email) = lower(coalesce(auth.email(), ''))
        AND perm.revoked_at IS NULL
    )
  INTO allowed;

  IF NOT allowed THEN
    RAISE EXCEPTION 'Forbidden: access to project % not permitted', _project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY SELECT public.internal_spine_field_keys(_project_id, _spine);
END;
$$;

REVOKE ALL ON FUNCTION public.spine_field_keys(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spine_field_keys(uuid, text) TO authenticated, service_role;

-- ============================================================
-- 7. Internal contradictions helper (trigger use only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.internal_project_has_contradictions(_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.engine_extracted_signals
    WHERE project_id = _project_id
      AND status = 'contradicted'
      AND superseded_by IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.engine_spine_field_truth
    WHERE project_id = _project_id
      AND status = 'contradicted'
  );
$$;

REVOKE ALL ON FUNCTION public.internal_project_has_contradictions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.internal_project_has_contradictions(uuid) TO service_role;

-- ============================================================
-- 8. Decision consistency + approved_truth provenance trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_decision_matches_ceremony()
RETURNS TRIGGER AS $$
DECLARE
  cer RECORD;
BEGIN
  SELECT project_id, spine, status
    INTO cer
    FROM public.engine_spine_ceremonies
   WHERE id = NEW.ceremony_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Decision references unknown ceremony %', NEW.ceremony_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF cer.project_id <> NEW.project_id OR cer.spine <> NEW.spine THEN
    RAISE EXCEPTION 'Decision project_id/spine (%/%) does not match ceremony (%/%)',
      NEW.project_id, NEW.spine, cer.project_id, cer.spine
      USING ERRCODE = 'check_violation';
  END IF;

  IF cer.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Cannot record a decision on a % ceremony', cer.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- approved_truth provenance: source_ref must carry ceremony stamp.
  IF NEW.new_status = 'approved_truth' THEN
    IF COALESCE(NEW.source_ref ->> 'approval_kind', '') <> 'ceremony'
       OR COALESCE(NEW.source_ref ->> 'ceremony_id', '') <> NEW.ceremony_id::text
       OR COALESCE(NEW.source_ref ->> 'operator_confirmed_by', '') = '' THEN
      RAISE EXCEPTION
        'approved_truth decisions require source_ref.approval_kind=''ceremony'', matching ceremony_id, and operator_confirmed_by'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_enforce_decision_matches_ceremony
  BEFORE INSERT ON public.engine_spine_ceremony_decisions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_decision_matches_ceremony();

-- ============================================================
-- 9. Point A precedence trigger (Point B cannot open before Point A completed)
--    Also blocks reopen/abandon of a completed Point A when Point B exists
--    (forces Phase 2B invalidation flow to be built before that path opens).
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_point_a_before_point_b()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.spine = 'point-b' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.engine_spine_ceremonies
      WHERE project_id = NEW.project_id
        AND spine = 'point-a'
        AND status = 'completed'
    ) THEN
      RAISE EXCEPTION 'Point B ceremony cannot open before a Point A ceremony is completed for project %', NEW.project_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.spine = 'point-a'
     AND OLD.status = 'completed'
     AND NEW.status <> 'completed' THEN
    IF EXISTS (
      SELECT 1 FROM public.engine_spine_ceremonies
      WHERE project_id = OLD.project_id
        AND spine = 'point-b'
    ) THEN
      RAISE EXCEPTION
        'Cannot reopen/abandon a completed Point A while Point B ceremonies exist for project % (Phase 2B invalidation required)',
        OLD.project_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_enforce_point_a_before_point_b_ins
  BEFORE INSERT ON public.engine_spine_ceremonies
  FOR EACH ROW EXECUTE FUNCTION public.enforce_point_a_before_point_b();
CREATE TRIGGER trg_enforce_point_a_before_point_b_upd
  BEFORE UPDATE ON public.engine_spine_ceremonies
  FOR EACH ROW EXECUTE FUNCTION public.enforce_point_a_before_point_b();

-- ============================================================
-- 10. DB-level completion protection
--     Enforces the canonical completion rule. Direct SQL updates
--     cannot bypass this — the app-layer completeCeremony mirrors it
--     only for user-facing error surfacing.
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_ceremony_completion()
RETURNS TRIGGER AS $$
DECLARE
  field_key text;
  row_status public.epistemic_status;
  row_ref jsonb;
  missing_required text[] := ARRAY[]::text[];
BEGIN
  IF NOT (NEW.status = 'completed' AND OLD.status <> 'completed') THEN
    RETURN NEW;
  END IF;

  -- Contradictions gate — use internal helper (no auth context dependency).
  IF public.internal_project_has_contradictions(NEW.project_id) THEN
    RAISE EXCEPTION 'Cannot complete ceremony %: project % has unresolved contradictions', NEW.id, NEW.project_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Every allowlisted field (static + dynamic) must be terminal.
  FOR field_key IN
    SELECT public.internal_spine_field_keys(NEW.project_id, NEW.spine)
  LOOP
    SELECT status, source_ref
      INTO row_status, row_ref
      FROM public.engine_spine_field_truth
     WHERE project_id = NEW.project_id
       AND spine = NEW.spine
       AND field_key = enforce_ceremony_completion.field_key;

    IF NOT FOUND THEN
      missing_required := array_append(missing_required, field_key || ' (no truth row)');
      CONTINUE;
    END IF;

    IF row_status = 'approved_truth' THEN
      CONTINUE;
    END IF;

    IF row_status = 'assumed'
       AND row_ref ->> 'approval_kind' = 'operator_override'
       AND COALESCE(row_ref ->> 'reason', '') <> ''
       AND COALESCE(row_ref ->> 'operator_confirmed_by', '') <> '' THEN
      CONTINUE;
    END IF;

    IF row_status = 'missing'
       AND row_ref ->> 'approval_kind' = 'operator_override'
       AND COALESCE(row_ref ->> 'reason', '') <> ''
       AND COALESCE(row_ref ->> 'operator_confirmed_by', '') <> ''
       AND (row_ref ->> 'accepted_as_risk')::boolean IS TRUE THEN
      CONTINUE;
    END IF;

    missing_required := array_append(missing_required, field_key || ' (' || row_status::text || ')');
  END LOOP;

  IF array_length(missing_required, 1) > 0 THEN
    RAISE EXCEPTION 'Ceremony % cannot complete: fields not terminal: %', NEW.id, array_to_string(missing_required, ', ')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_enforce_ceremony_completion
  BEFORE UPDATE ON public.engine_spine_ceremonies
  FOR EACH ROW EXECUTE FUNCTION public.enforce_ceremony_completion();
```

### App-layer changes (shipped WITH the migration, once approved)

New file `src/lib/engine-spine-ceremonies.functions.ts` exposing:

- `startCeremony({ projectId, spine })` — opens or returns the in-progress
  ceremony. For `spine='point-b'`, verifies a completed Point A ceremony
  exists first; returns a clear operator-facing error if not (defense in
  depth alongside the trigger).
- `listCeremonyFields({ ceremonyId })` — calls public `spine_field_keys`
  RPC (access-gated at DB level) after `assertAdminOrOperator`. Joins the
  returned key list against `engine_spine_field_truth` to compose the panel.
- `recordCeremonyDecision({ ceremonyId, fieldKey, newStatus, sourceRef })` —
  when `newStatus === 'approved_truth'`, server enriches sourceRef with
  `approval_kind='ceremony'`, `ceremony_id=ceremonyId`, and
  `operator_confirmed_by=actorEmail`. Runs Phase 1 evidence guards, inserts
  the decision row (DB trigger re-verifies stamp), and upserts
  `engine_spine_field_truth` with `ceremony_id` set and the same enriched
  source_ref.
- `completeCeremony({ ceremonyId })` — mirrors the DB rule for user-facing
  error surfacing: iterates via `spine_field_keys` RPC, checks each field's
  truth row, calls public `has_contradictions`, then flips the ceremony.
  The DB trigger is the source of truth; the app call surfaces friendly
  messages.
- `abandonCeremony({ ceremonyId, reason })` — sets
  `status='abandoned'` + `abandoned_at` + `abandoned_by_email` + `abandon_reason`.
  Attempts to abandon a completed Point A while Point B ceremonies exist
  are rejected by the trigger.

All admin/operator gated.

Additional app-layer change:

- `src/lib/engine-epistemic.server.ts` — extend `SourceRef` with optional
  `accepted_as_risk: boolean` and document the accepted-risk shape for
  ceremony-scoped `assumed` / `missing` decisions.

Cross-check vitest:

- New test compares the static array literal inside
  `internal_spine_field_keys` against `SPINE_FIELD_REGISTRY` in
  `src/lib/engine-spine-fields.ts`. Fails on drift.

### UI changes

- New `CeremonyPanel` on the Point A and Point B routes (list every field
  from `spine_field_keys`, current chip, popover to set new status +
  source_ref, running audit tail of decisions).
- `WorkspaceStepper` grows a badge on Point A / Point B when a ceremony is
  in-progress OR the project has `needs_confirmation` rows.
- Neutral fallback ("No status") from Phase 1 remains for unclassified
  fields; the panel exposes a "Classify" affordance for those.

### Phase 2B blockers (documented, NOT in this migration)

The Phase 2 R4 trigger rejects reopen/abandon of a completed Point A when
Point B ceremonies exist. Phase 2B must ship before that path unlocks:

- Downstream invalidation columns on Point B ceremonies (e.g.
  `stale_reason`, `stale_since`, `re_review_required`).
- Re-review workflow for downstream roadmap frames, milestones, and
  delivery packets when Point A truth changes.
- UI surface to warn operators before they trigger a downstream cascade.

### Backfill / migration risk

- All new columns/tables are additive; no data rewrite.
- `ceremony_id` on truth rows is nullable — historical rows untouched.
- `has_contradictions` (public) preserved as-is for existing UI/API callers.

### Preflight (to run before applying)

1. Confirm no orphaned in-progress ceremony rows would violate the partial
   unique index (table doesn't exist yet, so trivially true).
2. Confirm `engine_audit_log.action` accepts the new values
   (`spine_ceremony_opened`, `spine_ceremony_changed`,
   `spine_ceremony_decision`) — column is free-text today.
3. Confirm `public.update_updated_at_column()` exists.
4. Confirm `public.has_role_email(text, app_role)` exists.
5. Confirm `public.is_engine_staff()` exists.
6. Confirm `public.epistemic_status` enum exists (Phase 1 R3 shipped it).

### Smoke plan (post-apply)

Ceremony lifecycle:

1. `startCeremony(point-a)` → row created, `opened_by_email` = operator.
2. Second `startCeremony(point-a)` returns the same id (partial unique
   index).
3. `recordCeremonyDecision` for one field with `new_status='stated'` →
   truth row upserted, `ceremony_id` stamped, decision row present, two
   audit rows written.

Completion gate:

4. `completeCeremony` blocked while any allowlisted field is still
   `needs_confirmation` (or non-terminal).
5. Direct SQL `UPDATE engine_spine_ceremonies SET status='completed'` on
   an incomplete ceremony → rejected by trigger.
6. `completeCeremony` with one field left as bare `missing` (no
   accepted-risk source_ref) → rejected.
7. Same field re-decided as `missing` with `approval_kind='operator_override'`
   + `reason` + `accepted_as_risk=true` + `operator_confirmed_by` →
   `completeCeremony` succeeds.
8. Contradiction path: seed one `contradicted` row, then attempt
   `completeCeremony` → rejected with contradiction reason.

Point A precedence:

9. `startCeremony(point-b)` with no completed Point A → rejected app-side
   AND by trigger.
10. `abandonCeremony(point-a)` after any Point B ceremony exists → rejected.

Decision consistency + approved_truth provenance:

11. Insert a decision with mismatched `project_id`/`spine` vs its ceremony
    → rejected by trigger.
12. Insert a decision against a `completed` ceremony → rejected.
13. Direct SQL insert of a decision with `new_status='approved_truth'`
    and missing `approval_kind`/`ceremony_id`/`operator_confirmed_by` in
    `source_ref` → rejected by trigger.
14. Full success: every allowlisted field (static + dynamic) reaches
    `approved_truth` via `recordCeremonyDecision`; every promoted truth
    row shows `source_ref.approval_kind='ceremony'`, matching `ceremony_id`,
    and `operator_confirmed_by`. `completeCeremony` succeeds; `completed_at`
    + `completed_by_email` populated.

AI actor + unknown key:

15. AI actor attempting `recordCeremonyDecision` with `verified` /
    `approved_truth` → rejected by `assertStatusAllowedForActor`.
16. Unknown `field_key` → rejected by `assertKnownFieldKey`.

Abandon metadata:

17. `abandonCeremony` requires `reason`; row shows `abandoned_at`,
    `abandoned_by_email`, `abandon_reason`. Completed / in-progress
    columns remain null (CHECK enforced).

R4 field-universe split:

18. Authenticated caller with no staff role and no portal permission
    calling `spine_field_keys(other_project_id, 'point-a')` → raises
    `insufficient_privilege`.
19. Same caller cannot call `internal_spine_field_keys` at all →
    `permission denied for function internal_spine_field_keys`.
20. Staff caller on a project with `diagnosis:x` and `diagnosis:y` truth
    rows: `spine_field_keys(project, 'point-a')` returns full static set
    + both dynamic keys.
21. Client-portal member (non-staff) with active permission on the
    project can read `spine_field_keys` for that project.
22. DB completion trigger: with a fresh Point A ceremony where every
    static field is `approved_truth` but a `diagnosis:x` truth row is
    still `needs_confirmation`, a direct SQL
    `UPDATE ... SET status='completed'` is rejected — proves the trigger
    sees dynamic keys through `internal_spine_field_keys` even with no
    `auth.email()`.

Results append to `.orchestrator/phase-2-output.md`.






