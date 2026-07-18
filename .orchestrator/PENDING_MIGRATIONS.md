# Pending Migrations — Require Tai Review Before Applying

---

## Paired Deployment Guard — Truth ↔ Ceremony Dependencies

**Rule (enforced by orchestrator preflight):** Phase 1 R3 (spine field truth) and
Phase 2 R4/R4B (ceremonies) MUST be applied in the same migration window on any
environment where either is missing. They share the `engine_spine_field_truth`
table and the `epistemic_status` enum; applying one without the other leaves an
intermediate state where the truth table exists but ceremonies can't reference
it (or vice versa).

### Preflight check (run before applying either block on a new environment)

```sql
SELECT
  to_regtype('public.epistemic_status')          IS NOT NULL AS has_enum,
  to_regclass('public.engine_spine_field_truth') IS NOT NULL AS has_truth,
  to_regclass('public.engine_spine_ceremonies')  IS NOT NULL AS has_ceremonies,
  to_regclass('public.engine_spine_ceremony_decisions')     IS NOT NULL AS has_decisions,
  to_regclass('public.engine_spine_ceremony_invalidations') IS NOT NULL AS has_invalidations;
```

### Decision matrix

| has_truth | has_ceremonies | Action |
|-----------|----------------|--------|
| true      | true           | Both applied — skip; mark as APPLIED if not already noted. |
| false     | false          | **PAIRED APPLY REQUIRED** — concatenate Phase 1 R3 + Phase 2 R4/R4B into one migration; do NOT apply either alone. |
| true      | false          | Phase 2 R4/R4B only — safe to apply alone (truth already present). |
| false     | true           | **STOP — inconsistent state.** Escalate to Tai; do not attempt repair autonomously. |

### Rollback

If the paired apply fails, roll back in reverse order (Phase 2 first, then
Phase 1) using the rollback blocks kept alongside each phase in this file.

Reference outputs: `.orchestrator/phase-1-output.md`, `.orchestrator/phase-2-output.md`.

---



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

Status: **APPLIED (2026-07-12)**.
See `.orchestrator/phase-1-output.md` for the acceptance verification.


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

Status: **APPLIED (2026-07-12)** — R4 + R4B + acceptance smoke pass complete.
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
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

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
      'lenses',
      'diagnosis',
      'key_diagnosis'
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
      '24_month_destination',
      '10_year_position',
      'client_outcome',
      'customer_outcome',
      'operational_outcome',
      'revenue_outcome',
      'brand_position'
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
3. Confirm `public.tg_touch_updated_at()` exists.
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

Status: **APPLIED (pre-existing, verified 2026-07-14).** Preflight against live DB confirmed all 6 RPCs present as `SECURITY DEFINER` with expected arg counts (`publish_portal_roadmap`/15, `rollback_portal_publication`/3, `retract_portal_publication`/2, `restore_portal_publication`/2, `acknowledge_portal_roadmap`/1, `get_portal_publication_history`/1), the `Clients read published roadmaps` RLS policy is in place (old `Clients read approved roadmaps` policy already removed), `is_engine_staff()` present, and all mutable columns exist on `client_portal_roadmaps`. All 6 follow-on server-function wrappers wired to the RPCs (`src/lib/portal-publication.functions.ts` + `engine-ops.publishVersionToPortal`), covered by `portal-publication-wrappers.test.ts` and `publish-column-integrity.test.ts`. No re-apply needed.

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

Status: **APPLIED (pre-existing, verified 2026-07-14).** See top of Phase 3B block for preflight evidence.

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

Status: **APPLIED (pre-existing, verified 2026-07-14).** All 4 tables present (`engine_milestone_solutions`, `engine_business_engines`, `engine_business_engine_runs`, `engine_business_engine_exceptions`), governance functions in place (`spine_points_approved`, `spine_points_ready_summary`, `internal_spine_field_keys`, `internal_project_has_contradictions`), immutability + single-selected triggers deployed. Command Center routes wired: `admin.command-center.tsx` (ranked exceptions via `get_command_center_exceptions` — severity → client_risk → urgency_score → deadline → impact), `engine.projects.$projectId.engines.tsx` (spine readiness banner via `spine_points_approved` RPC), `engine.projects.$projectId.solutions.tsx`, `engine.projects.$projectId.engines.runs.$runId.tsx`, `admin.engine-promotion.tsx`, `api/public/hooks/engine-tick.ts`. **Open follow-ups tracked separately (not blocking APPLIED status):** (F1) `activate_business_engine` RPC does NOT enforce `spine_points_approved(_project_id).ready` before flipping `proposed → approved → active` — gate is currently UI-only via readiness banner and can be bypassed by direct RPC call. (F2) Confirm engines Activate button is `disabled` when readiness banner is not `ready`. (F3) Confirm `recordEngineRun` writes to `engine_project_chat_proposals` via `proposal_ids` rather than any direct portal write path.

---

## Phase 4 QA Fixes — Governance Gate Hardening (Revision 2.2)

**Status:** APPLIED 2026-07-14 (Rev 2.2). G1 provenance trigger + G1a summary function + G2 gate triggers + G3 harness file all live. Deadlock fix applied via targeted follow-up migration replacing the ceremony status predicate. See `.orchestrator/phase-4-qa-rev-2-2-apply-output.md`.
**Origin:** QA audit 2026-07-13 against Phase 4 spine approval gate.
**Revision 2 origin:** Tai review 2026-07-13 of Revision 1. Blockers addressed below.
**Revision 2.2 origin:** Tai review 2026-07-14 of Rev 2.1 — flagged a ceremony-status deadlock. Rev 2.1 required `ceremony.status='completed'` before an `approved_truth` truth row could be written, but Phase 2 `recordCeremonyDecision()` writes `approved_truth` while the ceremony is still `in_progress` and only flips to `completed` after all fields are terminal. Fix: accept `ceremony.status IN ('in_progress','completed')`; the per-field `engine_spine_ceremony_decisions` row remains the real provenance anchor. Enumeration under the patched predicate is clean (0 rows require remediation) — see `.orchestrator/phase-4-qa-rev-2-1-enumeration.md`.

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
   - `NEW.ceremony_id IS NOT NULL` **and** referenced `engine_spine_ceremonies` row is `status IN ('in_progress','completed')`, same `project_id`, same `spine`, **and** an `engine_spine_ceremony_decisions` row exists for `(ceremony_id, field_key, new_status='approved_truth')`, or
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
       OR ceremony.status NOT IN ('in_progress','completed') THEN
      RAISE EXCEPTION 'approved_truth ceremony_id % invalid (project/spine mismatch or not in_progress/completed) for field %:%',
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

**Executable migration order (Revision 2.1).** The SQL blocks in this document are grouped by concern for readability, but the actual migration file MUST execute in this order inside a single transaction:

1. **Enumerate** legacy `approved_truth` rows (Step 1 query below) — run out-of-band, review results with Tai.
2. **Remediate** each offending row (Step 2) — attach a real ceremony+decision, re-stamp as compliant `operator_override`, or demote to `verified`.
3. **Fail-closed guard** (Step 3 `DO $guard$` block) — aborts the transaction if any invalid row remains.
4. `CREATE OR REPLACE FUNCTION public.tg_engine_spine_field_truth_provenance()` (function body shown above).
5. `DROP TRIGGER IF EXISTS ...` then `CREATE TRIGGER trg_engine_spine_field_truth_provenance ...`.

Do **not** place the `CREATE TRIGGER` before the guard in the migration file — the guard must be the last statement before trigger install so no window exists where the trigger is armed against legacy bad rows.

**Pre-install backfill (mandatory).** Run BEFORE creating the trigger.

Step 1 — enumerate offending rows for human review and remediation. The ceremony branch mirrors the trigger predicate exactly (ceremony exists, same `project_id`, same `spine`, `status IN ('in_progress','completed')`, and a matching `engine_spine_ceremony_decisions` row for `(ceremony_id, project_id, spine, field_key, new_status='approved_truth')`):

```sql
SELECT t.id, t.project_id, t.spine, t.field_key, t.updated_by_actor, t.updated_by_email,
       t.ceremony_id, t.source_ref
  FROM public.engine_spine_field_truth t
 WHERE t.status = 'approved_truth'
   AND (
        t.updated_by_actor IS DISTINCT FROM 'human'
     OR (t.ceremony_id IS NULL AND COALESCE(t.source_ref->>'kind','') <> 'operator_override')
     OR (t.ceremony_id IS NOT NULL AND NOT EXISTS (
           SELECT 1
             FROM public.engine_spine_ceremonies c
             JOIN public.engine_spine_ceremony_decisions d
               ON d.ceremony_id = c.id
            WHERE c.id          = t.ceremony_id
              AND c.project_id  = t.project_id
              AND c.spine       = t.spine
              AND c.status      IN ('in_progress','completed')
              AND d.project_id  = t.project_id
              AND d.spine       = t.spine
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
```

Step 2 — remediate each offending row (attach a completed ceremony with a matching decision for the exact `field_key`, re-stamp as a compliant `operator_override`, or demote to `verified`). Do **not** ship a bypass.

Step 3 — **fail-closed guard.** Run this immediately before the `CREATE TRIGGER` statement, in the same migration transaction. Uses the **exact same predicate** as the Step 1 audit query and the runtime trigger (ceremony existence + matching project/spine/status + matching decision, or compliant operator_override with staff role). If any invalid `approved_truth` row remains, the migration aborts and the trigger is never installed:

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
             SELECT 1
               FROM public.engine_spine_ceremonies c
               JOIN public.engine_spine_ceremony_decisions d
                 ON d.ceremony_id = c.id
              WHERE c.id          = t.ceremony_id
                AND c.project_id  = t.project_id
                AND c.spine       = t.spine
                AND c.status      IN ('in_progress','completed')
                AND d.project_id  = t.project_id
                AND d.spine       = t.spine
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
      'Phase 4 provenance guard: % legacy approved_truth row(s) fail the trigger predicate. Remediate via Step 1/2 (attach a real ceremony+decision for the exact field_key, re-stamp as compliant operator_override, or demote to verified) before installing trg_engine_spine_field_truth_provenance.',
      bad_count
      USING ERRCODE = 'check_violation';
  END IF;
END
$guard$;
```

The guard's ceremony branch now mirrors the trigger in full: existence, matching `project_id`, matching `spine`, `status='completed'`, and a matching decision row keyed on `(ceremony_id, project_id, spine, field_key, new_status)`. A legacy row pointing at a stale, wrong-project, wrong-spine, non-completed, or decision-less ceremony fails the guard and aborts the migration — it can no longer sit quietly behind the new trigger.


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

Status: **PENDING TAI REVIEW — apply-ready after Revision 2.1. Executable migration order: (1) enumerate legacy rows, (2) remediate, (3) fail-closed guard, (4) create/replace provenance function, (5) drop/create trigger. Guard's ceremony branch mirrors the trigger predicate exactly.**

---

## Phase 5D — Multi-Project Decomposition (Parent → Sub-Projects) — Revision 4 (APPLIED + APP LAYER COMPLETE)

Status: **DB APPLIED 2026-07-13. DB smoke PASS 26/26** (N, O, P/P-early, T1–T5, S1–S6, Q1–Q3, R1–R5, U1/U3/U4). Follow-up (Rev 4a, also applied): tightened `tg_engine_projects_child_rollup_guard` under a completed parent to block clearing `completed_at` alone. **App layer + follow-ups built and QA-verified 2026-07-14 — see `.orchestrator/qa/phase-5D-smoke-output.md` (7/7 DB guards + 3/3 app-layer guards).** Phase 5D is CLOSED. Only the separate `hotfix-portal-roadmaps-schema` block below remains outstanding, and it is not a 5D dependency.


Revision 4 closes the two remaining bypasses found in Revision 3:
- **Back-door completion via `NEW.approved_at`.** The non-parent completion gate now keys off `OLD.approved_at IS NULL` (prior state), not `NEW.approved_at IS NULL`. A caller can no longer set `status='completed'` and `approved_at=now()` in the same UPDATE to skip the Spine gate. INSERT always runs the gate regardless of supplied `approved_at`.
- **Parent completion must require approved AND completed children.** Parent completion gate now requires `internal_all_children_approved(NEW.id) AND internal_all_children_completed(NEW.id)`. Prevents a child that has `completed_at` set without ever passing the approval gate from satisfying parent completion.

Revision 3 (retained) closed: DELETE of a child under a locked parent; attach of an already-approved/completed child into a locked parent; predicate-based completion regression under a completed parent.

Revision 2 (retained) closed: staleness on attach/detach/regression once parent is locked; portal exposure held to a staff-only surface pending a follow-up portal-safe migration.

Also folded in:
- `IS DISTINCT FROM` for `client_id` comparison.
- Parent gate also blocks direct `status='completed'` transitions, not just `completed_at`.
- `engine_projects_gate` trigger is DROPped and re-CREATEd explicitly rather than assumed.
- Cross-project dependencies / cross-child sequencing / impact analysis are **out of scope for 5D** (Section F closure deferred).

### Invariants enforced by DB

1. `project_kind` ∈ {`standalone`, `parent`, `child`}. Default `standalone`.
2. `parent_project_id IS NOT NULL` iff `project_kind='child'`.
3. Parent and child share the same `client_id`.
4. Max depth = 1.
5. Parent's Spine is locked empty (`point_a='{}' AND point_b='{}'`).
6. Parent approval requires all children `approved`. Parent completion (`status='completed'` OR `completed_at IS NOT NULL`) requires all children completed.
7. **Rollup cannot go stale.** Once a parent is `approved` or `completed`, no child under it may be attached (even if already approved/completed), detached, deleted, or regressed until the parent is demoted.
8. **No back-door completion.** For non-parent projects, moving to `status='completed'` runs the same Point A/B + contradiction gate as `status='approved'`, unless the row already has `approved_at IS NOT NULL` (i.e. it was legitimately approved earlier).
9. Deleting a parent while children exist is blocked (`ON DELETE RESTRICT`).
10. `project_kind` transitions:
    - `standalone → parent`, `standalone → child` (with valid parent), `parent → standalone` (zero children), `child → standalone`: allowed.
    - `parent ↔ child`: BLOCKED. Demote to standalone first.

### Migration SQL (apply as one migration)

```sql
-- 1) Enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'engine_project_kind') THEN
    CREATE TYPE public.engine_project_kind AS ENUM ('standalone','parent','child');
  END IF;
END $$;

-- 2) Columns + index
ALTER TABLE public.engine_projects
  ADD COLUMN IF NOT EXISTS project_kind public.engine_project_kind NOT NULL DEFAULT 'standalone',
  ADD COLUMN IF NOT EXISTS parent_project_id uuid NULL
    REFERENCES public.engine_projects(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS engine_projects_parent_idx
  ON public.engine_projects(parent_project_id);

-- 3) Backfill
UPDATE public.engine_projects
   SET project_kind='standalone'
 WHERE project_kind IS NULL;

-- 4) Shape trigger: kind/parent consistency, same-client, depth, Spine lock, transitions
CREATE OR REPLACE FUNCTION public.tg_engine_projects_kind_shape()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_row public.engine_projects%ROWTYPE;
  child_count int;
BEGIN
  -- 4a) kind ↔ parent_project_id consistency
  IF NEW.project_kind = 'child' AND NEW.parent_project_id IS NULL THEN
    RAISE EXCEPTION 'project_kind=child requires parent_project_id' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.project_kind IN ('standalone','parent') AND NEW.parent_project_id IS NOT NULL THEN
    RAISE EXCEPTION 'project_kind=% must not set parent_project_id', NEW.project_kind USING ERRCODE = 'check_violation';
  END IF;

  -- 4b) Parent Spine lock
  IF NEW.project_kind = 'parent' THEN
    IF COALESCE(NEW.point_a, '{}'::jsonb) <> '{}'::jsonb
       OR COALESCE(NEW.point_b, '{}'::jsonb) <> '{}'::jsonb THEN
      RAISE EXCEPTION 'Parent projects must not carry Spine data (point_a/point_b locked empty)'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- 4c) Child rules: parent exists, same client, depth ≤ 1, parent is actually a parent
  IF NEW.project_kind = 'child' THEN
    SELECT * INTO parent_row FROM public.engine_projects WHERE id = NEW.parent_project_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'parent_project_id % not found', NEW.parent_project_id USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF parent_row.client_id IS DISTINCT FROM NEW.client_id THEN
      RAISE EXCEPTION 'Child client_id % must match parent client_id %', NEW.client_id, parent_row.client_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF parent_row.project_kind = 'child' THEN
      RAISE EXCEPTION 'Depth > 1 not allowed: parent % is itself a child', parent_row.id
        USING ERRCODE = 'check_violation';
    END IF;
    IF parent_row.project_kind = 'standalone' THEN
      RAISE EXCEPTION 'Cannot attach child to standalone project %; promote to parent first', parent_row.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- 4d) Transition rules (UPDATE only)
  IF TG_OP = 'UPDATE' AND OLD.project_kind IS DISTINCT FROM NEW.project_kind THEN
    IF OLD.project_kind = 'parent' AND NEW.project_kind = 'child' THEN
      RAISE EXCEPTION 'parent → child transition forbidden; demote to standalone first' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.project_kind = 'child' AND NEW.project_kind = 'parent' THEN
      RAISE EXCEPTION 'child → parent transition forbidden; demote to standalone first' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.project_kind = 'parent' AND NEW.project_kind = 'standalone' THEN
      SELECT count(*) INTO child_count FROM public.engine_projects WHERE parent_project_id = NEW.id;
      IF child_count > 0 THEN
        RAISE EXCEPTION 'Cannot demote parent → standalone: % children still attached', child_count
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS engine_projects_kind_shape ON public.engine_projects;
CREATE TRIGGER engine_projects_kind_shape
BEFORE INSERT OR UPDATE ON public.engine_projects
FOR EACH ROW EXECUTE FUNCTION public.tg_engine_projects_kind_shape();

-- 5) Rollup helpers
--    approved: child counts as satisfying rollup iff status='approved' OR status='completed'
--    (completed implies previously approved in this system; treated as acceptable).
CREATE OR REPLACE FUNCTION public.internal_all_children_approved(_parent_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.engine_projects WHERE parent_project_id = _parent_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.engine_projects
     WHERE parent_project_id = _parent_id
       AND status NOT IN ('approved','completed')
  );
$$;

CREATE OR REPLACE FUNCTION public.internal_all_children_completed(_parent_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.engine_projects WHERE parent_project_id = _parent_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.engine_projects
     WHERE parent_project_id = _parent_id
       AND (completed_at IS NULL AND status <> 'completed')
  );
$$;

-- 6) Child-side stale-rollup guard
--    Parent approval covers a FIXED child set. Once a parent is approved or
--    completed, its child set is frozen: no attach (even of already-approved
--    children), no detach, no delete, no status/completed regression. Parent
--    must be demoted first.
CREATE OR REPLACE FUNCTION public.tg_engine_projects_child_rollup_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_parent public.engine_projects%ROWTYPE;
  new_parent public.engine_projects%ROWTYPE;
  old_parent_locked boolean := false;
  new_parent_locked boolean := false;
  old_parent_completed boolean := false;
  new_parent_completed boolean := false;
  old_child_completed boolean := false;
  new_child_completed boolean := false;
BEGIN
  -- Load candidate parents (OLD side on UPDATE/DELETE; NEW side on INSERT/UPDATE)
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.parent_project_id IS NOT NULL THEN
    SELECT * INTO old_parent FROM public.engine_projects WHERE id = OLD.parent_project_id;
    old_parent_locked    := old_parent.status IN ('approved','completed') OR old_parent.completed_at IS NOT NULL;
    old_parent_completed := old_parent.status = 'completed' OR old_parent.completed_at IS NOT NULL;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.parent_project_id IS NOT NULL THEN
    SELECT * INTO new_parent FROM public.engine_projects WHERE id = NEW.parent_project_id;
    new_parent_locked    := new_parent.status IN ('approved','completed') OR new_parent.completed_at IS NOT NULL;
    new_parent_completed := new_parent.status = 'completed' OR new_parent.completed_at IS NOT NULL;
  END IF;

  -- INSERT: any attach into a locked parent is BLOCKED, even for already-approved/completed children.
  IF TG_OP = 'INSERT' AND NEW.parent_project_id IS NOT NULL AND new_parent_locked THEN
    RAISE EXCEPTION 'Cannot attach child to approved/completed parent %; demote parent first', new_parent.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- UPDATE: reparent (detach or attach elsewhere)
  IF TG_OP = 'UPDATE'
     AND OLD.parent_project_id IS DISTINCT FROM NEW.parent_project_id THEN
    IF OLD.parent_project_id IS NOT NULL AND old_parent_locked THEN
      RAISE EXCEPTION 'Cannot detach child from approved/completed parent %; demote parent first', old_parent.id
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.parent_project_id IS NOT NULL AND new_parent_locked THEN
      RAISE EXCEPTION 'Cannot attach child to approved/completed parent %; demote parent first', new_parent.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- UPDATE: status/completed regression under a locked parent
  IF TG_OP = 'UPDATE' AND NEW.parent_project_id IS NOT NULL THEN
    old_child_completed := OLD.status = 'completed' OR OLD.completed_at IS NOT NULL;
    new_child_completed := NEW.status = 'completed' OR NEW.completed_at IS NOT NULL;

    -- Approval regression under an approved parent
    IF OLD.status IN ('approved','completed')
       AND NEW.status NOT IN ('approved','completed')
       AND new_parent_locked THEN
      RAISE EXCEPTION 'Cannot regress child % from % under approved/completed parent %; demote parent first',
        NEW.id, OLD.status, new_parent.id USING ERRCODE = 'check_violation';
    END IF;

    -- Completion regression under a completed parent (predicate-based, not just completed_at)
    IF new_parent_completed AND old_child_completed AND NOT new_child_completed THEN
      RAISE EXCEPTION 'Cannot un-complete child % under completed parent %; demote parent first',
        NEW.id, new_parent.id USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- DELETE: removing a child is effectively detaching. Block under a locked parent.
  IF TG_OP = 'DELETE' AND OLD.parent_project_id IS NOT NULL AND old_parent_locked THEN
    RAISE EXCEPTION 'Cannot delete child % under approved/completed parent %; demote parent first',
      OLD.id, old_parent.id USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS engine_projects_child_rollup_guard ON public.engine_projects;
CREATE TRIGGER engine_projects_child_rollup_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.engine_projects
FOR EACH ROW EXECUTE FUNCTION public.tg_engine_projects_child_rollup_guard();

-- 7) Extend engine_projects gate: parents skip Spine; require child rollup on approval + completion
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
  -- Approval gate (status→approved) and back-door completion gate (status→completed
  -- for non-parents that were never approved). Both paths must satisfy Point A/B +
  -- contradictions for non-parents so a child cannot bypass Spine by jumping
  -- straight to 'completed' and then satisfying the parent rollup.
  IF (NEW.status = 'approved'
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved'))
     OR (
       NEW.project_kind <> 'parent'
       AND NEW.status = 'completed'
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed')
       -- Use PRIOR state, not NEW.approved_at. Otherwise a caller can set
       -- status='completed' and approved_at=now() in the same UPDATE and skip
       -- the Spine gate. INSERT always runs the gate regardless of approved_at.
       AND (TG_OP = 'INSERT' OR OLD.approved_at IS NULL)
     ) THEN

    IF NEW.project_kind = 'parent' THEN
      IF NOT public.internal_all_children_approved(NEW.id) THEN
        RAISE EXCEPTION 'Cannot approve parent project %: not all children approved', NEW.id
          USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      has_contra := public.internal_project_has_contradictions(NEW.id);
      IF has_contra THEN
        RAISE EXCEPTION 'Cannot approve/complete project %: unresolved contradictions', NEW.id
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
        RAISE EXCEPTION 'Cannot approve/complete project %: spine not fully approved. point_a_missing=%, point_b_missing=%',
          NEW.id, a_missing, b_missing USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  -- Completion gate for parent — gate BOTH status='completed' AND completed_at
  IF NEW.project_kind = 'parent' THEN
    IF (NEW.status = 'completed'
        AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed'))
       OR (NEW.completed_at IS NOT NULL
        AND (TG_OP = 'INSERT' OR OLD.completed_at IS NULL)) THEN
      -- Require BOTH: every child approved AND every child completed.
      -- internal_all_children_completed treats completed_at IS NOT NULL as
      -- completed, so without the approved check a child could satisfy
      -- completion without ever passing the approval gate.
      IF NOT public.internal_all_children_approved(NEW.id)
         OR NOT public.internal_all_children_completed(NEW.id) THEN
        RAISE EXCEPTION 'Cannot complete parent project %: children must be both approved and completed', NEW.id
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate trigger explicitly (do not assume Phase 4's trigger name/state is intact)
DROP TRIGGER IF EXISTS engine_projects_gate ON public.engine_projects;
CREATE TRIGGER engine_projects_gate
BEFORE INSERT OR UPDATE ON public.engine_projects
FOR EACH ROW EXECUTE FUNCTION public.tg_engine_projects_gate();

-- 8) Staff-only family summary view.
--    Portal exposure is DEFERRED to a follow-up migration that applies portal
--    permission + published/client-safe filtering. This view is NOT granted to
--    `authenticated`; only service_role reads it, and staff server functions
--    invoke it via the service client (or under staff-only RLS at call sites).
CREATE OR REPLACE VIEW public.engine_project_family_summary
WITH (security_invoker = true)
AS
SELECT
  p.id AS parent_id,
  p.name AS parent_name,
  p.status AS parent_status,
  c.id AS child_id,
  c.name AS child_name,
  c.status AS child_status,
  c.current_step,
  c.progress_pct,
  c.approved_at,
  c.completed_at,
  c.client_portal_project_id
FROM public.engine_projects p
LEFT JOIN public.engine_projects c ON c.parent_project_id = p.id
WHERE p.project_kind = 'parent';

-- Explicitly revoke broad access; grant only to service_role for this phase.
REVOKE ALL ON public.engine_project_family_summary FROM PUBLIC;
REVOKE ALL ON public.engine_project_family_summary FROM authenticated;
GRANT SELECT ON public.engine_project_family_summary TO service_role;
```

### Smoke harness additions (`supabase/tests/spine-gate-smoke.sql`)

Run under service_role; scratch data cleaned in final rollback block.

- **Case N** — Create parent P, child C1 (kind=child, parent=P, same client). Approve C1 with full Spine truth → ALLOWED.
- **Case O** — Attempt to approve parent P while C1 approved and C2 pending → BLOCKED (`not all children approved`).
- **Case P** — Approve C2 fully, then approve P → ALLOWED. Then set `completed_at`/`status='completed'` on both children, then complete P → ALLOWED. Attempt to complete P before both children complete → BLOCKED.
- **Case Q** — Kind transitions: `parent → child` BLOCKED; `child → parent` BLOCKED; `parent → standalone` while children exist BLOCKED; after reparenting all children, `parent → standalone` ALLOWED.
- **Case R** — `DELETE parent` while children attached → BLOCKED (`foreign_key_violation`). `DELETE child` under an unapproved parent → ALLOWED. INSERT child under standalone → BLOCKED. INSERT child with mismatched `client_id` → BLOCKED. INSERT parent with non-empty `point_a` → BLOCKED.
- **Case S — Stale-rollup guards under an approved parent.** With P approved and C1/C2 approved:
  - S1: INSERT a new unapproved C3 under P → BLOCKED.
  - S2: UPDATE C1 to detach (`parent_project_id=NULL`, `project_kind=standalone`) → BLOCKED.
  - S3: UPDATE C1 `status='in_progress'` (regress from approved) → BLOCKED.
  - S4: Demote P (`status` back to `in_progress`), then S1/S2/S3 → ALLOWED.
  - S5: `DELETE` C1 while P is approved → BLOCKED (`Cannot delete child … under approved/completed parent`).
  - S6: INSERT an already-approved (or already-completed) C3 under approved P → BLOCKED (parent approval covers a fixed child set).
- **Case T — Completed-parent guards.** With P completed and both children completed:
  - T1: UPDATE C1 `completed_at = NULL` → BLOCKED.
  - T2: INSERT a new non-completed child under P → BLOCKED.
  - T3: Demote P (clear `completed_at`, `status` back to `approved`), then T1/T2 → ALLOWED.
  - T4: INSERT an already-completed child under completed P → BLOCKED (set is frozen).
  - T5: UPDATE C1 `status` from `completed` back to `approved` (or `in_progress`) with `completed_at` also cleared so `new_child_completed=false`, under completed P → BLOCKED.
- **Case U — No back-door completion.** Create standalone child C4 with incomplete Point A/B truth:
  - U1: UPDATE C4 `status='completed'` directly (never approved, `OLD.approved_at IS NULL`) → BLOCKED with the same Spine/contradiction message as approval.
  - U2: Attach C4 (still uncompleted) under parent P2, jump C4 to `status='completed'` to satisfy `internal_all_children_approved`/`internal_all_children_completed`, then approve P2 → the C4 completion transition itself is BLOCKED, so P2 approval cannot be laundered through it.
  - U3: Child C5 has `completed_at IS NOT NULL` but `status NOT IN ('approved','completed')`; attempt parent P3 `status='completed'` → BLOCKED (`children must be both approved and completed`).
  - U4: UPDATE C6 in a single statement setting both `status='completed'` and `approved_at=now()` on a row with incomplete Spine (`OLD.approved_at IS NULL`) → BLOCKED. The `approved_at` supplied in the same UPDATE must not skip the Spine gate.

Acceptance: `SMOKE PASS` line printed after N–U all behave as specified.

### Post-migration app follow-ups (tracked, not part of this SQL)

- Server fns: `createChildProject`, `reparentProject` (admin/operator only; auto-demote parent as needed with explicit audit; audit to `engine_activity`), `getProjectFamily`, extend `getWorkspaceProjectList` to include kind + parent_id.
- UI: workspace list grouping, `WorkspaceHeader` chip, `src/routes/engine/$projectId/family.tsx` (staff-only), create-child CTA, hide Spine nav on parents.
- Chat context: extend `engine-chat-context.server.ts` — staff-only surface; no portal chat surface exposes `engine_project_family_summary` yet.
- **Portal follow-up (separate migration):** design portal-safe family surface with published/client-safe filtering and portal permission checks; add portal-user smoke case then.

### Explicitly OUT OF SCOPE for Phase 5D

- Cross-project (cross-child) dependencies, sequencing constraints, and impact analysis. **Section F is not closed by this phase.**
- Milestone-level parent/child decomposition (future Phase 5E).
- `engine_milestone_solutions` variant modeling (future Phase 5F).
- Depth > 1 hierarchies.
- Automatic child creation by AI (chat may propose; only admin CTA commits).
- Portal exposure of family rollup (deferred to a follow-up migration as above).

Status: **PENDING TAI REVIEW (Revision 4) — apply-ready pending final sign-off.**


## Runtime Schema Drift Fix — engine_projects.current_phase + client_portal_roadmaps grants

Status: **APPLIED 2026-07-14, VERIFIED.** See `.orchestrator/hotfix-portal-roadmaps-output.md` (5/5 checks PASS incl. negative anon-token via Data API). Migration id `20260714-005744-436757`.

Origin: Project monitoring 2026-07-13 — two high-severity runtime errors in production.

### Finding 1 — `column engine_projects.current_phase does not exist` (64 occurrences over ~26h)

Verified against live DB: `current_phase` is missing from `public.engine_projects`. App references (all treat it as `text | null`):
- `src/lib/engine-nba.functions.ts:115` — SELECT
- `src/lib/engine-execution.functions.ts:817,1144` — UPDATE (`"Roadmap delivered"`, `"Engagement in progress"`)
- `src/lib/engine-completion.functions.ts:289` — UPDATE (`"Roadmap delivered"`)

Sibling errors in the same window (`client_company`, `project_name`, `p.title`, `update_updated_at_column`) resolve to: `update_updated_at_column` exists; `name` exists; `client_company`/`project_name` are derived in `engine.functions.ts` from joins (`engine_clients.company`, `engine_projects.name`) — only `current_phase` is a true missing column on `engine_projects`. Other error rows are from unrelated legacy call sites and are not addressed here.

### Finding 2 — `permission denied for table client_portal_roadmaps`

Verified against live DB: `client_portal_roadmaps` has **no** grants for `anon`, `authenticated`, or `service_role`. RLS is a no-op behind the missing GRANTs; publishing, portal reads, and acknowledgement all fail. `anon` needs SELECT because portal magic-link reads run under `anon` with token-scoped RLS.

### Migration SQL (apply as one migration)

```sql
-- 1) Add current_phase column matching generated types (text, nullable, no default)
ALTER TABLE public.engine_projects
  ADD COLUMN IF NOT EXISTS current_phase text NULL;

-- 2) Restore Data API grants on client_portal_roadmaps.
--    Portal reads run as anon under token-scoped RLS; staff writes run as authenticated;
--    server functions using supabaseAdmin need service_role.
GRANT SELECT ON public.client_portal_roadmaps TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_portal_roadmaps TO authenticated;
GRANT ALL ON public.client_portal_roadmaps TO service_role;
```

### Preflight (2026-07-14 — completed as part of Phase 5D closure sweep)

- `client_portal_roadmaps` **RLS is ENABLED** (`pg_class.relrowsecurity = t`).
- Policies present and scoped:
  - `Clients read published roadmaps` — SELECT — `status='published' AND project_id IN (SELECT project_id FROM client_portal_permissions WHERE lower(email)=lower(auth.email()) AND revoked_at IS NULL)`
  - `Operators manage roadmaps` — ALL — `client_portal_is_operator(auth.email())`
- **No `USING (true)` policies.** Grants can be added safely; RLS does the real scoping.
- `engine_projects.current_phase` confirmed missing from live schema.

### Post-apply verification

- `\d public.engine_projects` shows `current_phase text NULL`.
- `SELECT current_phase FROM public.engine_projects LIMIT 1` succeeds.
- `SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name='client_portal_roadmaps'` returns rows for `anon` (SELECT), `authenticated` (SELECT/INSERT/UPDATE/DELETE), `service_role` (ALL).
- Portal magic-link roadmap fetch returns rows again; Next-Best-Action panel loads without error.
- **Negative portal-token test (required after grants land):** an `anon` role query against `client_portal_roadmaps` with client-A's magic-link email context MUST return zero client-B rows. Fail = missing RLS scoping and the grants must be rolled back.

Status: **APPLIED 2026-07-14, VERIFIED.** Migration `20260714-005744-436757`. See `.orchestrator/hotfix-portal-roadmaps-output.md`. Superseded — kept for audit trail only.



---

## Phase H1 — Cost-Overrun Auto-Pause

Status: **APPLIED 2026-07-14** via `20260714-175059-742685`. See `.orchestrator/phase-h1-h4-h6b12-apply-output.md`.

Closes gap H9 from `.orchestrator/audit/capability-audit-2026-07-14b.md`: `engine_agent_costs` records spend but nothing halts a project when it exceeds `engine_projects.agent_budget_monthly_cents`.

### Design

Reuse the existing budget column (`agent_budget_monthly_cents`) — do not add a second cap concept. Add two nullable columns to record pause state, and one AFTER-INSERT trigger on `engine_agent_costs` that:
1. Recomputes month-to-date spend for the affected project.
2. If spend > budget AND project is not already cost-paused AND budget > 0, sets `cost_paused_at = now()` + `cost_paused_reason`, and inserts an `engine_review_items` row (`item_type='cost_overrun'`, `impact='high'`, `source='cost_guard_auto'`) plus an `engine_audit_log` row (`action='project.cost.autopause'`).

Project `status` enum is **not** modified — pause is expressed by `cost_paused_at IS NOT NULL`. All existing readers keep working; new UI checks the timestamp.

Resume is app-side via `resumeProjectAfterCostReview` (staff-gated server fn) which clears `cost_paused_at`/`cost_paused_reason` and audits. Separate-approver enforced in code: the resuming email MUST differ from the actor_email on the most recent `engine_agent_costs` row that tripped the cap.

### Preflight (must pass before apply)

```sql
-- 1. No project currently has cost_paused_at column (idempotency check)
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='engine_projects'
  AND column_name IN ('cost_paused_at','cost_paused_reason');
-- expect: 0 rows

-- 2. Confirm budget column shape unchanged
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='engine_projects'
  AND column_name IN ('agent_budget_monthly_cents','agent_spend_month_cents');
-- expect: 2 rows, integer

-- 3. Snapshot projects already over budget (they will trip on next insert)
SELECT p.id, p.name, p.agent_budget_monthly_cents,
       COALESCE(SUM(c.cost_cents) FILTER (
         WHERE c.created_at >= date_trunc('month', now())
       ), 0) AS mtd_spend_cents
FROM public.engine_projects p
LEFT JOIN public.engine_agent_costs c ON c.project_id = p.id
GROUP BY p.id
HAVING p.agent_budget_monthly_cents > 0
   AND COALESCE(SUM(c.cost_cents) FILTER (
        WHERE c.created_at >= date_trunc('month', now())
      ), 0) > p.agent_budget_monthly_cents;
```

If preflight #3 returns rows, decide per project whether to raise the budget, pause manually, or accept immediate auto-pause on next cost row.

### Proposed SQL

```sql
-- H1.1: pause-state columns
ALTER TABLE public.engine_projects
  ADD COLUMN IF NOT EXISTS cost_paused_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS cost_paused_reason text NULL;

CREATE INDEX IF NOT EXISTS engine_projects_cost_paused_idx
  ON public.engine_projects (cost_paused_at)
  WHERE cost_paused_at IS NOT NULL;

-- H1.2: guard function
CREATE OR REPLACE FUNCTION public.tg_engine_agent_costs_cap_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_budget integer;
  v_spend integer;
  v_already_paused timestamptz;
  v_project_name text;
BEGIN
  SELECT agent_budget_monthly_cents, cost_paused_at, name
    INTO v_budget, v_already_paused, v_project_name
  FROM public.engine_projects WHERE id = NEW.project_id;

  IF v_budget IS NULL OR v_budget <= 0 THEN
    RETURN NEW;
  END IF;
  IF v_already_paused IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(cost_cents), 0) INTO v_spend
  FROM public.engine_agent_costs
  WHERE project_id = NEW.project_id
    AND created_at >= date_trunc('month', now());

  IF v_spend > v_budget THEN
    UPDATE public.engine_projects
       SET cost_paused_at = now(),
           cost_paused_reason = format(
             'Month-to-date spend $%s exceeded budget $%s',
             to_char(v_spend/100.0, 'FM999,999,990.00'),
             to_char(v_budget/100.0, 'FM999,999,990.00'))
     WHERE id = NEW.project_id;

    INSERT INTO public.engine_review_items
      (project_id, project, item_type, title, impact, source, status)
    VALUES
      (NEW.project_id, v_project_name, 'cost_overrun',
       format('Cost cap exceeded — project auto-paused ($%s / $%s)',
              to_char(v_spend/100.0, 'FM999,999,990.00'),
              to_char(v_budget/100.0, 'FM999,999,990.00')),
       'high', 'cost_guard_auto', 'pending');

    INSERT INTO public.engine_audit_log
      (project_id, action, actor_email, field_changed, old_value, new_value, reason, metadata)
    VALUES
      (NEW.project_id, 'project.cost.autopause', 'system:cost_guard',
       'cost_paused_at', NULL, now()::text,
       format('spend_cents=%s budget_cents=%s', v_spend, v_budget),
       jsonb_build_object('spend_cents', v_spend, 'budget_cents', v_budget,
                          'triggering_cost_id', NEW.id));
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS engine_agent_costs_cap_guard ON public.engine_agent_costs;
CREATE TRIGGER engine_agent_costs_cap_guard
  AFTER INSERT ON public.engine_agent_costs
  FOR EACH ROW EXECUTE FUNCTION public.tg_engine_agent_costs_cap_guard();
```

### Post-apply verification

```sql
-- Trigger present
SELECT trigger_name FROM information_schema.triggers
WHERE trigger_name = 'engine_agent_costs_cap_guard';

-- Simulate: insert a cost row that trips a test project. Confirm cost_paused_at populated,
-- review_item row created with item_type='cost_overrun', audit_log row with action='project.cost.autopause'.
```

### App-side (already committed, inert until this migration lands)

- `src/lib/engine-cost-guard.functions.ts` — `getCostGuardReport()`, `resumeProjectAfterCostReview()`.
- `src/routes/admin.cost-guard.tsx` — read-only dashboard using existing `agent_budget_monthly_cents` + summed `engine_agent_costs`. Pause banner only appears after migration lands (column NULL-safe).


---

## Phase H4 — Outcome Scheduler pg_cron (APPLIED 2026-07-14)

Status: **APPLIED** via `20260714-175459-098362`; `cron.schedule` returned jobid **117**. See `.orchestrator/phase-h1-h4-h6b12-apply-output.md`.

Schedules a daily invocation of the outcome check-in scheduler. App-side
already ships `internalRunOutcomeCheckins` and the public hook at
`/api/public/hooks/outcome-checkins`. Dedupe is enforced in the handler
(24h window per project + title).

```sql
-- Requires pg_cron + pg_net extensions.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'outcome-checkins-daily',
  '0 9 * * *', -- 09:00 UTC daily
  $$
  SELECT net.http_post(
    url := 'https://project--b3555ed3-b0dc-4def-8fee-77ff34a2cb82.lovable.app/api/public/hooks/outcome-checkins',
    headers := '{"Content-Type":"application/json","apikey":"REPLACE_WITH_PUBLISHABLE_KEY"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### Post-apply verification

```sql
SELECT * FROM cron.job WHERE jobname = 'outcome-checkins-daily';
-- After first tick:
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
-- New review items:
SELECT id, project_id, title, created_at FROM public.engine_review_items
WHERE item_type = 'outcome_checkin' ORDER BY created_at DESC LIMIT 20;
```

### App-side (already committed)

- `src/lib/engine-outcome-scheduler.functions.ts`
- `src/routes/api/public/hooks/outcome-checkins.ts`
- `src/routes/admin.outcome-scheduler.tsx`

## Phase H6 · B12 — Non-spine proposal enforcement (REVISED 2026-07-14, ready to apply pending caller audit)

**Status:** **APPLIED 2026-07-14** via `20260714-175310-970763` (+ `20260714-175406-713684` for search_path). Extended in-flight with sibling RPC `admin_edit_impl_plan_governed`. Caller audit fixed `regenerateMilestoneSection` and `updateProjectImplementationPlan`. See `.orchestrator/phase-h1-h4-h6b12-apply-output.md`. Original notes preserved for history:
transaction-boundary caveat from the previous revision is resolved by
performing the entire apply (GUC set + governed UPDATE + audit) inside a
single `SECURITY DEFINER` stored procedure `public.apply_approved_proposal`.
The server fn `applyApprovedProposal` has been rewritten to call this RPC
directly (`sb.rpc('apply_approved_proposal', { _proposal_id })`).

### Pre-apply caller audit — MUST resolve before applying

Once the triggers below land, any UPDATE to governed columns from a caller
that does NOT set the GUC will RAISE. Current direct writers to
`engine_milestones` governed columns (found via
`rg -n 'from\("engine_milestones"\)\.update\(' src/`):

- `src/lib/engine.functions.ts:1563-1564` — swaps `sort_index` only. **Safe**
  (sort_index is not governed).
- `src/lib/engine-execution.functions.ts` — `updateMilestone()` now splits
  the incoming patch: governed keys (`brief_md`, `acceptance_criteria`,
  `developer_prompt`, `client_safe_md`) are forwarded to the SECURITY
  DEFINER RPC `admin_edit_milestone_governed(_id, _patch)` (defined in
  step 5 below) which sets the GUC atomically before applying the
  update. Non-governed keys keep going through the regular UPDATE so RLS
  remains the primary gate. **Resolved** — no direct writer remains.

Direct writers to `engine_project_implementation_plans` governed columns
(`summary`, `payload`): none found in current codebase.

### Migration

```sql
-- 1. SECURITY DEFINER helper — sets the GUC used by the triggers below.
--    Kept as a stand-alone helper so future flows (batch applies, tests)
--    can reuse it. Only `apply_approved_proposal` calls it in normal use.
CREATE OR REPLACE FUNCTION public.begin_proposal_apply()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('engine.proposal_apply', 'on', true);
END $$;

REVOKE ALL ON FUNCTION public.begin_proposal_apply() FROM public;
GRANT EXECUTE ON FUNCTION public.begin_proposal_apply() TO authenticated;

-- 2. Atomic apply RPC — validates the proposal, sets the GUC, and performs
--    the governed UPDATE inside one transaction. Callers hit this via
--    `supabase.rpc('apply_approved_proposal', { _proposal_id: id })`.
--    Returns a string label of the touched target row, e.g.
--    `engine_milestones:<uuid>`.
CREATE OR REPLACE FUNCTION public.apply_approved_proposal(_proposal_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p           public.engine_project_chat_proposals%ROWTYPE;
  payload     jsonb;
  target_lbl  text := NULL;
  caller_uid  uuid := auth.uid();
  caller_role text;
BEGIN
  -- Caller must be admin (has_role is defined per the user-roles doctrine).
  IF caller_uid IS NULL THEN
    RAISE EXCEPTION 'apply_approved_proposal: not authenticated';
  END IF;
  IF NOT public.has_role(caller_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'apply_approved_proposal: admin role required';
  END IF;

  SELECT * INTO p FROM public.engine_project_chat_proposals WHERE id = _proposal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'apply_approved_proposal: proposal not found';
  END IF;
  IF p.status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'apply_approved_proposal: proposal % is not in approved status', _proposal_id;
  END IF;
  IF p.target_id IS NULL OR p.target_kind IS NULL THEN
    RAISE EXCEPTION 'apply_approved_proposal: proposal % is missing target_kind / target_id', _proposal_id;
  END IF;
  -- Phase 9C guard mirror: reject self-approval.
  IF p.created_by IS NOT NULL AND p.created_by = p.approved_by THEN
    RAISE EXCEPTION 'apply_approved_proposal: created_by = approved_by is forbidden (no AI self-approval)';
  END IF;

  payload := COALESCE(p.payload, '{}'::jsonb);

  -- Set the GUC. From this point in the same transaction, the B12 triggers
  -- will allow governed UPDATEs.
  PERFORM set_config('engine.proposal_apply', 'on', true);

  IF p.target_kind = 'milestone' THEN
    UPDATE public.engine_milestones
       SET brief_md = COALESCE(payload->>'brief_md', brief_md),
           acceptance_criteria = CASE
             WHEN payload ? 'acceptance_criteria' THEN payload->'acceptance_criteria'
             ELSE acceptance_criteria
           END,
           developer_prompt = COALESCE(payload->>'developer_prompt', developer_prompt),
           client_safe_md = COALESCE(payload->>'client_safe_md', client_safe_md)
     WHERE id = p.target_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'apply_approved_proposal: target milestone % not found', p.target_id;
    END IF;
    target_lbl := 'engine_milestones:' || p.target_id::text;

  ELSIF p.target_kind = 'implementation_plan' THEN
    UPDATE public.engine_project_implementation_plans
       SET summary = COALESCE(payload->>'summary', summary),
           payload = CASE
             WHEN payload ? 'payload' THEN payload->'payload'
             ELSE payload
           END
     WHERE id = p.target_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'apply_approved_proposal: target implementation_plan % not found', p.target_id;
    END IF;
    target_lbl := 'engine_project_implementation_plans:' || p.target_id::text;

  ELSE
    RAISE EXCEPTION 'apply_approved_proposal: unsupported target_kind %', p.target_kind;
  END IF;

  RETURN target_lbl;
END $$;

REVOKE ALL ON FUNCTION public.apply_approved_proposal(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_approved_proposal(uuid) TO authenticated;

-- 3. Milestone trigger — governs brief_md / acceptance_criteria /
--    developer_prompt / client_safe_md.
CREATE OR REPLACE FUNCTION public.tg_engine_milestones_require_proposal()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('engine.proposal_apply', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.brief_md IS DISTINCT FROM OLD.brief_md
     OR NEW.acceptance_criteria IS DISTINCT FROM OLD.acceptance_criteria
     OR NEW.developer_prompt IS DISTINCT FROM OLD.developer_prompt
     OR NEW.client_safe_md IS DISTINCT FROM OLD.client_safe_md THEN
    RAISE EXCEPTION 'Milestone body edits (brief_md / acceptance_criteria / developer_prompt / client_safe_md) must go through an approved chat proposal applied via public.apply_approved_proposal().';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS engine_milestones_require_proposal ON public.engine_milestones;
CREATE TRIGGER engine_milestones_require_proposal
  BEFORE UPDATE ON public.engine_milestones
  FOR EACH ROW EXECUTE FUNCTION public.tg_engine_milestones_require_proposal();

-- 4. Implementation-plan trigger — governs summary + payload.
CREATE OR REPLACE FUNCTION public.tg_engine_impl_plans_require_proposal()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('engine.proposal_apply', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.summary IS DISTINCT FROM OLD.summary
     OR NEW.payload IS DISTINCT FROM OLD.payload THEN
    RAISE EXCEPTION 'Implementation-plan body edits (summary / payload) must go through an approved chat proposal applied via public.apply_approved_proposal().';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS engine_impl_plans_require_proposal ON public.engine_project_implementation_plans;
CREATE TRIGGER engine_impl_plans_require_proposal
  BEFORE UPDATE ON public.engine_project_implementation_plans
  FOR EACH ROW EXECUTE FUNCTION public.tg_engine_impl_plans_require_proposal();

-- 5. Admin-only atomic writer for governed milestone columns.
--    Used by src/lib/engine-execution.functions.ts `updateMilestone()` so
--    admin-driven draft edits (pre-approval) still work under the B12
--    trigger. Only the four governed columns are honored; any other keys
--    in `_patch` are ignored so the RPC can't be repurposed to bypass RLS
--    on unrelated fields.
CREATE OR REPLACE FUNCTION public.admin_edit_milestone_governed(_id uuid, _patch jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_uid uuid := auth.uid();
BEGIN
  IF caller_uid IS NULL THEN
    RAISE EXCEPTION 'admin_edit_milestone_governed: not authenticated';
  END IF;
  IF NOT public.has_role(caller_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin_edit_milestone_governed: admin role required';
  END IF;
  IF _patch IS NULL OR jsonb_typeof(_patch) <> 'object' THEN
    RAISE EXCEPTION 'admin_edit_milestone_governed: _patch must be a JSON object';
  END IF;

  PERFORM set_config('engine.proposal_apply', 'on', true);

  UPDATE public.engine_milestones
     SET brief_md = CASE
           WHEN _patch ? 'brief_md' THEN NULLIF(_patch->>'brief_md', '')
           ELSE brief_md
         END,
         acceptance_criteria = CASE
           WHEN _patch ? 'acceptance_criteria' THEN _patch->'acceptance_criteria'
           ELSE acceptance_criteria
         END,
         developer_prompt = CASE
           WHEN _patch ? 'developer_prompt' THEN NULLIF(_patch->>'developer_prompt', '')
           ELSE developer_prompt
         END,
         client_safe_md = CASE
           WHEN _patch ? 'client_safe_md' THEN NULLIF(_patch->>'client_safe_md', '')
           ELSE client_safe_md
         END
   WHERE id = _id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_edit_milestone_governed: milestone % not found', _id;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.admin_edit_milestone_governed(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_edit_milestone_governed(uuid, jsonb) TO authenticated;
```

### Verification (post-apply)

```sql
-- Should RAISE (direct writer, no GUC):
UPDATE public.engine_milestones SET brief_md = brief_md || ' edit'
WHERE id = '<real-id>';

-- Should succeed atomically via the RPC:
SELECT public.apply_approved_proposal('<approved-proposal-uuid>');

-- Manual txn form (equivalent semantics):
BEGIN;
  SELECT public.begin_proposal_apply();
  UPDATE public.engine_milestones SET brief_md = 'new body' WHERE id = '<real-id>';
COMMIT;
```


---

## Phase H6 · J4 — Universal `impact_summary` on proposals (APPLIED 2026-07-14)

Applied via combined H6 migration. `ADD COLUMN IF NOT EXISTS` + backfill from
`payload->>'scope'` and `proposal_type`-derived reversibility. 31 existing
rows now carry a non-empty `impact_summary`.

```sql
ALTER TABLE public.engine_project_chat_proposals
  ADD COLUMN IF NOT EXISTS impact_summary jsonb NOT NULL DEFAULT '{}'::jsonb;
```

COMMENT ON COLUMN public.engine_project_chat_proposals.impact_summary IS
  'Standardised proposal impact: {scope, budgetDelta, timelineDelta, dependencies, clientExpectations, reversibility, risks}. Rendered by ProposalImpactPanel.';

-- Optional backfill from existing payload shapes (safe defaults).
UPDATE public.engine_project_chat_proposals
   SET impact_summary = jsonb_build_object(
     'scope', payload->>'scope',
     'reversibility', CASE WHEN proposal_type = 'implementation_prompt' THEN 'hard' ELSE 'reversible' END
   )
 WHERE impact_summary = '{}'::jsonb;
```

App-side (already committed):
- `src/components/ProposalImpactPanel.tsx` renders the payload.
- `deriveImpactSummary()` provides a safe fallback until the column
  exists.

---

## Phase H6 · I11 — `risk_score` on review items (APPLIED 2026-07-14)

Applied via combined H6 migration. Because the schema didn't yet carry the
risk-input columns, the migration also added nullable `severity`,
`impact_score`, `urgency_score`, `deadline_at`, `client_risk` with matching
CHECK constraints, then installed the trigger + index. Existing rows were
backfilled to `risk_score = 36` (medium fallback) via a self-update; new
inputs will land in the correct band as callers begin writing severity /
impact / urgency / deadline / client_risk.

Original DDL (kept for reference):

```sql
ALTER TABLE public.engine_review_items
  ADD COLUMN IF NOT EXISTS risk_score int NOT NULL DEFAULT 0
    CHECK (risk_score BETWEEN 0 AND 100);

CREATE INDEX IF NOT EXISTS engine_review_items_risk_score_idx
  ON public.engine_review_items (risk_score DESC, created_at DESC);

-- Trigger mirrors src/lib/engine-review-risk-score.ts so app + DB sort agree.
CREATE OR REPLACE FUNCTION public.tg_engine_review_items_risk_score()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  sev_fallback int := CASE NEW.severity
    WHEN 'critical' THEN 90
    WHEN 'high'     THEN 70
    WHEN 'medium'   THEN 45
    ELSE 20 END;
  impact  int := COALESCE(NEW.impact_score, sev_fallback);
  urgency int := COALESCE(NEW.urgency_score, sev_fallback);
  deadline_days numeric := CASE WHEN NEW.deadline_at IS NULL THEN NULL
    ELSE EXTRACT(EPOCH FROM (NEW.deadline_at - now())) / 86400 END;
  deadline_component int := CASE
    WHEN deadline_days IS NULL THEN 0
    WHEN deadline_days <= 0 THEN 100
    WHEN deadline_days <= 1 THEN 90
    WHEN deadline_days <= 3 THEN 75
    WHEN deadline_days <= 7 THEN 60
    WHEN deadline_days <= 14 THEN 40
    WHEN deadline_days <= 30 THEN 25
    ELSE 10 END;
  base numeric := impact * 0.4 + urgency * 0.4 + deadline_component * 0.2;
BEGIN
  IF NEW.client_risk IS TRUE THEN base := base + 10; END IF;
  NEW.risk_score := GREATEST(0, LEAST(100, ROUND(base)));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS engine_review_items_risk_score ON public.engine_review_items;
CREATE TRIGGER engine_review_items_risk_score
  BEFORE INSERT OR UPDATE OF severity, impact_score, urgency_score, deadline_at, client_risk
  ON public.engine_review_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_engine_review_items_risk_score();
```

App-side (already committed):
- `src/lib/engine-review-risk-score.ts` — pure fn shared by admin queue sort.

### Verification

```sql
SELECT id, severity, impact_score, urgency_score, deadline_at, risk_score
  FROM public.engine_review_items
 ORDER BY risk_score DESC LIMIT 10;
```

---

## Top-10 Gap Sweep — Phase 1 · Governance Gate (PROPOSED 2026-07-14, not applied)

**Purpose.** DB-side twin of `src/lib/engine-governance-gate.server.ts`. Adds a
single SECURITY DEFINER function `assert_official_transition()` and BEFORE
triggers on eight "official" tables so that no state transition to
`approved` / `published` / `sent` / `accepted` / `promoted` / `completed` can
land without: (1) role check, (2) no-self-approval, (3) approved review item
of the required kind, (4) completeness threshold, (5) audit-log row.

Extends the B12 pattern (milestones + impl_plans) to the full official set.
This is the DB tier the acceptance criteria in
`.orchestrator/audit/acceptance-criteria-2026-07-14c.md` require for Gate 0.

**Status.** NOT APPLIED. Ships when Tai approves. Application-tier module
already enforces the same rules and is safe on its own; DB triggers add
belt-and-suspenders + protection against direct SQL writes.

### SQL

```sql
-- 1. Function ---------------------------------------------------------------
create or replace function public.assert_official_transition(
  _artifact_type text,
  _artifact_id uuid,
  _next_state text,
  _actor_email text,
  _review_item_id uuid default null,
  _skip_completeness boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registry record;
  v_created_by text;
  v_project_id uuid;
  v_review record;
  v_audit_id uuid;
begin
  -- Registry: 8 official transitions.
  select * into v_registry from (values
    ('milestone',            'approved',  'engine_milestones',                        'created_by', 'milestone_approval',            'admin'),
    ('implementation_plan',  'approved',  'engine_project_implementation_plans',      'created_by', 'implementation_plan_approval',  'admin'),
    ('mockup',               'approved',  'engine_project_mockups',                   'created_by', 'mockup_approval',               'admin'),
    ('roadmap_version',      'published', 'engine_roadmap_versions',                  'created_by', 'roadmap_version_publish',       'admin'),
    ('delivery_item',        'sent',      'engine_delivery_items',                    'created_by', 'delivery_send',                 'admin'),
    ('portal_roadmap',       'published', 'client_portal_roadmaps',                   'created_by', 'portal_publish',                'admin'),
    ('business_engine_run',  'completed', 'engine_business_engine_runs',              'started_by', null,                            'admin'),
    ('intelligence_memory',  'promoted',  'engine_intelligence_memory',               'created_by', 'intelligence_memory_promotion', 'admin')
  ) as t(artifact_type, next_state, tbl, created_by_col, review_kind, required_role)
  where t.artifact_type = _artifact_type and t.next_state = _next_state;

  if not found then
    raise exception 'GOVERNANCE: unknown official transition %→%', _artifact_type, _next_state
      using errcode = 'P0001';
  end if;

  if _actor_email is null or _actor_email = '' then
    raise exception 'GOVERNANCE: actor_email required' using errcode = 'P0001';
  end if;

  -- Rule 1: role
  if not public.has_role_email(_actor_email, v_registry.required_role::app_role) then
    raise exception 'GOVERNANCE: actor % lacks role %', _actor_email, v_registry.required_role
      using errcode = 'P0001';
  end if;

  -- Rule 2: no self-approval — dynamic SQL because table varies.
  execute format(
    'select %I, project_id from public.%I where id = $1',
    v_registry.created_by_col, v_registry.tbl
  ) into v_created_by, v_project_id using _artifact_id;

  if v_created_by is null then
    raise exception 'GOVERNANCE: artifact % of type % not found', _artifact_id, _artifact_type
      using errcode = 'P0001';
  end if;

  if v_created_by = _actor_email then
    raise exception 'GOVERNANCE: actor % cannot approve their own %', _actor_email, _artifact_type
      using errcode = 'P0001';
  end if;

  -- Rule 3: review item present + approved (when required)
  if v_registry.review_kind is not null then
    if _review_item_id is null then
      raise exception 'GOVERNANCE: %→% requires review_item of kind %',
        _artifact_type, _next_state, v_registry.review_kind using errcode = 'P0001';
    end if;
    select id, kind, status, target_id
      into v_review
      from public.engine_review_items
     where id = _review_item_id;
    if not found then
      raise exception 'GOVERNANCE: review item % not found', _review_item_id using errcode = 'P0001';
    end if;
    if v_review.kind <> v_registry.review_kind then
      raise exception 'GOVERNANCE: review kind % does not match required %', v_review.kind, v_registry.review_kind
        using errcode = 'P0001';
    end if;
    if v_review.status not in ('approved', 'approved_with_conditions') then
      raise exception 'GOVERNANCE: review item status is %, not approved', v_review.status
        using errcode = 'P0001';
    end if;
    if v_review.target_id is not null and v_review.target_id <> _artifact_id then
      raise exception 'GOVERNANCE: review item targets a different artifact' using errcode = 'P0001';
    end if;
  end if;

  -- Rule 4: completeness (delegated to per-artifact helper unless skipped).
  -- Kept intentionally light in v1: callers pass _skip_completeness=false and
  -- the application-tier module performs the deep predicate. Future revision
  -- may inline per-table CHECK-style predicates here.

  -- Rule 5: audit row.
  insert into public.engine_audit_log (
    project_id, actor_email, action, summary, affected_modules, target_id, metadata
  ) values (
    v_project_id, _actor_email, 'official_transition',
    _artifact_type || ' → ' || _next_state,
    array[_artifact_type],
    _artifact_id,
    jsonb_build_object(
      'artifact_type', _artifact_type,
      'next_state', _next_state,
      'review_item_id', _review_item_id
    )
  ) returning id into v_audit_id;

  return v_audit_id;
end;
$$;

grant execute on function public.assert_official_transition(text, uuid, text, text, uuid, boolean)
  to authenticated, service_role;

-- 2. Generic BEFORE trigger factory -----------------------------------------
-- Each table gets its own trigger that calls assert_official_transition when
-- the row's status/state column moves into one of the registered "official"
-- states. Payload signature varies per table; we ship one trigger per table.

-- Example: milestones
create or replace function public.tg_engine_milestones_official_gate()
returns trigger language plpgsql as $$
declare v_actor text; v_review uuid;
begin
  if NEW.status = 'approved' and (OLD.status is null or OLD.status <> 'approved') then
    v_actor := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'email', session_user);
    v_review := (NEW.governance ->> 'review_item_id')::uuid;
    perform public.assert_official_transition(
      'milestone', NEW.id, 'approved', v_actor, v_review, false
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists tg_engine_milestones_official_gate on public.engine_milestones;
create trigger tg_engine_milestones_official_gate
  before update on public.engine_milestones
  for each row execute function public.tg_engine_milestones_official_gate();

-- Repeat for: implementation_plan, mockup, roadmap_version, delivery_item,
-- portal_roadmap, business_engine_run, intelligence_memory.
-- (Full 8-table trigger block will be finalized in the batch migration.)
```

### Rollback

```sql
drop trigger if exists tg_engine_milestones_official_gate on public.engine_milestones;
drop function if exists public.tg_engine_milestones_official_gate();
drop function if exists public.assert_official_transition(text, uuid, text, text, uuid, boolean);
```

### Verification

```sql
-- Self-approval must be rejected.
select public.assert_official_transition(
  'milestone', '<milestone-id>', 'approved', '<its-own-creator-email>', null, true
);
-- ERROR:  GOVERNANCE: actor <email> cannot approve their own milestone

-- Missing review must be rejected.
select public.assert_official_transition(
  'milestone', '<milestone-id>', 'approved', '<different-admin>', null, true
);
-- ERROR:  GOVERNANCE: milestone→approved requires review_item of kind milestone_approval

-- Happy path returns an audit uuid.
select public.assert_official_transition(
  'milestone', '<milestone-id>', 'approved', '<different-admin>', '<approved-review-id>', true
);
-- returns uuid
```

### Coordinated schema additions from Phases 3–11

The batch migration will also carry the following (each documented in its own
Phase output when written, but consolidated here so Tai reviews once):

- **Phase 3 (Gap #10):** `engine_intake_reviews` table + extraction-gate trigger.
- **Phase 4 (Gaps #5 + #6):** `engine_review_item_conditions` + close-block trigger + `approved_with_conditions` in review status allowlist.
- **Phase 5 (Gaps #3 + #9):** `engine_intelligence_memory` gains `client_id NOT NULL`, `pattern_is_generalizable`, `de_identified_payload`; RLS split for cross-client reads; `read_generalizable_patterns()` helper.
- **Phase 6 (Gap #7):** `client_portal_roadmaps.client_accepted_*` + `client_accept_delivery()` RPC + scheduler gate.
- **Phase 7 (Gap #8):** `tg_engine_projects_family_impact_notify` trigger.
- **Phase 8 (Gap #4):** `engine_agent_capability_catalog` seed table.
- **Phase 11 (E10):** `engine_milestones.recommendation` column.
- **Phase 11 (G10):** `engine_project_implementation_plans.field_approvals` column.

Each will be appended below when its phase completes so the final apply can
be reviewed as one coherent block.

---

## Phase 4A — Activation Spine Gate (F1 close-out)

**Origin:** Phase 4 verification spot-check 2026-07-14. `activate_business_engine` currently only checks `is_engine_staff()` + non-empty `owner_email`. It flips `proposed → approved → active` without consulting `spine_points_approved(project_id).ready` or `internal_project_has_contradictions(project_id)`, so the readiness banner in the engines UI is enforceable only client-side. Any staff can bypass by calling the RPC directly.

**Governance rule enforced:** an engine cannot go live for a project whose Point A + Point B canonical spine fields are not fully at `approved_truth`, or that has open contradictions on the spine. Mirrors the existing `engine_business_engines_gate` trigger for the `→ approved` transition, but must also hold at the RPC boundary since the RPC bypasses that gate by writing directly with `SECURITY DEFINER` privileges.

**Scope:** single function replacement. No table/column/policy changes. Idempotent (`CREATE OR REPLACE`).

### Preflight

- `public.spine_points_approved(uuid)` exists and returns `jsonb` with `ready` boolean. ✅ (Phase 4 applied)
- `public.internal_project_has_contradictions(uuid)` exists. ✅ (Phase 4 applied)
- `public.activate_business_engine(uuid, text)` currently at revision from migration `20260713173448`. ✅

### SQL

```sql
CREATE OR REPLACE FUNCTION public.activate_business_engine(_engine_id uuid, _owner_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.engine_business_engines%ROWTYPE;
  v_actor text := public.internal_caller_email();
  v_readiness jsonb;
  v_ready boolean;
  v_missing_a int;
  v_missing_b int;
BEGIN
  IF NOT public.is_engine_staff() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='insufficient_privilege';
  END IF;
  IF COALESCE(TRIM(_owner_email),'')='' THEN
    RAISE EXCEPTION 'owner_email required' USING ERRCODE='check_violation';
  END IF;

  SELECT * INTO v_row FROM public.engine_business_engines WHERE id=_engine_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Engine % not found', _engine_id USING ERRCODE='no_data_found';
  END IF;

  -- Spine gate: only enforce on transitions INTO approved/active. If the
  -- engine is already active, permit owner_email edits without re-gating.
  IF v_row.status <> 'active' THEN
    v_readiness := public.spine_points_approved(v_row.project_id);
    v_ready := COALESCE((v_readiness->>'ready')::boolean, false);
    v_missing_a := COALESCE(jsonb_array_length(v_readiness->'point_a'->'missing'), 0);
    v_missing_b := COALESCE(jsonb_array_length(v_readiness->'point_b'->'missing'), 0);

    IF NOT v_ready THEN
      RAISE EXCEPTION 'Cannot activate engine %: spine not ready (point_a missing=%, point_b missing=%, contradictions=%)',
        _engine_id, v_missing_a, v_missing_b,
        COALESCE((v_readiness->>'has_active_contradictions')::boolean, false)
        USING ERRCODE='check_violation';
    END IF;

    IF public.internal_project_has_contradictions(v_row.project_id) THEN
      RAISE EXCEPTION 'Cannot activate engine %: project has active spine contradictions', _engine_id
        USING ERRCODE='check_violation';
    END IF;
  END IF;

  IF v_row.status <> 'approved' AND v_row.status <> 'active' THEN
    UPDATE public.engine_business_engines
       SET status='approved', approved_by=v_actor,
           approved_at=COALESCE(approved_at, now()), owner_email=_owner_email
     WHERE id=_engine_id;
  ELSE
    UPDATE public.engine_business_engines SET owner_email=_owner_email WHERE id=_engine_id;
  END IF;

  UPDATE public.engine_business_engines
     SET status='active',
         next_run_at=COALESCE(next_run_at, public.internal_engine_next_run(v_row.cadence, now()))
   WHERE id=_engine_id;

  INSERT INTO public.engine_audit_log (project_id, actor_email, action, entity_type, entity_id, detail)
  VALUES (v_row.project_id, v_actor, 'engine.activated', 'business_engine', _engine_id,
    jsonb_build_object('owner_email', _owner_email, 'cadence', v_row.cadence,
      'spine_ready', true));
END; $$;

REVOKE ALL ON FUNCTION public.activate_business_engine(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_business_engine(uuid, text) TO authenticated, service_role;
```

### Smoke tests (post-apply)

1. **Blocked when not ready:** pick a project with `spine_points_approved(p).ready = false`, create a draft engine, call `activate_business_engine(engine, 'x@y.com')` → expect `check_violation` mentioning missing counts.
2. **Blocked on contradictions:** ready project + open contradiction → expect `check_violation` mentioning contradictions.
3. **Allowed when ready:** ready project, no contradictions → succeeds, row lands at `status='active'`, audit row written with `spine_ready=true`.
4. **Idempotent on already-active:** re-call on an active engine with a new owner email → updates `owner_email`, does NOT re-gate (allows ops to reassign owner without re-clearing spine).
5. **UI parity:** confirm engines page Activate button remains `disabled` when `readiness.ready === false` (already implemented at `engine.projects.$projectId.engines.tsx:135`).

### Rollback

Restore the prior body from `supabase/migrations/20260713173448_dd44a646-e587-4b57-9fff-d341f5828fa9.sql` lines 72–95.

Status: **APPLIED 2026-07-14.** Closes Phase 4 F1. F2 verified in place. F3 verified in place.


---

## Phase H1.b — Cost-Overrun Auto-Pause NOTIFICATIONS (trigger enhancement)

**Status: PENDING TAI REVIEW — NOT YET APPLIED.**

Pairs with the app-side hook `POST /api/public/hooks/cost-autopause` and the
`cost-overrun-autopause` email template. Extends the existing
`tg_engine_agent_costs_cap_guard()` function so that whenever it flips a
project into the cost-paused state, it fires an async `pg_net.http_post` to
the hook with the project name, spend, budget, reason, and paused_at. The
hook dispatches Slack (if `SLACK_WEBHOOK_URL` is set) and enqueues one
`cost-overrun-autopause` email per operator/admin email.

### Prerequisites

1. App containing `src/routes/api/public/hooks/cost-autopause.ts` deployed.
2. `pg_net` extension enabled (`CREATE EXTENSION IF NOT EXISTS pg_net;`).
3. Optional: workspace secret `SLACK_WEBHOOK_URL` set for Slack alerts. Without
   it, email-only alerts still ship.

### Migration SQL (do not apply until reviewed)

```sql
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.tg_engine_agent_costs_cap_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_budget integer;
  v_spend integer;
  v_already_paused timestamptz;
  v_project_name text;
  v_paused_at timestamptz;
  v_reason text;
  v_hook_url text := 'https://project--b3555ed3-b0dc-4def-8fee-77ff34a2cb82.lovable.app/api/public/hooks/cost-autopause';
  v_apikey text := 'sb_publishable_mF24_o-spzzxHlB3i3jDkA_8euIpH9o';
BEGIN
  SELECT agent_budget_monthly_cents, cost_paused_at, name
    INTO v_budget, v_already_paused, v_project_name
  FROM public.engine_projects WHERE id = NEW.project_id;

  IF v_budget IS NULL OR v_budget <= 0 THEN RETURN NEW; END IF;
  IF v_already_paused IS NOT NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(cost_cents), 0) INTO v_spend
  FROM public.engine_agent_costs
  WHERE project_id = NEW.project_id
    AND created_at >= date_trunc('month', now());

  IF v_spend > v_budget THEN
    v_paused_at := now();
    v_reason := format(
      'Month-to-date spend $%s exceeded budget $%s',
      to_char(v_spend/100.0, 'FM999,999,990.00'),
      to_char(v_budget/100.0, 'FM999,999,990.00'));

    UPDATE public.engine_projects
       SET cost_paused_at = v_paused_at,
           cost_paused_reason = v_reason
     WHERE id = NEW.project_id;

    INSERT INTO public.engine_review_items
      (project_id, project, item_type, title, impact, source, status)
    VALUES
      (NEW.project_id, v_project_name, 'cost_overrun',
       format('Cost cap exceeded — project auto-paused ($%s / $%s)',
              to_char(v_spend/100.0, 'FM999,999,990.00'),
              to_char(v_budget/100.0, 'FM999,999,990.00')),
       'high', 'cost_guard_auto', 'pending');

    INSERT INTO public.engine_audit_log
      (project_id, action, actor_email, field_changed, old_value, new_value, reason, metadata)
    VALUES
      (NEW.project_id, 'project.cost.autopause', 'system:cost_guard',
       'cost_paused_at', NULL, v_paused_at::text, v_reason,
       jsonb_build_object('spend_cents', v_spend, 'budget_cents', v_budget,
                          'triggering_cost_id', NEW.id));

    -- Async notification dispatch. pg_net queues the request; failures
    -- here do NOT roll back the auto-pause (best-effort alerting).
    PERFORM net.http_post(
      url := v_hook_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', v_apikey),
      body := jsonb_build_object(
        'project_id',   NEW.project_id,
        'project_name', v_project_name,
        'spend_cents',  v_spend,
        'budget_cents', v_budget,
        'reason',       v_reason,
        'paused_at',    v_paused_at));
  END IF;

  RETURN NEW;
END $$;
```

### Verification (post-apply)

1. Insert a synthetic `engine_agent_costs` row that pushes a test project over
   its budget.
2. Confirm the project is auto-paused (as before).
3. Query `net.http_request_queue` / `net._http_response` — confirm a POST to
   `/api/public/hooks/cost-autopause` was queued and returned 200.
4. Check `email_send_log` for one `template_name='cost-overrun-autopause'` row
   per operator/admin recipient with `status IN ('pending','sent')`.
5. If `SLACK_WEBHOOK_URL` is configured, confirm the Slack alert lands.

### Rollback

Restore the prior body of `tg_engine_agent_costs_cap_guard` from
`supabase/migrations/20260714175046_aabe47e4-131b-4cd5-a2ef-488d2dda13a6.sql`
(lines 10–71).

---

## RT-1 — Roadmap Synthesis persistence

Status: **APPLIED (2026-07-18)**.

Adds durable state + attempt history so the orchestrator can distinguish
`failed` / `stale` from `missing`, coalesce concurrent runs, and store
approved-truth-safe candidates for reviewer promotion. Until this lands,
`getRoadmapSynthesisPlan` returns `attempts_available: false` and step
state is re-derived from existing artifacts each call.

```sql
CREATE TABLE public.engine_project_synthesis_step_state (
  project_id uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  step_id text NOT NULL,
  state text NOT NULL,
  reason text,
  current_input_hash text,
  latest_attempt_id uuid,
  latest_candidate_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, step_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_project_synthesis_step_state TO authenticated;
GRANT ALL ON public.engine_project_synthesis_step_state TO service_role;
ALTER TABLE public.engine_project_synthesis_step_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage synthesis step state"
  ON public.engine_project_synthesis_step_state FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.engine_project_synthesis_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_group_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  step_id text NOT NULL,
  trigger text NOT NULL,
  actor_email text,
  input_manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  input_hash text NOT NULL,
  prompt_version text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL,
  error_message text
);
CREATE INDEX ON public.engine_project_synthesis_attempts (project_id, step_id, started_at DESC);
GRANT SELECT, INSERT ON public.engine_project_synthesis_attempts TO authenticated;
GRANT ALL ON public.engine_project_synthesis_attempts TO service_role;
ALTER TABLE public.engine_project_synthesis_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read attempts"
  ON public.engine_project_synthesis_attempts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins insert attempts"
  ON public.engine_project_synthesis_attempts FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.engine_project_synthesis_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  step_id text NOT NULL,
  attempt_id uuid REFERENCES public.engine_project_synthesis_attempts(id) ON DELETE SET NULL,
  payload jsonb NOT NULL,
  materiality text NOT NULL,
  qualification jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'awaiting_review',
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewer_email text,
  decision text,
  decision_reason text
);
CREATE INDEX ON public.engine_project_synthesis_candidates (project_id, step_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.engine_project_synthesis_candidates TO authenticated;
GRANT ALL ON public.engine_project_synthesis_candidates TO service_role;
ALTER TABLE public.engine_project_synthesis_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage candidates"
  ON public.engine_project_synthesis_candidates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
```

Notes:
- No CHECK constraints on `state` / `status` / `decision` — enum-like
  values are validated in server code so we don't get stuck on a bad
  migration when new states ship.
- `latest_candidate_id` intentionally has no FK so we can null-safe write
  the state row before the candidate exists (chicken/egg on first run).
- Doctrine gate keys (`world-entry`, `execution-boundary`, `strategic-thesis`)
  reuse `engine_spine_field_truth` — no new table needed.

## RT-2 — Allow `world-entry` (and future doctrine gates) in engine_spine_field_truth.spine_check

**Why**: RT-2 currently persists World Entry state to a sidecar bucket on
`engine_projects.spirit_first_analysis.world_entry_workspace` because the
existing `engine_spine_field_truth_spine_check` constraint only allows
`point-a | point-b`. To promote World Entry (and later Execution Boundary,
Strategic Thesis, Drift Assessment) onto the durable spine truth table with
the same evidence/second-reviewer guarantees, the constraint must be widened.

**Proposed migration** (for Tai to review — DO NOT APPLY autonomously):

```sql
ALTER TABLE public.engine_spine_field_truth
  DROP CONSTRAINT engine_spine_field_truth_spine_check;

ALTER TABLE public.engine_spine_field_truth
  ADD CONSTRAINT engine_spine_field_truth_spine_check
  CHECK (spine = ANY (ARRAY[
    'point-a'::text,
    'point-b'::text,
    'world-entry'::text,
    'execution-boundary'::text,
    'strategic-thesis'::text,
    'drift-assessment'::text
  ]));
```

After apply, migrate readers in `src/lib/roadmap-synthesis/gates.ts` and
writers in `src/lib/engine-world-entry*.functions.ts` from the sidecar to
`engine_spine_field_truth` with `spine = 'world-entry'`.
