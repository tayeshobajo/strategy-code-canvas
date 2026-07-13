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

Status: **ACCEPTED (2026-07-12)** — R4 + R4B + acceptance smoke pass complete.
See `.orchestrator/phase-2-output.md` for the 21/21 acceptance run.

Post-acceptance hardening applied:
- `public.spine_field_keys(uuid, text)` locked to internal staff only
  (`is_engine_staff() OR has_role_email(_, 'team_member')`). The prior
  portal-member branch was removed; ceremonies stay internal-only and
  dynamic `diagnosis:*` keys are not exposed to portal clients. If Phase 3
  needs a client-safe field-label helper it must ship as a separate
  portal-safe function.


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







---

## Phase 2 smoke run — executed 2026-07-12

**Totals: 8 PASS / 0 FAIL / 14 INCONCLUSIVE (9 env-permission · 4 env-structural · 1 dep-blocked) / 22 total.**

Harness: `.orchestrator/phase-2-smoke/db-cases.sql` (transactional, ROLLBACK — no persistence). Run under `sandbox_exec` psql role which has INSERT/SELECT but not UPDATE on `engine_spine_*` tables.

PASSED (8): 1 (start point-a), 2 (duplicate blocked), 9 (point-b precedence INSERT branch), 11 (mismatched project_id on decision), 18 (public helper access gate present), 19 (internal helper has no authenticated grant), 20 (internal helper returns static + dynamic keys), 21 (portal-member branch present).

INCONCLUSIVE — requires UPDATE (9): 3, 4, 5, 7, 8, 15, 16, 17, 22.
INCONCLUSIVE-BY-ENV — structural verify only (4): 6, 10, 13, 14.
INCONCLUSIVE-BY-DEP (1): 12 (depended on case 7 UPDATE).

No trigger or gate produced a real failure. Recommended before Tai sign-off: Playwright pass through `CeremonyPanel` to exercise the UPDATE-only cases end-to-end. Scoped into the Phase 2 closeout with the `WorkspaceStepper` badge. Full per-case table + interpretation in `.orchestrator/phase-2-output.md`.

---

## Phase 3 — Governed Portal Publication (v4 — tightened)

Status: **APPLIED 2026-07-13** (Tai approved v4). Preflight passed:
7 portal projects × 1 publish candidate each, 0 orphan approved/delivered
without published_at. Backfill result: 7 rows → `published`, 0 → `superseded`
(no dual-published projects existed). All 4 new roadmap triggers and the
publish-event ref-validation trigger are installed. DB smoke suite lives at
`.orchestrator/phase-3-smoke/db-cases.sql`.

**App follow-on: IN PROGRESS.** Next: publish primitive rewrite, rollback/
retract/restore/history/ack server functions, `sendProjectDelivery` reroute,
portal reads narrowed to `status='published'`, Publish History + Rollback/
Retract/Restore UI, guard tests, A1/A2 transactional pairing tests. Not
marking Phase 3 accepted until DB smoke + app smoke + portal leak tests pass.

v4 changes over v3:
1. **Bug fix.** Removed `metadata.transition_reason` from the state-transition
   trigger. `metadata` is frozen post-publish, so v3's rollback/restore path
   was unreachable. Reason + actor for rollback/restore now lives entirely in
   `client_portal_publish_events` (`rolled_back`, `restored`); the DB trigger
   allows `superseded → published` and `retracted → published` unconditionally
   within the whitelist; the app-side contract (enforced by smoke) requires
   the matching event row in the same transaction.
2. Added `project_id` to the immutability trigger — a published/superseded/
   retracted row cannot be moved between portal projects.
3. Lineage trigger fire clause extended to `UPDATE OF previous_publication_id,
   project_id` so a `project_id` change re-validates lineage.
4. New trigger `tg_client_portal_publish_events_validate_refs` — every event
   row must reference roadmap ids that belong to `portal_project_id`, and
   `previous_portal_roadmap_id` cannot equal `portal_roadmap_id`.

v3 changes over v2 (kept for context):
1. Recursive JSONB scrub (banned keys blocked at any depth, not just top level).
2. Explicit state-transition whitelist trigger.
3. Full live-schema audit of `client_portal_roadmaps`; the immutability trigger
   now names every frozen client-facing column instead of a partial list.

### Full column audit (live schema, 2026-07-13)

`client_portal_roadmaps` columns today:

```text
id, project_id, source_submission_id, source_review_id, roadmap_document_id,
title, version_label, status, approved_at,
executive_summary, current_diagnosis, strategic_priorities, sequence_30_60_90,
risks_dependencies, recommended_next_move, supporting_notes,
current_focus, owner_name, next_milestone, next_meeting_at,
pdf_file_id, one_pager_file_id, share_url,
acknowledged_at, acknowledged_by_email,
metadata, created_at, updated_at,
approved_roadmap_version_id, visible_modules,
published_by, published_at, client_safe_canvas
```

Plus columns added by this migration:
`previous_publication_id, publish_diff, retracted_at, retracted_by, retraction_reason`.

Classification:

| Class | Columns | Rule when status ∈ (published, superseded, retracted) |
|---|---|---|
| **Frozen client-facing snapshot** | `title, version_label, executive_summary, current_diagnosis, strategic_priorities, sequence_30_60_90, risks_dependencies, recommended_next_move, current_focus, owner_name, next_milestone, next_meeting_at, pdf_file_id, one_pager_file_id, share_url, visible_modules, client_safe_canvas, approved_roadmap_version_id, source_submission_id, source_review_id, roadmap_document_id, publish_diff, previous_publication_id, published_by, published_at, approved_at` | Immutable; UPDATE raises. |
| **JSONB snapshot (frozen + recursively scrubbed)** | `strategic_priorities, sequence_30_60_90, risks_dependencies, visible_modules, client_safe_canvas, metadata, publish_diff` | Recursively scrubbed on every INSERT/UPDATE; frozen after publish. |
| **Internal-only text (never portal-visible)** | `supporting_notes` | Kept out of every portal read path and out of `publish_diff`; app-layer guard tests enforce. |
| **Mutable post-publish (governed)** | `status, updated_at, acknowledged_at, acknowledged_by_email, retracted_at, retracted_by, retraction_reason` | Governed by transition trigger + retraction CHECK. |
| **System** | `id, project_id, created_at` | Never mutable after insert. |

### Preflight (run BEFORE applying)

```sql
-- P1. Status distribution
SELECT status, count(*) FROM public.client_portal_roadmaps GROUP BY status;

-- P2. Banned internal keys at ANY depth in any client-facing jsonb column.
--     Uses the recursive helper installed by the migration; run this AFTER
--     step 0 of the migration (helper creation) but BEFORE COMMIT if you
--     want to preflight in one shot. Or install helper standalone first.
SELECT id, 'metadata' AS col,
       public.jsonb_contains_banned_key(metadata, ARRAY[
         'ceremony_id','ceremony_state','epistemic','epistemic_status',
         'operator_override','operator_lock','contradiction','contradictions',
         'provenance','source_ids','agent_costs','ai_confidence','confidence',
         'internal_notes','supporting_notes_internal','review_state',
         'intelligence_memory'
       ]) AS hit
  FROM public.client_portal_roadmaps
 WHERE public.jsonb_contains_banned_key(metadata, ARRAY[
         'ceremony_id','ceremony_state','epistemic','epistemic_status',
         'operator_override','operator_lock','contradiction','contradictions',
         'provenance','source_ids','agent_costs','ai_confidence','confidence',
         'internal_notes','supporting_notes_internal','review_state',
         'intelligence_memory'
       ]) IS NOT NULL
UNION ALL
SELECT id, 'client_safe_canvas',
       public.jsonb_contains_banned_key(client_safe_canvas, ARRAY[
         'ceremony_id','ceremony_state','epistemic','epistemic_status',
         'operator_override','operator_lock','contradiction','contradictions',
         'provenance','source_ids','agent_costs','ai_confidence','confidence',
         'internal_notes','supporting_notes_internal','review_state',
         'intelligence_memory'
       ])
  FROM public.client_portal_roadmaps
 WHERE public.jsonb_contains_banned_key(client_safe_canvas, ARRAY[
         'ceremony_id','ceremony_state','epistemic','epistemic_status',
         'operator_override','operator_lock','contradiction','contradictions',
         'provenance','source_ids','agent_costs','ai_confidence','confidence',
         'internal_notes','supporting_notes_internal','review_state',
         'intelligence_memory'
       ]) IS NOT NULL;
-- MUST return zero rows before proceeding.

-- P3. Simulate backfill: exactly one 'to_publish' per project
WITH candidates AS (
  SELECT id, project_id,
         row_number() OVER (PARTITION BY project_id
                            ORDER BY published_at DESC NULLS LAST, updated_at DESC) AS rn
    FROM public.client_portal_roadmaps
   WHERE status IN ('approved','delivered','published')
     AND published_at IS NOT NULL
)
SELECT project_id,
       count(*) FILTER (WHERE rn = 1) AS to_publish,
       count(*) FILTER (WHERE rn > 1) AS to_supersede
  FROM candidates GROUP BY project_id
  HAVING count(*) FILTER (WHERE rn = 1) <> 1;   -- MUST return zero rows
```

### Migration SQL (single file)

```sql
BEGIN;

-- 0. Recursive JSONB scrub helper (FIX #1). Walks objects + arrays; returns
--    the first banned key encountered at any depth, or NULL.
CREATE OR REPLACE FUNCTION public.jsonb_contains_banned_key(
  doc jsonb,
  banned text[]
) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  k text;
  v jsonb;
  hit text;
BEGIN
  IF doc IS NULL THEN RETURN NULL; END IF;
  CASE jsonb_typeof(doc)
    WHEN 'object' THEN
      FOR k, v IN SELECT * FROM jsonb_each(doc) LOOP
        IF k = ANY(banned) THEN RETURN k; END IF;
        hit := public.jsonb_contains_banned_key(v, banned);
        IF hit IS NOT NULL THEN RETURN hit; END IF;
      END LOOP;
    WHEN 'array' THEN
      FOR v IN SELECT jsonb_array_elements(doc) LOOP
        hit := public.jsonb_contains_banned_key(v, banned);
        IF hit IS NOT NULL THEN RETURN hit; END IF;
      END LOOP;
    ELSE
      RETURN NULL;
  END CASE;
  RETURN NULL;
END $$;

-- 1. Extend status set
ALTER TABLE public.client_portal_roadmaps
  DROP CONSTRAINT IF EXISTS client_portal_roadmaps_status_check;
ALTER TABLE public.client_portal_roadmaps
  ADD CONSTRAINT client_portal_roadmaps_status_check
  CHECK (status IN ('in_progress','approved','delivered',
                    'published','superseded','retracted'));

-- 2. Add new columns first so backfill and lineage work cleanly
ALTER TABLE public.client_portal_roadmaps
  ADD COLUMN IF NOT EXISTS previous_publication_id uuid
    REFERENCES public.client_portal_roadmaps(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS publish_diff jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS retracted_at timestamptz,
  ADD COLUMN IF NOT EXISTS retracted_by text,
  ADD COLUMN IF NOT EXISTS retraction_reason text;

-- 3. Correct backfill: latest published_at per project across
--    (approved,delivered,published) → 'published'; older ones → 'superseded';
--    rows without published_at stay put.
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

-- 4. Post-backfill invariant preflight
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

-- 5. Unique invariant
CREATE UNIQUE INDEX IF NOT EXISTS client_portal_roadmaps_one_published_per_project
  ON public.client_portal_roadmaps(project_id) WHERE status = 'published';

-- 6. Status consistency CHECKs
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

-- 7. Lineage validation trigger (cross-row, so not a CHECK)
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
  BEFORE INSERT OR UPDATE OF previous_publication_id, project_id
  ON public.client_portal_roadmaps
  FOR EACH ROW EXECUTE FUNCTION
  public.tg_client_portal_roadmaps_validate_lineage();

-- 8. Explicit state-transition whitelist trigger.
--    Same-status writes always allowed (subject to immutability trigger).
--    Acknowledgment fields may change under any current status without a
--    transition. All other transitions must be on the whitelist.
--    NOTE (v4): rollback/restore are NOT authorized via metadata — metadata
--    is frozen post-publish. Reason + actor for those transitions live in
--    client_portal_publish_events (rolled_back / restored). The app-side
--    contract requires the matching event row in the same transaction;
--    smoke asserts pairing.
CREATE OR REPLACE FUNCTION public.tg_client_portal_roadmaps_status_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  IF (OLD.status = 'in_progress' AND NEW.status = 'approved')
  OR (OLD.status = 'approved'    AND NEW.status = 'published')
  OR (OLD.status = 'delivered'   AND NEW.status = 'published')
  OR (OLD.status = 'published'   AND NEW.status = 'superseded')
  OR (OLD.status = 'published'   AND NEW.status = 'retracted')
  OR (OLD.status = 'superseded'  AND NEW.status = 'published')  -- rollback
  OR (OLD.status = 'retracted'   AND NEW.status = 'published')  -- restore
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'invalid_status_transition: % → % not permitted', OLD.status, NEW.status;
END $$;

DROP TRIGGER IF EXISTS tg_client_portal_roadmaps_status_transition
  ON public.client_portal_roadmaps;
CREATE TRIGGER tg_client_portal_roadmaps_status_transition
  BEFORE UPDATE OF status
  ON public.client_portal_roadmaps
  FOR EACH ROW EXECUTE FUNCTION
  public.tg_client_portal_roadmaps_status_transition();

-- 9. Immutability trigger (FIX #3): freeze the full "frozen client-facing
--    snapshot" column set from the audit above once status IN
--    (published, superseded, retracted). Only the "mutable post-publish"
--    columns may change.
CREATE OR REPLACE FUNCTION public.tg_client_portal_roadmaps_immutable_after_publish()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status NOT IN ('published','superseded','retracted') THEN
    RETURN NEW;
  END IF;
  IF NEW.title                       IS DISTINCT FROM OLD.title
  OR NEW.version_label               IS DISTINCT FROM OLD.version_label
  OR NEW.executive_summary           IS DISTINCT FROM OLD.executive_summary
  OR NEW.current_diagnosis           IS DISTINCT FROM OLD.current_diagnosis
  OR NEW.strategic_priorities        IS DISTINCT FROM OLD.strategic_priorities
  OR NEW.sequence_30_60_90           IS DISTINCT FROM OLD.sequence_30_60_90
  OR NEW.risks_dependencies          IS DISTINCT FROM OLD.risks_dependencies
  OR NEW.recommended_next_move       IS DISTINCT FROM OLD.recommended_next_move
  OR NEW.current_focus               IS DISTINCT FROM OLD.current_focus
  OR NEW.owner_name                  IS DISTINCT FROM OLD.owner_name
  OR NEW.next_milestone              IS DISTINCT FROM OLD.next_milestone
  OR NEW.next_meeting_at             IS DISTINCT FROM OLD.next_meeting_at
  OR NEW.pdf_file_id                 IS DISTINCT FROM OLD.pdf_file_id
  OR NEW.one_pager_file_id           IS DISTINCT FROM OLD.one_pager_file_id
  OR NEW.share_url                   IS DISTINCT FROM OLD.share_url
  OR NEW.visible_modules             IS DISTINCT FROM OLD.visible_modules
  OR NEW.client_safe_canvas          IS DISTINCT FROM OLD.client_safe_canvas
  OR NEW.approved_roadmap_version_id IS DISTINCT FROM OLD.approved_roadmap_version_id
  OR NEW.source_submission_id        IS DISTINCT FROM OLD.source_submission_id
  OR NEW.source_review_id            IS DISTINCT FROM OLD.source_review_id
  OR NEW.roadmap_document_id         IS DISTINCT FROM OLD.roadmap_document_id
  OR NEW.publish_diff                IS DISTINCT FROM OLD.publish_diff
  OR NEW.previous_publication_id     IS DISTINCT FROM OLD.previous_publication_id
  OR NEW.published_by                IS DISTINCT FROM OLD.published_by
  OR NEW.published_at                IS DISTINCT FROM OLD.published_at
  OR NEW.approved_at                 IS DISTINCT FROM OLD.approved_at
  OR NEW.project_id                  IS DISTINCT FROM OLD.project_id
  OR NEW.metadata                    IS DISTINCT FROM OLD.metadata
  THEN
    RAISE EXCEPTION 'client_portal_roadmaps: snapshot fields immutable once %',
                    OLD.status;
  END IF;
  RETURN NEW;
END $$;

-- NOTE: acknowledgment, status, retraction, updated_at intentionally omitted
-- so they remain writeable. Any new client-facing column added to
-- client_portal_roadmaps in the future MUST be added to this trigger AND to
-- the audit table above in the same migration.

DROP TRIGGER IF EXISTS tg_client_portal_roadmaps_immutable_after_publish
  ON public.client_portal_roadmaps;
CREATE TRIGGER tg_client_portal_roadmaps_immutable_after_publish
  BEFORE UPDATE ON public.client_portal_roadmaps
  FOR EACH ROW EXECUTE FUNCTION
  public.tg_client_portal_roadmaps_immutable_after_publish();

-- 10. Scrub trigger — recursive (FIX #1). Rejects banned keys at ANY depth
--     in every jsonb snapshot column.
CREATE OR REPLACE FUNCTION public.tg_client_portal_roadmaps_scrub_internal()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  banned text[] := ARRAY[
    'ceremony_id','ceremony_state','epistemic','epistemic_status',
    'operator_override','operator_lock','contradiction','contradictions',
    'provenance','source_ids','agent_costs','ai_confidence','confidence',
    'internal_notes','supporting_notes_internal','review_state',
    'intelligence_memory'
  ];
  hit text;
BEGIN
  hit := public.jsonb_contains_banned_key(NEW.metadata, banned);
  IF hit IS NOT NULL THEN
    RAISE EXCEPTION 'client_portal_roadmaps.metadata carries internal key: %', hit;
  END IF;
  hit := public.jsonb_contains_banned_key(NEW.publish_diff, banned);
  IF hit IS NOT NULL THEN
    RAISE EXCEPTION 'client_portal_roadmaps.publish_diff carries internal key: %', hit;
  END IF;
  hit := public.jsonb_contains_banned_key(NEW.client_safe_canvas, banned);
  IF hit IS NOT NULL THEN
    RAISE EXCEPTION 'client_portal_roadmaps.client_safe_canvas carries internal key: %', hit;
  END IF;
  hit := public.jsonb_contains_banned_key(NEW.visible_modules, banned);
  IF hit IS NOT NULL THEN
    RAISE EXCEPTION 'client_portal_roadmaps.visible_modules carries internal key: %', hit;
  END IF;
  hit := public.jsonb_contains_banned_key(NEW.strategic_priorities, banned);
  IF hit IS NOT NULL THEN
    RAISE EXCEPTION 'client_portal_roadmaps.strategic_priorities carries internal key: %', hit;
  END IF;
  hit := public.jsonb_contains_banned_key(NEW.sequence_30_60_90, banned);
  IF hit IS NOT NULL THEN
    RAISE EXCEPTION 'client_portal_roadmaps.sequence_30_60_90 carries internal key: %', hit;
  END IF;
  hit := public.jsonb_contains_banned_key(NEW.risks_dependencies, banned);
  IF hit IS NOT NULL THEN
    RAISE EXCEPTION 'client_portal_roadmaps.risks_dependencies carries internal key: %', hit;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_client_portal_roadmaps_scrub_internal
  ON public.client_portal_roadmaps;
CREATE TRIGGER tg_client_portal_roadmaps_scrub_internal
  BEFORE INSERT OR UPDATE OF metadata, publish_diff, client_safe_canvas,
                             visible_modules, strategic_priorities,
                             sequence_30_60_90, risks_dependencies
  ON public.client_portal_roadmaps
  FOR EACH ROW EXECUTE FUNCTION
  public.tg_client_portal_roadmaps_scrub_internal();

-- 11. Event audit table (ON DELETE RESTRICT; ack is first-class event)
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

-- 12. Publish-event reference validation (v4). Every event row must
--     reference roadmap ids that belong to portal_project_id, and
--     previous_portal_roadmap_id (when present) must be a distinct row in
--     the same project.
CREATE OR REPLACE FUNCTION public.tg_client_portal_publish_events_validate_refs()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  cur_project uuid;
  prev_project uuid;
BEGIN
  SELECT project_id INTO cur_project
    FROM public.client_portal_roadmaps
   WHERE id = NEW.portal_roadmap_id;
  IF cur_project IS NULL THEN
    RAISE EXCEPTION 'publish_events: portal_roadmap_id % not found', NEW.portal_roadmap_id;
  END IF;
  IF cur_project <> NEW.portal_project_id THEN
    RAISE EXCEPTION 'publish_events: portal_roadmap_id belongs to different portal project';
  END IF;

  IF NEW.previous_portal_roadmap_id IS NOT NULL THEN
    IF NEW.previous_portal_roadmap_id = NEW.portal_roadmap_id THEN
      RAISE EXCEPTION 'publish_events: previous_portal_roadmap_id cannot equal portal_roadmap_id';
    END IF;
    SELECT project_id INTO prev_project
      FROM public.client_portal_roadmaps
     WHERE id = NEW.previous_portal_roadmap_id;
    IF prev_project IS NULL THEN
      RAISE EXCEPTION 'publish_events: previous_portal_roadmap_id % not found', NEW.previous_portal_roadmap_id;
    END IF;
    IF prev_project <> NEW.portal_project_id THEN
      RAISE EXCEPTION 'publish_events: previous_portal_roadmap_id belongs to different portal project';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_client_portal_publish_events_validate_refs
  ON public.client_portal_publish_events;
CREATE TRIGGER tg_client_portal_publish_events_validate_refs
  BEFORE INSERT OR UPDATE OF portal_project_id, portal_roadmap_id,
                             previous_portal_roadmap_id
  ON public.client_portal_publish_events
  FOR EACH ROW EXECUTE FUNCTION
  public.tg_client_portal_publish_events_validate_refs();

COMMIT;
```

**Acknowledgment audit:** ack is tracked in TWO places, both required.
`client_portal_activity` remains the user activity feed (existing).
`client_portal_publish_events.event_type='acknowledged'` makes ack a
first-class publication transition attributable to a specific
`portal_roadmap_id`. The app-side `acknowledgePortalRoadmap` server function
will write the ack columns AND insert one `acknowledged` event.

### Rollback SQL

```sql
BEGIN;

DROP TRIGGER IF EXISTS tg_client_portal_roadmaps_scrub_internal
  ON public.client_portal_roadmaps;
DROP TRIGGER IF EXISTS tg_client_portal_roadmaps_immutable_after_publish
  ON public.client_portal_roadmaps;
DROP TRIGGER IF EXISTS tg_client_portal_roadmaps_status_transition
  ON public.client_portal_roadmaps;
DROP TRIGGER IF EXISTS tg_client_portal_roadmaps_validate_lineage
  ON public.client_portal_roadmaps;
DROP FUNCTION IF EXISTS public.tg_client_portal_roadmaps_scrub_internal();
DROP FUNCTION IF EXISTS public.tg_client_portal_roadmaps_immutable_after_publish();
DROP FUNCTION IF EXISTS public.tg_client_portal_roadmaps_status_transition();
DROP FUNCTION IF EXISTS public.tg_client_portal_roadmaps_validate_lineage();
DROP FUNCTION IF EXISTS public.jsonb_contains_banned_key(jsonb, text[]);

DROP TRIGGER IF EXISTS tg_client_portal_publish_events_validate_refs
  ON public.client_portal_publish_events;
DROP FUNCTION IF EXISTS public.tg_client_portal_publish_events_validate_refs();

DROP TABLE IF EXISTS public.client_portal_publish_events;
DROP INDEX IF EXISTS public.client_portal_roadmaps_one_published_per_project;

ALTER TABLE public.client_portal_roadmaps
  DROP CONSTRAINT IF EXISTS client_portal_roadmaps_retraction_fields_consistent,
  DROP CONSTRAINT IF EXISTS client_portal_roadmaps_published_at_required;

-- Retracted rows require manual triage; fail loudly.
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

### Smoke cases (30 — DB-level, `.orchestrator/phase-3-smoke/db-cases.sql`)

1. Backfill: latest published_at per project → `published`; older → `superseded`; unpublished rows unchanged.
2. Post-backfill preflight aborts a synthesized dual-`published` scenario.
3. Unique index rejects a second `published` row per project.
4. `status='published'` insert without `published_at` → CHECK failure.
5. `status='retracted'` without retraction fields → CHECK failure.
6. Non-retracted status with any retraction field set → CHECK failure.
7. `retraction_reason=''` while retracted → CHECK failure.
8. UPDATE `client_safe_canvas` on `published` row → immutability trigger error.
9. UPDATE `publish_diff` on `superseded` row → error.
10. UPDATE `approved_roadmap_version_id` on `retracted` row → error.
11. UPDATE `acknowledged_at`/`acknowledged_by_email` on `published` → ALLOWED.
12. Status transitions published→superseded, published→retracted → ALLOWED.
13. Concurrent status→retracted with retraction fields set → ALLOWED.
14. Scrub: `metadata` with top-level `ceremony_id` → rejected, error names the key.
15. Scrub: `publish_diff` with top-level `epistemic` → rejected.
16. Scrub: `client_safe_canvas` with top-level `provenance` → rejected.
17. Scrub: `visible_modules` with `agent_costs` → rejected.
18. Lineage: `previous_publication_id = id` → trigger error.
19. Lineage: `previous_publication_id` from a different project → error.
20. Lineage: valid prior row in same project → ALLOWED.
21. ON DELETE RESTRICT: deleting a roadmap referenced by an event → FK violation.
22. Events RLS: non-staff `authenticated` sees zero rows.
23. Events RLS: staff sees all rows.
24. Acknowledgment event: `event_type='acknowledged'` insert succeeds, is history-filterable, and passes the ref-validation trigger (same-project roadmap).
25. **[v3]** Scrub: banned key nested 3 levels deep in `client_safe_canvas.phases[0].items[0].provenance` → rejected, error names `provenance`.
26. **[v3]** Scrub: banned key nested inside `metadata.publish.debug.agent_costs` → rejected, error names `agent_costs`.
27. **[v4]** Transition: UPDATE `published` → `approved`, `superseded` → `in_progress`, `retracted` → `delivered`, `published` → `in_progress` → all rejected (`invalid_status_transition`).
28. **[v4]** Transition: `superseded` → `published` ALLOWED at the DB layer (no `transition_reason` involved); `retracted` → `published` ALLOWED at the DB layer. App-level smoke A1/A2 covers the paired event-row requirement.
29. **[v4]** Immutability: UPDATE `project_id` on a `published` / `superseded` / `retracted` row → immutability trigger error naming `project_id`. Pre-publish row (`in_progress`, `approved`) may still change `project_id` but re-runs the lineage validation trigger.
30. **[v4]** Publish-event ref validation:
    a. Insert event with `portal_roadmap_id` whose `project_id` ≠ `portal_project_id` → rejected.
    b. Insert event with `previous_portal_roadmap_id` from a different project → rejected.
    c. Insert event with `previous_portal_roadmap_id = portal_roadmap_id` → rejected.
    d. UPDATE an existing event to swap `portal_roadmap_id` to a foreign-project row → rejected.
    e. Valid `rolled_back` event with same-project previous ref → ALLOWED.

UI/app-level smoke deferred to the app-layer PR after migration lands
(publish → republish idempotent, rollback, retract, ack, history panel).
Additional app-level cases already scoped:

- **A1** — `rollbackPortalPublication` writes exactly one `event_type='rolled_back'` row referencing the target roadmap, in the same transaction as the `superseded → published` UPDATE; if the event insert fails, the status flip is rolled back.
- **A2** — same shape for `restorePortalPublication` / `event_type='restored'`.

### What ships on the app side after Tai applies this

- `publishVersionToPortal` reworked (diff-aware, idempotent, writes lineage
  + `published`/`superseded` events).
- New `rollbackPortalPublication` (flips `superseded → published` and writes
  a paired `rolled_back` event with reason/actor in the same transaction),
  `retractPortalPublication`, `restorePortalPublication` (flips
  `retracted → published` and writes a paired `restored` event),
  `getPortalPublicationHistory`, and `acknowledgePortalRoadmap` (writes an
  `acknowledged` event) server functions. None of these mutate `metadata` on
  post-publish rows — reason lives on the event row, not the snapshot.
- `sendProjectDelivery` re-routed through the same publish primitive.
- Portal read filters narrow from `IN('approved','delivered')` to
  `= 'published'`.
- Internal UI: Publish diff preview, Publish History panel, Rollback +
  Retract + Restore controls (admin-only).
- Guard tests extending `publish-column-integrity.test.ts` and
  `portal-context-leaks.test.ts`; 30-case DB smoke + A1/A2 app smoke under
  `.orchestrator/phase-3-smoke/`.

### Capabilities moved to CONFIRMED (post-apply)

- Portal publication is a governed state machine with an explicit transition whitelist enforced at the DB layer; illegal downgrades cannot happen even from admin code.
- One authoritative current row per project.
- Every published version is immutable across the full audited snapshot column set; changes only via new supersede/retract transitions.
- Republish is diff-aware and idempotent.
- Rollback, retract, and restore are first-class, audited primitives.
- Internal state cannot leak into any client-facing jsonb column at any nesting depth (`metadata`, `publish_diff`, `client_safe_canvas`, `visible_modules`, `strategic_priorities`, `sequence_30_60_90`, `risks_dependencies`) at the DB layer.
- Client acknowledgment is captured as a first-class publication transition attributable to a specific historical row.

---

## Phase 3B — Portal Publication Atomic RPCs

Status: **PENDING TAI REVIEW** — do not apply.

**Why this is needed.** Phase 3 v4 requires paired writes:
`superseded → published` MUST insert a `rolled_back` event; `retracted →
published` MUST insert a `restored` event; both in the SAME transaction.
Supabase-js has no client-side transaction API — the only way to guarantee
atomicity (event insert fails → status flip rolls back, status flip fails →
no orphan event) is a `SECURITY DEFINER` PL/pgSQL function invoked via
`rpc()`. Same pattern applies to publish, retract, and acknowledge, which
each currently do 2–3 sequential writes with no rollback path.

**Six RPCs, one migration.** All are `SECURITY DEFINER`, `SET search_path =
public`, authorize the caller against `is_engine_staff()` (client-facing
`acknowledge_portal_roadmap` authorizes against
`client_portal_permissions`), and raise on invalid state.

```sql
-- 1. publish_portal_roadmap: supersedes prior 'published' row + inserts new
-- 'published' row + writes 'published' event (and 'superseded' event for
-- prior row when present). All in one txn.
CREATE OR REPLACE FUNCTION public.publish_portal_roadmap(
  _portal_project_id uuid,
  _engine_project_id uuid,
  _engine_version_id uuid,
  _title text,
  _version_label text,
  _executive_summary text,
  _current_diagnosis text,
  _strategic_priorities jsonb,
  _sequence_30_60_90 jsonb,
  _risks_dependencies jsonb,
  _recommended_next_move text,
  _client_safe_canvas jsonb,
  _publish_diff jsonb DEFAULT '{}'::jsonb,
  _summary text DEFAULT NULL
) RETURNS uuid ...;

-- 2. rollback_portal_publication: current 'published' → 'retracted' (with
-- reason), then target superseded row → 'published', then insert
-- 'rolled_back' event referencing the restored row + previous_portal_roadmap_id.
CREATE OR REPLACE FUNCTION public.rollback_portal_publication(
  _portal_project_id uuid,
  _target_roadmap_id uuid,   -- the superseded row to promote back
  _reason text
) RETURNS uuid ...;

-- 3. retract_portal_publication: current 'published' → 'retracted', writes
-- retraction fields, inserts 'retracted' event. No successor row.
CREATE OR REPLACE FUNCTION public.retract_portal_publication(
  _portal_roadmap_id uuid,
  _reason text
) RETURNS uuid ...;

-- 4. restore_portal_publication: 'retracted' → 'published', clears retraction
-- fields (mutable — not in immutability set), inserts 'restored' event.
CREATE OR REPLACE FUNCTION public.restore_portal_publication(
  _portal_roadmap_id uuid,
  _reason text
) RETURNS uuid ...;

-- 5. acknowledge_portal_roadmap: sets acknowledged_at / acknowledged_by_email
-- on the live 'published' row (only mutable post-publish fields on the
-- immutability trigger's allowlist), inserts 'acknowledged' event. Caller
-- authorized against client_portal_permissions.
CREATE OR REPLACE FUNCTION public.acknowledge_portal_roadmap(
  _portal_roadmap_id uuid
) RETURNS uuid ...;

-- 6. get_portal_publication_history: staff-only ordered timeline of events
-- + roadmap snapshots for one portal project. Read-only.
CREATE OR REPLACE FUNCTION public.get_portal_publication_history(
  _portal_project_id uuid
) RETURNS TABLE(...) ...;
```

**Grants.**
```sql
GRANT EXECUTE ON FUNCTION public.publish_portal_roadmap(...)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_portal_publication(...) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retract_portal_publication(...)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_portal_publication(...)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_portal_roadmap(...)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_portal_publication_history(...) TO authenticated;
```

**Behavioural contract enforced inside each RPC.**
- Every state flip and event insert runs in a single implicit BEGIN/COMMIT
  (a single PL/pgSQL function is one txn from PostgREST's perspective).
- Authorization is checked first (`is_engine_staff()` for 1–4, 6; portal
  permission for 5) — no unauthenticated writes possible.
- `_reason` for rollback/retract must be non-empty; enforced in-function
  before any mutation.
- `rollback_portal_publication` verifies `_target_roadmap_id` is
  `superseded` AND belongs to `_portal_project_id`; raises otherwise.
- `restore_portal_publication` verifies row is `retracted`; raises otherwise.
- `acknowledge_portal_roadmap` verifies row is `published`; raises otherwise.
- Each RPC returns the primary event id so callers can log/verify.

**Follow-on server functions** (built after this migration lands):
- `publishVersionToPortal` — rewritten to call `publish_portal_roadmap` RPC.
- `rollbackPortalPublication`, `retractPortalPublication`,
  `restorePortalPublication`, `acknowledgePortalRoadmap`,
  `getPortalPublicationHistory` — thin `createServerFn` wrappers over each
  RPC with Zod input validation and existing `assertOps`/portal-membership
  guards duplicated as belt-and-suspenders.

**Smoke coverage** (A1/A2 tests to be added post-apply):
- A1: force the event insert to fail (invalid actor email) → row remains
  `superseded`, no event written.
- A2: force the status flip to fail (already `published`) → no event written.
- Both use SAVEPOINT + rollback verification against the live row.

Return: revised SQL body (currently drafted signatures + contract only).
Full body next revision — request approval to expand into apply-ready SQL.
