## G-4 — No more half-born projects

### Problem (audit-confirmed)

`createProjectFromSource` inserts six sibling rows best-effort (project agent, agent permissions, v0.0 roadmap container, portal project, portal permission, portal back-link). Any failure logs an `integrity_warning` in `engine_activity` and continues. Result: an `engine_projects` row can exist without agent config, without a container version, or without portal linkage, and the intake UI reports success. `verifyProjectIntegrity` already exists as a diagnostic, but nothing gates on it.

### Contract this change enforces

1. **Every project declares its delivery mode at creation.**
2. **Hard-required siblings are always required** — a project with no agent config or no v0.0 container is never created.
3. **Portal linkage is required only when the project is client-facing** — internal experiments do not force a portal project.
4. **On any required-sibling failure, the project is rolled back**, not left half-born.

### Design

#### 1. New column: `engine_projects.delivery_mode`

Migration adds:
- Enum type `engine_delivery_mode`: `internal_only | client_portal_required`.
- Column `delivery_mode engine_delivery_mode NOT NULL DEFAULT 'client_portal_required'`.
  - Default is client-facing because that's the shipping-product norm; operators opt into `internal_only` for experiments.

Backfill for existing rows: any row with `client_portal_project_id IS NOT NULL` stays `client_portal_required`; rows without a linked portal but with a `client_id` whose `contact_email` is null become `internal_only`; anything else stays the default.

#### 2. Extend `CreateInput` for `createProjectFromSource`

Accept optional `deliveryMode: 'internal_only' | 'client_portal_required'`. If not supplied, derive:
- Contact email present (either via `newClient.contact_email` or the resolved existing client) → `client_portal_required`.
- Otherwise → `internal_only`.

Store the resolved mode on `engine_projects.delivery_mode` in the initial insert.

#### 3. Integrity gate — replace best-effort with fail-and-rollback

After the sibling insert block, call an inline `assertProjectIntegrity(projectId, deliveryMode)` helper:

- **Always required:** `engine_project_agents`, `engine_agent_permissions`, `engine_roadmap_versions` (v0.0 container).
- **Additionally required when `delivery_mode = 'client_portal_required'`:** `client_portal_project_id` link on `engine_projects`, `client_portal_projects` row, at least one non-revoked `client_portal_permissions` row.
- On mismatch: log a single `integrity_failure` `engine_activity` (kept for audit), then delete the just-created `engine_projects` row. FK cascades handle sibling rows for the tables that already cascade; explicitly delete the agent/permission/version rows for those that don't. Then `throw new Error("Project creation failed integrity check: <missing list>")`. Do not proceed to source insert or pipeline kick-off.
- If `client_portal_required` and no contact email is available, refuse at the top of the handler with a clear error before any inserts run — avoids the wasted round-trip.

#### 4. Keep `verifyProjectIntegrity` as ongoing diagnostic

Extend it to also return `delivery_mode` and adjust the `ok` calculation: missing portal rows are only a failure when `delivery_mode = 'client_portal_required'`. Internal-only projects with no portal linkage report `portal_project: null` and stay `ok: true`.

### Files touched

- **Migration** (new): add enum + `delivery_mode` column + backfill.
- **`src/integrations/supabase/types.ts`**: regenerated after migration approval (automatic).
- **`src/lib/engine-project-intake.functions.ts`**:
  - Extend `CreateInput` with optional `deliveryMode`.
  - Resolve/set `delivery_mode` on the project insert.
  - Add `assertProjectIntegrity` inline helper; call it before source insert / pipeline kick-off.
  - Rollback path: delete the project row on failure, log `integrity_failure`, throw.
  - Extend `verifyProjectIntegrity` to honour `delivery_mode`.
- **Guard test** (new): `src/lib/__tests__/project-integrity-rollback.test.ts`
  - `createProjectFromSource` source contains `assertProjectIntegrity` call before source insert.
  - Rollback deletes the project row on failure (asserted by grep on the rollback branch).
  - `client_portal_required` with no contact email throws before any insert (regex).
  - `verifyProjectIntegrity` returns `ok: true` for internal_only projects with no portal linkage.
- **`.lovable/engine-qa-audit.md`**: add G-4 closure log entry.

### What this plan explicitly does **not** do

- No wrap in a Postgres transaction / RPC-based single-shot insert (would need a `SECURITY DEFINER` function; over-engineered for the win here — sequential inserts + rollback is enough and easier to audit).
- No change to `submitPortalOnboarding` or `createSource` — those don't create engine projects.
- No UI surfacing of `delivery_mode` in the intake form yet — the auto-derive rule covers today's flows, and an explicit toggle can land in a follow-up.

### Success criteria

- Migration approved and applied; `engine_projects.delivery_mode` exists with the enum and correct default.
- New tests pass.
- Existing G-0…G-3 guard tests still pass.
- Manually simulated failure of any required sibling insert during creation results in the `engine_projects` row being gone and the caller receiving an error (verifiable via a follow-up ops check).

Ready to switch to build mode when you approve.
