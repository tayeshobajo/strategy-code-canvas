# Portal Publish + Approval Workflow — Phased Plan

The four requests together add the "approval → publish → client feedback" half of the Roadmap Engine spine. This is large enough that I want to ship it in four review-gated phases rather than one monolithic drop. Each phase is independently testable.

Note on existing surface area:
- `src/routes/portal.roadmap.tsx` (1477 lines) already renders a rich roadmap canvas backed by `getPortalRoadmapDocs` / a demo fixture. It is **not** wired to `engine_roadmap_versions`.
- `src/routes/engine.review.tsx` already lists review items and has approve / send-back mutations against `engine_review_items`, but has no notion of AI-draft versions, publish, or client-preview stages.
- `approveVersion` exists in engine ops but only flips a version to `approved`; there is no publish record and no gate on the portal reader.

The plan **extends** those surfaces rather than rebuilding them.

---

## Phase 1 — Publish pipeline + portal reads approved version (request 1)

**Schema (one migration):**
- New table `engine_portal_publications` (project_id FK, version_id FK, published_at, published_by, client_safe_payload jsonb, superseded_at). GRANTs + RLS: operators write, `authenticated` clients read only rows for projects they have `client_portal_permissions` on.
- Add `client_preview_status` (`none | draft | approved`) and `client_preview_approved_at` to `engine_roadmap_versions`.

**Server:**
- `publishVersionToPortal(versionId)` in `engine-ops.functions.ts` — requires version.status = `approved` AND client_preview_status = `approved`. Strips to client-safe fields only (title, phase, status, client-visible description, dates; drops confidence, cost, internal notes, AI provenance). Inserts publication row, marks prior publication superseded, writes `engine_audit_log`.
- New `getPublishedRoadmap(projectId)` for portal use — reads latest non-superseded publication only.

**UI:**
- `portal.roadmap.tsx`: swap `getPortalRoadmapDocs` for `getPublishedRoadmap` with a fallback empty state ("Your roadmap is being prepared") when no publication exists. Demo fixture route stays for the mockup page.
- New "Publish to client portal" button in `engine.projects.$projectId.versions.compare.tsx` gated by the two statuses above.

**Acceptance:** Approving a version does NOT change the portal. Explicitly clicking Publish updates portal roadmap. Internal fields never appear in the network payload for the portal query.

---

## Phase 2 — Client portal actions feed back to engine (request 2)

**Schema:** none new — reuse `client_portal_messages`, `client_portal_activity`, `engine_review_items`.

**Server (`portal.functions.ts` + `engine-ops.functions.ts`):**
- `acknowledgePortalMilestone({ milestoneId })` — logs `client_portal_activity` + `engine_audit_log`.
- `respondToPortalDecision({ milestoneId, decision, note })` — writes activity + `client_portal_messages` row + `engine_review_items` (item_type = "Client Decision", impact from decision severity).
- `requestPortalClarification({ milestoneId, question })` — creates message + activity + review item ("Client Clarification").
- All three are `requireSupabaseAuth` + check `client_portal_permissions` for the project.

**UI:**
- Extend the existing `MilestoneSheet` action buttons (Acknowledge / Respond / Ask) so they call these fns instead of the current local state. Toast on success, optimistic update via TanStack Query.
- On the engine side, `engine.review.tsx` picks up "Client Decision" / "Client Clarification" items automatically since it already reads `engine_review_items`.

**Acceptance:** Client clicks in the portal show up in the operator review queue within one refetch, with the project + milestone context.

---

## Phase 3 — Engine review dashboard for AI-draft versions (request 3)

`engine.review.tsx` currently shows a flat review queue. Add a top-of-page "Draft roadmap versions" strip:
- Query: `listDraftVersions()` — `engine_roadmap_versions` where `status='ai_generated'` OR `status='draft'`, join project + latest extraction run for provenance.
- Card per draft: project name, version label ("v0.1 — AI draft"), source, generated_at, signal count, "Open in builder" + "Prepare for Tai review" actions.
- "Prepare for Tai review" flips status → `tai_edited` and creates/updates a review item of type `Roadmap Update`.

No changes to the existing approval-queue table beneath it.

**Acceptance:** Running the intake wizard from Phase 4 of the previous plan produces a card here within ~30s.

---

## Phase 4 — Ordered Tai approval workflow (request 4)

Enforce the three-gate order on `engine_roadmap_versions`: official approval → client preview approval → portal publish.

**Server:**
- `submitVersionForApproval(versionId)` — status must be `tai_edited`; creates review item `Roadmap Update` (impact = high). No status change yet.
- `approveVersion(versionId)` (existing) — only allowed if a matching review item is `approved`; flips to `approved`.
- `submitPreviewForApproval(versionId)` / `approvePreview(versionId)` — mirrors the pair for `client_preview_status`; requires version already `approved`.
- `publishVersionToPortal(versionId)` (from Phase 1) — now hard-checks both gates via the same review-item chain.

**UI:**
- Timeline strip on `engine.projects.$projectId.versions.compare.tsx` showing the three gates with current state and the next allowed action.
- The existing approve / reject flow in `engine.review.tsx` drives the state transitions — no separate approval UI.

**Acceptance checklist matches the one in the spec:** operator cannot publish until preview approved; preview cannot be approved until version approved; every gate writes to `engine_audit_log`; client portal only ever reads publications.

---

## Technical notes

- All server fns use `requireSupabaseAuth` and check `has_role('operator')` or `admin` for engine-side actions; portal fns check `client_portal_permissions`.
- Every migration includes GRANTs and RLS per project convention.
- No changes to the demo fixture route (`portal.roadmap-mockup.tsx`).
- Publish payload builder lives in a pure helper (`src/lib/roadmap-publish.ts`) with unit tests so we can prove no internal fields leak.

## Out of scope for this plan

- Redesigning the portal roadmap canvas visuals (Phase 1 only swaps its data source).
- Milestone brief AI generation.
- Client-side realtime — clients see updates on next navigation / refetch.

---

**How I'd like to proceed:** approve this plan, then I'll implement Phase 1 (schema + publish fn + portal reader swap) in the next turn and stop for review before Phase 2. If you'd rather I collapse phases, tell me which to merge.
