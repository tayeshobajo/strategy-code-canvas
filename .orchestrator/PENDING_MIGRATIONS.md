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

## Phase 1 — Epistemic-Status Taxonomy (Truth Model) — **REVISION R2**

Status: **PENDING TAI REVIEW** — do not apply. Supersedes R1 (never applied).

### What changed from R1

1. **Enum widened from 5 → 8 values.** Adds `missing`, `needs_confirmation`,
   `approved_truth`. Splits `verified` (evidence supports it) from
   `approved_truth` (a human with authority promoted it to canonical).
2. **No `unclassified` in the enum.** Absence of a row is the neutral
   state. UI renders a distinct "No status" pill, never `inferred`.
3. **Field-key drift guardrail.** All writes are validated in-app against
   `POINT_B_FIELD_KEYS` / a Point A base-key allowlist plus the
   `diagnosis:<title>` namespace. SQL is unchanged; enforcement is
   server-side because sidecars remain jsonb (see §7 for the normalized
   alternative Tai can choose instead).
4. **Evidence rules per status** (enforced in
   `src/lib/engine-epistemic.server.ts#assertEvidenceForStatus`; see §5).

### Design decisions

1. **Enum `epistemic_status`** — 8 values:
   `stated | inferred | assumed | missing | contradicted | needs_confirmation | verified | approved_truth`.
2. **`engine_extracted_signals`** — `status` (default `inferred`),
   `source_ref` jsonb, `superseded_by` FK. Unchanged from R1.
3. **`engine_projects`** — sidecar jsonb columns `point_a_status`,
   `point_b_status`. Comment references the allowlist.
4. **`engine_project_chat_events`** — `epistemic_delta` jsonb. Unchanged.
5. **`has_contradictions(_project_id uuid)`** RPC. Unchanged.

### Evidence rules (app-layer, not SQL)

| Status | Rule |
|---|---|
| `stated` | `kind ∈ {intake_answer,transcript,operator_note}` AND (`id` OR `operator_confirmed_by`) |
| `inferred` | `kind='ai_inference'` + `model` + `prompt_ref` (AI) or human override |
| `assumed` | `kind='working_assumption'` + `rationale` (AI) or human override |
| `missing` | `kind='gap_note'` or human override |
| `contradicted` | `kind='conflict'` + `conflicting_source_ids[≥2]` (AI) or human override + `reason` |
| `needs_confirmation` | `reason` string or human override |
| `verified` | `evidence_id` OR (`id`+`quote`+`timestamp`) (AI) or human override |
| `approved_truth` | `approval_kind='ceremony'` + `ceremony_id`, OR `approval_kind='operator_override'` + `operator_confirmed_by`. AI is blocked at `assertStatusAllowedForActor`. |

Human writes go through `createServerFn` with `requireSupabaseAuth`; the
handler injects `operator_confirmed_by` from `context.claims.email` before
calling the rule. `ceremony_id` becomes a real FK once Phase 2 lands.

### Proposed SQL (Variant A — sidecar jsonb, RECOMMENDED)

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

-- 3. Spine sidecar columns. Field-key allowlist enforced in app layer
--    via `src/lib/engine-spine-fields.ts` (see server-fn validators).
ALTER TABLE public.engine_projects
  ADD COLUMN point_a_status jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN point_b_status jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.engine_projects.point_a_status IS
  'Map keyed by POINT_A_BASE_FIELD_KEYS or ''diagnosis:<title>''. Enforced by server fns.';
COMMENT ON COLUMN public.engine_projects.point_b_status IS
  'Map keyed by POINT_B_FIELD_KEYS. Enforced by server fns.';

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

### Alternative — Variant B (normalized field-truth table)

Ships instead of the two sidecar columns above. Tighter integrity at the
cost of one join per read. Not recommended for R2 (adds table + policies +
grants to the same migration); documented so Tai can pick it explicitly.

```sql
CREATE TABLE public.engine_spine_field_truth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  spine text NOT NULL CHECK (spine IN ('point-a','point-b')),
  field_key text NOT NULL,
  status public.epistemic_status NOT NULL,
  source_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_email text,
  UNIQUE (project_id, spine, field_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_spine_field_truth TO authenticated;
GRANT ALL ON public.engine_spine_field_truth TO service_role;

ALTER TABLE public.engine_spine_field_truth ENABLE ROW LEVEL SECURITY;

-- Reuses the same "team members read" pattern used by engine_extracted_signals.
CREATE POLICY "Team members read spine field truth"
  ON public.engine_spine_field_truth FOR SELECT
  TO authenticated USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'operator')
    OR public.has_role(auth.uid(), 'team')
  );

CREATE POLICY "Operators write spine field truth"
  ON public.engine_spine_field_truth FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'));
```

If Variant B is picked, drop the two sidecar `ALTER TABLE ... ADD COLUMN
point_*_status` blocks from Variant A and adapt the server functions
accordingly.

### Preflight (unchanged, updated column check)

```sql
SELECT count(*) FROM public.engine_extracted_signals;

SELECT column_name FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('engine_extracted_signals','engine_projects','engine_project_chat_events')
  AND column_name IN ('status','source_ref','superseded_by',
                      'point_a_status','point_b_status','epistemic_delta');
-- Expected: zero rows for the sidecar/delta columns.
```

### Rollback (Variant A)

```sql
DROP FUNCTION IF EXISTS public.has_contradictions(uuid);
ALTER TABLE public.engine_project_chat_events DROP COLUMN IF EXISTS epistemic_delta;
ALTER TABLE public.engine_projects
  DROP COLUMN IF EXISTS point_a_status,
  DROP COLUMN IF EXISTS point_b_status;
DROP INDEX IF EXISTS engine_extracted_signals_status_idx;
ALTER TABLE public.engine_extracted_signals
  DROP COLUMN IF EXISTS superseded_by,
  DROP COLUMN IF EXISTS source_ref,
  DROP COLUMN IF EXISTS status;
DROP TYPE IF EXISTS public.epistemic_status;
```

### App-layer already shipped (does NOT require the migration)

- `src/lib/engine-epistemic.server.ts` — 8-value enum, discriminated
  source-ref union, `assertEvidenceForStatus`, `assertKnownFieldKey`,
  `enrichSourceRefForHuman`, `AI_WRITABLE_STATUSES` expanded.
- `src/lib/engine-spine-fields.ts` — canonical allowlist.
- `src/lib/engine-epistemic.functions.ts` — both write handlers call the
  new assertions; unknown field keys are rejected.
- `src/components/engine/EpistemicStatusChip.tsx` — neutral "No status"
  pill when the field has no row; popover exposes all 8 statuses and
  builds a per-status source ref that server enrichment finalises.
- Point A cards now key statuses as `diagnosis:<title>` (matches
  allowlist).

### Follow-ups (NOT in this migration)

- Phase 2: `ceremony_id` real FK on `approved_truth` entries.
- Phase 1B: contradiction resolver UI.
- Phase 3: strip sidecar status from `buildClientSafePayload`.
- Phase 5: agents write initial statuses for the current backlog.


