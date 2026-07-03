# Roadmap Engine ↔ Client Portal: Downstream Contract (P3)

Close the audit gaps: make the Portal a true downstream consumer of an internal publish pipeline, with project-scoped artifacts, execution handoff, and activity telemetry.

## Scope

Four fixes, in dependency order. Each is a self-contained migration + code slice so we can ship and verify one at a time.

---

### 1. Real publish pipeline (internal approval → portal)

Today `send_delivery` (P1) writes directly to `client_portal_roadmaps` / `client_portal_files`, and lifecycle status is seeded in migrations. Replace with an explicit, auditable publish step.

- New server fn `publishRoadmapToPortal({ projectId })` in `src/lib/engine-execution.functions.ts`:
  - Requires `has_role(auth.uid(), 'admin')` or operator.
  - Guards: source `engine_roadmap_versions` row must be `status='approved'` with non-null `approved_at` and `approved_by`.
  - Atomic: insert `client_portal_roadmaps` row (`status='delivered'`, `source_version_id` set), mirror published `roadmap_documents` (client_safe + published only), flip `client_portal_projects.portal_status` → `roadmap_delivered`, `last_client_activity_at=now()`.
  - Writes `client_portal_activity` (`event_type='roadmap_published'`, `client_visible=true`).
- Delivery Room UI (`src/routes/engine.projects.$projectId.delivery.tsx`): add "Publish to Client Portal" primary action; disabled until roadmap approved; shows last publish timestamp + who.
- Remove implicit status seeding from prior migrations' data blocks (leave schema).

### 2. Delivery Room entities + client event telemetry

Portal currently has no activity feed and downloads are plain links.

- Migration: extend `client_portal_activity` `event_type` vocabulary and add helper RPCs:
  - `log_portal_view({ project_id, surface })` — surfaces: `roadmap`, `file`, `billing`, `home`.
  - `log_portal_download({ project_id, file_id })` — signed URL issuance path.
  - `log_portal_acknowledge({ project_id, roadmap_id })` — client explicit ack.
  - `log_portal_reply({ project_id, message_id })` — auto-fires from message insert trigger.
  - `mark_follow_up_needed({ project_id, reason })` — operator-only.
- Replace raw `file_url` links with signed URLs from `client-portal-files` bucket via server fn `getPortalFileDownload({ fileId })` that also logs the download.
- New route `src/routes/portal.activity.tsx` already exists — wire it to `client_portal_activity` filtered by `client_visible=true`.
- Portal roadmap page: add "Acknowledge receipt" button (once per version) that calls `log_portal_acknowledge` and updates `client_portal_roadmaps.acknowledged_at`.

### 3. Execution handoff with explicit Tai approval

After client acknowledges the roadmap, execution should not auto-start.

- Add `engine_projects.execution_kickoff_status` enum: `awaiting_ack | ready_to_start | started`.
- Server fn `startExecutionEngagement({ projectId })` (admin/operator only) — allowed only when `client_portal_roadmaps.acknowledged_at IS NOT NULL`. Flips `portal_status` → `engagement_active`, writes activity `event_type='engagement_started'`.
- Delivery Room shows a "Start Engagement" affordance gated on client ack; portal Home surfaces "Awaiting Tai to kick off execution" copy in the interim.

### 4. Project/workspace-scoped portal (drop email-only scoping)

Today `client_portal_files` / `client_portal_messages` are joined by email.

- Migration: add `project_id uuid NOT NULL REFERENCES client_portal_projects(id)` to `client_portal_files` and `client_portal_messages` (backfill from `client_portal_permissions.email` → single active project; verify no ambiguity before enforcing NOT NULL).
- Rewrite RLS on both tables to use `project_id IN (SELECT project_id FROM client_portal_permissions WHERE lower(email)=lower(auth.email()) AND revoked_at IS NULL)`.
- Update `portal.functions.ts` reads/writes + `portal.files.tsx` / `portal.messages.tsx` to scope on current project (from `usePortalContext`).
- Deprecate `current_client_portal_project_id()` in favor of an explicit `projectId` argument passed by the client, validated server-side against permissions.

---

## Technical notes

- All four items ship as separate migrations to keep review small and rollback surgical.
- Each new server fn uses `requireSupabaseAuth` + explicit role check (never rely on RLS alone for state transitions).
- Every state transition writes to `client_portal_activity` — that table becomes the single source of truth for the portal activity feed and the audit log.
- Signed URLs: 5-minute TTL, generated per-download via `supabaseAdmin.storage.from('client-portal-files').createSignedUrl`.
- No changes to intake review flow or draft artifact isolation — those already pass.

## Verification per slice

1. Publish pipeline: unit test that `publishRoadmapToPortal` rejects non-approved versions; e2e that portal Roadmap route flips from locked → visible after publish.
2. Telemetry: assert `client_portal_activity` row per view/download/ack; portal Activity page renders newest-first.
3. Execution handoff: assert `startExecutionEngagement` rejects before ack; portal Home copy updates.
4. Project scoping: assert cross-project read returns 0 rows even with matching email; RLS regression test.

## Out of scope

- Multi-project-per-client UX (single project remains the default; scoping change just makes it correct).
- Redesign of Delivery Room layout.
- Notification emails on publish/ack (can layer via existing email queue in a follow-up).
