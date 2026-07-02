## Goal

Two new workspace pages per project, tied together by an "AI drafts, Tai reviews, approved versions stay locked" workflow:

1. `/engine/projects/$projectId/intelligence-layer` — Input Hub, AI Processing Timeline, Auto-Populated Outputs, Change Detection, Roadmap Versions.
2. `/engine/projects/$projectId/agent` — Project Agent Console with prompt input, suggested prompts, recent agent outputs, and an Agent Control right rail.

Everything is admin-only (matches existing `/engine` gating). Existing 14-step workspace stays intact; the new pages sit alongside it and drive the same JSONB modules already on `engine_projects`.

## Data model (new tables)

All in `public`, admin-only RLS via `has_role(auth.uid(), 'admin')`, standard grants (`authenticated`, `service_role`), `updated_at` triggers.

- `engine_sources` — the Input Hub row.
  - `project_id`, `name`, `type` (enum: `transcript | brief | website_url | document | screenshot | email_note | research_note | competitor_url | previous_roadmap`), `storage_path` (nullable, uses existing private `engine-signals` bucket), `url` (nullable), `raw_text` (nullable), `status` (`queued | processing | processed | failed`), `signals_count`, `confidence` (0-100), `used_in_version` (nullable text), `error`, timestamps.
- `engine_roadmap_versions` — versioned snapshot of the 12 JSONB modules on `engine_projects`.
  - `project_id`, `version` (e.g. `v1.2`), `status` (`ai_generated | draft | needs_review | tai_edited | approved | client_facing | delivered | archived`), `created_by` (`ai | tai`), `source_ids` (uuid[]), `summary`, `payload` (jsonb snapshot of all 12 modules), `approved_by`, `approved_at`, timestamps. Unique `(project_id, version)`.
- `engine_change_events` — Change Detection feed.
  - `project_id`, `kind` (`new_info | conflict | opportunity | risk | deadline_change | scope_change | investment_impact | client_copy_affected`), `title`, `body`, `severity` (`info | warn | critical`), `source_id` (nullable), `version_id` (nullable), `resolved_at`, timestamps.
- `engine_agent_tasks` — Recent agent outputs and console history.
  - `project_id`, `kind` (`milestone_brief | acceptance_criteria | lovable_prompt | missing_decisions | update_from_source | version_compare | risk_estimate | client_summary | qa_checklist | free_form`), `prompt`, `output` (text), `related_module` (nullable text like `builder`, `blueprint`), `confidence`, `cost_cents`, `status` (`draft | applied | saved_as_task | rejected`), `created_by_email`, timestamps.
- Extend `engine_projects` with agent-control fields: `agent_permission_level` (`draft_only | propose_updates | execute_approved`, default `propose_updates`), `agent_safety_rules` (jsonb), `agent_allowed_modules` (text[]).

Add `WORKSPACE_STEPS` entries for the two new routes and hide the old `intelligence` stub row (or replace it — see Open Question).

## Server functions (`src/lib/engine.functions.ts`)

All admin-gated via `requireSupabaseAuth` + `has_role` check.

- Sources: `listSources`, `createSource` (URL/notes), `uploadSourceFile` (returns signed upload target in `engine-signals`), `reprocessSource`, `removeSource`.
- Processing: `runIntelligencePipeline(projectId)` — calls Lovable AI (`google/gemini-3-flash-preview`) with the project's unprocessed sources + current module state, returns a structured draft for each of the 12 modules + a change-event list. Streams stage updates into `engine_activity` so the UI Timeline can subscribe.
- Versions: `listVersions`, `createDraftVersion(payload, sourceIds, summary)`, `applyUpdatesToDraft(moduleKey)`, `approveVersion(versionId)` (locks; bumps `engine_projects.approved_version`), `restoreVersion`, `archiveVersion`, `compareVersions(a, b)`.
- Change events: `listChangeEvents`, `resolveChangeEvent`.
- Agent: `listAgentTasks`, `runAgentPrompt({ kind, prompt, useProjectContext, attachedSourceIds })` — dispatches to Lovable AI with a kind-specific system prompt; writes an `engine_agent_tasks` row; tracks `cost_cents` from usage; `applyAgentTask`, `saveAgentTaskAsTask`, `rejectAgentTask`.
- Agent control: `updateAgentPermissions`, `updateAgentBudget`.

Approval law enforced server-side: any write to a module JSONB only lands in the current `draft` version. `approved` versions are immutable; `approveVersion` copies draft into a new approved snapshot and updates `engine_projects.approved_version`. Client Preview and Delivery read from the approved snapshot.

## UI

### `/engine/projects/$projectId/intelligence-layer`

Reuses `WorkspaceHeader` and `WorkspaceStepper`. Five stacked sections built with `SectionCard`:

1. **Input Hub** — 5 quick-add tiles (Upload Source, Add URL, Paste Transcript, Add Brief / Notes, More). Table below with Source, Type, Date, Status pill, Signals, Confidence dial, Used in, row actions (View / Reprocess / Remove). File upload wired to `engine-signals` bucket with signed URLs.
2. **AI Processing Timeline** — 11 stages (from spec) as a vertical checklist with per-stage timestamp + status, streamed from `engine_activity` filtered by `kind = 'pipeline_stage'`. "Run Intelligence Update" button top-right calls `runIntelligencePipeline`.
3. **Auto-Populated Outputs** — 11 module cards (Signal Extraction → Client Preview). Each shows Generated/Draft/Approved pill, confidence, items count, needs-review count, `Open` (deep-links to the existing workspace route) and `Apply Updates` (moves draft payload into that module's JSONB on the current draft version).
4. **Change Detection** — Feed of `engine_change_events` grouped by kind with severity coloring; each row links to the affected module + resolve action.
5. **Roadmap Versions** — Table of `engine_roadmap_versions` with Version, Status pill, Created by, Sources, Changes summary, Date, Approved by, Actions (View / Compare / Restore / Archive). Approval Gate panel with "Apply All Safe Updates", "Review Changes One by One", "Save as New Draft", "Reject Updates", and the final "Approve & Create New Version" button — disabled until Tai confirms.

Right rail (Intelligence Control): current approved version, latest draft version, sources processed x/y, modules needing review, AI confidence score, conflicts detected, "Next Best Action" card, "Review Updates" CTA.

### `/engine/projects/$projectId/agent`

Header metrics row: Current roadmap version, Approved version, Agent tasks count, Modules needing review, Blocked decisions, Agent spend (this month), Budget remaining.

Layout: two-column with left main + right rail.

- **Project Context card** — client name/logo, current phase, Point A / Point B one-liners, target date, critical deadline, last source processed, sources available. Reads from `engine_projects` + latest approved version.
- **Ask the Agent** — big textarea, "Use project context" toggle, "Attach" (multi-select of sources), Send. Submits to `runAgentPrompt`.
- **Popular Prompts** — 8 chip buttons prefilling the prompt with the kind-specific template.
- **Recent Agent Outputs** — table of `engine_agent_tasks` with kind badge, confidence, cost, status, actions (View / Apply / Save as task / Reject). "View" opens a drawer with full output + Markdown render.
- **Active Generation** panel — live progress bar sourced from the in-flight task's streamed activity, showing generation steps and estimated completion/cost.
- **Live Activity** — latest `engine_activity` rows for the project.

Right rail:
- **Agent Control** — permission level selector (`Draft only | Propose updates | Execute approved`), granular checklist of allowed capabilities, `Manage permissions` link.
- **Cost Tracker** — donut of `engine_agent_tasks.cost_cents` grouped by kind (Source Processing, Content Generation, Analysis, Version Compare), month spend, remaining, projected EOM.
- **Pending Approvals** — top 3 unresolved change events / draft modules with impact badge, links to Intelligence Layer.
- **Safety & Guardrails** — read-only summary of `agent_safety_rules`.

## AI integration

Uses the existing Lovable AI Gateway helper (`src/lib/ai-gateway.server.ts` if present, else create it per `ai-sdk-lovable-gateway`). Default model `google/gemini-3-flash-preview`. Structured output with the AI SDK `Output.object` API. Cost tracked from response usage where available; otherwise a small per-call estimate. All model calls happen inside server functions — no client-side AI calls, no user API keys.

## Files to create

- Migration for the 4 new tables + `engine_projects` column extensions + updated_at triggers.
- `src/routes/engine.projects.$projectId.intelligence-layer.tsx`
- `src/routes/engine.projects.$projectId.agent.tsx`
- `src/components/engine/IntelligenceLayer/` — `InputHub.tsx`, `ProcessingTimeline.tsx`, `AutoOutputs.tsx`, `ChangeDetection.tsx`, `VersionsTable.tsx`, `IntelligenceControlRail.tsx`.
- `src/components/engine/AgentConsole/` — `HeaderMetrics.tsx`, `ProjectContextCard.tsx`, `PromptComposer.tsx`, `PopularPrompts.tsx`, `RecentOutputsTable.tsx`, `ActiveGeneration.tsx`, `AgentControlRail.tsx`, `CostTracker.tsx`.
- Extend `src/lib/engine.functions.ts` with the server functions above; add prompt templates in `src/lib/engine-agent-prompts.ts`.
- Update `src/lib/engine-workspace.ts` to add both routes into `WORKSPACE_STEPS`.

## Open questions before I build

1. The existing `engine.projects.$projectId.intelligence.tsx` route is a placeholder — should the new `intelligence-layer` route replace it (I'll delete the old stub) or live alongside it?
2. For file uploads in the Input Hub, is it fine to reuse the existing private `engine-signals` bucket (admin-only RLS), or do you want a new bucket dedicated to intelligence sources?
3. Agent cost tracking — bill from Lovable AI Gateway usage tokens (approximate), or fixed per-kind estimate (e.g. milestone_brief = $0.05)?
