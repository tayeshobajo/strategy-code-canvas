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
