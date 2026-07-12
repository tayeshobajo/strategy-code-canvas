# Pending Migrations — Require Tai Review Before Applying

## Phase 6C — Roadmap Acknowledgment Columns

Add to engine_projects table:

- acknowledged_roadmap_version TEXT NULL
- acknowledged_at TIMESTAMPTZ NULL
- acknowledged_by TEXT NULL

SQL:
ALTER TABLE engine_projects
ADD COLUMN IF NOT EXISTS acknowledged_roadmap_version TEXT,
ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS acknowledged_by TEXT;

Status: PENDING_TAI — do not apply until Tai reviews

## Phase 4B — Spine Governance Version History

Add a dedicated field-level history table for approved Spine changes:

- Table: `engine_spine_versions`
- Required columns:
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `project_id UUID NOT NULL REFERENCES engine_projects(id) ON DELETE CASCADE`
  - `field_name TEXT NOT NULL`
  - `old_value JSONB NULL`
  - `new_value JSONB NULL`
  - `reason TEXT NOT NULL`
  - `approver_email TEXT NOT NULL`
  - `changed_by TEXT NOT NULL`
  - `changed_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`
- Recommended indexes:
  - `(project_id, changed_at DESC)`
  - `(project_id, field_name, changed_at DESC)`

SQL:
CREATE TABLE IF NOT EXISTS public.engine_spine_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.engine_projects(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  old_value JSONB NULL,
  new_value JSONB NULL,
  reason TEXT NOT NULL,
  approver_email TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_engine_spine_versions_project_changed
  ON public.engine_spine_versions (project_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_engine_spine_versions_project_field_changed
  ON public.engine_spine_versions (project_id, field_name, changed_at DESC);

Status: PENDING_TAI — do not apply until Tai reviews

## Phase 9C — AI Self-Assessment Prevention

### Problem
The `engine_milestones` table has a `created_by_kind` TEXT column (NOT NULL, default observed
in existing rows). The `engine_tasks` table has an `ai_generated` BOOLEAN column (NOT NULL).

Currently there is no DB-level constraint preventing an AI-sourced actor from:
1. Marking a milestone `status = 'complete'` or `approval_status = 'approved'`
2. Marking a task `status = 'done'` or `status = 'accepted'` when `ai_generated = true`

This means Captain can, in theory, mark its own work as done — violating the human-in-the-loop
principle that is core to the Roadmap Engine's trust model.

### Constraint Spec

**Constraint 1 — engine_milestones: no AI self-approval**

Block any row where `created_by_kind` is an AI actor from having `approval_status = 'approved'`
unless a human `approved_by_email` is also set.

```sql
ALTER TABLE public.engine_milestones
ADD CONSTRAINT no_ai_self_approval
CHECK (
  -- If created by AI, an approver email must be set to approve it
  NOT (
    created_by_kind IN ('ai', 'captain', 'agent', 'system_agent', 'pipeline')
    AND approval_status = 'approved'
    AND (approved_by_email IS NULL OR approved_by_email = '')
  )
);
```

**Constraint 2 — engine_tasks: no AI self-completion**

Block ai_generated tasks from reaching terminal "accepted" or "verified" status without
a human owner_email.

```sql
ALTER TABLE public.engine_tasks
ADD CONSTRAINT no_ai_self_completion
CHECK (
  NOT (
    ai_generated = true
    AND status IN ('done', 'accepted', 'verified', 'complete', 'completed')
    AND (owner_email IS NULL OR owner_email = '')
  )
);
```

**Constraint 3 — engine_milestones: completion requires human actor on AI-created rows**

```sql
ALTER TABLE public.engine_milestones
ADD CONSTRAINT no_ai_self_complete
CHECK (
  NOT (
    created_by_kind IN ('ai', 'captain', 'agent', 'system_agent', 'pipeline')
    AND status IN ('complete', 'completed', 'done')
    AND (approved_by_email IS NULL OR approved_by_email = '')
  )
);
```

### Pre-flight check (run BEFORE applying constraints)

Verify no existing rows would violate the constraints:

```sql
-- Check constraint 1 violations
SELECT id, name, created_by_kind, approval_status, approved_by_email
FROM engine_milestones
WHERE created_by_kind IN ('ai', 'captain', 'agent', 'system_agent', 'pipeline')
  AND approval_status = 'approved'
  AND (approved_by_email IS NULL OR approved_by_email = '');

-- Check constraint 2 violations
SELECT id, name, ai_generated, status, owner_email
FROM engine_tasks
WHERE ai_generated = true
  AND status IN ('done', 'accepted', 'verified', 'complete', 'completed')
  AND (owner_email IS NULL OR owner_email = '');

-- Check constraint 3 violations
SELECT id, name, created_by_kind, status, approved_by_email
FROM engine_milestones
WHERE created_by_kind IN ('ai', 'captain', 'agent', 'system_agent', 'pipeline')
  AND status IN ('complete', 'completed', 'done')
  AND (approved_by_email IS NULL OR approved_by_email = '');
```

If any query returns rows, backfill `approved_by_email` / `owner_email` on those rows before
applying the constraints — or adjust `created_by_kind` values to non-AI categories if they
were miscategorized.

### Also note
After applying, the application layer (`approveChatProposal`, `updateChatProposalStatus`,
any status-mutation server functions) will need to ensure they pass `approved_by_email` /
`owner_email` whenever they operate on AI-generated rows. This is already enforced by
`approveChatProposal` (which requires staff email), but should be audited for milestone
status update paths.

Status: PENDING_TAI — DO NOT APPLY until:
1. Pre-flight queries above return zero rows (or rows are backfilled)
2. Tai explicitly approves
3. Apply during a low-traffic window (constraints are instant for small tables but worth confirming)
