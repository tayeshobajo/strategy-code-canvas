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

### Apply-ready SQL

Wrap the whole block in a single migration file, `BEGIN; ... COMMIT;`.
Also included: RLS refresh on `client_portal_roadmaps` (the existing
`Clients read approved roadmaps` policy still filters
`status IN ('approved','delivered')`, which is stale after Phase 3 v4 —
clients would see zero rows without this).

```sql
BEGIN;

-- ---------------------------------------------------------------------------
-- 0. RLS refresh: clients read PUBLISHED (not approved/delivered) roadmaps.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Clients read approved roadmaps"
  ON public.client_portal_roadmaps;

CREATE POLICY "Clients read published roadmaps"
  ON public.client_portal_roadmaps
  FOR SELECT TO authenticated
  USING (
    status = 'published'
    AND project_id IN (
      SELECT p.project_id
        FROM public.client_portal_permissions p
       WHERE lower(p.email) = lower(auth.email())
         AND p.revoked_at IS NULL
    )
  );

-- Staff read-all policy remains (defined in earlier migration); no change.

-- ---------------------------------------------------------------------------
-- 1. publish_portal_roadmap
--    Supersede any existing 'published' row for the project, insert the new
--    'published' snapshot, write a 'published' event, and (if a prior row
--    was superseded) a paired 'superseded' event. Returns the 'published'
--    event id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_portal_roadmap(
  _portal_project_id     uuid,
  _engine_project_id     uuid,
  _engine_version_id     uuid,
  _title                 text,
  _version_label         text,
  _executive_summary     text,
  _current_diagnosis     text,
  _strategic_priorities  jsonb,
  _sequence_30_60_90     jsonb,
  _risks_dependencies    jsonb,
  _recommended_next_move text,
  _client_safe_canvas    jsonb,
  _visible_modules       jsonb DEFAULT '{}'::jsonb,
  _publish_diff          jsonb DEFAULT '{}'::jsonb,
  _summary               text  DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor          text := auth.email();
  v_prior_id       uuid;
  v_new_id         uuid;
  v_published_evt  uuid;
BEGIN
  IF NOT public.is_engine_staff() THEN
    RAISE EXCEPTION 'publish_portal_roadmap: not authorized';
  END IF;
  IF v_actor IS NULL OR length(btrim(v_actor)) = 0 THEN
    RAISE EXCEPTION 'publish_portal_roadmap: caller email required';
  END IF;
  IF _portal_project_id IS NULL OR _engine_project_id IS NULL THEN
    RAISE EXCEPTION 'publish_portal_roadmap: project ids required';
  END IF;

  -- Lock any current 'published' row for this project.
  SELECT id INTO v_prior_id
    FROM public.client_portal_roadmaps
   WHERE project_id = _portal_project_id
     AND status     = 'published'
   FOR UPDATE;

  IF v_prior_id IS NOT NULL THEN
    UPDATE public.client_portal_roadmaps
       SET status = 'superseded'
     WHERE id = v_prior_id;
  END IF;

  INSERT INTO public.client_portal_roadmaps (
    project_id, approved_roadmap_version_id, title, version_label,
    executive_summary, current_diagnosis, strategic_priorities,
    sequence_30_60_90, risks_dependencies, recommended_next_move,
    client_safe_canvas, visible_modules, publish_diff,
    previous_publication_id, status, published_at, published_by
  ) VALUES (
    _portal_project_id, _engine_version_id, _title, _version_label,
    _executive_summary, _current_diagnosis,
    COALESCE(_strategic_priorities, '[]'::jsonb),
    COALESCE(_sequence_30_60_90, '{}'::jsonb),
    COALESCE(_risks_dependencies, '[]'::jsonb),
    _recommended_next_move,
    COALESCE(_client_safe_canvas, '{}'::jsonb),
    COALESCE(_visible_modules, '{}'::jsonb),
    COALESCE(_publish_diff, '{}'::jsonb),
    v_prior_id, 'published', now(), v_actor
  ) RETURNING id INTO v_new_id;

  IF v_prior_id IS NOT NULL THEN
    INSERT INTO public.client_portal_publish_events (
      portal_project_id, portal_roadmap_id, previous_portal_roadmap_id,
      engine_project_id, engine_version_id, event_type, actor_email,
      summary, diff
    ) VALUES (
      _portal_project_id, v_prior_id, NULL,
      _engine_project_id, _engine_version_id, 'superseded', v_actor,
      _summary, '{}'::jsonb
    );
  END IF;

  INSERT INTO public.client_portal_publish_events (
    portal_project_id, portal_roadmap_id, previous_portal_roadmap_id,
    engine_project_id, engine_version_id, event_type, actor_email,
    summary, diff
  ) VALUES (
    _portal_project_id, v_new_id, v_prior_id,
    _engine_project_id, _engine_version_id, 'published', v_actor,
    _summary, COALESCE(_publish_diff, '{}'::jsonb)
  ) RETURNING id INTO v_published_evt;

  RETURN v_published_evt;
END $$;

-- ---------------------------------------------------------------------------
-- 2. rollback_portal_publication
--    Current 'published' → 'retracted' with reason, then chosen superseded
--    row → 'published'. Writes a single 'rolled_back' event referencing the
--    restored row with previous = the just-retracted row. Reason must be
--    non-empty; target must be superseded AND in this project.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rollback_portal_publication(
  _portal_project_id uuid,
  _target_roadmap_id uuid,
  _reason            text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor        text := auth.email();
  v_current_id   uuid;
  v_engine_proj  uuid;
  v_engine_ver   uuid;
  v_target_stat  text;
  v_target_proj  uuid;
  v_event_id     uuid;
BEGIN
  IF NOT public.is_engine_staff() THEN
    RAISE EXCEPTION 'rollback_portal_publication: not authorized';
  END IF;
  IF v_actor IS NULL OR length(btrim(v_actor)) = 0 THEN
    RAISE EXCEPTION 'rollback_portal_publication: caller email required';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) = 0 THEN
    RAISE EXCEPTION 'rollback_portal_publication: reason required';
  END IF;

  SELECT project_id, status
    INTO v_target_proj, v_target_stat
    FROM public.client_portal_roadmaps
   WHERE id = _target_roadmap_id
   FOR UPDATE;

  IF v_target_proj IS NULL THEN
    RAISE EXCEPTION 'rollback_portal_publication: target not found';
  END IF;
  IF v_target_proj <> _portal_project_id THEN
    RAISE EXCEPTION 'rollback_portal_publication: target belongs to different project';
  END IF;
  IF v_target_stat <> 'superseded' THEN
    RAISE EXCEPTION 'rollback_portal_publication: target must be superseded (got %)', v_target_stat;
  END IF;

  SELECT id, engine_project_id, engine_version_id
    INTO v_current_id, v_engine_proj, v_engine_ver
    FROM public.client_portal_roadmaps r
    LEFT JOIN public.engine_roadmap_versions v
      ON v.id = r.approved_roadmap_version_id
   WHERE r.project_id = _portal_project_id
     AND r.status     = 'published'
   FOR UPDATE;

  IF v_current_id IS NULL THEN
    RAISE EXCEPTION 'rollback_portal_publication: no live published row to retract';
  END IF;

  -- Retract the currently-published row (fields required by CHECK).
  UPDATE public.client_portal_roadmaps
     SET status            = 'retracted',
         retracted_at      = now(),
         retracted_by      = v_actor,
         retraction_reason = _reason
   WHERE id = v_current_id;

  -- Promote the target back to published.
  UPDATE public.client_portal_roadmaps
     SET status = 'published'
   WHERE id = _target_roadmap_id;

  INSERT INTO public.client_portal_publish_events (
    portal_project_id, portal_roadmap_id, previous_portal_roadmap_id,
    engine_project_id, engine_version_id, event_type, actor_email,
    summary, diff
  ) VALUES (
    _portal_project_id, _target_roadmap_id, v_current_id,
    COALESCE(v_engine_proj, gen_random_uuid()), v_engine_ver,
    'rolled_back', v_actor, _reason, '{}'::jsonb
  ) RETURNING id INTO v_event_id;

  RETURN v_event_id;
END $$;

-- ---------------------------------------------------------------------------
-- 3. retract_portal_publication
--    'published' → 'retracted' with reason. No successor. Writes 'retracted'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.retract_portal_publication(
  _portal_roadmap_id uuid,
  _reason            text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor       text := auth.email();
  v_project     uuid;
  v_status      text;
  v_engine_proj uuid;
  v_engine_ver  uuid;
  v_event_id    uuid;
BEGIN
  IF NOT public.is_engine_staff() THEN
    RAISE EXCEPTION 'retract_portal_publication: not authorized';
  END IF;
  IF v_actor IS NULL OR length(btrim(v_actor)) = 0 THEN
    RAISE EXCEPTION 'retract_portal_publication: caller email required';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) = 0 THEN
    RAISE EXCEPTION 'retract_portal_publication: reason required';
  END IF;

  SELECT r.project_id, r.status,
         v.engine_project_id, r.approved_roadmap_version_id
    INTO v_project, v_status, v_engine_proj, v_engine_ver
    FROM public.client_portal_roadmaps r
    LEFT JOIN public.engine_roadmap_versions v
      ON v.id = r.approved_roadmap_version_id
   WHERE r.id = _portal_roadmap_id
   FOR UPDATE;

  IF v_project IS NULL THEN
    RAISE EXCEPTION 'retract_portal_publication: roadmap not found';
  END IF;
  IF v_status <> 'published' THEN
    RAISE EXCEPTION 'retract_portal_publication: roadmap must be published (got %)', v_status;
  END IF;

  UPDATE public.client_portal_roadmaps
     SET status            = 'retracted',
         retracted_at      = now(),
         retracted_by      = v_actor,
         retraction_reason = _reason
   WHERE id = _portal_roadmap_id;

  INSERT INTO public.client_portal_publish_events (
    portal_project_id, portal_roadmap_id, previous_portal_roadmap_id,
    engine_project_id, engine_version_id, event_type, actor_email,
    summary, diff
  ) VALUES (
    v_project, _portal_roadmap_id, NULL,
    COALESCE(v_engine_proj, gen_random_uuid()), v_engine_ver,
    'retracted', v_actor, _reason, '{}'::jsonb
  ) RETURNING id INTO v_event_id;

  RETURN v_event_id;
END $$;

-- ---------------------------------------------------------------------------
-- 4. restore_portal_publication
--    'retracted' → 'published'. Clears retraction fields (mutable — not on
--    the immutability allowlist; the retraction_fields_consistent CHECK
--    forces them NULL when status <> 'retracted', so they must clear in
--    the same statement). Writes 'restored'. Reason required (audit).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_portal_publication(
  _portal_roadmap_id uuid,
  _reason            text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor       text := auth.email();
  v_project     uuid;
  v_status      text;
  v_engine_proj uuid;
  v_engine_ver  uuid;
  v_conflict    uuid;
  v_event_id    uuid;
BEGIN
  IF NOT public.is_engine_staff() THEN
    RAISE EXCEPTION 'restore_portal_publication: not authorized';
  END IF;
  IF v_actor IS NULL OR length(btrim(v_actor)) = 0 THEN
    RAISE EXCEPTION 'restore_portal_publication: caller email required';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) = 0 THEN
    RAISE EXCEPTION 'restore_portal_publication: reason required';
  END IF;

  SELECT r.project_id, r.status,
         v.engine_project_id, r.approved_roadmap_version_id
    INTO v_project, v_status, v_engine_proj, v_engine_ver
    FROM public.client_portal_roadmaps r
    LEFT JOIN public.engine_roadmap_versions v
      ON v.id = r.approved_roadmap_version_id
   WHERE r.id = _portal_roadmap_id
   FOR UPDATE;

  IF v_project IS NULL THEN
    RAISE EXCEPTION 'restore_portal_publication: roadmap not found';
  END IF;
  IF v_status <> 'retracted' THEN
    RAISE EXCEPTION 'restore_portal_publication: roadmap must be retracted (got %)', v_status;
  END IF;

  -- Refuse if a different row is already published in this project.
  SELECT id INTO v_conflict
    FROM public.client_portal_roadmaps
   WHERE project_id = v_project
     AND status     = 'published'
   FOR UPDATE;
  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'restore_portal_publication: another roadmap is currently published in this project';
  END IF;

  UPDATE public.client_portal_roadmaps
     SET status            = 'published',
         retracted_at      = NULL,
         retracted_by      = NULL,
         retraction_reason = NULL
   WHERE id = _portal_roadmap_id;

  INSERT INTO public.client_portal_publish_events (
    portal_project_id, portal_roadmap_id, previous_portal_roadmap_id,
    engine_project_id, engine_version_id, event_type, actor_email,
    summary, diff
  ) VALUES (
    v_project, _portal_roadmap_id, NULL,
    COALESCE(v_engine_proj, gen_random_uuid()), v_engine_ver,
    'restored', v_actor, _reason, '{}'::jsonb
  ) RETURNING id INTO v_event_id;

  RETURN v_event_id;
END $$;

-- ---------------------------------------------------------------------------
-- 5. acknowledge_portal_roadmap
--    Client-facing. Sets acknowledged_at + acknowledged_by_email on the
--    live 'published' row (both mutable — absent from the immutability
--    allowlist). Writes 'acknowledged' event. Idempotent: repeated calls
--    are no-ops (no re-ack, no duplicate event).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.acknowledge_portal_roadmap(
  _portal_roadmap_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email       text := lower(coalesce(auth.email(), ''));
  v_project     uuid;
  v_status      text;
  v_already_ack timestamptz;
  v_engine_proj uuid;
  v_engine_ver  uuid;
  v_event_id    uuid;
BEGIN
  IF v_email = '' THEN
    RAISE EXCEPTION 'acknowledge_portal_roadmap: caller email required';
  END IF;

  SELECT r.project_id, r.status, r.acknowledged_at,
         v.engine_project_id, r.approved_roadmap_version_id
    INTO v_project, v_status, v_already_ack, v_engine_proj, v_engine_ver
    FROM public.client_portal_roadmaps r
    LEFT JOIN public.engine_roadmap_versions v
      ON v.id = r.approved_roadmap_version_id
   WHERE r.id = _portal_roadmap_id
   FOR UPDATE;

  IF v_project IS NULL THEN
    RAISE EXCEPTION 'acknowledge_portal_roadmap: roadmap not found';
  END IF;
  IF v_status <> 'published' THEN
    RAISE EXCEPTION 'acknowledge_portal_roadmap: roadmap must be published (got %)', v_status;
  END IF;

  -- Portal permission check.
  IF NOT EXISTS (
    SELECT 1 FROM public.client_portal_permissions p
     WHERE p.project_id = v_project
       AND lower(p.email) = v_email
       AND p.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'acknowledge_portal_roadmap: not authorized for this project';
  END IF;

  IF v_already_ack IS NOT NULL THEN
    RETURN NULL; -- idempotent no-op
  END IF;

  UPDATE public.client_portal_roadmaps
     SET acknowledged_at       = now(),
         acknowledged_by_email = v_email
   WHERE id = _portal_roadmap_id;

  INSERT INTO public.client_portal_publish_events (
    portal_project_id, portal_roadmap_id, previous_portal_roadmap_id,
    engine_project_id, engine_version_id, event_type, actor_email,
    summary, diff
  ) VALUES (
    v_project, _portal_roadmap_id, NULL,
    COALESCE(v_engine_proj, gen_random_uuid()), v_engine_ver,
    'acknowledged', v_email, NULL, '{}'::jsonb
  ) RETURNING id INTO v_event_id;

  RETURN v_event_id;
END $$;

-- ---------------------------------------------------------------------------
-- 6. get_portal_publication_history
--    Staff-only ordered timeline: event + minimal roadmap snapshot columns.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_portal_publication_history(
  _portal_project_id uuid
) RETURNS TABLE (
  event_id          uuid,
  event_type        text,
  actor_email       text,
  summary           text,
  created_at        timestamptz,
  portal_roadmap_id uuid,
  previous_portal_roadmap_id uuid,
  engine_project_id uuid,
  engine_version_id uuid,
  roadmap_title     text,
  roadmap_version_label text,
  roadmap_status    text,
  roadmap_published_at timestamptz,
  roadmap_retracted_at timestamptz,
  roadmap_retraction_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_engine_staff() THEN
    RAISE EXCEPTION 'get_portal_publication_history: not authorized';
  END IF;

  RETURN QUERY
  SELECT e.id, e.event_type, e.actor_email, e.summary, e.created_at,
         e.portal_roadmap_id, e.previous_portal_roadmap_id,
         e.engine_project_id, e.engine_version_id,
         r.title, r.version_label, r.status, r.published_at,
         r.retracted_at, r.retraction_reason
    FROM public.client_portal_publish_events e
    LEFT JOIN public.client_portal_roadmaps r
      ON r.id = e.portal_roadmap_id
   WHERE e.portal_project_id = _portal_project_id
   ORDER BY e.created_at DESC, e.id DESC;
END $$;

-- ---------------------------------------------------------------------------
-- Grants. All six functions callable by authenticated (RPCs enforce their
-- own authorization). Revoke from PUBLIC as defense-in-depth.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.publish_portal_roadmap(uuid,uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,text,jsonb,jsonb,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rollback_portal_publication(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.retract_portal_publication(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_portal_publication(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.acknowledge_portal_roadmap(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_portal_publication_history(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.publish_portal_roadmap(uuid,uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,text,jsonb,jsonb,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_portal_publication(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retract_portal_publication(uuid,text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_portal_publication(uuid,text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_portal_roadmap(uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_portal_publication_history(uuid)   TO authenticated;

COMMIT;
```

### Behavioural contract (enforced in-function)

- Every state flip + event insert runs in one PL/pgSQL body = one PostgREST
  txn. Any RAISE aborts the whole block (no orphan events, no orphan flips).
- `is_engine_staff()` gate on 1–4 and 6; `client_portal_permissions` gate
  on 5. All check the caller email is present.
- `_reason` required (non-empty) for rollback / retract / restore.
- `rollback` locks the target row `FOR UPDATE`, verifies it is `superseded`
  AND lives in the passed project.
- `restore` refuses if any other row in the project is already `published`
  (defensive — the partial unique index would also reject it).
- `acknowledge` is idempotent: a second call on an already-acked row
  returns NULL and writes no event.
- All mutating RPCs return the primary event id so app callers can log /
  smoke-test the paired write.

### Preflight before apply

```sql
-- Confirm the six function names are unused / safe to replace.
SELECT proname FROM pg_proc WHERE proname IN (
  'publish_portal_roadmap','rollback_portal_publication',
  'retract_portal_publication','restore_portal_publication',
  'acknowledge_portal_roadmap','get_portal_publication_history'
);

-- Confirm current RLS policy name matches what we DROP.
SELECT policyname FROM pg_policies
 WHERE schemaname='public' AND tablename='client_portal_roadmaps';
```

### Post-apply verification

```sql
-- 6 functions present, all SECURITY DEFINER.
SELECT proname, prosecdef FROM pg_proc
 WHERE proname IN (
   'publish_portal_roadmap','rollback_portal_publication',
   'retract_portal_publication','restore_portal_publication',
   'acknowledge_portal_roadmap','get_portal_publication_history')
 ORDER BY proname;

-- Only the new policy on client_portal_roadmaps for clients.
SELECT policyname, cmd FROM pg_policies
 WHERE schemaname='public' AND tablename='client_portal_roadmaps'
 ORDER BY policyname;
```

### Follow-on server functions (built after this migration lands)

- `publishVersionToPortal` — rewritten to call `publish_portal_roadmap` RPC
  (drops all in-app sequential writes + orphan-guard fallbacks).
- Thin `createServerFn` wrappers with Zod validation + `assertOps` /
  portal-permission guards duplicated for defense-in-depth:
  - `rollbackPortalPublication`
  - `retractPortalPublication`
  - `restorePortalPublication`
  - `acknowledgePortalRoadmap`
  - `getPortalPublicationHistory`

### Smoke coverage added after apply

- **A1 (rollback pairing):** Call `rollback_portal_publication` with a
  bogus `_target_roadmap_id` (different project). Expect raise;
  post-check: no new event rows, no status changes.
- **A2 (publish pairing):** Force event insert failure by temporarily
  seeding an invalid actor path (simulated via constraint) and re-running
  publish. Expect the whole txn to roll back — no superseded row, no new
  published row.
- **A3 (ack idempotency):** Call `acknowledge_portal_roadmap` twice on
  the same published row. Expect one event row and the first
  `acknowledged_at` unchanged.
- **A4 (RLS refresh):** As a client user, `select id, status from
  client_portal_roadmaps where project_id=$1` returns exactly the
  currently-`published` row and nothing else (no approved, delivered,
  superseded, or retracted rows).

Status: **PENDING TAI REVIEW — apply-ready.**

---

## Phase 4 — Multi-Solution Decomposition + Business Engines + Command Center

**Status:** DRAFT — apply-ready spec, awaiting Tai review.
**Scope:** Five interlocking systems requested 2026-07-13. Grouped into ONE migration file because the FK graph is tightly connected (engines depend on candidate solutions; run history depends on engines; command center reads across both).

### 1. Multi-Solution Decomposition

**Intent.** Every roadmap milestone can decompose into 1..N candidate solutions. Each solution carries its own scope, assumptions, dependencies, and evidence links. One solution is `selected`; the rest stay `candidate` / `deferred` / `rejected` for audit.

```sql
-- Enum for solution status
CREATE TYPE public.milestone_solution_status AS ENUM (
  'candidate','selected','deferred','rejected','superseded'
);

CREATE TABLE public.engine_milestone_solutions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id    uuid NOT NULL REFERENCES public.engine_milestones(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  title           text NOT NULL,
  summary         text,
  rationale       text,
  status          public.milestone_solution_status NOT NULL DEFAULT 'candidate',
  effort_estimate text,             -- 'S' | 'M' | 'L' | 'XL' or free-form
  investment_estimate_cents integer,
  assumptions     jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{text, confidence, source_id?}]
  depends_on_solution_ids uuid[] NOT NULL DEFAULT '{}',  -- other solutions this one requires
  depends_on_milestone_ids uuid[] NOT NULL DEFAULT '{}',
  evidence_source_ids uuid[] NOT NULL DEFAULT '{}',      -- FK-style ref to engine_sources
  created_by      text,
  approved_by     text,
  approved_at     timestamptz,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.engine_milestone_solutions TO authenticated;
GRANT ALL ON public.engine_milestone_solutions TO service_role;

ALTER TABLE public.engine_milestone_solutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read solutions"
  ON public.engine_milestone_solutions FOR SELECT TO authenticated
  USING (public.is_engine_staff());
CREATE POLICY "Staff write solutions"
  ON public.engine_milestone_solutions FOR ALL TO authenticated
  USING (public.is_engine_staff()) WITH CHECK (public.is_engine_staff());

CREATE INDEX idx_solutions_milestone ON public.engine_milestone_solutions(milestone_id);
CREATE INDEX idx_solutions_project ON public.engine_milestone_solutions(project_id);
CREATE INDEX idx_solutions_status ON public.engine_milestone_solutions(status);

CREATE TRIGGER touch_engine_milestone_solutions
  BEFORE UPDATE ON public.engine_milestone_solutions
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
```

**Governance trigger:** exactly one `selected` solution per milestone at any time.

```sql
CREATE OR REPLACE FUNCTION public.tg_engine_solutions_single_selected()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'selected' THEN
    UPDATE public.engine_milestone_solutions
      SET status = 'superseded', updated_at = now()
      WHERE milestone_id = NEW.milestone_id
        AND id <> NEW.id
        AND status = 'selected';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER engine_solutions_single_selected
  BEFORE INSERT OR UPDATE OF status ON public.engine_milestone_solutions
  FOR EACH ROW WHEN (NEW.status = 'selected')
  EXECUTE FUNCTION public.tg_engine_solutions_single_selected();
```

### 2. Business Engines Framework

**Intent.** A first-class recurring engine (Content Authority, Lead Follow-Up, Review & Reputation, Client Success, Founder Rhythm, custom). Each engine has cadence, owner, triggers, approvals, metrics, exception rules. Engines live under a project but produce cycles independent of milestones.

```sql
CREATE TYPE public.business_engine_kind AS ENUM (
  'content_authority','lead_followup','review_reputation','client_success',
  'founder_rhythm','custom'
);
CREATE TYPE public.business_engine_status AS ENUM (
  'draft','proposed','approved','active','paused','archived'
);
CREATE TYPE public.business_engine_cadence AS ENUM (
  'daily','weekly','biweekly','monthly','quarterly','ad_hoc'
);

CREATE TABLE public.engine_business_engines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  milestone_id    uuid REFERENCES public.engine_milestones(id) ON DELETE SET NULL,
  kind            public.business_engine_kind NOT NULL,
  name            text NOT NULL,
  outcome         text NOT NULL,       -- what "good" looks like
  workflow        jsonb NOT NULL DEFAULT '[]'::jsonb,   -- ordered steps
  cadence         public.business_engine_cadence NOT NULL DEFAULT 'weekly',
  cron_expression text,                -- optional advanced schedule
  owner_email     text,
  triggers        jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {on_event, on_metric, on_time}
  approval_rules  jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {requires_human, roles, gate_fields}
  metrics         jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{name, target, unit, source}]
  exception_rules jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{when, severity, action}]
  status          public.business_engine_status NOT NULL DEFAULT 'draft',
  last_run_at     timestamptz,
  next_run_at     timestamptz,
  missed_cycles   integer NOT NULL DEFAULT 0,
  approved_by     text,
  approved_at     timestamptz,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.engine_business_engines TO authenticated;
GRANT ALL ON public.engine_business_engines TO service_role;

ALTER TABLE public.engine_business_engines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read engines"
  ON public.engine_business_engines FOR SELECT TO authenticated
  USING (public.is_engine_staff());
CREATE POLICY "Staff write engines"
  ON public.engine_business_engines FOR ALL TO authenticated
  USING (public.is_engine_staff()) WITH CHECK (public.is_engine_staff());

CREATE INDEX idx_engines_project ON public.engine_business_engines(project_id);
CREATE INDEX idx_engines_status ON public.engine_business_engines(status);
CREATE INDEX idx_engines_next_run ON public.engine_business_engines(next_run_at) WHERE status='active';

CREATE TRIGGER touch_engine_business_engines
  BEFORE UPDATE ON public.engine_business_engines
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
```

### 3. Per-Engine Run History (Immutable)

**Intent.** Every engine cycle records inputs, model/task outputs, decisions, approvals, cost, latency, evidence. UPDATE forbidden after `completed_at`.

```sql
CREATE TYPE public.engine_run_status AS ENUM (
  'scheduled','running','awaiting_approval','completed','failed','skipped'
);

CREATE TABLE public.engine_business_engine_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_id       uuid NOT NULL REFERENCES public.engine_business_engines(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  cycle_key       text NOT NULL,         -- e.g. '2026-W29' for weekly; enforced-unique per engine
  status          public.engine_run_status NOT NULL DEFAULT 'scheduled',
  scheduled_for   timestamptz NOT NULL,
  started_at      timestamptz,
  completed_at    timestamptz,
  inputs          jsonb NOT NULL DEFAULT '{}'::jsonb,
  outputs         jsonb NOT NULL DEFAULT '{}'::jsonb,
  decisions       jsonb NOT NULL DEFAULT '[]'::jsonb,
  model           text,
  tokens_input    integer,
  tokens_output   integer,
  cost_cents      integer,
  latency_ms      integer,
  evidence_ids    uuid[] NOT NULL DEFAULT '{}',
  approval_ids    uuid[] NOT NULL DEFAULT '{}',   -- FK-style ref to engine_review_items
  proposal_ids    uuid[] NOT NULL DEFAULT '{}',   -- FK-style ref to engine_project_chat_proposals
  error           text,
  actor_email     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (engine_id, cycle_key)
);

GRANT SELECT, INSERT, UPDATE ON public.engine_business_engine_runs TO authenticated;
GRANT ALL ON public.engine_business_engine_runs TO service_role;

ALTER TABLE public.engine_business_engine_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read engine runs"
  ON public.engine_business_engine_runs FOR SELECT TO authenticated
  USING (public.is_engine_staff());
CREATE POLICY "Staff write engine runs"
  ON public.engine_business_engine_runs FOR ALL TO authenticated
  USING (public.is_engine_staff()) WITH CHECK (public.is_engine_staff());

CREATE INDEX idx_runs_engine ON public.engine_business_engine_runs(engine_id);
CREATE INDEX idx_runs_project ON public.engine_business_engine_runs(project_id);
CREATE INDEX idx_runs_status ON public.engine_business_engine_runs(status);
CREATE INDEX idx_runs_scheduled ON public.engine_business_engine_runs(scheduled_for);
```

**Immutability trigger** — same shape as `engine_project_build_evidence`:

```sql
CREATE OR REPLACE FUNCTION public.tg_engine_business_engine_runs_seal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.completed_at IS NOT NULL AND OLD.status IN ('completed','failed','skipped') THEN
    RAISE EXCEPTION 'Engine run % is sealed and cannot be modified', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER engine_business_engine_runs_seal
  BEFORE UPDATE ON public.engine_business_engine_runs
  FOR EACH ROW EXECUTE FUNCTION public.tg_engine_business_engine_runs_seal();
```

### 4. Engine Exceptions (feeds Command Center)

**Intent.** Explicit exception rows so the Command Center reads a single ranked list. Auto-generated by engine runs when a rule fires; also creatable by triggers on missed cycles.

```sql
CREATE TYPE public.engine_exception_severity AS ENUM ('low','medium','high','critical');
CREATE TYPE public.engine_exception_status AS ENUM ('open','acknowledged','resolved','dismissed');

CREATE TABLE public.engine_business_engine_exceptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_id     uuid REFERENCES public.engine_business_engines(id) ON DELETE CASCADE,
  run_id        uuid REFERENCES public.engine_business_engine_runs(id) ON DELETE SET NULL,
  project_id    uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  kind          text NOT NULL,                -- 'missed_cycle','metric_breach','approval_stuck','blocked','budget_drift','client_risk'
  severity      public.engine_exception_severity NOT NULL DEFAULT 'medium',
  summary       text NOT NULL,
  detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
  urgency_score integer NOT NULL DEFAULT 50,   -- 0..100
  impact_score  integer NOT NULL DEFAULT 50,
  deadline_at   timestamptz,
  client_risk   boolean NOT NULL DEFAULT false,
  next_action   text,                          -- human-readable "do this"
  next_action_owner text,
  status        public.engine_exception_status NOT NULL DEFAULT 'open',
  resolved_by   text,
  resolved_at   timestamptz,
  resolution_note text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.engine_business_engine_exceptions TO authenticated;
GRANT ALL ON public.engine_business_engine_exceptions TO service_role;

ALTER TABLE public.engine_business_engine_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read engine exceptions"
  ON public.engine_business_engine_exceptions FOR SELECT TO authenticated
  USING (public.is_engine_staff());
CREATE POLICY "Staff write engine exceptions"
  ON public.engine_business_engine_exceptions FOR ALL TO authenticated
  USING (public.is_engine_staff()) WITH CHECK (public.is_engine_staff());

CREATE INDEX idx_exceptions_status ON public.engine_business_engine_exceptions(status);
CREATE INDEX idx_exceptions_severity ON public.engine_business_engine_exceptions(severity);
CREATE INDEX idx_exceptions_project ON public.engine_business_engine_exceptions(project_id);
CREATE INDEX idx_exceptions_deadline ON public.engine_business_engine_exceptions(deadline_at);

CREATE TRIGGER touch_engine_business_engine_exceptions
  BEFORE UPDATE ON public.engine_business_engine_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
```

### 5. Governance gates on engines

**Rules (confirmed 2026-07-13).**
- Engine transitioning `draft → proposed` allowed by any staff.
- `proposed → approved` requires **all** canonical minimum spine fields in `approved_truth`, for **both** Point A and Point B, on this project. No reduced "core subset" — the full canonical minimums (mirroring `POINT_A_BASE_FIELD_KEYS` + dynamic `diagnosis:*` set, and every key in `POINT_B_FIELD_KEYS`).
- `proposed → approved` also **hard-blocks** when the project has any unresolved contradictions (`engine_extracted_signals.status='contradicted' AND superseded_by IS NULL`, or any `engine_spine_field_truth.status='contradicted'`). Historical/resolved contradictions do not block.
- `approved → active` requires `approved_at` and non-null `owner_email`.
- Engine runs never publish to portal directly. Publish path stays through `publish_portal_roadmap` RPC. Engines produce **proposals** (rows in `engine_project_chat_proposals`) that must pass the existing approval flow before affecting portal state.
- Scope changes to selected `engine_milestone_solutions` (touching `investment_estimate_cents`, `depends_on_*`, or promoting a new `selected`) require a chat proposal or a `spine_field_changed` audit row.

#### 5A. `spine_points_approved(_project_id)` — project-aware readiness helper

The gate MUST resolve required keys the same way ceremony completion does (`internal_spine_field_keys` for point-a + point-b, which enumerates dynamic `diagnosis:*` keys per project). Never hardcode a UI-side list. UI and DB read the exact same field universe from this helper.

```sql
-- Detailed, project-aware readiness. Returns per-spine status + missing key
-- lists so the app can tell the user exactly what to close. `ready` is the
-- single boolean the gate checks; `has_active_contradictions` breaks it out
-- so the UI can show a distinct "resolve contradictions first" message.
CREATE OR REPLACE FUNCTION public.spine_points_approved(_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  point_a_required text[];
  point_b_required text[];
  point_a_missing  text[];
  point_b_missing  text[];
  contradictions   boolean;
  allowed          boolean;
BEGIN
  -- Access gate: staff, or a portal member on this project.
  SELECT public.is_engine_staff()
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

  -- Canonical required key sets, project-aware (includes dynamic diagnosis:*).
  SELECT COALESCE(array_agg(field_key), '{}')
    INTO point_a_required
    FROM public.internal_spine_field_keys(_project_id, 'point-a');
  SELECT COALESCE(array_agg(field_key), '{}')
    INTO point_b_required
    FROM public.internal_spine_field_keys(_project_id, 'point-b');

  -- Missing = required minus keys currently at approved_truth.
  SELECT COALESCE(array_agg(k), '{}')
    INTO point_a_missing
    FROM unnest(point_a_required) k
   WHERE NOT EXISTS (
     SELECT 1 FROM public.engine_spine_field_truth t
      WHERE t.project_id = _project_id
        AND t.spine      = 'point-a'
        AND t.field_key  = k
        AND t.status     = 'approved_truth'
   );

  SELECT COALESCE(array_agg(k), '{}')
    INTO point_b_missing
    FROM unnest(point_b_required) k
   WHERE NOT EXISTS (
     SELECT 1 FROM public.engine_spine_field_truth t
      WHERE t.project_id = _project_id
        AND t.spine      = 'point-b'
        AND t.field_key  = k
        AND t.status     = 'approved_truth'
   );

  -- Active contradictions only (reuses trigger-only internal helper — does
  -- not check historical/resolved rows, does not bypass access gate above).
  contradictions := public.internal_project_has_contradictions(_project_id);

  RETURN jsonb_build_object(
    'ready', (
      array_length(point_a_missing, 1) IS NULL
      AND array_length(point_b_missing, 1) IS NULL
      AND NOT contradictions
    ),
    'point_a', jsonb_build_object(
      'required', to_jsonb(point_a_required),
      'missing',  to_jsonb(point_a_missing),
      'approved', array_length(point_a_missing, 1) IS NULL
    ),
    'point_b', jsonb_build_object(
      'required', to_jsonb(point_b_required),
      'missing',  to_jsonb(point_b_missing),
      'approved', array_length(point_b_missing, 1) IS NULL
    ),
    'has_active_contradictions', contradictions
  );
END;
$$;

REVOKE ALL ON FUNCTION public.spine_points_approved(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spine_points_approved(uuid) TO authenticated, service_role;
```

#### 5B. Approval trigger — uses the helper

```sql
CREATE OR REPLACE FUNCTION public.tg_engine_business_engines_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  readiness jsonb;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    -- Same field universe the UI reads. Uses internal_* helpers so trigger
    -- context does not need the caller's access grants.
    readiness := jsonb_build_object(
      'point_a_missing', (
        SELECT COALESCE(jsonb_agg(k), '[]'::jsonb)
          FROM (
            SELECT field_key AS k
              FROM public.internal_spine_field_keys(NEW.project_id, 'point-a')
             WHERE NOT EXISTS (
               SELECT 1 FROM public.engine_spine_field_truth t
                WHERE t.project_id = NEW.project_id
                  AND t.spine      = 'point-a'
                  AND t.field_key  = field_key
                  AND t.status     = 'approved_truth'
             )
          ) x
      ),
      'point_b_missing', (
        SELECT COALESCE(jsonb_agg(k), '[]'::jsonb)
          FROM (
            SELECT field_key AS k
              FROM public.internal_spine_field_keys(NEW.project_id, 'point-b')
             WHERE NOT EXISTS (
               SELECT 1 FROM public.engine_spine_field_truth t
                WHERE t.project_id = NEW.project_id
                  AND t.spine      = 'point-b'
                  AND t.field_key  = field_key
                  AND t.status     = 'approved_truth'
             )
          ) x
      ),
      'contradictions', public.internal_project_has_contradictions(NEW.project_id)
    );

    IF (readiness->>'contradictions')::boolean THEN
      RAISE EXCEPTION 'Cannot approve engine %: project % has unresolved contradictions',
        NEW.id, NEW.project_id USING ERRCODE = 'check_violation';
    END IF;

    IF jsonb_array_length(readiness->'point_a_missing') > 0
       OR jsonb_array_length(readiness->'point_b_missing') > 0 THEN
      RAISE EXCEPTION 'Cannot approve engine %: spine not fully approved. Missing %',
        NEW.id, readiness USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.approved_at IS NULL THEN NEW.approved_at := now(); END IF;
    IF NEW.approved_by IS NULL THEN
      RAISE EXCEPTION 'approved_by required when approving engine %', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.status = 'active' AND (OLD.status IS DISTINCT FROM 'active') THEN
    IF NEW.approved_at IS NULL OR COALESCE(TRIM(NEW.owner_email),'') = '' THEN
      RAISE EXCEPTION 'Engine % cannot activate without approved_at and owner_email', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER engine_business_engines_gate
  BEFORE INSERT OR UPDATE OF status ON public.engine_business_engines
  FOR EACH ROW EXECUTE FUNCTION public.tg_engine_business_engines_gate();
```

**AI-self-approval prevention (reuses Phase 9C pattern).**

```sql
CREATE OR REPLACE FUNCTION public.tg_engine_business_engines_no_self_approve()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.approved_by IS NOT NULL
     AND NEW.created_by IS NOT NULL
     AND NEW.approved_by = NEW.created_by
     AND NEW.created_by ILIKE 'agent:%' THEN
    RAISE EXCEPTION 'AI-created engine % cannot self-approve (created_by=%, approved_by=%)',
      NEW.id, NEW.created_by, NEW.approved_by USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER engine_business_engines_no_self_approve
  BEFORE INSERT OR UPDATE OF approved_by ON public.engine_business_engines
  FOR EACH ROW EXECUTE FUNCTION public.tg_engine_business_engines_no_self_approve();
```

Same trigger applied to `engine_milestone_solutions.approved_by`.

#### 5C. App-layer contract for the readiness helper

- `src/lib/engine-spine-readiness.functions.ts` — thin `createServerFn` wrapper around `spine_points_approved`. Returns the raw jsonb shape unchanged.
- Engines UI ("Approve engine" button) calls this before submitting, disables the action when `ready=false`, and renders the exact missing keys per spine plus an active-contradictions banner. The DB trigger is the enforcement backstop.
- Smoke test S2 is rewritten to assert:
  - S2a — Missing one canonical Point B key ⇒ approval raises with the missing key list in the message.
  - S2b — All canonical keys approved but one contradicted signal ⇒ approval raises with "unresolved contradictions".
  - S2c — All canonical keys approved and no contradictions ⇒ approval succeeds.

### 6. RPC surface (SECURITY DEFINER)

Written after tables land, in a follow-on migration if you want them phased. Included here for review:

- `propose_milestone_solution(_milestone_id, _payload)` → returns solution id.
- `select_milestone_solution(_solution_id, _reason)` → flips status, supersedes siblings, writes `engine_audit_log`.
- `activate_business_engine(_engine_id, _owner_email)` → runs the gate, sets `next_run_at` from cadence.
- `record_engine_run(_engine_id, _cycle_key, _inputs, _outputs, _decisions, _model, _cost_cents, _latency_ms, _evidence_ids)` → inserts a run, updates `last_run_at` / `next_run_at`, generates exceptions per rules.
- `open_engine_exception(_engine_id, _kind, _summary, _severity, _detail, _deadline_at, _client_risk)`.
- `resolve_engine_exception(_exception_id, _resolution_note)`.
- `get_command_center_exceptions(_limit)` → ranked list joining project + engine.

### 7. Application layer (built after migration lands)

- `src/lib/engine-solutions.functions.ts` — proposeMilestoneSolution / selectMilestoneSolution / listSolutionsForMilestone.
- `src/lib/engine-business-engines.functions.ts` — create/update/activate/pause/archive; list per project.
- `src/lib/engine-business-engine-runs.functions.ts` — recordRun (thin wrapper), listRunsForEngine, getRun.
- `src/lib/engine-command-center.functions.ts` — getCommandCenterFeed (calls RPC).
- `src/routes/engine.projects.$projectId.solutions.tsx` — solutions board per milestone (drill-in via milestone brief).
- `src/routes/engine.projects.$projectId.engines.tsx` — per-project engine list, add engine, run history drawer.
- `src/routes/admin.command-center.tsx` — global exception feed sorted by (severity, urgency, deadline, client_risk).
- Nav wired in `admin.tsx` (top-slot: Command Center) and `WorkspaceHeader` (engines + solutions under existing MORE_SECTIONS).

### 8. Scheduler

- `src/routes/api/public/hooks/engine-tick.ts` — POST endpoint; iterates `engine_business_engines` where `status='active' AND next_run_at <= now()`; for each, either enqueues an openclaw run (if fully automated) or opens a `awaiting_approval` run and a `medium`/`high` exception. Uses `apikey` header pattern per `schedule-jobs-modern`.
- pg_cron job (installed via `supabase--insert`, not migration): every 5 minutes → hits engine-tick.

### 9. Smoke coverage after apply

- **S1** (solutions): create three candidate solutions on one milestone; promote #2 to `selected`. Expect #1 and #3 unchanged status `candidate`; no prior `selected` existed so no supersede. Then promote #3 → expect #2 flips to `superseded`, #3 becomes `selected`. Unique-selected invariant holds.
- **S2** (engine gate): try to `UPDATE engine_business_engines SET status='approved'` on a project whose Point B is not approved → expect raise with ERRCODE check_violation.
- **S3** (engine self-approve): insert with `created_by='agent:captain'` and `approved_by='agent:captain'` → expect raise.
- **S4** (run seal): insert a run with `status='completed'` + `completed_at=now()`; then UPDATE its `outputs` → expect raise.
- **S5** (exception feed): open a `critical` exception with `client_risk=true`, another `low`; `get_command_center_exceptions(10)` returns critical first.
- **S6** (scheduler idempotency): call engine-tick twice within one minute → second call is a no-op (no duplicate cycle_key rows).

### 10. Not in this migration (explicit)

- No portal-visible surface for engines yet. Client sees engine *outputs* only after they land in an approved roadmap version.
- No cross-project engine sharing. Each engine is scoped to one project.
- No auto-conversion of existing milestones into engines. Manual promotion via `select_milestone_solution` + operator flag.
- No parent/child project decomposition — a separate Phase 5 draft.

Status: **PENDING TAI REVIEW — apply-ready.**

---

## Phase 4 QA Fixes — Governance Gate Hardening (Revision 2)

**Origin:** QA audit 2026-07-13 against Phase 4 spine approval gate.
**Revision 2 origin:** Tai review 2026-07-13 of Revision 1. Blockers addressed below; nothing else changed.

### Revision 2 blockers addressed

1. **Removed** the permanent `source_ref->>'kind'='backfill'` bypass. Backfill is now a **pre-install** operation (audit query + explicit ceremony/override remediation), not a trigger exemption.
2. **Split** `spine_points_approved(project_id)` into two functions:
   - `spine_points_approved(project_id)` — staff/service-only, returns full detail (`required[]`, `missing[]`, dynamic `diagnosis:*` keys). Retained for admin UI and RPC.
   - `spine_points_ready_summary(project_id)` — portal-safe, returns only `{ready, point_a_approved, point_a_missing_count, point_b_approved, point_b_missing_count, has_active_contradictions}`. No field keys leak.
3. **Aliased** every `internal_spine_field_keys(...)` result as `s(field_key)` so `t.field_key = s.field_key` cannot resolve tautologically against the outer subquery.
4. **Guarded** `OLD.status` references with `TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'approved'` so triggers declared `BEFORE INSERT OR UPDATE` behave correctly on INSERT.
5. **Strengthened** ceremony provenance: the ceremony must have a matching `engine_spine_ceremony_decisions` row with the same `field_key` and `new_status='approved_truth'`. Reusing a completed ceremony for an unrelated field is rejected.
6. **Added** `DROP TRIGGER IF EXISTS` before every `CREATE TRIGGER` so re-apply is idempotent.
7. **Extended** smoke coverage to `engine_roadmap_versions` (case K) and `engine_projects` (case L) approval gates, plus a positive-path re-approve (case M) after full truth.
8. **Verified** `engine_roadmap_versions.created_by` exists (`text NOT NULL DEFAULT 'ai'`).
9. **Added** service-role allowance to `spine_points_approved` so the smoke harness (which runs as service_role, `auth.email()` is NULL) can invoke it.
10. **Tightened** operator override: `updated_by_email` must map to a user with `admin` or `operator` role (via `has_role_email`), not merely match `source_ref.operator_email`.

### G1 — Enforce ceremony provenance for `approved_truth` writes

BEFORE INSERT/UPDATE trigger on `public.engine_spine_field_truth`. When `NEW.status='approved_truth'`:

1. `NEW.updated_by_actor='human'`.
2. Either
   - `NEW.ceremony_id IS NOT NULL` **and** referenced `engine_spine_ceremonies` row is `status='completed'`, same `project_id`, same `spine`, **and** an `engine_spine_ceremony_decisions` row exists for `(ceremony_id, field_key, new_status='approved_truth')`, or
   - `NEW.source_ref->>'kind'='operator_override'` with a non-empty `reason`, `operator_email` matching `updated_by_email` (case-insensitive), and that email carrying `admin` or `operator` role. Emits an `engine_audit_log` row for every override write.

No other combination is accepted. There is no backfill bypass.

```sql
CREATE OR REPLACE FUNCTION public.tg_engine_spine_field_truth_provenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ceremony        public.engine_spine_ceremonies%ROWTYPE;
  decision_exists boolean;
  op_email        text;
  op_reason       text;
  is_op_staff     boolean;
BEGIN
  IF NEW.status <> 'approved_truth' THEN
    RETURN NEW;
  END IF;

  IF NEW.updated_by_actor IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'approved_truth requires human actor (got actor=%, field=%:%)',
      NEW.updated_by_actor, NEW.spine, NEW.field_key
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.ceremony_id IS NOT NULL THEN
    SELECT * INTO ceremony FROM public.engine_spine_ceremonies WHERE id = NEW.ceremony_id;
    IF ceremony.id IS NULL
       OR ceremony.project_id <> NEW.project_id
       OR ceremony.spine      <> NEW.spine
       OR ceremony.status     <> 'completed' THEN
      RAISE EXCEPTION 'approved_truth ceremony_id % invalid (project/spine mismatch or not completed) for field %:%',
        NEW.ceremony_id, NEW.spine, NEW.field_key
        USING ERRCODE = 'check_violation';
    END IF;

    -- Ceremony must have decided THIS field to approved_truth.
    SELECT EXISTS (
      SELECT 1
        FROM public.engine_spine_ceremony_decisions d
       WHERE d.ceremony_id = NEW.ceremony_id
         AND d.project_id  = NEW.project_id
         AND d.spine       = NEW.spine
         AND d.field_key   = NEW.field_key
         AND d.new_status  = 'approved_truth'
    ) INTO decision_exists;
    IF NOT decision_exists THEN
      RAISE EXCEPTION 'approved_truth ceremony % has no matching decision for field %:%',
        NEW.ceremony_id, NEW.spine, NEW.field_key
        USING ERRCODE = 'check_violation';
    END IF;

  ELSIF (NEW.source_ref ->> 'kind') = 'operator_override' THEN
    op_email  := lower(COALESCE(NEW.source_ref ->> 'operator_email', ''));
    op_reason := btrim(COALESCE(NEW.source_ref ->> 'reason', ''));

    IF op_email = '' OR op_email <> lower(COALESCE(NEW.updated_by_email, '')) THEN
      RAISE EXCEPTION 'approved_truth operator_override requires source_ref.operator_email matching updated_by_email (field %:%)',
        NEW.spine, NEW.field_key USING ERRCODE = 'check_violation';
    END IF;
    IF op_reason = '' THEN
      RAISE EXCEPTION 'approved_truth operator_override requires source_ref.reason (field %:%)',
        NEW.spine, NEW.field_key USING ERRCODE = 'check_violation';
    END IF;

    -- Operator email must actually hold admin or operator role.
    SELECT public.has_role_email(op_email, 'admin'::app_role)
        OR public.has_role_email(op_email, 'operator'::app_role)
      INTO is_op_staff;
    IF NOT COALESCE(is_op_staff, false) THEN
      RAISE EXCEPTION 'approved_truth operator_override email % lacks admin/operator role (field %:%)',
        op_email, NEW.spine, NEW.field_key USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.engine_audit_log (
      project_id, action, field_changed, old_value, new_value, actor_email, metadata
    ) VALUES (
      NEW.project_id,
      'spine_field_truth_operator_override',
      NEW.spine || ':' || NEW.field_key,
      NULL,
      jsonb_build_object('status','approved_truth','source_ref',NEW.source_ref),
      NEW.updated_by_email,
      jsonb_build_object('actor_kind','human','reason', op_reason)
    );
  ELSE
    RAISE EXCEPTION 'approved_truth requires ceremony_id or source_ref.kind=operator_override (field %:%)',
      NEW.spine, NEW.field_key USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_engine_spine_field_truth_provenance ON public.engine_spine_field_truth;
CREATE TRIGGER trg_engine_spine_field_truth_provenance
BEFORE INSERT OR UPDATE ON public.engine_spine_field_truth
FOR EACH ROW EXECUTE FUNCTION public.tg_engine_spine_field_truth_provenance();
```

**Pre-install backfill (mandatory).** Run BEFORE creating the trigger.

Step 1 — enumerate offending rows for human review and remediation:

```sql
SELECT id, project_id, spine, field_key, updated_by_actor, updated_by_email,
       ceremony_id, source_ref
  FROM public.engine_spine_field_truth
 WHERE status = 'approved_truth'
   AND (
        updated_by_actor IS DISTINCT FROM 'human'
     OR (ceremony_id IS NULL AND COALESCE(source_ref->>'kind','') <> 'operator_override')
     OR (ceremony_id IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM public.engine_spine_ceremony_decisions d
            WHERE d.ceremony_id = engine_spine_field_truth.ceremony_id
              AND d.field_key   = engine_spine_field_truth.field_key
              AND d.new_status  = 'approved_truth'))
     OR (ceremony_id IS NULL
         AND COALESCE(source_ref->>'kind','') = 'operator_override'
         AND (
              COALESCE(lower(source_ref->>'operator_email'),'') <> COALESCE(lower(updated_by_email),'')
           OR COALESCE(btrim(source_ref->>'reason'),'') = ''
           OR NOT (
                public.has_role_email(source_ref->>'operator_email', 'admin'::app_role)
             OR public.has_role_email(source_ref->>'operator_email', 'operator'::app_role))
         ))
   );
```

Step 2 — remediate each offending row (attach a completed ceremony with a matching decision, re-stamp as a compliant `operator_override`, or demote to `verified`). Do **not** ship a bypass.

Step 3 — **fail-closed guard.** Run this immediately before the `CREATE TRIGGER` statement, in the same migration transaction. If any invalid `approved_truth` row remains, the migration aborts and the trigger is never installed — legacy bad rows can no longer sit quietly behind the new gate:

```sql
DO $guard$
DECLARE
  bad_count integer;
BEGIN
  SELECT count(*) INTO bad_count
    FROM public.engine_spine_field_truth t
   WHERE t.status = 'approved_truth'
     AND (
          t.updated_by_actor IS DISTINCT FROM 'human'
       OR (t.ceremony_id IS NULL AND COALESCE(t.source_ref->>'kind','') <> 'operator_override')
       OR (t.ceremony_id IS NOT NULL AND NOT EXISTS (
             SELECT 1 FROM public.engine_spine_ceremony_decisions d
              WHERE d.ceremony_id = t.ceremony_id
                AND d.field_key   = t.field_key
                AND d.new_status  = 'approved_truth'))
       OR (t.ceremony_id IS NULL
           AND COALESCE(t.source_ref->>'kind','') = 'operator_override'
           AND (
                COALESCE(lower(t.source_ref->>'operator_email'),'') <> COALESCE(lower(t.updated_by_email),'')
             OR COALESCE(btrim(t.source_ref->>'reason'),'') = ''
             OR NOT (
                  public.has_role_email(t.source_ref->>'operator_email', 'admin'::app_role)
               OR public.has_role_email(t.source_ref->>'operator_email', 'operator'::app_role))
           ))
     );

  IF bad_count > 0 THEN
    RAISE EXCEPTION
      'Phase 4 provenance guard: % legacy approved_truth row(s) fail the trigger predicate. Remediate via Step 1/2 (attach a real ceremony decision, re-stamp as compliant operator_override, or demote to verified) before installing trg_engine_spine_field_truth_provenance.',
      bad_count
      USING ERRCODE = 'check_violation';
  END IF;
END
$guard$;
```

The guard uses the **exact same predicate** as the trigger (human actor + ceremony-with-matching-decision OR operator_override with matching email, non-empty reason, and staff role). No `backfill` exemption.

### G1b — Portal caller swap (ship in same release as G1)

Before or in the same release as this migration, every portal-reachable caller of `spine_points_approved` must be swapped to `spine_points_ready_summary`. After G1a lands, `spine_points_approved` refuses non-staff / non-service callers, so any lingering portal call throws `insufficient_privilege` at runtime.

Audit callers with:

```bash
rg -n "spine_points_approved" src supabase
```

For each hit, confirm it runs in a staff-only server function (protected by `requireSupabaseAuth` + `hasRoleForEmail(admin|operator)`) or is called via `supabaseAdmin` in a webhook/cron. Any portal, client, or unauthenticated route must use `spine_points_ready_summary` instead.

### G1c — Smoke harness execution role

`spine_points_approved` / `spine_points_ready_summary` are `SECURITY DEFINER`, so inside the function `current_user` is the function owner, not the caller. Role checks use `current_setting('request.jwt.claim.role', true)` and `is_engine_staff()` (which reads `auth.email()`) — neither is set by a plain `psql` session, so a direct connection would fail those gates.

The harness in `supabase/tests/spine-gate-smoke.sql` only exercises trigger paths (INSERT/UPDATE on `engine_spine_field_truth`, `engine_business_engines`, `engine_roadmap_versions`, `engine_projects`) — it does **not** invoke the SECURITY DEFINER RPCs. Run it as one of:

- `psql "$SUPABASE_DB_URL"` connected as **`postgres`** (superuser bypasses RLS and per-role grants), or
- `psql` with `SET LOCAL role = service_role;` prepended, or
- via the `supabase--migration` tool, which executes under `service_role`.

If the harness is ever extended to call the RPCs directly, wrap those calls with `SET LOCAL role = service_role;` so the `current_user = 'service_role'` branch inside the function evaluates true.

### G1a — Split `spine_points_approved` for portal safety

Portal members must not read internal spine field-key names (`diagnosis:*` and other dynamic keys reveal internal taxonomy). The detailed function stays staff/service; portal callers get a summary-only helper.

```sql
-- Detailed function — restrict to staff or service_role.
CREATE OR REPLACE FUNCTION public.spine_points_approved(_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  point_a_required text[];
  point_b_required text[];
  point_a_missing  text[];
  point_b_missing  text[];
  contradictions   boolean;
  allowed          boolean;
BEGIN
  -- Staff OR service_role only. Portal members no longer get field names.
  allowed := public.is_engine_staff()
          OR current_setting('request.jwt.claim.role', true) = 'service_role'
          OR current_user = 'service_role';
  IF NOT allowed THEN
    RAISE EXCEPTION 'Forbidden: spine_points_approved is staff/service-only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(array_agg(s.field_key), '{}') INTO point_a_required
    FROM public.internal_spine_field_keys(_project_id, 'point-a') AS s(field_key);
  SELECT COALESCE(array_agg(s.field_key), '{}') INTO point_b_required
    FROM public.internal_spine_field_keys(_project_id, 'point-b') AS s(field_key);

  SELECT COALESCE(array_agg(k), '{}') INTO point_a_missing
    FROM unnest(point_a_required) AS k
   WHERE NOT EXISTS (
     SELECT 1 FROM public.engine_spine_field_truth t
      WHERE t.project_id = _project_id AND t.spine = 'point-a'
        AND t.field_key = k AND t.status = 'approved_truth');

  SELECT COALESCE(array_agg(k), '{}') INTO point_b_missing
    FROM unnest(point_b_required) AS k
   WHERE NOT EXISTS (
     SELECT 1 FROM public.engine_spine_field_truth t
      WHERE t.project_id = _project_id AND t.spine = 'point-b'
        AND t.field_key = k AND t.status = 'approved_truth');

  contradictions := public.internal_project_has_contradictions(_project_id);

  RETURN jsonb_build_object(
    'ready',
      array_length(point_a_missing,1) IS NULL
      AND array_length(point_b_missing,1) IS NULL
      AND NOT contradictions,
    'point_a', jsonb_build_object(
      'required', to_jsonb(point_a_required),
      'missing',  to_jsonb(point_a_missing),
      'approved', array_length(point_a_missing,1) IS NULL),
    'point_b', jsonb_build_object(
      'required', to_jsonb(point_b_required),
      'missing',  to_jsonb(point_b_missing),
      'approved', array_length(point_b_missing,1) IS NULL),
    'has_active_contradictions', contradictions
  );
END;
$$;

REVOKE ALL ON FUNCTION public.spine_points_approved(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spine_points_approved(uuid) TO service_role;
-- Staff routes call it through server functions running with the caller's JWT;
-- is_engine_staff() gates access at the function body. No blanket GRANT to authenticated.
GRANT EXECUTE ON FUNCTION public.spine_points_approved(uuid) TO authenticated;

-- Portal-safe summary — counts only, no field names.
CREATE OR REPLACE FUNCTION public.spine_points_ready_summary(_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a_missing_ct int;
  b_missing_ct int;
  contradictions boolean;
  allowed boolean;
BEGIN
  SELECT public.is_engine_staff()
      OR current_setting('request.jwt.claim.role', true) = 'service_role'
      OR current_user = 'service_role'
      OR EXISTS (
        SELECT 1
          FROM public.client_portal_projects cpp
          JOIN public.client_portal_permissions perm ON perm.project_id = cpp.id
          JOIN public.engine_projects ep ON ep.client_portal_project_id = cpp.id
         WHERE ep.id = _project_id
           AND lower(perm.email) = lower(coalesce(auth.email(), ''))
           AND perm.revoked_at IS NULL)
    INTO allowed;
  IF NOT allowed THEN
    RAISE EXCEPTION 'Forbidden: access to project % not permitted', _project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT count(*) INTO a_missing_ct
    FROM public.internal_spine_field_keys(_project_id,'point-a') AS s(field_key)
   WHERE NOT EXISTS (SELECT 1 FROM public.engine_spine_field_truth t
     WHERE t.project_id=_project_id AND t.spine='point-a'
       AND t.field_key=s.field_key AND t.status='approved_truth');

  SELECT count(*) INTO b_missing_ct
    FROM public.internal_spine_field_keys(_project_id,'point-b') AS s(field_key)
   WHERE NOT EXISTS (SELECT 1 FROM public.engine_spine_field_truth t
     WHERE t.project_id=_project_id AND t.spine='point-b'
       AND t.field_key=s.field_key AND t.status='approved_truth');

  contradictions := public.internal_project_has_contradictions(_project_id);

  RETURN jsonb_build_object(
    'ready', a_missing_ct=0 AND b_missing_ct=0 AND NOT contradictions,
    'point_a_approved', a_missing_ct=0,
    'point_a_missing_count', a_missing_ct,
    'point_b_approved', b_missing_ct=0,
    'point_b_missing_count', b_missing_ct,
    'has_active_contradictions', contradictions);
END;
$$;

GRANT EXECUTE ON FUNCTION public.spine_points_ready_summary(uuid) TO authenticated, service_role;
```

App code follow-up (post-migration, not part of this SQL bundle): swap portal-side callers of `spine_points_approved` to `spine_points_ready_summary`.

### G2 — Extend gate to `engine_roadmap_versions` and `engine_projects`

Same missing-key + contradiction gate. Uses aliased helper results and TG_OP-safe OLD access.

```sql
CREATE OR REPLACE FUNCTION public.tg_engine_roadmap_versions_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a_missing jsonb;
  b_missing jsonb;
  has_contra boolean;
BEGIN
  IF NEW.status = 'approved'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN

    has_contra := public.internal_project_has_contradictions(NEW.project_id);
    IF has_contra THEN
      RAISE EXCEPTION 'Cannot approve roadmap version %: project % has unresolved contradictions',
        NEW.id, NEW.project_id USING ERRCODE = 'check_violation';
    END IF;

    SELECT COALESCE(jsonb_agg(s.field_key), '[]'::jsonb) INTO a_missing
      FROM public.internal_spine_field_keys(NEW.project_id, 'point-a') AS s(field_key)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.engine_spine_field_truth t
        WHERE t.project_id = NEW.project_id AND t.spine = 'point-a'
          AND t.field_key = s.field_key AND t.status = 'approved_truth');

    SELECT COALESCE(jsonb_agg(s.field_key), '[]'::jsonb) INTO b_missing
      FROM public.internal_spine_field_keys(NEW.project_id, 'point-b') AS s(field_key)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.engine_spine_field_truth t
        WHERE t.project_id = NEW.project_id AND t.spine = 'point-b'
          AND t.field_key = s.field_key AND t.status = 'approved_truth');

    IF jsonb_array_length(a_missing) > 0 OR jsonb_array_length(b_missing) > 0 THEN
      RAISE EXCEPTION 'Cannot approve roadmap version %: spine not fully approved. point_a_missing=%, point_b_missing=%',
        NEW.id, a_missing, b_missing USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.approved_at IS NULL THEN NEW.approved_at := now(); END IF;
    IF NEW.approved_by IS NULL THEN
      RAISE EXCEPTION 'approved_by required when approving roadmap version %', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS engine_roadmap_versions_gate ON public.engine_roadmap_versions;
CREATE TRIGGER engine_roadmap_versions_gate
BEFORE INSERT OR UPDATE OF status ON public.engine_roadmap_versions
FOR EACH ROW EXECUTE FUNCTION public.tg_engine_roadmap_versions_gate();

-- No-self-approve for AI-created versions. created_by is NOT NULL default 'ai'.
CREATE OR REPLACE FUNCTION public.tg_engine_roadmap_versions_no_self_approve()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.approved_by IS NOT NULL
     AND NEW.created_by IS NOT NULL
     AND NEW.approved_by = NEW.created_by
     AND (NEW.created_by ILIKE 'agent:%' OR NEW.created_by = 'ai') THEN
    RAISE EXCEPTION 'AI-created roadmap version % cannot self-approve (created_by=%, approved_by=%)',
      NEW.id, NEW.created_by, NEW.approved_by USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS engine_roadmap_versions_no_self_approve ON public.engine_roadmap_versions;
CREATE TRIGGER engine_roadmap_versions_no_self_approve
BEFORE INSERT OR UPDATE OF approved_by ON public.engine_roadmap_versions
FOR EACH ROW EXECUTE FUNCTION public.tg_engine_roadmap_versions_no_self_approve();
```

`engine_projects.status` includes `'approved'`. Same gate:

```sql
CREATE OR REPLACE FUNCTION public.tg_engine_projects_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a_missing jsonb;
  b_missing jsonb;
  has_contra boolean;
BEGIN
  IF NEW.status = 'approved'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    has_contra := public.internal_project_has_contradictions(NEW.id);
    IF has_contra THEN
      RAISE EXCEPTION 'Cannot approve project %: unresolved contradictions', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT COALESCE(jsonb_agg(s.field_key),'[]'::jsonb) INTO a_missing
      FROM public.internal_spine_field_keys(NEW.id,'point-a') AS s(field_key)
     WHERE NOT EXISTS (SELECT 1 FROM public.engine_spine_field_truth t
       WHERE t.project_id=NEW.id AND t.spine='point-a'
         AND t.field_key=s.field_key AND t.status='approved_truth');
    SELECT COALESCE(jsonb_agg(s.field_key),'[]'::jsonb) INTO b_missing
      FROM public.internal_spine_field_keys(NEW.id,'point-b') AS s(field_key)
     WHERE NOT EXISTS (SELECT 1 FROM public.engine_spine_field_truth t
       WHERE t.project_id=NEW.id AND t.spine='point-b'
         AND t.field_key=s.field_key AND t.status='approved_truth');
    IF jsonb_array_length(a_missing) > 0 OR jsonb_array_length(b_missing) > 0 THEN
      RAISE EXCEPTION 'Cannot approve project %: spine not fully approved. point_a_missing=%, point_b_missing=%',
        NEW.id, a_missing, b_missing USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS engine_projects_gate ON public.engine_projects;
CREATE TRIGGER engine_projects_gate
BEFORE INSERT OR UPDATE OF status ON public.engine_projects
FOR EACH ROW EXECUTE FUNCTION public.tg_engine_projects_gate();
```

### G3 — SQL smoke harness (`supabase/tests/spine-gate-smoke.sql`)

Existing cases A–J stay. Revision 2 adds:

- **Case K** — `engine_roadmap_versions` UPDATE `status='approved'` with a missing Point A key → BLOCKED (`check_violation`).
- **Case L** — `engine_projects` UPDATE `status='approved'` with a missing Point B key → BLOCKED.
- **Case M** — restore full approved truth; K and L both succeed → ALLOWED.
- **Case J revision** — verify a completed Point A ceremony cannot be reused to stamp an unrelated field: INSERT `approved_truth` with a valid `ceremony_id` but a `field_key` the ceremony did not decide → BLOCKED with "no matching decision".

Update pending in same commit as this migration section. Companion `.sql` file, not a schema change.

### Companion app-layer fix (non-migration, already applied)

`src/lib/engine-spine-readiness.functions.ts` — `SpineReadiness.point_a.approved` / `point_b.approved` retyped from `string[]` to `boolean` to match the RPC return shape. UI unaffected (only reads `.missing`).

### Post-migration app follow-ups (tracked, not part of this SQL)

- Swap portal-side callers from `spine_points_approved` → `spine_points_ready_summary`.
- Confirm any admin server functions calling `spine_points_approved` run with a staff JWT (they already do via `hasRoleForEmail`).

Status: **PENDING TAI REVIEW — apply-ready after Revision 2. Run the G1 backfill audit query BEFORE installing the G1 trigger; there is no bypass.**
