# RT-3 — Execution Boundary + Capability Registry

Replace the in-memory `CAPABILITY_MENU` in `src/lib/roadmap-synthesis/capability-menu.ts` with a versioned, DB-backed registry, and add a per-project **Execution Boundary** approval workspace that produces the two truth rows the RT-1 gate already reads (`approved_capabilities`, `client_owned_areas`).

## Goals

1. Capability menu is durable, versioned, and edited by admins — not a code constant.
2. Every project has an explicit, approved Execution Boundary: which capabilities are in scope, which areas the client owns, what's explicitly excluded.
3. Boundary changes are auditable, versioned, and invalidate the RT-1 synthesis steps that depend on them (materiality already handles this).

## Deliverables

### 1. Database (goes to `.orchestrator/PENDING_MIGRATIONS.md` — NOT applied)

Two new tables + one revision to `capability-menu.ts` shim:

- **`engine_capability_registry`** — one row per capability version.
  - `capability_id` (text), `version` (int), `label`, `category`, `execution_mode`, `description`, `retired_at`, `created_by`, standard timestamps.
  - Unique on `(capability_id, version)`; view `engine_capability_registry_current` returns latest non-retired per `capability_id`.
  - `engine_capability_menu_version` singleton row holding a semver-ish string bumped on any change.
  - Grants: `SELECT` to `authenticated`; `ALL` to `service_role`. RLS: authenticated read-all; writes only via server fn (admin-gated).

- **`engine_project_execution_boundary`** — one active row per project + version history.
  - `project_id`, `version` (int, monotonic), `status` (`draft` | `proposed` | `approved` | `superseded`), `capability_ids` (text[]), `client_owned_areas` (text[]), `exclusions` (text[]), `notes`, `proposed_by`, `approved_by`, `approved_at`, standard timestamps.
  - Constraint: `proposed_by <> approved_by` when `status = 'approved'` (second-reviewer rule, same as World Entry).
  - Grants + RLS scoped to project members via existing helper. Trigger: on approval, upsert two rows into `engine_spine_field_truth` for `execution_boundary` field (`approved_capabilities`, `client_owned_areas`) with `status = 'approved_truth'` so the existing RT-1 gate flips green automatically.

### 2. App layer (built now, safe pre-migration)

- **`src/lib/engine-capability-registry.functions.ts`** — `listCapabilities()`, `getCapabilityMenuVersion()`, `upsertCapability()` (admin), `retireCapability()` (admin). Falls back to `CAPABILITY_MENU` constant when the table is missing so builds don't break pre-migration.
- **`src/lib/roadmap-synthesis/capability-menu.ts`** — convert `CAPABILITY_MENU` + `CAPABILITY_MENU_VERSION` to async loaders (`loadCapabilityMenu()`, `loadCapabilityMenuVersion()`) with the constant as fallback. Update `qualification.ts` and `plan.server.ts` call sites.
- **`src/lib/engine-execution-boundary.functions.ts`**:
  - `getProjectExecutionBoundary(projectId)` — latest row + full version history.
  - `proposeExecutionBoundary(projectId, { capability_ids, client_owned_areas, exclusions, notes })` — creates `proposed` row.
  - `approveExecutionBoundary(boundaryId)` — enforces separate-reviewer, marks approved, writes truth rows via `engine_activity` guard.
  - `rejectExecutionBoundary(boundaryId, reason)`.
  - `aiDraftExecutionBoundary(projectId)` — LLM call using World Entry + intake to propose a draft.

### 3. UI

- **`/admin/capability-registry`** — table view: capabilities with version, category, execution mode, retire toggle, "New capability" and "Bump version" actions. Behind admin role.
- **`/engine/projects/$projectId/execution-boundary`** — new route in the project rail:
  - Left: capability picker grouped by category with checkboxes; shows current menu version.
  - Middle: client-owned areas + exclusions editors (chip inputs).
  - Right: status card (Draft / Proposed / Approved), reviewer info, "Propose", "AI draft", "Approve" (disabled when current user is proposer), version history list with diff to previous.
- Add "Execution Boundary" pill to `SpineReadinessPanel` linking here when the gate is unsatisfied.
- Add nav entry to `LeftProjectRail`.

### 4. Wiring

- Synthesis materiality already lists `execution_boundary_version` in the input manifest — bumping capability menu version or approving a new boundary triggers staleness on dependent steps automatically.
- `engine_activity` entries: `execution_boundary_proposed`, `execution_boundary_approved`, `execution_boundary_rejected`, `capability_registered`, `capability_retired`.

## Out of scope (deferred to RT-4+)

- LLM judges for world/wow gates.
- Client-portal visibility of the approved boundary (portal is downstream-only; will consume once approved via existing publish pipeline).
- Automatic capability suggestions from World Entry vocabulary.

## Files touched

New: 3 server-fn modules, 2 routes, 1 diff component, migration spec.
Modified: `capability-menu.ts`, `qualification.ts`, `plan.server.ts`, `LeftProjectRail.tsx`, `SpineReadinessPanel.tsx`, `admin.tsx` nav.

## Migration handling

Per project doctrine (`CLAUDE.md`): the SQL for both tables + view + trigger goes to `.orchestrator/PENDING_MIGRATIONS.md` for Tai review, NOT applied. App code ships with fallback so the build stays green; the DB-backed path activates once Tai runs the migration.
