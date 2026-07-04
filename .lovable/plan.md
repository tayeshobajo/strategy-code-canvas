
# Roadmap Engine — Source-to-Draft Vertical Slice

Goal: prove the core law end-to-end.
**Add a source → extract structured signals → generate draft roadmap v0.1 → surface in Review Queue.**
No portal publish, no client feedback loop, no delivery — those come after this works.

Guiding rules:
- AI drafts, Tai approves. Drafts land as `ai_generated`, never touch `approved_snapshot`.
- Sources are `internal_only` by default (already true — no client-portal exposure exists).
- Every AI-generated field carries a trace back to the source that produced it.
- Extend existing `engine_*` tables where the concept exists; add new tables only for genuinely new lifecycles.

---

## Current state (verified)

Already exists and works: `engine_sources`, `engine_roadmap_versions` (with `ai_generated`/`draft`/`tai_edited`/`approved` statuses), `engine_review_items`, `engine_change_events`, `engine_audit_log`, `runIntelligencePipeline`, `createSource`, `reprocessSource`, `approveVersion`, `compareVersions`, `restoreVersion`, agent-cost tracking.

Gaps blocking the vertical slice:
1. **No `createProject` server fn** — projects can't be started from a source. Only 2 seed projects exist, 0 real sources uploaded.
2. **Extraction stores blobs in `engine_sources.raw_text` / project JSONB** — no queryable per-signal rows, no source→signal→module trace.
3. **`runIntelligencePipeline` updates project JSONB but does not create a new `engine_roadmap_versions` row as `v0.1 ai_generated`** — the draft isn't a versioned artifact, so it can't be reviewed/approved/compared cleanly.
4. **Single AI provider** — everything routes through one model; no split between cheap intake pass and premium reasoning pass.
5. **Draft doesn't auto-enqueue a review item** — Review & Approvals is manual today.

---

## Deliverable phases

### Phase 1 — Schema plumbing (single migration)

Extend + add only what the slice needs.

**Add tables:**
- `engine_extracted_signals` — one row per structured signal.
  Cols: `id`, `project_id`, `source_id` (FK), `extraction_run_id`, `category` (enum: `goal | pain | opportunity | deadline | constraint | decision_maker | hidden_asset | risk | required_system | milestone_candidate | investment_signal | client_language | open_question`), `label`, `detail`, `confidence` (0–100), `client_safe` (bool, default false), `used_in_version_id` (FK nullable), `metadata` jsonb, timestamps.
- `engine_extraction_runs` — one row per pipeline run.
  Cols: `id`, `project_id`, `source_id`, `provider_intake` (text), `provider_structured` (text), `model_intake`, `model_structured`, `status` enum (`pending|running|succeeded|failed`), `started_at`, `finished_at`, `error`, `signals_count`, `cost_cents`, `produced_version_id` (FK to `engine_roadmap_versions`, nullable).

**Extend `engine_sources`:**
- `visibility` enum `internal_only | operator_only | client_safe` default `internal_only`.
- `used_in_version_ids uuid[]` default `{}`.

**Extend `engine_roadmap_versions`:**
- `generation_provenance jsonb` default `{}` (records `{intake_model, structured_model, source_ids, run_id, generated_at}`).
- `label text` (human tag e.g. "v0.1 — AI draft from Ryan transcript").

All new tables get: `GRANT` to `authenticated`/`service_role`, RLS enabled, admin-all + team_member-read policies matching existing engine tables. `updated_at` trigger reuses `public.tg_touch_updated_at`.

Skip for later: `portal_publications`, `portal_activity`, dedicated `audit_events` (existing `engine_audit_log` is sufficient), `roadmap_approvals` (already exists).

### Phase 2 — AI provider abstraction

New file `src/lib/engine-ai-providers.server.ts`:
- `runIntakePass({ text, sourceType }) → { summary, cleanedText, keywords }` — uses Lovable AI Gateway with `google/gemini-3-flash-preview` (fast/cheap).
- `runStructuredPass({ intakeOutput, projectContext, sources }) → { signals: ExtractedSignal[], modules: DraftModules }` — uses Anthropic Claude Sonnet via `ANTHROPIC_API_KEY` (already provisioned). Returns structured signals + populated draft modules for the 11 module fields (`extraction`, `point_a`, `point_b`, `hidden_assets`, `gap_map`, `blueprint`, `roadmap`, `sequencing`, `deadlines`, `investment`, `client_preview`).
- Both wrapped so provider/model can swap via config without touching callers.
- Structured pass uses strict JSON schema output; on parse failure, falls back to empty result + logs to `engine_audit_log`.

### Phase 3 — Rework `runIntelligencePipeline`

Existing fn in `src/lib/engine-intelligence.functions.ts` becomes:
1. Insert `engine_extraction_runs` row (status `running`).
2. Load source raw text (already implemented via storage download).
3. Call `runIntakePass` → store lightweight summary on the run.
4. Call `runStructuredPass` → get signals + module drafts.
5. Bulk-insert `engine_extracted_signals` linked to the source+run.
6. **Create a new `engine_roadmap_versions` row** with:
   - `version` auto-incremented (`v0.1`, `v0.2`, …) per project, AI drafts always bump minor.
   - `status = 'ai_generated'`.
   - `created_by = 'ai'`.
   - `source_ids = [source_id]` (or accumulated when reprocessing).
   - `payload` = the 11 module drafts.
   - `generation_provenance` = models + run id.
   - `label` = `"v0.X — AI draft from {source.name}"`.
7. Enqueue an `engine_review_items` row: `type='roadmap_version'`, references the new version, status `pending`, `submitted_by='ai'`.
8. Update `engine_extraction_runs`: `status='succeeded'`, `produced_version_id`, `signals_count`, `cost_cents`.
9. Update source: `status='processed'`, append version to `used_in_version_ids`.
10. Log to `engine_audit_log` and `engine_activity`.

Project JSONB module fields **still** get written (so existing workspace UI keeps working) but sourced from the version's `payload` — the version is authoritative.

Failure path: `engine_extraction_runs.status='failed'`, source `status='failed'`, review item not created, audit entry with error, user-visible toast.

### Phase 4 — Project creation from source

New `createProjectFromSource` server fn (admin/operator):
- Input: `{ clientId?, newClient?: { company, industry, contact }, projectName, engagementType, roadmapType, primaryGoal, criticalDates, sourceType, sourcePayload: { text?, url?, uploadedFilePath? } }`.
- Steps: upsert client → insert `engine_projects` (status `intake`, no roadmap version yet) → insert `engine_sources` row (status `queued`) → immediately fire `runIntelligencePipeline` (fire-and-forget on the server, function returns as soon as pipeline is triggered).
- Project status transitions: `intake → source_processing → needs_review` (driven by extraction outcome). Add these to `engine_project_status` enum if missing — currently has `active/draft/needs_review/approved/delivered/in_execution/blocked/archived`, so add `intake` and `source_processing`.

New route `src/routes/engine.projects.new.tsx` (already have `engine.projects.index.tsx`):
- Wizard with the intake fields above.
- Source input tabs: **Paste text** (transcript/brief/notes), **Upload file** (uses existing `createSourceUploadUrl`), **Website URL**, **Manual blank**.
- Submit → calls `createProjectFromSource` → redirects to `/engine/projects/{id}/overview` with a "Processing…" state that polls the extraction run.

Add "New Roadmap Project" primary CTA on `engine.projects.index.tsx` and Command Center.

### Phase 5 — UI wire-up (minimal)

- **Signal Room** (`engine.projects.$projectId.signal-room.tsx`): if signals from `engine_extracted_signals` exist, render them grouped by category with source badges, alongside existing raw source list. Add "Add Source" button (opens same source picker as Phase 4) that fires `createSource` + `runIntelligencePipeline`.
- **Versions**: extraction runs show `v0.1 — AI draft (from {source})` in the version list, clearly badged "AI-generated · Needs review".
- **Review & Approvals** (`engine.review.tsx`): new draft versions appear at the top automatically via the review item enqueued in Phase 3.
- **Provenance chip** — reusable `<GeneratedFromBadge sourceId ... />` shown on signals, modules, and versions.

Everything else in the operator workspace stays as-is — this slice only proves the pipeline.

---

## Out of scope (explicitly deferred)

- Portal publish gate & `portal_publications` / `portal_activity` tables.
- Client feedback → review item loop.
- Milestone brief generation, delivery packaging.
- New tables not required for the slice (`decisions`, `deliverables`, `phases`, `execution_tasks`, etc. — most already have equivalents).
- Reworking existing 14 workspace pages beyond the Signal Room touch above.

Once the vertical slice is trusted, the follow-up phase adds the approval → publish → portal → feedback half of the loop.

---

## Acceptance test for this slice

1. Sign in as operator, click **New Roadmap Project**, paste a transcript, submit.
2. Land on the project overview showing status `Source Processing`.
3. Within ~30s, Signal Room shows structured signals grouped by category with the source badge.
4. Versions tab shows `v0.1 — AI draft` marked `ai_generated`.
5. `/engine/review` shows the new version at the top of the queue.
6. Approving the version flips it to `approved` (existing flow, untouched); nothing publishes to client portal yet — that's the next phase.
7. Every signal and every module field has a "Generated from {source} by {model}" trace.
