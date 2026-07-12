# The Roadmap Engine — Complete Phase Map to 100%

*Created: 2026-07-11. Source: Captain + Tai vision alignment conversation (4:26 PM CDT).*
*Cathedral-level thinking: every surface, every actor, every failure mode, every lifecycle state.*

---

## Status Key
- ✅ Built
- 🔶 Partial — exists but incomplete
- 🔸 Not built

---

## LAYER 1 — FOUNDATION
*The platform exists and is trustworthy*

### Phase 1 — Platform Foundation ✅
Authentication, organizations, roles, clients, projects, permissions, audit trail, core data model, multi-tenancy, security boundaries

### Phase 1B — Platform Governance 🔸 Partial
Rate limiting, cost controls, agent budgets, abuse prevention, data retention policy, backup strategy, GDPR/data deletion flows, terms enforcement, support escalation path

---

## LAYER 2 — INTAKE
*A founder can begin and the platform receives their story cleanly*

### Phase 2 — Conversational Intake ✅
Adaptive questions, save and resume, attachments, voice notes, client identity, submission management, intake states

### Phase 2B — Intake Intelligence 🔸 Partial
Auto-research triggers, contradiction detection during intake, smart question ordering, duplicate submission detection, intake quality scoring before submission is accepted

### Phase 2C — Proposed Change Flow 🔸 Not built — NEXT PRIORITY
The governance mechanism that enforces Captain CANNOT rules.
- Captain conversation containing a proposed change surfaces a structured proposal card
- Proposal contains: what changes, what it affects, risk level, affected milestones
- Routes to Approvals Queue for human approve/reject
- On approve: project spine updates, version increments, audit trail entry written
- DB table: `engine_project_chat_proposals` already exists
- Server functions: `engine-chat-proposals.functions.ts` already built
- UI component: `src/components/engine/chat/ProposalCard.tsx` already exists
- What is missing: wire ProposalCard into chat route, add approve/reject server mutations that write back to spine and audit trail

---

## LAYER 3 — UNDERSTANDING
*The Captain knows what is true, what is assumed, and what is missing*

### Phase 3 — Understanding Engine ✅
Intelligence extraction, Known/Inferred/Missing/Contradictory classification, confidence scoring, clarification questions, Understanding Room

### Phase 3B — Research and Verification Layer 🔸 Not built
Captain autonomously researches: existing website audit, Google presence, social media audit, competitor landscape, industry benchmarks, domain/hosting, SEO health.

### Phase 3C — Understanding Confidence Gate 🔸 Not built
Platform cannot advance to Point A until understanding confidence clears a defined threshold.

### Phase 3D — Project AI Workspace 🔸 Not built
Every project gets a dedicated ChatGPT conversation and Claude project as its persistent AI brain.
- `engine_projects` gets two new fields: `chatgpt_conversation_url`, `claude_project_url`
- Project creation flow prompts for these (or they can be set later in project settings)
- Engine UI shows an "AI Workspace" tab per project with links + last mockup + last decision logged
- Captain reads the ChatGPT conversation before generating mockups for that project
- Captain reads the Claude project for architectural context before building phases
- Before any build phase: Captain navigates to project ChatGPT, generates mockup, waits for approval
- DB: migration needed to add columns to engine_projects (write to PENDING_MIGRATIONS.md — do NOT apply)

**Understanding Room classification system:**
Known / Inferred / Missing / Contradictory / Needs confirmation / Accepted assumption / Approved truth

**"100% understanding" = no important uncertainty is hiding. Not that everything is known.**

---

## LAYER 4 — DIAGNOSIS AND DIRECTION
*Point A is honest. Point B is specific.*

### Phase 4 — Project Spine ✅
Point A, Point B, constraints, risks, decisions, success metrics, versioning, approval gates

### Phase 4B — Spine Governance 🔸 Not built
Spine version history with diff view. Every change to an approved Spine entry requires a reason, an approver, and an audit entry. Client acknowledgment of Point B before roadmap generation begins.

### Phase 4C — Decision Log 🔸 Not built
A cross-project, cross-spine feed of every approved change decision made in the platform.
- Surfaces every instance where a spine field was changed, why, and who approved it
- Filterable by project, field type, date range, approver, and decision type
- Each entry shows: what changed, old value, new value, reason given, approved by, downstream impact (milestones affected, packets unblocked/blocked)
- Operator can see the full decision history of a client relationship at a glance
- Turns audit trail into institutional memory — every decision is explainable
- No migration needed if engine_spine_versions table exists; feeds from that table

---

## LAYER 5 — THE ROADMAP
*The plan is unique to this business, generative, and defensible*

### Phase 5 — Generative Roadmap ✅
Capability-gap analysis, strategic phases, milestones, dependencies, outcomes, investment ranges, roadmap visualization

### Phase 5B — Roadmap Intelligence Layer 🔸 Partial
Every milestone includes: what was found, evidence, confidence, why it matters, what it unlocks, strategic priority, dependencies, risk, estimated investment, expected timeline, success measure.

### Phase 5C — Roadmap Scenarios 🔸 Not built
Aggressive / Conservative / Core paths. Client selects pace and investment level.

---

## LAYER 6 — ROADMAP REVIEW AND CLIENT DELIVERY
*The client receives a clean, approved deliverable*

### Phase 6 — Roadmap Review and Client Delivery 🔶 Partial
Internal review, roadmap approval, client-safe publishing, client acknowledgment, roadmap versions, PDF/portal presentation

### Phase 6B — Delivery Completeness Gate 🔸 Not built
Before a roadmap is published to the client portal, a checklist must pass: Point A confirmed, Point B confirmed, all milestones have rationale, investment ranges present, client communication drafted.

### Phase 6C — Client Acknowledgment Flow 🔸 Not built
Client receives roadmap → reads it → formally acknowledges understanding → approves to proceed (or requests revision). Stored, timestamped, version-locked.

---

## LAYER 7 — PLANS AND SPECIFICATIONS
*Strategy becomes buildable*

### Phase 7 — Plans and Specifications ✅ (UI built)
Project frames, mockups, architecture, specifications, acceptance criteria, QA plans

### Phase 7B — Plan Depth and Completeness 🔸 Not fully built
Each plan must include: user journeys, sitemap (if web), data model, integrations, permissions matrix, content requirements, performance targets, accessibility requirements, SEO requirements.

### Phase 7C — Mockup-to-Spec Pipeline 🔸 Not built
Visual mockup → human review → approved reference → spec written against it.

---

## LAYER 8 — WORK AND AGENT ORCHESTRATION
*Work gets done by the right agent or human, with clear scope*

### Phase 8 — Work and Agent Orchestration 🔶 Partial
Execution packets, human assignments, agent assignments, model routing, costs, handoffs, failures and fallbacks

### Phase 8B — Execution Packet Completeness 🔸 Not fully built
Every packet must have: goal, scope, exclusions, approved inputs, dependencies, owner, executor, do-not-touch boundaries, output contract, acceptance criteria, evidence requirements, cost limit, fallback behavior.

### Phase 8C — Agent Capability Routing 🔸 Not built
Platform requests capabilities rather than hardcoding providers.

### Phase 8D — Cost and Budget Enforcement 🔸 Not built
Each project has an agent budget. Captain cannot spawn work that would exceed budget without approval.

---

## LAYER 9 — EVIDENCE AND QA
*Output is not acceptance. Evidence is not proof. Review is not delivery.*

### Phase 9 — Evidence and QA ✅ (UI built)
Evidence collection, QA gates, review, acceptance, rejection, revision cycles

### Phase 9B — Evidence Requirements Enforcement 🔸 Not built
System physically blocks milestone completion without evidence checklist satisfied.

### Phase 9C — AI Self-Assessment Prevention 🔸 Critical gap
The AI cannot mark its own work as accepted. Enforced at the data layer. Any record where `created_by` and `approved_by` would be the same agent must be rejected by the schema. **MIGRATION ONLY — write to PENDING_MIGRATIONS.md.**

---

## LAYER 10 — DELIVERY AND CLIENT SUCCESS
*The client receives a complete, documented handoff*

### Phase 10 — Delivery and Client Success 🔸 Exists in structure, not fully operational
Delivery Room, client updates, training, handoff, acceptance, support, next-phase recommendations

### Phase 10B — Delivery Readiness Gate 🔸 Not built
Before delivery is offered: all milestones complete, evidence accepted, QA gate passed, client communication drafted.

### Phase 10C — Post-Delivery Learning Loop 🔸 Not built
Outcome survey, 30/60/90 day check-ins, Captain generates next-phase recommendation.

---

## LAYER 11 — COMMAND CENTER AND PORTFOLIO OPERATIONS
*Tai can see everything across all projects without drowning in detail*

### Phase 11 — Command Center ✅ (built 2026-07-11)
Exception queues, Intelligent NBA, portfolio risk, workload, budget tracking, delivery forecasting

### Phase 11B — Exception-Based Management 🔸 Not fully built
At 100+ projects, Command Center surfaces only what needs human attention.

### Phase 11C — Drift Detection 🔸 Not built
Captain continuously compares project state to approved Spine. Surfaces drift immediately.

### Phase 11D — Capacity and Workload Intelligence 🔸 Not built
Real capacity, bottlenecks, at-risk projects this week.

---

## LAYER 12 — BUSINESS ENGINES AND FOUNDER CONSISTENCY

### Phase 12A — Engine Builder 🔸 Not built
Founding engines: Content Authority, Lead Follow-Up, Reputation, Client Success, Founder Operating Rhythm.

### Phase 12B — Project Memory 🔸 Not built
### Phase 12C — Industry Memory 🔸 Not built
### Phase 12D — Agent Performance and Outcome Learning 🔸 Not built
### Phase 12E — Ongoing Roadmap Regeneration 🔸 Not built

---

## LAYER 13 — CLIENT PORTAL (FULL)

### Phase 13 — Client Portal 🔶 Partial
### Phase 13B — Portal as Downstream-Only View 🔸 Not fully built
### Phase 13C — Client Decision Center 🔸 Not built
### Phase 13D — Client Progress Narrative 🔸 Not built

---

## LAYER 14 — COMMERCIAL INFRASTRUCTURE

### Phase 14 — Billing and Commercial Operations 🔸 Not built
### Phase 14B — Operator Onboarding 🔸 Not built

---

## LAYER 15 — OBSERVABILITY AND RELIABILITY

### Phase 15 — Platform Observability 🔸 Not built

---

## Summary Table

| Layer | Phase(s) | Status |
|---|---|---|
| Foundation | 1, 1B | ✅ / 🔸 |
| Intake | 2, 2B, 2C | ✅ / 🔸 / 🔸 |
| Understanding | 3, 3B, 3C, 3D | ✅ / 🔸 / 🔸 / 🔸 |
| Diagnosis | 4, 4B, 4C | ✅ / 🔸 / 🔸 |
| Roadmap | 5, 5B, 5C | ✅ / 🔸 / 🔸 |
| Client Delivery | 6, 6B, 6C | 🔶 / 🔸 / 🔸 |
| Plans & Specs | 7, 7B, 7C | ✅ / 🔸 / 🔸 |
| Orchestration | 8, 8B, 8C, 8D | 🔶 / 🔸 / 🔸 / 🔸 |
| Evidence & QA | 9, 9B, 9C | ✅ / 🔸 / 🔸 |
| Delivery | 10, 10B, 10C | 🔸 / 🔸 / 🔸 |
| Command Center | 11, 11B, 11C, 11D | ✅ / 🔸 / 🔸 / 🔸 |
| Business Engines | 12A–12E | 🔸 all |
| Client Portal | 13, 13B, 13C, 13D | 🔶 / 🔸 / 🔸 / 🔸 |
| Commercial | 14, 14B | 🔸 / 🔸 |
| Observability | 15 | 🔸 |

---

## The Three Highest-Leverage Gaps

1. **Phase 2C** — Proposed Change Flow. Governance mechanism. Infrastructure already in codebase.
2. **Phase 6C + 13B** — Client acknowledgment and portal-as-downstream-only.
3. **Phase 9C** — AI self-assessment prevention at schema level. Migration only — Tai must approve.

*Last updated: 2026-07-11 by Captain*
