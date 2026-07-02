# Client Portal ↔ Roadmap Engine Integration Audit

Scope: no code changes. Pass / partial / fail against the 10 checks, plus leakage risks and prioritized fixes.

---

## 1. Portal access — MOSTLY PASS
- PASS: Access requires a row in `client_access` + `client_portal_permissions`; no public signup; magic-link only via `/portal/login`.
- PASS: `getPortalContext` scopes every query to the caller's email → project.
- PARTIAL: When authenticated but no `client_portal_projects` row exists, home renders `PendingWorkspacePanel` — good. But the header greets `auth.email()` (screenshot: "Welcome back, Tai") rather than the client contact resolved from `client_portal_projects.contact_name`. If Tai signs in with his own email against a client project, the greeting is misleading.
- FAIL: Sidebar links (Roadmap, Files, Messages, Billing, Activity) are always active during `workspace_provisioning`. Empty rooms are reachable and can look broken. No lock/disabled state tied to `portal_status`.

## 2. Workspace provisioning — PARTIAL
- PASS: `STATUS_COPY` covers `payment_confirmed → engagement_complete` with clear CTAs.
- FAIL: The lifecycle states the brief requires are only partially represented. Missing / not mapped:
  - `portal_access_granted`, `workspace_provisioning`, `workspace_ready` (currently squashed into `payment_confirmed` / `access_sent`)
  - `roadmap_not_published` vs `roadmap_published` (only `roadmap_ready` / `roadmap_delivered`)
  - `access_paused` (only `access_revoked`)
- FAIL: Provisioning progress is presentational; there is no backend "provisioning checklist" driving the steps (payment → permission → project row → onboarding sent → roadmap linked).
- FAIL: Roadmap page does not gate on "approved roadmap actually published to portal" — it queries `roadmap_documents` by project and shows whatever exists.

## 3. Approved roadmap publishing — PARTIAL / RISK
- PASS: `portal.roadmap.tsx` reads from `roadmap_documents` filtered by `published_at`; drafts without `published_at` are hidden.
- PARTIAL: `client_portal_roadmaps` is filtered by `approved_at IS NOT NULL` in `getPortalContext` — good.
- RISK: There is no enforced link between an **engine-approved** `engine_roadmap_versions` row and the `roadmap_documents` / `client_portal_roadmaps` row shown to the client. Nothing at the DB level prevents inserting a `client_portal_roadmaps` row with `approved_at` set before Tai actually approves the version in the engine. Publish is a UI/policy convention, not a schema constraint.
- PASS (by omission): AI confidence, agent costs, gap severity, version conflicts, review notes, internal risk notes are not read by any portal query.

## 4. Delivery Room connection — FAIL
- Delivery Room (`engine.delivery.tsx` + `engine.projects.$projectId.delivery.tsx`) tracks a checklist on `engine_projects.delivery` JSONB and transitions `engine_delivery_items.status` to `"sent"` on `send_delivery`.
- FAIL: No `ready_for_portal` / `uploaded_to_portal` state. `send_delivery` does NOT insert or update the corresponding `client_portal_roadmaps` / `roadmap_documents` row — the portal-visible artifact is produced elsewhere with no traceable handoff.
- FAIL: No `client_viewed`, `client_downloaded`, `client_acknowledged`, `client_replied`, `follow_up_needed` events feed back into `engine_delivery_history`. `client_portal_activity` records client actions but is not mirrored into Delivery Room.
- FAIL: No "Moved to execution" transition wired from portal acknowledgement.

## 5. Files — PARTIAL
- PASS: `client_portal_files` reads/writes scoped by `project_id`; storage bucket `client-portal-files` is private.
- FAIL: No `approved` / `client_visible` flag on `client_portal_files`. Any file uploaded to a project's folder is visible to the client. Internal-only files must live outside this table/bucket, but there is no schema-level guard against an operator uploading an internal file into the client bucket.

## 6. Messages — PASS with caveat
- PASS: `client_portal_messages` scoped by project; RLS restricts to the client's project.
- CAVEAT: Confirm no `internal_only` note field on the same table is ever selected by the portal — need to spot-check `portal.messages.tsx` selects. Recommendation: enforce column-level exclusion via a view if internal notes are stored on the same row.

## 7. Billing — PASS
- PASS: `client_portal_billing` displays Stripe-confirmed status and invoice URLs only; no internal margin, agent costs, or pricing calculations are read.

## 8. Activity — PARTIAL
- PASS: `client_portal_activity` uses `client_visible` boolean; portal filters on it (per `log_client_portal_activity` RPC).
- RISK: Nothing enforces that engine events (approvals, regenerations, cost accruals from `engine_agent_costs`, `engine_audit_log`, `engine_intelligence_decisions`) are excluded — they live in separate tables and aren't read by portal queries, which is correct. But there's no CI-level guard: a future portal query joining `engine_audit_log` would leak silently.

## 9. Execution handoff — FAIL
- No portal-side "Accept roadmap" action that transitions the internal project into Execution Tracker.
- `move_project_to_execution` exists in `engine-execution.functions.ts` under `HARD_BLOCKED`, gated to Tai — good.
- Missing: client acknowledgement event → surfaces in Delivery Room as "Ready to move to execution" for Tai to approve.

## 10. Security & leakage — MOSTLY PASS
- PASS: `/engine/*` routes require `admin`, `operator`, or `team_member` role (`engine.tsx` beforeLoad). Portal users without these roles are redirected to `/portal/access-denied`.
- PASS: No portal route imports from `engine.functions.ts`, `engine-agent.functions.ts`, `engine-intelligence.functions.ts`, `engine-execution.functions.ts`.
- RISK: `client_portal_projects` has 29 columns — need to audit for any internal-only field (e.g. internal notes, pricing, AI confidence) selected by portal reads. The current `getPortalContext` select-list is narrow, which is good, but there is no view enforcing this.

---

## Leakage risk summary

| Risk | Severity | Where |
|---|---|---|
| No FK from portal roadmap → approved engine version | HIGH | `client_portal_roadmaps` / `roadmap_documents` |
| No approved/client_visible flag on files | HIGH | `client_portal_files` |
| Sidebar rooms reachable while unprovisioned (looks broken, not a data leak) | MED | `portal.tsx` |
| Greeting uses signed-in email, not client contact | LOW | `portal.home.tsx` |
| No enforced view hiding internal columns on `client_portal_projects` | MED | schema |
| Delivery Room has no portal handoff state | HIGH | `engine_delivery_items` |
| No client-side ack event → execution transition | MED | delivery + execution |

## Prioritized fix list (for a follow-up build plan)

**P0 — Structural boundary**
1. Add `source_version_id uuid REFERENCES engine_roadmap_versions(id)` to `client_portal_roadmaps`; enforce `approved_at IS NOT NULL AND source_version_id IS NOT NULL` before portal can display.
2. Add `client_visible boolean DEFAULT false` and `approved_by`/`approved_at` to `client_portal_files`; portal query filters on it.
3. Create Postgres views (`portal_project_v`, `portal_activity_v`, `portal_files_v`) exposing only client-safe columns; RLS on base tables denies direct SELECT; portal reads from views only.

**P1 — Delivery Room ↔ Portal handoff**
4. Add states to `engine_delivery_items.status`: `ready_for_portal`, `uploaded_to_portal`, `client_viewed`, `client_downloaded`, `client_acknowledged`, `client_replied`, `follow_up_needed`, `moved_to_execution`.
5. `send_delivery` writes the approved artifact into `client_portal_roadmaps` + `client_portal_files` in one transaction and flips delivery status to `uploaded_to_portal`.
6. Mirror `client_portal_activity` events with `client_visible=true` into `engine_delivery_history` so Tai sees view/download/ack in Delivery Room.

**P2 — Lifecycle & UX**
7. Add the missing `portal_status` values: `portal_access_granted`, `workspace_provisioning`, `workspace_ready`, `roadmap_not_published`, `roadmap_published`, `access_paused`. Add corresponding `STATUS_COPY`.
8. Drive provisioning steps from actual backend flags (payment, permission, project row, onboarding sent, roadmap linked) instead of visual-only steps.
9. Lock/disable sidebar links (`Roadmap`, `Files`, `Billing`) when their prerequisite state isn't met, with tooltip "Not ready yet".
10. Greeting uses `client_portal_projects.contact_name`; show client company name in the header.

**P3 — Execution handoff**
11. Portal "Accept roadmap" button → writes `client_acknowledged` + creates a Tai-facing "Ready to move to execution" task in Delivery Room. Client cannot directly trigger `move_project_to_execution`.

**P4 — Guard rails**
12. Add a test that greps portal route/function files for imports of `engine_*` / `engine-*.functions` and fails CI on match.
13. Add a test that asserts portal SELECT lists on `client_portal_projects` contain only whitelisted columns.

---

## Overall verdict

The portal is currently **adjacent** to the engine, as you suspected. There is no actual leakage today because portal queries happen to select safe columns and don't import engine functions — but the boundary is **convention, not construction**. The two systems need: (a) a schema-enforced approved-artifact bridge, (b) a real Delivery Room handoff protocol, and (c) client-safe views instead of hand-curated select-lists.

Screenshot state is `workspace_provisioning` — the doorway is right, but Roadmap/Files should be locked, the greeting should be the client contact, and the setup steps should be backend-driven.
