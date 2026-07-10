# Trust Tai Roadmap Engine — Full Operational Audit

## Mission
You are performing a full operational audit of the Trust Tai Roadmap Engine / Project Factory.

Your job is to determine: **Can this engine reliably take a new project from intake to successful delivery without the project getting stuck, becoming confusing, or requiring Tai to manually hold the whole system together?**

## Core Philosophy
This system should be an AI Product Manager + Project Factory, not a random dashboard.
- Capture truth from intake
- Classify and extract the right project intelligence
- Create a project spine
- Generate the right planning layers
- Produce implementation-ready packets
- Track OpenClaw / builder execution
- Collect evidence
- Review evidence
- Assess delivery readiness
- Protect client-facing surfaces
- Keep operators clear on what should happen next

**Core law: The founder should not be the system.**

The system must tell the team: what is happening, what is blocked, what should happen next, who needs to act, what is safe to do, what is not safe to do, what evidence proves progress, what is ready for client-facing delivery.

## Audit Areas (Review Each Deeply)

### 1. Intake → Project Creation
- Is the intake clear enough for a real client/operator?
- Does it collect enough information?
- Are required vs optional questions right?
- Does the system handle weak/vague/incomplete/contradictory answers?
- Does it classify projects correctly?
- Does it create the right project record and land in the right state?
- Does the dashboard make the next move obvious?
- Where does it fake understanding? Where does it need clarification?

### 2. Command Center
- Does it give a true high-level view of operations?
- Are metrics meaningful?
- Are Next Best Actions truly computed from state, or static?
- Can an operator know what to do first?
- Does it reveal blocked work clearly?
- Does it show system health honestly?
- Are agent alerts useful or noisy?
- Audit all visible areas: active projects, new signals, sources processing, roadmaps drafting, needs review, approved, portal published, deliveries pending, in execution, blocked, agent spend, system health, NBA, priority queue, agent alerts, review queue, delivery queue, execution tracker preview

### 3. Project Overview
- Does the overview explain current state clearly?
- Does the workflow stepper help or clutter?
- Is NBA clear and trustworthy?
- Does it tell the operator why the project is blocked?
- Are critical dates, roadmap health, shortcuts, recent activity, audit trail useful?
- Does it orient a new team member within 30 seconds?

### 4. Project Spine
- Does it show project direction clearly?
- Does it connect Point A, Point B, sources, milestones, tasks, QA gates, activity?
- Are AI PM insights useful?
- Does it tell what is known, missing, changed, and what should happen next?
- Are QA gates meaningful? Are states accurate?
- Audit: Project Direction, Approved Scope, Roadmap Spine, Task Spine, QA Gates, Activity & Decisions, AI PM panel

### 5. Project Chat / Intelligence Layer
- Does chat answer from project context?
- Does it know what it does not know?
- Does it refuse hidden/system prompt requests?
- Does it avoid mutating project state directly?
- Does it create useful action proposals?
- Is Action Mode clear?
- Does it become more useful as layers are created?
- Test: status prompts, blocked prompts, next steps, missing info, client questions, build questions, delivery readiness, security tests (hidden prompt, mark delivered, publish, accept)

### 6. Planning Layer Sequence
Review the full factory chain:
Project Spine → Frame Builder → Mockup Builder → Backend Builder → QA Factory → Implementation Plan → Build Execution → OpenClaw v2 → v3 → v4 → v5 → v6

- Does this sequence make sense?
- Are handoffs clean? Does each layer consume the approved artifact from the previous?
- Missing layers? Too many layers? Duplicative layers?
- Too slow (too many gates)? Too fast (risky)?
- Challenge this architecture. Do not assume it is correct.

### 7. Frame Builder
- Does it consume the Spine correctly?
- Does it create useful page/state structure?
- Are must-build/should-build/later-build distinctions clear?
- Does approval protect the frame?
- Does it help downstream Mockup Builder?
- Is the output detailed enough for design? Too abstract? Missing fields?

### 8. Mockup Builder
- Does it consume the approved frame?
- Does it cover pages, states, global components, interactions, responsive strategy, QA notes, open decisions?
- Is it useful enough for Lovable/design generation?
- Does it avoid pretending to generate actual images?

### 9. Backend Builder
- Does it consume approved mockup/frame/spine?
- Does it create usable data model, server function, RLS, integration, workflow, implementation guidance?
- Does it avoid applying migrations automatically?
- Does it protect approved upstream artifacts?
- Is it enough for a developer or OpenClaw to implement safely?
- What backend risks are not surfaced?

### 10. QA Factory
- Does it create a real test matrix?
- Does every test begin as not_run?
- Does it cover route, role, data, RLS, workflow, UI state, responsive, integration, audit, regression, edge cases?
- Does it avoid marking itself passed?
- Is the QA plan usable by a QA operator?
- What test categories are missing? What evidence should be required?

### 11. Implementation Plan
- Does it produce phases, build steps, migrations, server functions, UI wiring, RLS, integrations, QA execution order, developer prompts, rollback strategy, release gates?
- Does it avoid executing anything?
- Is it clear enough for OpenClaw or Lovable?
- Would a developer know what to build first? Are dependencies clear? Are rollback plans meaningful?

### 12. Build Execution
- Are build packets scoped well?
- Do they include do-not-touch boundaries?
- Are handoff prompts strong enough?
- Are acceptance criteria clear?
- Are QA/evidence requirements clear?
- Does packet lifecycle make sense? (draft, ready, handed_off, in_progress, returned, qa_required, accepted, rejected, archived)
- Are statuses sufficient? Any missing? Any status transitions that could trap work?

### 13. OpenClaw Direct Connection v2
- Is the request payload scoped correctly?
- Are secrets/system prompts protected?
- Is the confirmation modal clear?
- Does returned output become evidence?
- Is the packet still human-gated after return?

### 14. OpenClaw Supervised Queue v3
- Does explicit packet selection work?
- Does one-at-a-time execution hold?
- Are failure policies clear?
- Are skip/retry/review actions safe?
- Does it avoid running everything automatically?
- Does queue state mirror run state correctly?
- Would it scale to 5, 20, 100 packets?

### 15. Background Monitoring v4
- Does it detect stale runs, timeouts, failed runs, completed-but-not-returned runs, missing evidence, awaiting-QA packets?
- Does it notify appropriately?
- Does dedupe work?
- Does it avoid running next items or accepting packets?
- Are monitor settings clear?

### 16. QA Evidence Review v5
- Does it map evidence to QA requirements?
- Does it map evidence to acceptance criteria?
- Does it detect missing evidence?
- Does it check do-not-touch boundaries?
- Does it avoid accepting packets automatically?
- Is the verdict useful?

### 17. Delivery Readiness v6
Known issue: `kind` vs `event_type` selection bug (fixed, needs re-proof):
- critical monitor events must be counted
- project should flip to blocked when critical events exist
- monitor query errors should surface a blocker instead of silently returning []

Questions:
- Does readiness correctly block delivery when monitor findings are critical?
- Does it block when packets are not accepted?
- Does it block when QA evidence reviews are missing or insufficient?
- Does it distinguish "ready to prepare delivery package" from "delivered"?
- Does it prevent publish/notify/deliver side effects?

### 18. Client Portal / Portal Safety
- Are client-facing views isolated?
- Are internal notes, signals, costs, AI drafts, review comments, system prompts, provider data hidden?
- Are only approved/published client-safe artifacts visible?
- Any leak risks? RLS risks? Naming/field risks? Route risks?

### 19. RLS / Permissions / Security
- staff-only tables?
- authenticated SELECT grants?
- service_role writes?
- no direct INSERT/UPDATE/DELETE from authenticated where intended?
- anon blocked?
- cross-project access?
- admin-only approval actions?
- operator vs admin boundaries?
- audit log coverage?
- secrets not stored? system prompts not stored?

### 20. Audit / Activity / Notifications
- Are important mutations written to engine_audit_log?
- Are operator activities written to engine_activity?
- Are warnings/failures creating operator_notifications?
- Are errors safe/truncated?
- Missing audit events? Noisy events? Events that should trigger alerts?

### 21. Next Best Action
- Does compute_engine_next_best_action correctly surface the next action across all stages?
- Does it understand build packets, OpenClaw queues, QA evidence reviews, Delivery Readiness?
- Does it prioritize real blockers over later-stage actions?
- Does it avoid saying "deliver/publish" too early?
- Known gap: NBA has not been fully updated for all Build Execution/OpenClaw/QA Evidence/Delivery Readiness states.

### 22. Operations Readiness
- Could Tai hand this to a team member and expect them to move projects forward?
- Does it reduce Tai's mental load?
- Too many pages? Too much clicking?
- Are names clear? Stages intuitive? Approval gates practical?
- Anything over-engineered? Under-engineered?

### 23. Design / UX / Layout
- Does the engine feel premium, calm, intelligent, operational?
- Too white/flat? Panels readable?
- Is the sidebar organized correctly?
- Are top tabs becoming too many?
- Does the Command Center visually communicate urgency?
- Are status badges and alerts clear?

### 24. Scalability
- What happens with 10 projects? 100? 1000 build packets?
- Many OpenClaw runs? Many monitor events?
- Many concurrent operators? Many clients?
- Review: query patterns, indexes, pagination, dedupe, data volume, UI performance, audit log growth, notification growth

### 25. Final Strategic Judgment
- Is the engine smooth enough to run Trust Tai operations?
- What would break first in real use?
- Top 10 fixes before real client delivery?
- Top 10 improvements to make it world-class?
- What parts are already strong? Too complex? Missing?
- Should v7 Delivery Package be built now, or stabilize first?

## Required Output Structure

Write the full audit report to `AUDIT_REPORT.md` in the repo root with these sections:

1. **Executive Summary** — Overall verdict, can it run operations today, biggest strengths, biggest risks, recommended next move
2. **Intake-to-Delivery Journey Review** — Flow analysis, smooth points, stalls, intervention points
3. **Architecture Review** — Full factory chain review, missing/overbuilt layers, weak/strong handoffs, recommended changes
4. **Operational Readiness** — Can an operator use this? Can Tai step back? What depends on Tai's brain?
5. **Page-by-Page Review** — Every page/component reviewed
6. **Data / State / RLS Review** — Tables, grants, RLS, server functions, protected surfaces, client portal isolation, audit coverage
7. **Next Best Action Review** — Weaknesses, correct precedence model, required missing states
8. **UX / Design Review** — Navigation, layout, visual hierarchy, statuses, alerts, empty states, premium feel
9. **Scalability Review** — Performance risks, data growth, pagination/indexing, concurrency
10. **Trust & Safety Review** — What the system must never do, guardrail strength, leak/mutation risks
11. **Top 10 Critical Fixes** — Ranked by urgency
12. **Top 10 Product Improvements** — Ranked by operational leverage
13. **Top 10 Strategic Opportunities** — Where the system could become significantly more powerful
14. **Recommendation** — Choose one: Ready for real internal use / Limited pilot / Needs stabilization / Architecture needs rework
15. **Suggested Next Sprint** — What to fix, build, remove, test

## Rules
- Do not be polite at the expense of truth
- If the structure is wrong, say so
- If the best next move is not v7, say so
- Challenge the architecture — do not assume it is correct because it exists
- Read the actual code, migrations, and types. Do not guess.
- Protect the future of Trust Tai operations
