# Sprint 1 · Wave 2 + Wave 3 · Export Verification

Four independent-but-related deliverables. All shipped in one pass. No schema migrations applied — any new-schema needs land in `.orchestrator/PENDING_MIGRATIONS.md` as shims.

---

## 1. Wave 2 — Spine body swaps (Incomplete + Client-Ready)

The `SpineVariantBanner` already switches (Incomplete / Active / Client-Ready). Today all three variants render the **same body** (NBA, Snapshot, Truth cards, Readiness matrix, Foundation, Captain brief). Wave 2 makes the body swap too:

- **Incomplete body** (`<SpineIncompleteBody />`): kills operational noise, focuses on _resolving understanding_.
  - Truth cards (Point A/B) with a "Missing / Draft" state chip.
  - `SpineReadinessPanel` (readiness checks) elevated to top row.
  - Contradictions & open questions list from `spine.notifications`.
  - Single CTA: "Resolve Understanding Gaps" → understanding-room.
  - Hides Milestone matrix, Approvals card, Captain brief.
- **Active body** (`<SpineActiveBody />`): the current layout, extracted as-is.
- **Client-Ready body** (`<SpineClientReadyBody />`): shows the **roadmap-as-client-sees-it** preview strip plus publish/acknowledgment status.
  - Portal publish card (status, published_at, acknowledgment).
  - Approved milestones roll-up (phase → milestone → client-facing copy).
  - Investment ranges + timeline summary.
  - Full inspector still available on every field via existing hook.
  - Primary CTA "Open Portal Preview", secondary "Re-publish".

Banner behaviour unchanged — same `data-qa-variant` markers preserved for the QA suite.

## 2. Inspector: Propose / Edit changed Spine statement

Extend `SourceTruthInspector` with an "Propose change" action on any inspected field. Persists to `engine_spine_field_truth` (already exists, tracked in spine schema) with attribution.

- New server fn `proposeSpineFieldChange` (in `src/lib/engine-spine-truth.functions.ts`):
  - `.middleware([requireSupabaseAuth])`
  - Input: `{ projectId, sectionKey, fieldKey, newValue, changeReason }`
  - Writes a new row to `engine_spine_field_truth` (status = `needs_confirmation`, version = prior + 1, updated_by = caller email).
  - Emits an `engine_activity` audit event ("spine_field_proposed") and a `engine_version_change_decisions` link so it appears in Version History.
  - Never mutates `engine_projects` directly — proposed changes go through approval; the existing Approvals Queue picks them up.
- New server fn `getSpineFieldHistory({ projectId, sectionKey, fieldKey })` — returns ordered `engine_spine_field_truth` rows for the version panel inside the inspector.
- Inspector UI changes:
  - New "Propose change" tab in the drawer body.
  - Textarea for the revised statement, a "Reason for change" field, submit button.
  - After submit: shows toast, refreshes the inspector, appears in a "Version history" strip at the bottom of the drawer with actor / timestamp / status chip.
- No DB schema change if `engine_spine_field_truth` already has the required columns (project_id, section_key, field_key, value, version, status, updated_by, updated_at, change_reason). If not, degrade: write to `engine_project_chat_proposals` (type `spine_field_change`) as an intake queue and note the schema gap in `.orchestrator/PENDING_MIGRATIONS.md`.

## 3. Wave 3 — Milestone workspace tabs

Brief already exists (`engine.projects.$projectId.milestones.$milestoneId.brief.tsx`). Add three siblings + one shared tab strip.

- `src/components/engine/MilestoneTabs.tsx` — renders `<Link>`s for Brief · Mockups · Build · QA, active-state via `<Link activeProps>`. Sticky under the WorkspaceHeader. Preserves search params via `search={(prev) => prev}`.
- `src/routes/engine.projects.$projectId.milestones.$milestoneId.mockups.tsx` — mockup versions table (reads `engine_project_mockups` scoped by milestone). Empty-state CTA "Request mockups" (no-op stub).
- `src/routes/engine.projects.$projectId.milestones.$milestoneId.build.tsx` — reads `engine_project_build_packets`, `engine_project_build_evidence` for this milestone; shows packet status + evidence list.
- `src/routes/engine.projects.$projectId.milestones.$milestoneId.qa.tsx` — reads `engine_project_qa_plans` + `engine_project_qa_evidence_reviews`; renders QA plan steps and evidence review status.
- Each tab route uses `useSuspenseQuery` on a scoped query (`['milestone', milestoneId, tabName]`) with 60s stale time — switching tabs re-uses cached spine + milestone data (state persistence between tabs).
- All four routes render `<MilestoneTabs />` at top so deep links like `/engine/projects/:pid/milestones/:mid/qa` land directly on QA.
- Route params validated via `Route.useParams()`; navigation between tabs uses `<Link to="/engine/projects/$projectId/milestones/$milestoneId/qa" params={...}>` — never string interpolation.

## 4. Export Client Roadmap verification

The existing `exportClientRoadmapPdf` in `src/lib/roadmap-pdf.ts` runs client-side and pulls from `project.point_a`, `project.point_b`, `project.investment.phases`, `project.roadmap.milestones`, `project.blueprint.nodes`. Verify against a real project.

- Playwright script under `/tmp/browser/spine2/export/`:
  - Restore Supabase session.
  - Visit `/engine/projects/<cakepro id>/spine`.
  - Click "Export Client Roadmap" in the header, accept download.
  - Also click on `/engine/projects/<smoke>/spine` and `/engine/projects/<e2e>/spine`.
- Parse each PDF with `pdftotext` (or `pypdf`) and assert:
  - Contains project name + `Prepared <today>`.
  - Executive summary block.
  - `Phased roadmap` section with at least one phase name when investment.phases is non-empty.
  - `Milestones` section lists exactly the milestones with a non-empty `client_facing` field.
  - Approvals count matches: number of milestones with `approval_status = 'approved'` from DB via `supabase--read_query`.
  - Footer "Trust Tai · trusttai.com" and page N/N.
- Report saved to `.orchestrator/phase-spine2-sprint1-wave2-export-verification.md` — pass/fail per project + a screenshot of the first page.

---

## Ordering / risk

1. Ship Wave 2 body swaps first (contained; only touches the spine route file).
2. Ship milestone tabs next (independent files; no cross-cutting risk).
3. Ship inspector propose flow (needs new server fn + UI edit).
4. Verify Export last (read-only Playwright + PDF inspection).

## Files touched / created

- edit `src/routes/engine.projects.$projectId.spine.tsx` — extract three body components; wire variant switch
- create `src/lib/engine-spine-truth.functions.ts` — propose/history server fns
- edit `src/components/engine/SourceTruthInspector.tsx` — add Propose tab + version strip
- edit `src/hooks/use-source-inspector.tsx` — optional refresh handle
- create `src/components/engine/MilestoneTabs.tsx`
- create `src/routes/engine.projects.$projectId.milestones.$milestoneId.mockups.tsx`
- create `src/routes/engine.projects.$projectId.milestones.$milestoneId.build.tsx`
- create `src/routes/engine.projects.$projectId.milestones.$milestoneId.qa.tsx`
- edit `src/routes/engine.projects.$projectId.milestones.$milestoneId.brief.tsx` — mount `MilestoneTabs` header
- write `.orchestrator/phase-spine2-sprint1-wave2-export-verification.md`
- append shim note to `.orchestrator/PENDING_MIGRATIONS.md` if `engine_spine_field_truth` lacks required columns

## Design tokens

No new tokens; use existing `#0A0F1F`, `#3E68B2`, `#eaf6ef`, `#fbf6e4`, `#eef3fb`, `font-display`, `font-mono` already in the spine banner styles.

## Non-goals

- No schema migrations applied (per repo rule).
- No changes to publish pipeline itself; Client-Ready body reads existing `spine.portal_publish` and roadmap payload only.
- No changes to header actions (Approvals · N / Ask Captain / Export already wired).
