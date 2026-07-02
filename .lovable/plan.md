# Build Milestone Briefs, Agent Tasks, Costs, Version Review, Permissions

Five new workspace pages that turn intelligence into execution. All routes are admin-gated and wired into the existing engine workspace shell.

## Data model additions

New migration adds:

- `engine_milestones` — one row per roadmap milestone
  - `id, project_id, name, phase, status, owner_email, priority, deadline_relevance, related_system_node, related_gap, related_hidden_asset, estimated_effort, estimated_cost_cents`
  - `brief_md, acceptance_criteria jsonb[], developer_prompt, qa_checklist jsonb, dependencies jsonb, risks jsonb, decisions jsonb, client_safe_md`
  - `approval_status ('draft'|'needs_review'|'approved'|'revision_requested'), approved_at, approved_by_email`
- `engine_tasks` — agent-generated tasks
  - `id, project_id, milestone_id, name, source, priority, owner_email, status, estimated_effort_hours, estimated_cost_cents, due_date, blocked_decision, acceptance_criteria jsonb, created_by ('agent'|'human')`
- `engine_agent_permissions` — one row per project
  - permission mode, per-action mode (allowed/needs_approval/blocked) as jsonb, safety rules jsonb, budget fields (warning threshold, hard stop, require_approval_above_cents, preferred_model, auto_pause)
- Reuse existing `engine_agent_tasks.cost_cents` for cost center rollups; add `category` column for spend-by-category breakdown.

All tables: GRANT to authenticated/service_role, RLS enabled, admin-only policies via `has_role`.

## Server functions (`src/lib/engine-execution.functions.ts`)

- `getMilestoneBrief({ milestoneId })` — returns milestone + related roadmap context
- `generateBriefSection({ milestoneId, section })` — AI-generates brief/criteria/prompt/QA/client-copy using existing `callLovableAi`
- `updateMilestone`, `approveMilestone`, `requestMilestoneRevision`, `sendMilestoneToTasks`
- `listAgentTasks({ projectId, filters })`, `updateTaskStatus`, `createTask`, `bulkGenerateTasks`
- `getAgentCosts({ projectId, range })` — aggregates from `engine_agent_tasks` grouped by category/milestone; computes projected month-end spend
- `getPermissions({ projectId })`, `updatePermissions({ projectId, patch })` — enforces safety rules server-side
- `getVersionCompare({ approvedId, draftId })` — module-by-module diff with change categorization (added/modified/removed), impact heuristics, source evidence lookup from `engine_change_events`
- `acceptChange`, `rejectChange`, `acceptAllSafe`, `approveAsNewOfficial`

Safety rules enforced in server functions (not just UI): reject any write that violates AI cannot overwrite approved / publish / send / approve-own / change investment / mark delivered.

## Routes

1. `src/routes/engine.projects.$projectId.milestones.$milestoneId.brief.tsx`
   - Milestone Overview strip (name, phase, status, owner, priority, deadline, related nodes/gaps/assets, effort, cost)
   - Sections: Generated Brief, Acceptance Criteria (interactive checklist), Developer/Lovable Prompt (copy/export), QA Checklist, Dependencies, Risks & Decisions, Client-Safe Explanation
   - Approval Gate footer: Approve Brief, Request Revision, Save Draft, Send to Tasks, Generate Updated Prompt
   - Right rail: Milestone Intelligence (confidence, sources analyzed), Related To, Dependencies, Risks, Blocked Decisions, Version History

2. `src/routes/engine.projects.$projectId.agent.tasks.tsx`
   - View switcher: Board (default, columns per status), List, Milestone, Owner, Priority, Calendar
   - Top metrics row: totals per status, estimated effort, agent cost this month, blocked count
   - Task cards show all requested fields; row actions: approve, assign, edit, archive, reject
   - Right rail: Agent Operations summary, Next Best Action, Tasks by Priority/Milestone

3. `src/routes/engine.projects.$projectId.agent.costs.tsx`
   - Top KPI strip (total spend, this month, budget remaining, projected month-end, cost/approved output, unused draft cost)
   - Spend Overview line chart + Spend by Category donut (recharts, already installed)
   - Spend by Milestone table; Value & Efficiency card (approved/rejected/reused, tasks, time-saved, cost per version)
   - Budget Controls form (monthly cap, warning, hard stop, require approval above, model tier, auto-pause)
   - Cost Intelligence side card (spike detection, highest cost driver, suggested actions)
   - Recent Cost Activity table

4. `src/routes/engine.projects.$projectId.versions.compare.tsx`
   - Header with From (Approved) / To (AI Draft), source trigger, status
   - KPI row: total changes, added, modified, removed, conflicts, modules affected
   - Change Summary side card
   - Left column: Review by Module (10 modules, change counts, tab filter for High Impact/Conflicts/Investment/Sequencing)
   - Main table per module: Change | v1.0 (Current) | v1.2 (Draft) | Source Evidence | Impact | Actions (Accept/Edit/Reject)
   - Approval Confirmation footer: Approve as new official version (blocked until reviewed or "Accept all safe")

5. `src/routes/engine.projects.$projectId.agent.permissions.tsx`
   - Permission Mode radio (Draft only / Propose / Execute approved)
   - Action Permissions table (10 actions × Allowed/Needs approval/Blocked)
   - Safety Rules panel — 6 non-negotiable rules shown as locked toggles (always on, cannot disable)
   - Budget & Approval Controls
   - Save writes to `engine_agent_permissions`

## Navigation

Add links to `WorkspaceHeader` toolbar: Milestone Brief (per milestone context), Tasks, Costs, Compare, Permissions. Add "Agent" submenu to keep the toolbar clean.

## Files

**Created**
- `supabase/migrations/<ts>_execution_milestones_tasks_permissions.sql`
- `src/lib/engine-execution.functions.ts`
- `src/components/engine/MilestoneBrief/*` (OverviewStrip, CriteriaChecklist, PromptBlock, QAChecklist, ApprovalGate)
- `src/components/engine/AgentTasks/*` (BoardView, ListView, TaskCard, ViewSwitcher)
- `src/components/engine/AgentCosts/*` (KpiStrip, SpendChart, CategoryDonut, BudgetControlsForm)
- `src/components/engine/VersionCompare/*` (ModuleList, ChangeRow, ApprovalFooter)
- `src/components/engine/AgentPermissions/*` (ModeSelector, ActionMatrix, SafetyRules)
- Five route files above

**Edited**
- `src/components/engine/WorkspaceHeader.tsx` — new toolbar links
- `src/integrations/supabase/types.ts` — regenerated after migration
- `src/routeTree.gen.ts` — regenerated

## Out of scope for this turn

- Email/PDF delivery of briefs (existing pdf util already covers roadmap PDFs)
- Calendar view integration with external calendars — placeholder month grid only
- Bulk import of tasks from CSV — "Import Tasks" button stubbed
