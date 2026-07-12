# Phase 1C Output — Platform Configuration

**Status:** ✅ COMPLETE  
**Commit:** `5c4e127d2b3b00589ec6af36e45103f3a5036971`  
**Completed:** 2026-07-12 CDT  
**Build method:** Direct GitHub commit (no Lovable AI)

---

## What was built

### 1. `src/lib/engine-platform-config.functions.ts`
Server function module with four exported server functions:

| Function | Method | Description |
|---|---|---|
| `getPlatformConfig(workspaceId)` | GET | Returns workspace-level config (falls back to hardcoded defaults) |
| `savePlatformConfig(workspaceId, config)` | POST | Persists config to in-memory cache (extends to DB without API change) |
| `getProjectTypeTemplates()` | GET | Returns all project type templates |
| `getProjectTypeTemplate(id)` | GET | Returns a single template by ID |

**Types exported:**
- `WorkspaceConfig` — workspace settings shape
- `GovernanceGateThreshold` — per-step gate rule
- `DeliveryChecklistItem` — checklist item
- `ProjectTypeTemplate` — template catalogue entry

**Project type templates (static catalogue):**
- `web-app` — Standard web application (13 steps, full governance)
- `marketing-site` — Marketing/brochure site (9 steps, lighter governance)
- `mobile-app` — Native/hybrid mobile app (14 steps, strictest governance)
- `api-integration` — API/backend service (10 steps, architecture-heavy)

**Storage:** In-memory `_configCache` Map keyed by workspaceId. No new DB tables required. Extend to `engine_workspaces.settings` JSONB without changing the API.

**Default workspace config:**
- `default_project_type`: web-app
- `require_proposal_approval`: true
- `roadmap_staleness_days`: 30
- `governance_gates`: 3 gates (builder / preview / delivery)
- `delivery_checklist`: 6 global items (4 required, 2 optional)

---

### 2. `src/routes/admin.platform-config.tsx`
Full admin UI at `/admin/platform-config`:

**Sections:**
1. **Workspace defaults** — default project type selector, proposal approval toggle, staleness day input, last-saved-by metadata
2. **Governance gate thresholds** — editable gate rules per step (max open decisions, require_client_ack, require_delivery_readiness)
3. **Global delivery checklist** — inline label editing + required/optional toggle per item
4. **Project type templates** — expandable cards showing step sequences and governance defaults (read-only)

**UX patterns used:**
- `SectionCard` component with amber-400 header labels (matches existing admin design)
- `font-mono` labels on all field identifiers
- `Toggle` component (amber active state, matches engine design)
- Dirty-state tracking: "Save changes" button only appears when unsaved edits exist
- Success/error status bars with icon feedback
- All sections dark themed (#0f172a / white/5 cards, white/10 borders)

---

### 3. `src/routes/admin.tsx` (updated)
- Added `SlidersHorizontal` icon import from lucide-react
- Added "Platform config" nav entry pointing to `/admin/platform-config`
- Entry appears between "Runtime config" and "User roles"

---

## Architecture decisions

- **No new tables:** Config stored in-memory server-side. This is intentional — the `engine_workspaces` table doesn't exist yet. When Phase 4B (spine governance) migration lands, `savePlatformConfig` can be extended to write to a JSONB column without breaking the public API.
- **Admin-only:** All server functions call `assertAdmin()` via `hasRoleForEmail`. Non-admin users see a redirect.
- **Static templates as catalogue:** Project type templates are code-defined. Custom templates need a code deploy, which is the right call until usage data justifies a template editor.
- **Per-project overrides:** The `WorkspaceConfig` type is designed so individual `engine_projects` records can carry overrides — the server function accepts workspaceId and the UI can be extended to read per-project config by querying the project's JSONB fields.

---

## Files changed

| File | Action |
|---|---|
| `src/lib/engine-platform-config.functions.ts` | Created |
| `src/routes/admin.platform-config.tsx` | Created |
| `src/routes/admin.tsx` | Updated (nav entry added) |
