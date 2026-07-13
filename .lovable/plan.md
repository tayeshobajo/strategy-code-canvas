# Phase 3 Migration — v4 (not applied)

Rewrite the Phase 3 block in `.orchestrator/PENDING_MIGRATIONS.md` in place. Fixes one functional bug and two audit-integrity gaps in v3. Still awaiting Tai approval.

## 1. Drop `metadata.transition_reason` as authorization

Bug: v3 authorized `superseded → published` and `retracted → published` by reading `metadata->>'transition_reason'`. But the immutability trigger freezes `metadata` once status ∈ (published, superseded, retracted), so that write is rejected. Rollback and restore cannot ship.

Fix:
- Remove all `transition_reason` reads from `tg_client_portal_roadmaps_status_transition`.
- The trigger allows `superseded → published` and `retracted → published` unconditionally at the DB layer (still gated by the whitelist; illegal jumps still rejected).
- Reason + actor + audit lives in `client_portal_publish_events` (`rolled_back`, `restored`). That table is the source of truth for "why" — it is admin-writable, not client-visible.
- App-side contract (enforced by smoke, not DB): every `superseded → published` UPDATE must be paired with a `client_portal_publish_events` row `event_type='rolled_back'`; every `retracted → published` must be paired with `event_type='restored'`. Both must reference the roadmap being restored and be written in the same server function call.
- No new mutable "reason" column on `client_portal_roadmaps`. Keeping the frozen snapshot clean is the point.

## 2. Freeze and validate `project_id`

- Add `project_id` to the DISTINCT list in `tg_client_portal_roadmaps_immutable_after_publish`. A published/superseded/retracted row cannot be reassigned to another portal project.
- Extend the lineage trigger fire clause: `BEFORE INSERT OR UPDATE OF previous_publication_id, project_id`. Any project reassignment revalidates lineage, so a lineage pointer cannot cross-project through a `project_id` change either (belt and braces — the immutability trigger already blocks it post-publish, but pre-publish rows must still not cross projects via lineage).

## 3. Validate publish-event references

New trigger `tg_client_portal_publish_events_validate_refs` (BEFORE INSERT OR UPDATE):

- `portal_roadmap_id.project_id` must equal `portal_project_id` → else raise.
- If `previous_portal_roadmap_id` IS NOT NULL:
  - Its `project_id` must equal `portal_project_id` → else raise.
  - `previous_portal_roadmap_id <> portal_roadmap_id` → else raise.
- The lookup joins `client_portal_roadmaps` by id; missing ids raise.

Trigger fires on INSERT and on UPDATE OF the three ref columns. UPDATEs to events are rare (append-only in practice) but the trigger covers them.

## 4. Smoke case updates (30 total; adds/replaces on v3's 28)

- **S27 (rewritten)** — Transition: `published → approved`, `superseded → in_progress`, `retracted → delivered`, `published → in_progress` all rejected (`invalid_status_transition`).
- **S28 (rewritten)** — Transition: `superseded → published` ALLOWED at DB layer; `retracted → published` ALLOWED at DB layer. No `transition_reason` involved. (App-level smoke below covers reason+audit pairing.)
- **S29 (new)** — Immutability: attempt to UPDATE `project_id` on a `published`/`superseded`/`retracted` row → immutability trigger error naming `project_id`. Pre-publish row (`in_progress`, `approved`) may still change project_id but re-runs lineage validation.
- **S30 (new)** — Publish-event refs:
  - a) Insert event with `portal_roadmap_id` whose `project_id` ≠ `portal_project_id` → rejected.
  - b) Insert event with `previous_portal_roadmap_id` from a different project → rejected.
  - c) Insert event with `previous_portal_roadmap_id = portal_roadmap_id` → rejected.
  - d) UPDATE an existing event to swap `portal_roadmap_id` to a foreign-project row → rejected.
  - e) Valid rolled_back event with same-project previous ref → ALLOWED.
- **S24 (extended)** — Acknowledged event insert must pass the new ref-validation trigger (same-project roadmap).
- App-level smoke (documented alongside DB smoke, deferred until the app-layer PR):
  - **A1** — `rollbackPortalPublication` writes exactly one `event_type='rolled_back'` row referencing the target roadmap, in the same transaction as the `superseded → published` UPDATE; if the event insert fails, the status flip is rolled back.
  - **A2** — same shape for `restorePortalPublication` / `event_type='restored'`.

## 5. What does NOT change from v3

- Recursive `jsonb_contains_banned_key` helper and scrub trigger (banned keys at any depth, across `metadata, publish_diff, client_safe_canvas, visible_modules, strategic_priorities, sequence_30_60_90, risks_dependencies`).
- Backfill logic, post-backfill preflight, partial unique index.
- Status-consistency CHECKs (`published_at` required; retraction fields all-or-nothing; non-empty `retraction_reason`).
- Immutability column set (v3 list) — `project_id` is the only addition.
- Lineage trigger internals — only its fire clause expands to `project_id`.
- `client_portal_publish_events` table shape, RLS, `ON DELETE RESTRICT`, ack as first-class event.
- Rollback SQL — extended to `DROP TRIGGER tg_client_portal_publish_events_validate_refs` and its function.

## Deliverable

One edit to `.orchestrator/PENDING_MIGRATIONS.md`: replace the Phase 3 v3 block with v4. Status header updated to `PENDING TAI REVIEW (2026-07-13, revised v4). NOT APPLIED.` No SQL applied, no app code, no UI.
