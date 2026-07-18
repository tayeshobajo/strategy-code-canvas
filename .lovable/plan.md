## Project Work Tab — Execution Operating Layer

Replace the placeholder card at `src/routes/engine.projects.$projectId.work.tsx` with a real, server-owned execution surface that mirrors the brief and continues the locked Spine / Roadmap design language.

## How it interconnects (system view)

The Work tab is downstream of Spine → Roadmap and upstream of QA & Delivery → Client View. Nothing here invents state; every panel reads a single server-owned view model composed from existing durable tables.

```text
                Approved Spine (truth statuses, Point A/B)
                              │
                              ▼
                    Approved Roadmap (versions, milestones)
                              │  engine_milestones
                              ▼
              ┌───────────────────────────────┐
              │        Work Read Model        │  ProjectWorkReadModel
              │  composed server-side, one    │  (server fn: getProjectWork)
              │  round trip per Work render   │
              └───────────────────────────────┘
                              │
   ┌──────────────┬───────────┼──────────────┬─────────────────┐
   ▼              ▼           ▼              ▼                 ▼
Summary strip  Captain    Milestone     Work Queue         Agents view
+ Next-best    Brief      Execution    (engine_tasks +    (engine_agent_tasks
 action                    cards         packets)          + assignments)
                              │
                              ▼
                      Evidence + Blockers
                (engine_project_build_evidence,
                 engine_review_items where status=blocker)
                              │
                              ▼
                    QA Handoff candidates ──────► QA & Delivery tab
```

The governing invariant: every work item traces back to an approved milestone (`engine_milestones.approval_status = 'approved'`), an intended outcome (milestone `brief_md` / `client_safe_md`), and acceptance conditions (`acceptance_criteria`). Rows that don't trace go into a "Needs Review — off-roadmap" band, never the main queue.

## Scope of this plan

Implements Phases 1–4, 6, 7, 9 from the brief in one shippable pass. Phase 5 (execution packets) hooks into the existing `engine_project_build_packets` table (no schema changes). Phase 8 (cost + material changes) surfaces existing `estimated_cost_cents` and `engine_activity` — no new metering. Phase 10 QA is scenario checks against real project rows.

**Out of scope for this pass (call out to user, do not silently defer):**
- New DB tables or columns. Any schema needs go to `.orchestrator/PENDING_MIGRATIONS.md`.
- Writing new work items or lifecycle transitions from this tab beyond what existing server functions already expose (Start / Block / Submit are wired as CTAs, but net-new mutation server functions are not created unless a matching one already exists).
- Real per-agent cost telemetry beyond what `engine_agent_tasks.cost_cents` and `engine_milestones.estimated_cost_cents` already store.

## Files

### New — read model + server functions
- `src/lib/work-view.ts` — pure derivation. Input: raw rows for the project (milestones, tasks, packets, evidence, agent tasks, review items, activity, roadmap view). Output: `ProjectWorkReadModel` matching the brief's §34 shape. Handles: summary counts, milestone execution states (12 canonical states), gate progression (Brief / Criteria / Mockups / Build / QA / Delivery), readiness reasons, blocker classification, next-best-action selection, work health, scope-drift detection, QA handoff eligibility.
- `src/lib/engine-work.functions.ts` — `getProjectWork` server fn (`requireSupabaseAuth` + operator/admin gate, mirrors the roadmap fn pattern). One handler composes: `engine_projects`, `engine_milestones`, `engine_tasks`, `engine_project_build_packets`, `engine_project_build_evidence`, `engine_agent_tasks`, `engine_review_items` (item_type='blocker' or status='blocked'), `engine_activity` (last 30 material changes), plus reuses `getProjectSpine` + `deriveRoadmapView` for milestone gate context.
- `src/lib/work-view.test.ts` — unit tests for the 10 canonical QA scenarios in §39: locked-when-no-roadmap, ready-to-plan, visual milestone with unapproved mockups, non-visual N/A gate, agent execution flow, blocked dependency, scope drift, ready-for-QA gating, agent failure, parent/child aggregation.

### New — components (all under `src/components/engine/work/`)
- `WorkHeader.tsx` — title, subtitle, execution phase, active milestone count, work health chip, last material change, version. Right side: Add Work, Ask Captain, Open Blockers, Filters, More menu (Agent Workspace, Generate execution brief, Compare work changes, Manage assignments, View cost analysis, Export internal work report, Open history).
- `WorkSummaryStrip.tsx` — 8 pill metrics (Ready to Start, In Progress, Blocked, Awaiting Approval, Awaiting Client, Ready for QA, Active Agents, Value Blocked). Each filters the view via search params.
- `HighestLeverageWorkAction.tsx` — inline card mirroring the reference image's amber "Highest-Leverage Action" panel: action, milestone, why-it-matters, owner, due, impact, CTA. Server-selected via `work-view`'s `next_best_action` (ranked by downstream-blocked count, urgency, authority).
- `WorkModeSwitcher.tsx` — three-tab switcher: Milestones / Queue / Agents (URL search param `mode`).
- `MilestoneExecutionCard.tsx` — one card per milestone: name, outcome, phase, current gate, work state (12 canonical states from durable gates), owner, active tasks count, blocked tasks count, expected artifact, evidence progress `x of n`, cost, due, gate progression strip (Brief → Criteria → Mockups → Build → QA → Delivery with ✓ / current / locked / N/A pills), CTA "Open Milestone Workspace" deep-linking to the existing milestone workspace tabs.
- `MilestoneGateStrip.tsx` — the reference image's mini-timeline dots (Brief / Criteria / Mockups / Build / QA), fed from durable gate order; never renders a downstream state that violates predecessor order.
- `WorkQueueTable.tsx` — Queue view: Work Item, Milestone, Purpose, Owner (human/agent badge), Status, Priority, Dependency, Expected Artifact, Evidence chip, Due, Next Action. Row click opens `WorkItemDrawer`.
- `WorkItemDrawer.tsx` — full detail: name, milestone link, purpose, expected artifact, acceptance criteria list, owner/reviewer/approver rows, status + lifecycle badge (Draft → Ready → Assigned → In Progress → Submitted → Evidence Review → Accepted → Complete, plus Blocked / Needs Clarification / Rejected / Superseded / Cancelled branches), dependencies, blockers, effort/cost, evidence requirements list with attach state, related mockup/brief link, source of instruction, change history. Actions row: Start, Pause, Block, Submit, Attach Evidence, Ask Captain, Reassign, Request Clarification, Move to Milestone, Propose Scope Change. Actions that already have a server fn call it; the rest render disabled with a "server fn pending" tooltip so we don't fake writes.
- `AgentsView.tsx` — agent-oriented pivot: role, current work, project, state (Working / Monitoring / Waiting / Needs Clarification / Blocked / Failed / Complete / Idle), waiting reason, last activity, cost, "Ask Captain" CTA. States derived from `engine_agent_tasks.status` + `pending_approval` + `error`.
- `WorkCaptainBriefCard.tsx` — right-rail Captain Brief: What changed / What matters now / Recommendation / Watch for, plus `CaptainPrompts` (reuses existing component) with work-specific prompt seeds ("What should start next?", "Which milestone is ready for QA?", "Where is scope drifting?", "Which agent is waiting?").
- `WorkApprovalsBlockersCard.tsx` — right-rail card listing execution-related items from `engine_review_items` with impact + CTA.
- `WorkAgentsRailCard.tsx` — condensed active-agents card for the right rail (mirrors the reference image's Active Agents box: Captain, PM, Developer, QA with state chips).
- `WorkCostCapacityCard.tsx` — MTD spend, burn rate, capacity load, without turning into a finance dashboard.
- `WorkEmptyState.tsx` — the six empty/error states from §31–32 (no approved roadmap, roadmap approved / nothing ready, no active work, agent not assigned, blocked by missing truth, version mismatch, agent failure) with correct CTAs.

### Modified
- `src/routes/engine.projects.$projectId.work.tsx` — delete the placeholder card & shortcut buttons. New route:
  - `validateSearch` for `mode` (milestones/queue/agents), `filter` (summary pill filters), `milestoneId`, `workItemId` (drawer state), `agentId`.
  - Loader uses `queryOptions` + `getProjectWork` (called via `useServerFn` inside the component so it's safe under `_authenticated` and matches the roadmap route's pattern).
  - Renders: `WorkEmptyState` when no approved roadmap OR no milestones ready; otherwise `WorkHeader` + `WorkSummaryStrip` + `HighestLeverageWorkAction` + `WorkModeSwitcher` + main region (Milestones cards | Queue table | Agents view) in a two-column layout with the persistent right rail (`WorkCaptainBriefCard`, `WorkApprovalsBlockersCard`, `WorkAgentsRailCard`, `WorkCostCapacityCard`).
  - Uses the same `xl:sticky` right-rail treatment used on Spine and Roadmap so it feels like the execution counterpart.

### Not touched
- `src/components/engine/LeftProjectRail.tsx`, `src/routes/engine.projects.$projectId.tsx` (project shell + navigation stays as-is, per §4 "Do not create a second navigation").
- Existing milestone workspace tabs, QA routes, Agent Workspace route — the Work tab deep-links into them; no duplication.
- No writes to Supabase schema. If a lifecycle transition or scope-change action needs a new mutation and no server fn exists, it's rendered as a disabled affordance with a tooltip until we ship the write path.

## Design fidelity (matches reference image + baseline)

- Warm-white app bg (`.engine-theme` cloud tokens already in place), white cards with warm-gray borders, deep navy typography, electric royal blue for active work / CP, Instrument Serif for headings, Inter for UI. No new colors introduced.
- Header pattern, summary pill row, and amber highest-leverage banner mirror the uploaded reference exactly.
- Two-column grid `minmax(0,1fr) 320px` with sticky right rail — same as Roadmap for continuity.
- Milestone cards use the reference image's compact stat block (Active Tasks / Blockers / Evidence %) with a full-width gate strip beneath.

## Data notes

- **Value Blocked** ($ metric): summed `engine_milestones.estimated_cost_cents / 100` for milestones with any active blocker; brief documents this fallback since no per-blocker $ field exists.
- **Active Agents count**: distinct `engine_agent_tasks.related_module` runners with status != 'rejected'/'applied' AND updated within 24h.
- **Scope drift detection**: for each in-progress task, compare its `milestone_id`'s current `acceptance_criteria` hash against the packet's snapshot at hand-off (`engine_project_build_packets.payload.criteria_hash` if present, else flag as "packet lacks snapshot").
- **QA handoff eligibility**: milestone qualifies when all its build packets are `accepted`, evidence count ≥ required, no open blocker rows, `engine_milestones.approval_status = 'approved'`, and a QA plan exists (`engine_project_qa_plans` row for the milestone).
- **Next-best action ranking**: score = downstream_blocked_count × 3 + urgency_days_overdue × 2 + (requires_admin ? 2 : 0). Highest score wins; ties broken by earliest due date.

## Guarding invariants (server-side)

- All reads scoped by `project_id` and gated by `requireSupabaseAuth` + `hasRoleForEmail('operator' | 'admin')`.
- Client-facing surfaces (Client View) never receive this payload; the read model has no `internal_only: false` fields to strip because the whole payload is internal.
- Agents cannot approve their own work — this is a display invariant here: acceptance CTAs are hidden when `viewer.email === work_item.owner_id`. The DB-level enforcement is Phase 9C and remains in `.orchestrator/PENDING_MIGRATIONS.md`; we surface a banner if any accepted row violates the rule so ops can see drift.

## Verification

- `bunx tsgo` clean.
- Unit tests: `bunx vitest run src/lib/work-view.test.ts` — all 10 canonical scenarios pass.
- Playwright against the live preview at `/engine/projects/<realProjectId>/work`: screenshot Milestones view, Queue view, Agents view, an empty state, and the drawer open. Confirm the reference image's layout, sticky right rail, and gate strip render.
- Manual: click every CTA; confirm deep links resolve to the correct existing routes and that disabled affordances show the "server fn pending" tooltip rather than errors.

## Sequence (single build session)

1. `work-view.ts` + `work-view.test.ts` (make tests pass first).
2. `engine-work.functions.ts` (compose the read model).
3. Components in dependency order: primitives (header, summary strip, gate strip) → milestone card → queue table → drawer → agents view → right-rail cards → empty states.
4. Route swap + search-schema wiring.
5. Typecheck, unit tests, Playwright verify, commit `feat(work-tab): execution operating layer`.
6. Write `.orchestrator/phase-work-tab-output.md` with the changed-files list, screenshots, and any deferred writes.
