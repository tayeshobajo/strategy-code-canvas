# Phase 4B Output — Spine Governance
*Completed: 2026-07-11*

## Status
- 🟠 BLOCKED on migration

## What I found
- There is **no** `engine_spine_versions`, `engine_project_versions`, or other spine-specific field history table in `src/integrations/supabase/types.ts`.
- Approved spine content is stored directly on `engine_projects.point_a` and `engine_projects.point_b`.
- The current edit path is `updateProjectStep` in `src/lib/engine.functions.ts`, which updates those columns directly.
- Existing protection only prevents overwriting approved `point-a` / `point-b` content without first resetting the step state. It does **not** capture a reason, approver, field diff, or spine-specific activity event.
- Existing audit infrastructure does exist:
  - `engine_audit_log` supports `field_changed`, `old_value`, `new_value`, and `reason`
  - `engine_activity` exists for project-feed events
- Existing diff infrastructure also exists for full roadmap versions:
  - `engine_roadmap_versions`
  - `/engine/projects/$projectId/versions/compare`

## Why Phase 4B is blocked
The governance requirement needs a durable field-level history record for approved spine changes. That record does not exist today, and per instructions no Supabase migration can be applied autonomously.

Without the new table, the system cannot safely satisfy:
- field-by-field version history
- old vs new diff review for spine changes
- required reason + approver linkage on every approved spine change

## What I built anyway
- `src/components/engine/SpineVersionHistory.tsx`
  - Collapsible placeholder panel
  - Clearly states version history is pending migration
  - Surfaces the blocking dependency on `engine_spine_versions`
- `src/routes/engine.projects.$projectId.spine.tsx`
  - Wired in the placeholder panel so the operator sees the governance gap in the Spine UI
- `.orchestrator/PENDING_MIGRATIONS.md`
  - Added the required `engine_spine_versions` migration spec and SQL stub

## Required migration
Add `engine_spine_versions` with:
- `project_id`
- `field_name`
- `old_value`
- `new_value`
- `reason`
- `approver_email`
- `changed_by`
- `changed_at`
- `metadata`

## Next implementation step after Tai approves migration
1. Add a dedicated approved-spine mutation that requires `reason`
2. Insert `engine_spine_versions` row for each approved spine field change
3. Insert `engine_activity` row with `kind = spine_field_changed`
4. Replace the placeholder panel with a real diff/history viewer
