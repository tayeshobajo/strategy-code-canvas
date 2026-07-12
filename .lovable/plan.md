
# Roadmap Engine — Next Build Loop

Seven phases, ordered so each earlier phase unblocks the next. Foundations (truth model, ceremonies, portal transition, evidence gate) come before capability expansion (agents, decomposition, engines). No code in this plan.

Reference: `.orchestrator/roadmap-engine-capability-audit.md`.

---

## Phase 1 — Epistemic-Status Taxonomy (Truth Model)

**Why it matters.** Every downstream ceremony, gate, and agent needs to know whether a fact is *known*, *inferred*, *assumed*, or *contradicted*. Without this, Point A/B approvals are theater, evidence gates can't distinguish real proof from restated claims, and specialist agents can't reason about confidence.

**Current gap.** Audit A/B/D — no epistemic-status field anywhere on spine fields, extracted signals, or roadmap payload. `engine_extracted_signals` has `confidence` (number) but no source-type / provenance / status label. Portal payload flattens everything as fact.

**Schema.**
- New enum `epistemic_status`: `stated`, `inferred`, `assumed`, `contradicted`, `verified`.
- Add `status`, `source_ref` (jsonb: `{kind, id, quote?, timestamp?}`), `superseded_by` to `engine_extracted_signals`.
- Add per-field status map to `engine_projects.point_a`, `point_b` (jsonb sidecar: `point_a_status`, `point_b_status` keyed by field).
- `engine_project_chat_events` gains `epistemic_delta` jsonb for status changes.

**Server functions.**
- `promoteSignalToSpine` — must record status + source_ref.
- `markSpineFieldStatus(project_id, path, status, evidence)` — admin/operator only.
- `detectContradictions(project_id)` — flag when new signal conflicts with existing `stated`.

**UI.**
- Status chip on every Point A / Point B field (stated / inferred / assumed / contradicted).
- Hover reveals source (transcript timestamp, intake question, operator note).
- Filter: "show only inferred/assumed fields" for review.

**Governance.** Only admin/operator can move `inferred` → `stated`. AI can only write `inferred` or `assumed`. Contradictions require human resolution before ceremony gate opens.

**Acceptance.**
- Every field in `point_a` / `point_b` has a status.
- No field enters `stated` without either an intake answer, transcript quote, or operator confirmation.
- Contradiction detector produces at least one flag on a seeded contradictory dataset.

**QA questions.**
- Can I see, for any Point A field, whether Tai actually confirmed it or the AI guessed it?
- If a client contradicts a prior answer, does the system surface it before the next ceremony?
- Does the portal ever show `inferred` content as if it were fact?

**Risk if skipped.** Every later phase reinvents provenance inconsistently. Approval ceremonies can't be trusted. Evidence gate can't tell proof from paraphrase.

---

## Phase 2 — Point A & Point B Approval Ceremonies

**Why it matters.** Point A and Point B are the two load-bearing decisions of the entire roadmap. Today they mutate silently. Without a ceremony boundary, everything downstream (milestones, plans, portal publish) rests on unversioned state.

**Current gap.** Audit B/D — no `pointA_approved_at`, no ceremony record, no locked snapshot. `engine_projects.point_a` / `point_b` are freely editable jsonb; spine version history exists but ceremony-level approval doesn't.

**Depends on.** Phase 1 (needs status taxonomy to know what's being approved).

**Schema.**
- New table `engine_spine_ceremonies` (kind: `point_a` | `point_b`, project_id, version_id, snapshot jsonb, approved_by, approved_at, superseded_at, client_ack_at?).
- `engine_projects` gains `point_a_ceremony_id`, `point_b_ceremony_id` (current-approved pointer).
- Enforce: Point B ceremony cannot open until Point A ceremony is `approved`.

**Server functions.**
- `openPointACeremony`, `approvePointACeremony`, `reopenPointA` (invalidates B).
- Same trio for Point B.
- `getCeremonyDiff(from, to)` — surfaces field-level changes across ceremonies.

**UI.**
- Dedicated `/engine/projects/$id/ceremony/point-a` and `/point-b` routes.
- Show full snapshot + status chips + operator sign-off action.
- Overview page shows "Point A: approved 2 days ago by Tai" or "Awaiting ceremony."
- Reopening Point A shows destructive warning ("this will invalidate Point B and all downstream milestones").

**Governance.** Approval = admin only. Client acknowledgment is separate (Phase 3). Roadmap generation blocked until Point A approved; milestone approval blocked until Point B approved.

**Acceptance.**
- Cannot generate roadmap without Point A ceremony.
- Reopening Point A after Point B is approved surfaces cascade and requires re-approval of B.
- Ceremony snapshots are immutable.

**QA questions.**
- Can I answer "when was Point A finalized and by whom" with one query?
- If Tai reopens Point A, does Point B automatically enter a re-review state?
- Is there a state where the roadmap references a Point B that has since been changed?

**Risk if skipped.** Silent drift; roadmap and portal reference stale strategy. No auditable "we agreed on this" moment.

---

## Phase 3 — Portal Publication as a System Transition

**Why it matters.** Publishing to the portal is currently a data copy, not a state transition. There's no pre-publish preview lock, no client acknowledgment gate as a first-class transition, no rollback, no republish diff.

**Current gap.** Audit K — `publishVersionToPortal` writes rows and returns. No `publish_state` machine. Client ack banner exists (per prior fix) but ack isn't a transition — it's just a boolean.

**Depends on.** Phases 1 & 2 (only ceremony-approved spine can back a publish).

**Schema.**
- New enum `portal_publish_state`: `draft`, `preview_locked`, `published`, `client_acknowledged`, `superseded`, `rolled_back`.
- `client_portal_roadmaps` gains `publish_state`, `published_at`, `acknowledged_at`, `superseded_by`, `preview_locked_by`.
- New table `engine_portal_publish_events` (append-only transition log).
- Trigger: only one `published` row per project at a time.

**Server functions.**
- `lockPreview`, `unlockPreview` — freezes internal editing during client review.
- `publishToPortal` (transition draft/preview_locked → published; supersedes prior).
- `recordClientAcknowledgment` — the acknowledgment fix promoted from boolean to transition.
- `rollbackPortalPublish`, `republishWithDiff`.

**UI.**
- Engine side: publish button shows current state + next legal transition, not a raw action.
- Portal side: "New version available — see what changed" banner when republished after ack.
- Ops timeline of publish events per project.

**Governance.** Publish = admin only. Ack recorded with client email + IP. Rollback logged and visible in portal.

**Acceptance.**
- Two concurrent publishes cannot both land as `published`.
- Client ack is durable across page reloads (fixes the earlier bug at the transition layer, not the handler layer).
- Republish surfaces field-level diff to the client.

**QA questions.**
- If I publish, then republish 10 minutes later, does the client see what changed?
- Can a client claim they never acknowledged and can we prove otherwise?
- Can an operator accidentally edit spine while the client is mid-review?

**Risk if skipped.** Recurring "did we send this?" ambiguity, silent overwrites of what client saw, ack that keeps disappearing (regression risk).

---

## Phase 4 — Required Evidence Gate Hardening

**Why it matters.** Milestone completion currently allows soft evidence. Governance blocks AI self-approval but not "evidence is a screenshot of a Figma link." The gate must enforce *typed* evidence per milestone kind.

**Current gap.** Audit F/L — `engine_project_qa_evidence_reviews` exists; `MilestoneEvidenceGate` component exists. No schema-level requirement mapping milestone → required evidence types. Reviewer can pass anything.

**Depends on.** Phase 1 (evidence entries need epistemic-status/source_ref).

**Schema.**
- New table `engine_evidence_requirements` (milestone_kind, required_kinds array, min_count).
- `engine_evidence` (or existing evidence table) gains `kind` enum (`screenshot`, `test_run`, `deploy_url`, `client_signoff`, `metric_snapshot`, `document`), `verified_by`, `verified_at`.
- Trigger: milestone cannot transition to `complete` unless all required kinds present + verified by non-author.

**Server functions.**
- `defineEvidenceRequirements(milestone_kind, ...)` — admin config.
- `attachEvidence`, `verifyEvidence` (verifier ≠ attacher).
- `evaluateGate(milestone_id)` — returns pass/fail + missing kinds.

**UI.**
- Milestone view shows checklist: "Required: 1 deploy URL ✅ · 1 client sign-off ⏳".
- Cannot mark milestone complete until checklist green.
- Reviewer identity shown next to each evidence item.

**Governance.** Non-author verification enforced at DB layer. AI can attach evidence but never verify.

**Acceptance.**
- Migration seeds sensible defaults per milestone kind.
- Attempting to close a milestone with missing evidence throws with a clear message listing what's missing.
- Author-verifies-own-evidence rejected at DB.

**QA questions.**
- For a "shipped feature" milestone, can it close without a deploy URL?
- Can the person who uploaded evidence also mark it verified?
- Can I list every milestone that closed without meeting requirements? (Should be zero.)

**Risk if skipped.** Milestones "complete" on paper only. Portal shows green when work isn't real.

---

## Phase 5 — Specialist Agent Architecture

**Why it matters.** Today there is one generic Captain. Real leverage needs specialists (Intake Interviewer, Strategy Analyst, Roadmap Composer, Plan Architect, QA Reviewer, Portal Editor) each with scoped permissions and evaluators.

**Current gap.** Audit C — `engine_agent_tasks`, `engine_agent_permissions`, `engine_agent_costs` exist but `agent_kind` is effectively single-role. No per-agent prompt registry, no per-agent output schema, no evaluator hooks.

**Depends on.** Phases 1–4 (agents need truth model, ceremony boundaries, publish state, and evidence contract to operate against).

**Schema.**
- New table `engine_agents` (kind enum, current_prompt_version, allowed_actions[], output_schema jsonb, model_pref).
- New table `engine_agent_prompt_versions` (agent_id, version, prompt, changelog, activated_at).
- `engine_agent_tasks` gains `agent_id` FK, `input_context_hash`, `output_valid` bool, `evaluator_score`.
- Tighten `engine_agent_permissions` to per-agent-kind allowlist.

**Server functions.**
- `invokeAgent(kind, context)` — routes to correct prompt + schema + model.
- `registerAgentPromptVersion` (admin).
- `runAgentEvaluator(task_id)` — schema validity, hallucination checks, cost budget.

**UI.**
- `/engine/agents` — list agents, current prompt version, recent runs, avg cost, eval pass rate.
- Per-project agent activity log filtered by agent kind.
- Prompt version diff view.

**Governance.** Each agent's `allowed_actions` enforced at server-fn dispatch. Prompt changes require admin. Evaluator failure blocks proposal from reaching Approvals Queue.

**Acceptance.**
- At minimum 4 agent kinds live: Intake Interviewer, Strategy Analyst, Roadmap Composer, QA Reviewer.
- An agent cannot invoke an action outside its allowlist even if prompted to.
- Prompt rollback returns identical outputs on a fixed input.

**QA questions.**
- If the Roadmap Composer tries to publish to the portal, is it blocked?
- Can I A/B two prompt versions for the same agent?
- Do I know which agent (and which prompt version) authored any given proposal?

**Risk if skipped.** Single-Captain bottleneck; no path to specialized quality; prompt changes are ad-hoc and unauditable.

---

## Phase 6 — Parent/Child Project Decomposition

**Why it matters.** Real businesses have programs of work, not a single project. Milestones are sometimes projects in their own right. Without parent/child, portfolio view lies about capacity.

**Current gap.** Audit E — `engine_projects` is flat. No parent FK. Milestones don't spawn child projects. Portfolio queries treat each project as atomic.

**Depends on.** Phase 5 (a Roadmap Composer specialist proposes decomposition), Phase 2 (child projects need their own ceremonies).

**Schema.**
- `engine_projects` gains `parent_project_id`, `origin_milestone_id`, `decomposition_kind` (`program`, `spinoff`, `sub_workstream`).
- New view `engine_project_tree` for portfolio rollups.
- Trigger: closing a parent requires all children closed or explicitly detached.

**Server functions.**
- `spawnChildFromMilestone(milestone_id)` — creates child project inheriting Point A, requiring its own Point B ceremony.
- `attachChildProject`, `detachChildProject`.
- Rollup: `getProjectTreeStatus(parent_id)`.

**UI.**
- Overview shows parent/children with status rollup.
- Milestone card gains "Promote to child project" action.
- Portfolio / Command Center groups by tree, not flat list.

**Governance.** Only admin promotes milestone → child. Child inherits parent's client access.

**Acceptance.**
- A milestone can be promoted to a child project without losing evidence/history.
- Portfolio load with 50 projects across 10 trees renders under budget.
- Closing parent with open children blocked with clear message.

**QA questions.**
- Can I see a program with its child projects as one view?
- If I promote a milestone, do its existing evidence rows come with it?
- Does portal show child projects distinctly to the client?

**Risk if skipped.** Portfolio-level decisions made on inaccurate rollups. No natural home for multi-quarter programs.

---

## Phase 7 — Recurring Business Operating Engines

**Why it matters.** The product promise is not "we ship a roadmap" — it's "we run the business's operating engines." Content, Lead Follow-Up, Ops Rhythm, etc., are recurring loops with their own cadences, evidence, and reviews.

**Current gap.** Audit N — engines are entirely absent. No cadence table, no engine instance, no recurring evidence.

**Depends on.** All prior phases — engines are the highest-level composition and need agents (5), decomposition (6), ceremonies (2), truth (1), publish transitions (3), and evidence (4).

**Schema.**
- New table `engine_operating_engines` (kind: `content_authority`, `lead_followup`, `ops_rhythm`, `financial_hygiene`, etc.; project_id or parent_id; cadence; owner; sla).
- New table `engine_engine_runs` (engine_id, run_started_at, run_completed_at, evidence_ids, status).
- `engine_engine_checkins` for 30/60/90 review cadence.

**Server functions.**
- `defineEngine`, `scheduleEngineRun`, `recordEngineRun`, `escalateMissedRun`.
- Cron-driven (pg_cron via existing pattern) run-generator that opens runs on cadence.

**UI.**
- `/engine/projects/$id/engines` — engine list, cadence, next run, streak, last evidence.
- Portal side: client sees "This month's engine runs" summary.
- NBA integration: missed engine runs feed portfolio exception list.

**Governance.** Engine definition = admin. Run completion requires evidence (Phase 4 gate applies).

**Acceptance.**
- At least 2 engine kinds fully wired end-to-end.
- Missed runs surface in Command Center within one cadence period.
- 30/60/90 check-in feeds back into roadmap adjustments (proposals to Approvals Queue).

**QA questions.**
- Can I prove content-authority ran every week for the last quarter?
- If an engine misses two consecutive runs, does the client see it?
- Do outcome check-ins actually mutate the roadmap or just annotate it?

**Risk if skipped.** Product remains "roadmap-as-a-service" rather than "operating system." Client value collapses after delivery.

---

## Suggested Build Order

1. **Phase 1** — Truth model (foundation, unblocks everything).
2. **Phase 2** — Ceremonies (needs 1).
3. **Phase 3** — Portal transition (needs 2; also fixes the recurring ack regression at the right layer).
4. **Phase 4** — Evidence gate (needs 1; parallelizable with 3 if capacity allows).
5. **Phase 5** — Specialist agents (needs 1–4 as operating surface).
6. **Phase 6** — Decomposition (needs 2 and 5).
7. **Phase 7** — Operating engines (needs everything).

Phases 3 and 4 can run in parallel if two operators are available. Phases 5–7 are strictly sequential.

---

## Cross-Cutting Non-Goals for This Loop

- No marketing site work.
- No Stripe/payments changes.
- No portal visual redesign.
- No migration is authored during planning — every schema line above becomes a `PENDING_MIGRATIONS.md` entry when its phase enters build.
