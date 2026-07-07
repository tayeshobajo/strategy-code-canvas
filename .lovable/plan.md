## Phase 12: Operator Review + Approval Gate QA

**Goal:** Prove the operator authority layer — review, approve, and preserve draft history — without breaking versioning or leaking to the client portal.

**No app code changes** unless a blocker is found. Only the QA script's confirmation-screen regex gets updated.

### Scope

Use the 4 successful Phase 11 submissions (Event Site, Founder Bottleneck, Automation, Injection Booking). Skip the not-a-fit (no review item exists).

### Steps

1. **QA script fix (non-blocker)**
   - Update the Playwright submitted-confirmation assertion in the Phase 11 script to match the real final copy (inspect the DOM once, then lock the selector — prefer role/text over the stale "Thank you" regex).

2. **Auth + inventory**
   - Sign in as the seeded QA operator (`/api/public/seed-qa-account` account).
   - Query backend to relist the 4 pending review items with their `submission_id`, `project_id`, `engine_source_id`, `extraction_run_id`, `roadmap_version_id`, `frame`, `subtype`.

3. **Screenshot sweep (read-only, all 4 items)**
   - `/ops/queue`
   - `/ops/submissions/{submission_id}` for each
   - Review detail panel per item
   - Extracted signals panel
   - Linked engine project, engine source, extraction run, AI draft version

4. **Field completeness audit per review item**
   Verify each panel exposes: submission_id, project_id, engine_source_id, extraction_run_id, roadmap_version_id, frame, subtype, original first answer, full Q&A transcript, extracted signals, open objectives, AI draft status, review status, and the action buttons (Approve / Request changes / Decline / Add internal note). Log any missing field.

5. **Permission probes**
   - QA operator can view review items ✓
   - QA operator publish-to-portal button state (allowed vs gated) — record which
   - AI self-approval blocked: attempt `decideReviewItem` against a version whose `created_by` matches the caller → expect 403 / guard error (already covered by `decide-review-item-ordering.test.ts`; verify at runtime)
   - Unauthenticated / client-role fetch of `/ops/*` → expect redirect or 403

6. **Single approval flow — Event Site only**
   - Open review item → click Approve.
   - Assert DB post-conditions:
     - `engine_roadmap_versions.status = 'approved'`, `approved_at` set, `approved_by` set to operator
     - Original `ai_generated` version row preserved (not mutated, not deleted)
     - `engine_review_items.status = 'approved'`
     - `engine_review_audit` row written with correct `version_id` linkage
     - `engine_change_events` / `engine_activity` entry created
     - `client_portal_projects` untouched; no `client_portal_roadmaps` row; `client_preview_status` unchanged
   - Confirm the approved version_id matches the AI-drafted one (no silent re-versioning).

7. **Report**
   - Screenshots captured (list + paths)
   - Review item IDs + linked row IDs
   - Approval result + audit event row
   - Missing fields / permission gaps
   - Whether approval can be bypassed (attempted vectors + outcome)
   - Confirmation that `version_id` approved == AI-drafted version
   - Explicit statement: no portal publish occurred

### Out of scope (deferred to Phase 13)

Client-safe payload generation, portal publish action, client portal rendering, client feedback loop.

### Technical notes

- Use Playwright with `LOVABLE_BROWSER_SUPABASE_*` session restore for operator auth against `http://localhost:8080`.
- DB reads via `psql` (public schema tables listed above).
- Screenshots to `/tmp/browser/phase12/` and copied to `/mnt/documents/phase12/` for the report.
- Do not run `pg_dump`; per-query CSV only if needed.
