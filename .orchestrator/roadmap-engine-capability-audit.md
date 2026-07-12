# Trust Tai Roadmap Engine — Capability Audit

**Date:** 2026-07-12
**Method:** Read-only. 6 parallel code+DB explores + direct `pg_constraint` / `pg_policies` queries. No code changes, no migrations, no writes to real projects.
**Scope:** All 17 target-state confirmation sections (A–Q, ~200 items) plus the Ultimate Confirmation.
**Legend:** ✅ **Confirmed** — executable code path or enforced DB constraint proves it • 🟡 **Partial** — mechanism exists but has a real, named gap • 🔴 **Not Built** — no supporting artifact found • ⚪ **N/A** — item doesn't map to current architecture.

---

## Section verdict summary

| § | Cluster | Verdict | Headline |
|---|---|---|---|
| A | Conversational Intake | 🟡 Partial | Adaptive intake works; per-answer timestamps and follow-up-type differentiation are thin. |
| B | Automatic Understanding | 🟡 Partial | Extraction runs auto; **no epistemic-status taxonomy** (known/inferred/…); no auto-clarification/routing. |
| C | Captain & Specialist Agents | 🔴 Mostly Not Built | Single "Roadmap Agent" per project; **no specialist agent architecture**. |
| D | Understanding Readiness | 🟡 Partial | Confidence-driven scoring is real; Point A/B human sign-off uses generic step state, not a dedicated ceremony. |
| E | Generative Roadmap | 🟡 Partial | Milestone data model is rich; "100/100 definition", explicit coverage taxonomy, "don't build yet" recommender missing. |
| F | Multiple Solutions / Decomposition | 🔴 Not Built | `engine_projects` has no parent/child columns — architecturally absent. |
| G | Mockups, Plans, Specs | 🟡 Partial | Mockup approval gate is enforced (trigger + query filter); complexity-adaptive planning depth and field-level approval missing. |
| H | Controlled Build & Execution | 🟡 Partial | DB state-machine trigger enforces packet transitions; no owner/deadline fields, no cost-overrun approval flow, no dependency unlock. |
| I | QA & Evidence | 🟡 Partial | Evidence types + AI/human separation are solid; **acceptance evidence gate is bypassable** via free-text ack. |
| J | Approvals & Governance | 🟡 Partial | AI self-approval blocked at DB (CHECK constraints); approval vocabulary missing conditional/defer/escalate, no impact-disclosure schema. |
| K | Spine, Versioning, Drift | 🟡 Partial | Spine field history + side-by-side diff wired to `engine_audit_log`; drift is read-only diagnostic (correct), missing budget/technical drift kinds and downstream-impact record. |
| L | Client Comms & Portal | 🟡 Partial | RLS correctly separates internal from client-visible; publication-as-transition, typed activity tracking, Captain-drafted comms not located. |
| M | Business Engines & Founder Rhythm | 🔴 Not Built | Zero code references to Content Authority / Lead Follow-Up / Reputation / Client Success / Founder Rhythm engines. No cron/scheduler infra. |
| N | Delivery & Stage Transitions | 🟡 Partial | Readiness computation exists; `engine_delivery_items` carries notice metadata only, not files/links/access/training/support. |
| O | Outcome Feedback & Learning | 🟡 Partial | 30/60/90 windows computed **reactively on query**, not proactively scheduled; feedback→roadmap loop absent. |
| P | Portfolio Scale & Exception Mgmt | ✅ Mostly Confirmed | Exception Board, NBA (with SQL fallback), Command Center all real; multi-factor ranking (financial/client-risk) and unified milestone drill-in are thin. |
| Q | Reliability, Security, Accountability | 🟡 Partial | Model-agnostic + fallback confirmed; audit trail fragmented across two tables; confidence captured but not gated; owner-accountability field not surfaced. |

**Overall posture:** Governance, spine protection, portal isolation, and portfolio-level exception surfacing are the strongest areas — all backed by DB constraints or set-based server queries. The weakest architectural gaps are (1) the specialist-agent model, (2) multi-project decomposition, and (3) the M-section recurring "operating engines" — all three are effectively unbuilt, not just partial.

---

## Section A — Conversational Intake

| # | Confirmation | Status | Evidence |
|---|---|---|---|
| A1 | Intake is conversational, not static questionnaire | ✅ | `src/lib/intake/conversation-planner.ts:84-138`, `question-generator.ts:33-78` — `planNextTurn` branches on memory/gaps; generator produces contextual sentences, not fixed copy. |
| A2 | Adapts next question based on prior answers | ✅ | `conversation-planner.ts:115-136` (`analyzeGaps`, `rankAllCandidates`). |
| A3 | Avoids re-asking known items | ✅ | `question-generator.ts:47-49,59,74-75`; `passesVoiceCheck` L15-31 rejects near-duplicates. |
| A4 | Deeper follow-ups for vague/contradictory/strategic answers | 🟡 | `conversation-planner.ts:106-124` — single `clarify-low-confidence` branch handles all three cases; no distinct code paths per follow-up type. |
| A5 | Adapts by business type/maturity/goals/constraints | ✅ | `src/lib/intake/frame-profiles.ts:37-38,287-294`; frame chosen in `intake-classify.functions.ts`. |
| A6 | Clients save and resume | ✅ | `intake.functions.ts:97-222` (`saveDraft`, `LoadDraftInput`) + `intake_drafts.resume_token`. |
| A7 | Uploads: docs, screenshots, links, recordings, materials | 🟡 | `intake-media.functions.ts:1-13,68-79`, `intake-sources.functions.ts:29,49` — images/audio/docs/links/transcripts handled; **video explicitly returns empty summary** (`intake-media.functions.ts:74-79`). |
| A8 | Ingests meeting transcript | ✅ | `intake-sources.functions.ts:29,49,64,136` — distinct `kind:"transcript"` path. |
| A9 | Required vs optional distinction | ✅ | `frame-profiles.ts:29` `required: boolean` + `requiredFields`/`optionalFields` split. |
| A10 | Recognizes not-a-fit + routes appropriately | ✅ | `intake-frames.ts:245-267,304`, `conversation-planner.ts:89-90` — `not_a_fit` frame short-circuits with `redirect_not_fit`. |
| A11 | Every answer retains source + timestamp | 🟡 | `intake-memory.ts:17-18` has `evidence`/`source` per fact; **no per-answer `timestamp` field** — only draft-level `updated_at`. |
| A12 | Intake reviewed internally before treated as truth | ✅ | Migration `20260630150000_intake_project_init.sql:18-29` — `roadmap_intake_reviews.approval_required`, `outbound_blocked` default `true`; held in `needs_review` until reviewed via `src/routes/ops/submissions.$id.tsx`. |

---

## Section B — Automatic Understanding

| # | Confirmation | Status | Evidence |
|---|---|---|---|
| B1 | Understanding begins automatically post-intake | ✅ | `engine-project-intake.functions.ts:462-470` calls `runIntelligencePipelineInternal` inline. |
| B2 | Extracts facts/goals/constraints/risks/assets/assumptions/unresolved questions | 🟡 | `engine_signal_category` enum (migration `20260704152247`:3-7) covers goal/pain/opportunity/deadline/constraint/decision_maker/hidden_asset/risk/required_system/milestone_candidate/investment_signal/client_language/open_question. **"assumptions" is not a distinct category.** |
| B3 | Classifies known/inferred/missing/contradictory/needs_confirmation/approved_truth | 🔴 | Zero matches in `engine-intelligence.functions.ts` and migration enums. Existing vocabulary is signal *category*, not epistemic status. |
| B4 | Never presents inference as confirmed fact | 🔴 | `engine_intelligence_memory.confidence` exists but no gating flag prevents inferred rows from being surfaced as fact. |
| B5 | Detects contradictions across intake/docs/meetings/research | 🟡 | UI references exist (`understanding-room.tsx`); no dedicated contradiction-detector function/table located. |
| B6 | Every finding linked to supporting evidence | ✅ | `engine_extracted_signals.source_id → engine_sources(id)`, `extraction_run_id → engine_extraction_runs(id)` (FK-enforced, migration `20260704152247`:78-92). |
| B7 | Confidence level per finding | ✅ | `engine_extracted_signals.confidence smallint NOT NULL DEFAULT 70`; `engine_intelligence_memory.confidence` default 80. |
| B8 | Identifies material info still required | 🟡 | Gap logic present in intake stage (`hasEnoughSignal`, `conversation-planner.ts:63-82`); no post-extraction material-gap identifier confirmed. |
| B9 | Auto-prepares clarification questions | 🔴 | `client_clarification` exists only as a manually-authored proposal type. No auto-generation from extraction gaps. |
| B10 | Assigns missing info to client/team/research/specialist | 🔴 | No `assigned_to`/`owner_type` field in `engine_extracted_signals` or `engine_intelligence_memory`. |
| B11 | Updates when new information arrives | ✅ | `engine-intelligence.functions.ts:160-167` `reprocessSource` + re-invokable pipeline. |
| B12 | Material change to approved understanding creates a proposal | 🟡 | Proposal mechanism exists and blocks auto-approval (`engine-chat-proposals.functions.ts:22,83,377-397,567-579`), but is chat-triggered, not fired automatically on diff. |

---

## Section C — Captain and Specialist Agents

| # | Confirmation | Status | Evidence |
|---|---|---|---|
| C1 | Every qualified intake gets a Captain | 🟡 | `engine-project-intake.functions.ts:176-183` inserts one "Roadmap Agent" per project. No qualification gate observed. |
| C2 | Captain has PM/PjM/SA/dev/CS/growth capabilities | 🔴 | No capability taxonomy in `engine-agent.functions.ts`/`engine-agent-prompts.ts`. Only task `kind`s (milestone_brief, acceptance_criteria, qa_checklist, etc.). |
| C3 | Understands the business, not just the deliverable | 🟡 | Chat context loads `point_a`/`point_b` (`engine-chat-context.server.ts`); no explicit capability marker for business vs deliverable focus. |
| C4 | Access to Spine/roadmap/decisions/risks/work/evidence/history | ✅ | Chat context + NBA load `point_a/point_b/open_decisions/next_action` (`engine-nba.functions.ts:115,172`). |
| C5 | Instantiates specialists only when needed | 🔴 | Only one generic agent row created per project. No dynamic specialist instantiation logic. |
| C6 | Specialists: research/design/dev/SEO/analytics/content/QA/compliance/automation | 🔴 | `grep specialist` = 0 hits. Task kinds run inside the single Captain, not distinct specialist agents. |
| C7 | Per-agent permissions, no cross-client access | ✅ | `engine-execution.functions.ts:37-49` `assertActionAllowed` scopes by `project_id` via `engine_agent_permissions`. |
| C8 | Every run records model/task/inputs/outputs/cost/latency/evidence | 🟡 | `engine_agent_costs` inserts at `engine-agent.functions.ts:228`, `engine-execution.functions.ts:439,559,1399,1555`. Column completeness for latency/evidence not independently verified. |
| C9 | Agent cannot approve own work | ✅ | DB CHECK `no_ai_self_approval`, `no_ai_self_complete` on `engine_milestones`; `no_ai_self_completion` on `engine_tasks`. Verified via `pg_constraint`. |
| C10 | Captain always knows next-action owner | 🟡 | `engine-nba.functions.ts:115,172` exposes `next_action` string; owner (person/role) not confirmed as structured field. |
| C11 | Escalates when human judgment required | 🟡 | `assertActionAllowed` throws `needs_approval` (`engine-execution.functions.ts:47`) — escalation-by-blocking. No distinct notification/escalation event. |
| C12 | Captain can prepare, not publish/approve/alter scope alone | ✅ | `assertActionAllowed` hard-blocks `send_delivery`/`move_project_to_execution` regardless of permissions (`engine-execution.functions.ts:31-33`); combined with CHECK constraints. |

---

## Section D — Understanding Readiness

| # | Confirmation | Status | Evidence |
|---|---|---|---|
| D1 | Meaningful readiness threshold before roadmap | 🟡 | `engine.functions.ts:2484-2500` — thresholds (≥85 known, ≥70 inferred, ≥40 needs_confirmation). Hardcoded magic numbers, not milestone-specific. |
| D2 | "100% understanding" = resolved/assigned/assumption/risk | 🟡 | State machine maps to `approved`/`contradictory`/`needs_confirmation`/`known`; no single aggregate 100% gate combining all areas. |
| D3 | Doesn't require irrelevant areas resolved for specific milestone | 🔴 | `AREA_DEFS` (`engine.functions.ts:2120`) not confirmed to filter per-milestone materiality. |
| D4 | Measured by importance + confidence, not field count | ✅ | `engine.functions.ts:2484-2500` derives state from weighted `avgConf` + artifact confidence. |
| D5 | Explains what's preventing readiness | ✅ | `UnderstandingArea.summary` populated with reason text (e.g., "No signals captured yet.", contradiction regex L2492-2493). |
| D6 | Authorized human approves Point A | 🟡 | Generic `StepStateBar` (draft/review/approved) shared by all steps (`src/components/engine/StepState.tsx:52`) — no Point-A-specific approval endpoint located. |
| D7 | Authorized human approves Point B | 🟡 | Same as D6 — Point B uses the shared generic step approval. |
| D8 | Approved Point A/B promoted into protected Spine | ✅ | `engine.functions.ts:1290-1358` — spine step changes (`isSpineStep`) write per-field audit rows with `action='spine_field_changed'`, feeding `getSpineFieldHistory`. |

---

## Section E — Generative Business Roadmap

| # | Confirmation | Status | Evidence |
|---|---|---|---|
| E1 | Generated per business, not from fixed checklist | ✅ | `engine_projects.blueprint/roadmap` jsonb per client_id; no fixed checklist table. |
| E2 | Defines "100/100" for that business | 🔴 | No `target_state`/`100_100` field or artifact in schema. |
| E3 | Evaluates full digital + operational presence | 🟡 | `engine_projects.point_a/point_b/gap_map/blueprint` jsonb — structure exists; content breadth unverifiable statically. |
| E4 | Considers positioning/website/SEO/…/accessibility where relevant | 🔴 | No structured taxonomy enum for these categories. |
| E5 | Explains what to build / why / what it unlocks | 🟡 | `engine_milestones.brief_md`, `client_safe_md` are freeform; not enforced structure. |
| E6 | Sequences by dependencies + business leverage | 🟡 | `sort_index` + `dependencies` jsonb exist; leverage-scoring logic not located. |
| E7 | Phases = business transformation, not production stages | 🔴 | `engine_milestones.phase` is free text with no enum enforcement. |
| E8 | Websites/portals/CRMs/automations/dashboards appear as milestones | 🔴 | `related_system_node` is free text; no typed classification. |
| E9 | Every milestone has rationale/ownership/deps/timing/investment/risks/success | ✅ | `engine_milestones` columns: `owner_email, dependencies, due_date, estimated_cost_cents, risks, acceptance_criteria, brief_md`. |
| E10 | Can recommend "don't build yet" | 🔴 | No `defer`/`not_yet` recommendation path. `can_be_deferred` in QA factory is unrelated. |
| E11 | Identifies underused existing assets | ✅ | `hidden_assets` jsonb + dedicated module (`engine.functions.ts:223`, `engine-intelligence.functions.ts:1413`). |
| E12 | Identifies urgent foundations/future opps/optional/current risks | 🟡 | `priority`, `related_gap`, `deadline_relevance` exist; no unified classifier. |
| E13 | Recommendations remain proposed until approved | ✅ | `engine_milestones.approval_status` + `no_ai_self_approval` CHECK. |
| E14 | Roadmap remains living operating path after delivery | 🟡 | `engine_roadmap_versions` + `roadmap_version_id` FK; post-delivery update workflow not evidenced. |

---

## Section F — Multiple Solutions and Project Decomposition

| # | Confirmation | Status | Evidence |
|---|---|---|---|
| F1 | Recognizes when one need requires multiple solutions | 🔴 | Zero grep hits for "multiple solutions" / decomposition. |
| F2 | Single engagement can contain 2+ connected projects | 🔴 | `engine_projects` has no `parent_project_id` / engagement column. Flat `client_id → projects`. |
| F3 | Parent business transformation with child projects | 🔴 | No parent/child columns. |
| F4 | Each child has own scope/team/budget/timeline/plans/execution/evidence/approvals | 🔴 | Depends on F3. |
| F5 | Dependencies between children visible + enforced | 🔴 | `engine_milestones.dependencies` is project-scoped only; no cross-project dependency field. |
| F6 | One child proceeds while another remains in discovery | 🔴 | Depends on F3. |
| F7 | Change in one triggers impact analysis on connected solutions | 🔴 | `engine_change_events` is per-project only. |
| F8 | Captain recommends splitting oversized milestone into independent projects | 🔴 | No split recommendation logic. |
| F9 | Client sees one coherent journey across multiple delivery projects | 🔴 | `client_portal_project_id` is 1:1 with `engine_projects`; no unification layer. |

Section F is architecturally absent, not merely unwired.

---

## Section G — Mockups, Plans, and Specifications

| # | Confirmation | Status | Evidence |
|---|---|---|---|
| G1 | Knows when enough understanding to begin mockups | 🟡 | `engine-plan-depth.functions.ts:1-30` audits existing plans; not a start-trigger gate. |
| G2 | Mockups generated from approved truth + brand + user + milestone | 🟡 | `engine_project_mockups.frame_id → engine_project_frames` FK; "brand+user" inputs not fully traced. |
| G3 | Mockups linked to roadmap milestone | ✅ | Chain via `frame_id` and downstream `mockup_id` FKs on backend_plans/impl_plans/qa_plans. No direct `milestone_id` column on mockups. |
| G4 | Approval state + version history | ✅ | `engine_project_mockups.status/approved_by_email/approved_at` + trigger `tg_engine_project_mockups_enforce` (migration `20260709170034`:57-92). No dedicated version-history table — enforced-archive pattern. |
| G5 | Client feedback creates proposed revision, not overwrite | 🟡 | Trigger forces archive before change; no auto-created "proposed revision" row/link located. |
| G6 | Dev can't begin from unapproved mockup when required | ✅ | `loadLatestApprovedMockup()` filters `.eq("status","approved")` in `engine-backend-builder.functions.ts:251-264` and `engine-implementation-plan.functions.ts:332-377`. |
| G7 | Captain chooses planning depth by complexity | 🔴 | `engine-plan-depth.functions.ts:107-115` applies identical fixed `WEIGHTS` to all projects. |
| G8 | Simple site ≠ complex healthcare process | 🔴 | Same uniform weights — no branching. |
| G9 | Plans include user flows/architecture/data/integrations/permissions/AC/QA/rollback | 🟡 | Separate tables exist for backend/impl/qa plans; column-level content not inspected. |
| G10 | Spec approvable field-by-field | 🔴 | Only whole-record `status` approval. No per-field flags. |
| G11 | Approved plans auto-eligible for execution-packet generation | 🔴 | `engine-execution.functions.ts:1461-1571` decomposes *milestones* into tasks, not plans into packets. |

---

## Section H — Controlled Build and Execution

| # | Confirmation | Status | Evidence |
|---|---|---|---|
| H1 | Approved mockups + plans converted to executable work | 🟡 | `engine-build-execution.functions.ts:517-750` builds packets from approved impl-plan chain; manual-triggered, not event-driven. |
| H2 | Dev proceeds only after approvals | ✅ | Trigger `tg_engine_build_packets_enforce` (migration `20260709230256`:64-105) blocks `draft→handed_off`; only `ready→handed_off` allowed. |
| H3 | Packet has goal/scope/exclusions/inputs/owner/executor/deadline/AC | 🟡 | `BuildPacketPayload` (`engine-build-execution.functions.ts:96-119`) has `packet_goal`, `execution_scope`, `acceptance_criteria`, `target_builder`, `evidence_required`. **No `owner`, `deadline`/`due_at` distinct fields**; only `assigned_to`. |
| H4 | Packet identifies files/systems/records may change | ✅ | `execution_scope.expected_files_or_surfaces: string[]`. |
| H5 | "Do not touch" boundary | ✅ | `execution_scope.do_not_touch: string[]` auto-populated with guard rules (L785-788). |
| H6 | States evidence required for completion | ✅ | `payload.evidence_required: string[]`. (But not enforced at accept — see I5.) |
| H7 | Assign to human/agent/tool/mixed | ✅ | `packet_type` CHECK `('lovable','openclaw','developer','qa','mixed')` (migration L11-12). |
| H8 | Work cannot silently expand beyond approved scope | 🔴 | No scope_expansion guard; packet immutability only prevents edits post-`accepted`, not mid-execution. |
| H9 | Cost overruns require approval | 🔴 | `engine-agent.functions.ts:114-121` — hard stop with "Raise the cap" message. Not an approval-to-proceed workflow. |
| H10 | Failed runs trigger retries/fallbacks/escalation | 🟡 | `retryQueueItem` (`engine-openclaw-queue.functions.ts:851-897`); `failure_policy IN ('stop_queue','continue_after_review')`. No distinct escalation event type. |
| H11 | Records what was actually changed | ✅ | `engine_project_build_evidence` (diff_summary/log/artifact) + audit log inserts on every transition. |
| H12 | Completion of one packet unlocks downstream | 🔴 | Sequence numbers exist; no gating code found linking packet N+1 to packet N `accepted`. |

---

## Section I — QA and Evidence

| # | Confirmation | Status | Evidence |
|---|---|---|---|
| I1 | Automated QA can run | ✅ | `engine-qa-evidence.functions.ts:754-813` generates QA evidence review draft; `generated_by IN ('ai','human','hybrid')`. |
| I2 | Responsive/functional/accessibility/perf/integration/content/regression coverage | 🔴 | `qa_requirements: string[]` is free text; no category enum. |
| I3 | QA requirements from approved AC | 🟡 | Derived from plan context; no traceability field linking to specific AC IDs. |
| I4 | Requires screenshots/videos/URLs/tests/DB records/files | ✅ | `evidence_type CHECK IN ('screenshot','log','diff_summary','qa_report','link','note','artifact')` (migration `20260709230256`:118). |
| I5 | Packet not complete while required evidence missing | 🟡 | `acceptBuildPacket` (`engine-build-execution.functions.ts:1221-1252`) blocks if `!hasEvidence && !data.evidenceAck`. **Bypassable via free-text `evidenceAck`**; no check against packet's own `evidence_required` list. |
| I6 | Evidence accepted/rejected/returned | ✅ | Statuses `qa_required → accepted/rejected/in_progress` (migration L94). |
| I7 | Generated output vs implementation evidence | ✅ | `evidence_type` distinguishes `qa_report`/`diff_summary` from `screenshot`/`link`/`artifact`. |
| I8 | Evidence submission vs human acceptance | ✅ | `engine-qa-evidence.functions.ts:1021-1035` — approving a QA review logged as "Packet NOT accepted... still requires the human Accept action". |
| I9 | Identifies ready-for-human-QA | ✅ | `qa_required` distinct status. |
| I10 | Tells reviewer exactly what needs judgment | 🟡 | `needs_owner_decision` verdict partially covers this; no dedicated judgment-scope field. |
| I11 | Prioritizes by risk + impact | 🔴 | `priority p0/p1/p2` exists on packets; no evidence it drives QA queue order. |
| I12 | Failed QA blocks delivery | 🔴 | No delivery-blocking check found tying failed verdict to delivery gate in inspected files. |
| I13 | Accepted evidence sealed into permanent history | 🟡 | `engine_project_build_evidence` grants only SELECT to authenticated (migration L132-134) — effectively immutable, but not explicit seal-on-accept. |
| I14 | AI executor cannot be final acceptance authority | ✅ | DB CHECK `no_ai_self_completion` on `engine_tasks`; `no_ai_self_approval`/`no_ai_self_complete` on `engine_milestones` (migration `20260712192438`). |

---

## Section J — Approvals and Governance

| # | Confirmation | Status | Evidence |
|---|---|---|---|
| J1 | 10 named stages have separate approval gates | 🟡 | Scattered `frame/mockup/backend_plan/qa_plan/impl_plan_approved` activity types; no unified gate table enumerating all 10. |
| J2 | Approval authority is role-based + explicit | ✅ | `roadmap_approvals` INSERT policy: `WITH CHECK (has_role(auth.uid(),'admin'))` (migration `20260702180621`:21-23). |
| J3 | Approval displays what's changing and why | 🔴 | `roadmap_approvals` only has free `notes text`; no structured what/why. |
| J4 | Shows impact on scope/budget/timeline/deps/expectations | 🔴 | No impact columns on approval records. |
| J5 | Options: approve / approve-with-conditions / request-changes / reject / defer / escalate | 🔴 | `engine_version_change_decisions.decision CHECK IN ('accept','edit','reject')` — only 3; `engine_review_items.status` has no CHECK at all. |
| J6 | Conditions tracked until resolved | 🔴 | No conditions field/table. |
| J7 | Records who/when/why | ✅ | `actor_email`, `created_at`, `note` on `engine_version_change_decisions`; `approver_email`, `approved_at`, `notes` on `roadmap_approvals`. |
| J8 | Material approval creates/updates project version | ✅ | `roadmap_approvals.version_id → engine_roadmap_versions`. |
| J9 | Sacred actions protected from unauthorized users | ✅ | DB CHECK constraints (migration `20260712192438`) + `assertActionAllowed`. |
| J10 | No internal artifact reaches client just because it exists | ✅ | `visibility` enum defaults `internal_only` across intake/engine sources; delivery items require explicit `client_portal_required` mode. |

---

## Section K — Project Spine, Versioning, and Drift

| # | Confirmation | Status | Evidence |
|---|---|---|---|
| K1 | One protected source of truth per project | ✅ | `engine_projects.point_a/point_b` + `engine_roadmap_versions`. |
| K2 | Downstream consumes approved truth from Spine | 🟡 | Not independently traced — did not confirm chat context reads only approved-state vs. draft. |
| K3 | Field version history viewable | ✅ | `getSpineFieldHistory` (`engine.functions.ts:1792-1826`) queries `engine_audit_log` filtered `action='spine_field_changed'`. |
| K4 | Side-by-side diff old/new | ✅ | `SpineVersionHistory.tsx:88-118` renders `DiffBlock` from `old_value_json`/`new_value_json`. |
| K5 | Change records author/reason/approval/downstream impact | 🟡 | `engine.functions.ts:1338-1352` captures `actor_email`, `reason`, `field_changed`, `old_value`, `new_value`, `metadata`. **`approval` and `downstream_impact` fields absent.** |
| K6 | Captain continuously compares approved truth vs current state | ✅ | `engine-drift-detection.functions.ts:150-215` loads spine + status/current_step/open_decisions/health_score together. |
| K7 | Detects scope/timeline/budget/quality/technical/strategic drift | 🟡 | `DriftKind` enum covers `step_conflicts_spine, deliverable_orphaned, spine_changed_post_proposal, milestone_count_exceeded, scope_ahead_of_spine, undecided_spine, spine_stale`. **Budget and technical drift kinds absent.** |
| K8 | Root-cause relationships between signals | 🔴 | Each `DriftSignal` is independent; no causal graph. |
| K9 | Drift approved into new Spine version OR routed for review | 🟡 | Module is explicitly read-only diagnostic ("NEVER auto-corrects"); routing-for-review confirmed, drift→spine-version-write path not located. |
| K10 | Nothing important disappears into chat/meetings/overwritten docs | 🟡 | `engine_audit_log` + `engine_activity` capture step-level and spine changes; did not verify a chat→spine bridge for decisions made in Captain conversations. |

Note: an earlier concern that Phase 4B's `spine_field_changed` action wasn't firing turned out to be a distinct-values sampling artifact — the writer at `engine.functions.ts:1290-1358` is live and wired to `SpineVersionHistory`.

---

## Section L — Client Communication and Portal

| # | Confirmation | Status | Evidence |
|---|---|---|---|
| L1 | Captain drafts client updates from live state | 🔴 | No `draft_client_update` fn located. |
| L2 | Client communications require review before send | 🟡 | `roadmap_approvals` gates roadmap docs; general comms review gate not evidenced. |
| L3 | Client sees only approved + client-safe info | ✅ | `client_portal_files.client_visible+is_internal`; `client_portal_activity.client_visible` — RLS enforces `client_visible=true AND is_internal=false`. |
| L4 | Internal prompts/costs/private risks/team notes hidden | ✅ | Same RLS predicate; internal cost/prompt columns live outside client_portal_* tables. |
| L5 | Portal shows started / going / currently stand | 🔴 | No such column names in client_portal_projects/roadmaps schema. |
| L6 | Client sees what requires their attention | ✅ | `mark_portal_follow_up_needed`/`resolve_portal_follow_up` fns (migration `20260703005908`:79,165). |
| L7 | Client decisions captured as structured project events | 🟡 | `log_client_portal_activity` generic `event_type`/`metadata jsonb` (migration `20260701040448`:267-284) — captured, but as generic events not a typed decision schema. |
| L8 | Client acknowledgment tracked | ✅ | `event_type='follow_up_resolved'` + `recordPortalRoadmapEvent` (post-hotfix). |
| L9 | Delivery packages published only after completeness gate | 🟡 | `engine-delivery-readiness-gate.functions.ts:8-19` gates on packet acceptance; comment explicitly states the module "NEVER publishes to client portal" — publish step lives elsewhere and is unverified. |
| L10 | Publication is a real system transition | 🔴 | No located publish-as-transition function. |
| L11 | Tracks viewed/downloaded/acknowledged/replied/follow-up-needed | 🟡 | `client_portal_activity.event_type` (generic text) + `portal_access_events` — not typed columns. |

---

## Section M — Business Engines and Founder Consistency

Every M-section confirmation is **🔴 Not Built**. Zero grep matches across `src/` for "operating engine", "Content Authority", "Lead Follow-Up", "Reputation Engine", "Client Success Engine", or "Founder Operating Rhythm". No cron/scheduled-job infrastructure (`pg_cron`, `cron.schedule`) found in schema. `admin.exception-management.tsx` handles exceptions but is unrelated to the M-engines concept.

| # | Confirmation | Status | Evidence |
|---|---|---|---|
| M1..M12 | All twelve items | 🔴 | Absent from codebase and schema. Requires new subsystem (recurring-cadence table, engine definitions, learning loop, exception surfacing tied to engine metrics). |

---

## Section N — Delivery and Stage Transitions

| # | Confirmation | Status | Evidence |
|---|---|---|---|
| N1 | Knows when milestones/evidence/QA/comms ready for delivery | ✅ | `engine-delivery-readiness-gate.functions.ts:56-70` computes totalPackets/acceptedPackets/rejectedPackets/qa_required. |
| N2 | Delivery Room locked until conditions pass | 🟡 | Gate computes readiness; enforcement of a "lock" not in this file. |
| N3 | Automatic transitions after gate passes | 🔴 | No auto-transition trigger found in `engine-stage-transitions.functions.ts`. |
| N4 | Automated transitions record every action | 🔴 | `engine_delivery_history` exists; linkage to auto transitions unverified. |
| N5 | Next human actor notified with exact action | 🔴 | No "notify next actor with exact action" code located. |
| N6 | Delivery includes files/live links/access/training/limitations/support | 🔴 | `engine_delivery_items` columns are notice metadata (client, roadmap, version, status, channel, recipient, prepared_by, approved_by, last_action) — no content-package fields (migration `20260702164527`:3-18). |
| N7 | Client acceptance separate from internal approval | 🟡 | `engine_delivery_items.approved_by` (internal) vs `client_portal_activity` ack events are separate paths; no explicit `client_acceptance` column. |
| N8 | Project delivery ≠ business outcome achieved | 🟡 | `engine-post-delivery-learning.functions.ts:2-24` documents the distinction in comments; no product-level enforcement preventing conflation. |

---

## Section O — Outcome Feedback and Continuous Learning

| # | Confirmation | Status | Evidence |
|---|---|---|---|
| O1 | Schedules 30/60/90-day outcome check-ins | 🟡 | `engine-post-delivery-learning.functions.ts:14-24` computes windows from `published_at` on read. **No scheduler / cron / notification** — reactive, not proactive. |
| O2 | Compares actual vs Point B + success metrics | 🔴 | No "Point B" comparison logic found; only `satisfactionScore 1-10`. |
| O3 | Collects quantitative + qualitative | 🟡 | `OutcomeSurveyRecord` qualitative + `engine-outcome-feedback.functions.ts:58-72` quantitative — two separate systems, not unified. |
| O4 | Distinguishes delivery success from outcome success | ✅ | Header comment `engine-post-delivery-learning.functions.ts:2-6` explicit. |
| O5 | Identifies what worked/failed/should change | 🟡 | `OutcomeSynthesis` (`patternKind, description, recommendation`) exists; UI wiring unclear. |
| O6 | Captain recommends roadmap adjustments from real results | 🔴 | No `recommendation → roadmap` write path located. |
| O7 | New recs require approval before altering roadmap | 🔴 | No outcome-specific approval gate located. |
| O8 | Proven patterns improve future roadmap generation | 🔴 | No feedback into roadmap-generation prompts. |
| O9 | Confidential client knowledge not reused improperly | 🔴 | No cross-client anonymization/scoping logic found in outcome files. |
| O10 | Platform becomes smarter without careless privacy | 🔴 | Depends on O8/O9. |

---

## Section P — Portfolio Scale and Exception Management

| # | Confirmation | Status | Evidence |
|---|---|---|---|
| P1 | Command Center handles 100+ without per-project inspection | ✅ | `engine-exception-management.functions.ts:138-509` `getExceptionBoard` batch-loads via ~4 set-based queries. |
| P2 | Healthy projects stay quiet | ✅ | Doc comment "Silence is signal" (L9-21); `clearProjectCount` (L99) counts zero-exception projects. |
| P3 | Surfaces only projects needing decision/intervention/escalation | ✅ | 8 exception kinds gated on concrete thresholds (stalled≥7d L266, rejected packets L284, open_decisions>0 L303, evidence gap L334, QA stuck≥3d L357, health≤40 L378, ack overdue≥2d L397, idle≥5d L428). |
| P4 | Ranks by urgency/impact/deadline/financial/client-risk | 🟡 | `SEVERITY_RANK` sorts critical/high/medium/low (L107-112,466-488); financial-consequence and client-risk aren't separate scoring dimensions. |
| P5 | Every project always has a live Next Best Action | ✅ | `engine-nba.functions.ts:98-214` AI path (L184-209) with SQL RPC `compute_engine_next_best_action` fallback (L73-94) — never null. |
| P6 | Leadership sees blocked/approvals/failed agents/budget/delivery risk across portfolio | ✅ | `engine.index.tsx:64-95` Command Center: Active/Needs Attention/Awaiting Approval/At Risk/Delivery-this-month + `health_breakdown`, `approval_breakdown`, `agent_budget_cents`. Failed-agent dimension not directly verified. |
| P7 | Viewable globally / project-level / inside single milestone | 🟡 | Global + project-level exist; milestone-level drill-in via `actionPath` inconsistent across the 8 exception kinds. |
| P8 | One cross-project Decision Log | ✅ | `/admin/decision-log` + `listDecisionLog` (post-hotfix). |
| P9 | Explains why healthy/at-risk/blocked | 🟡 | Exception `detail` strings explain in the feed; no persisted queryable "why" field on the project record. |
| P10 | Operator decides, not hunts | ✅ | Follows from P1–P5. |

---

## Section Q — Reliability, Security, and Accountability

| # | Confirmation | Status | Evidence |
|---|---|---|---|
| Q1 | Every action auditable | 🟡 | Coverage uneven — `engine_activity` (60+ kinds) is rich, `engine_audit_log` sparse (~5 actions), plus `engine_change_events`, `engine_review_audit`, `portal_access_events`, `email_send_log`. No single canonical audit table. |
| Q2 | Every work item has accountable owner | 🔴 | grep for `owner_id`/`assigned_to`/`accountable` in exception + NBA modules = 0 hits. May exist on `engine_projects.assigned_operator` but not surfaced here. |
| Q3 | Permissions at org/project/role/client levels | ✅ | `assertOperatorOrAdmin`, `hasRoleForEmail`, `isOperatorEmail`/`isAdminEmail`, `client_portal_is_operator()`; 13 migrations reference these. |
| Q4 | Sensitive files/credentials protected | ✅ | `client.server.ts:10-22` service-role key loaded from `process.env` only; server-only import. |
| Q5 | Models/tools receive minimum context | 🟡 | NBA prompt (`engine-nba.functions.ts:34-67`) sends only per-project scoped fields; intent evident, not formally enforced. |
| Q6 | Model-agnostic, best provider per capability | ✅ | `engine-ai-providers.server.ts:1-6` — "Providers are swappable behind these two functions"; uses Lovable Gateway (Gemini) + Anthropic Claude. |
| Q7 | Selection considers quality/privacy/cost/reliability/availability | 🟡 | Fixed two-tier routing (Gemini Flash for intake; Claude Sonnet for structured), tracked in `cost_cents`. No dynamic multi-factor selection. |
| Q8 | Fallback when model/service fails | ✅ | `runStructuredPass` (Claude → Gemini fallback, L276-304); NBA (AI → SQL RPC fallback, L184-213); `callLovableAi` surfaces 429/402. |
| Q9 | Users understand why system recommended X | 🟡 | NBA returns `reason` field; exceptions include `detail`. Not confirmed for all AI outputs. |
| Q10 | System admits low confidence | 🟡 | NBA `confidence?: number` (L13, L208); structured pass `overall_confidence` (L313). Captured as data; not gated (doesn't block/downgrade actions). |
| Q11 | No AI-generated output official without governance | ✅ | DB CHECK constraints (verified) + exception-mgmt guardrail ("NEVER auto-resolves") + `assertActionAllowed` publish blocks. |

---

## Ultimate Confirmation

**Can the Roadmap Engine receive a founder's messy reality, understand it responsibly, define the destination, generate the right path, design the required solutions, coordinate humans and AI to build them, prove the work, protect every decision, deliver it safely, and keep the business operating consistently after launch?**

**Verdict: Partial — approximately 60% of the target state is confirmed.**

The engine can:
- Receive messy reality via a genuinely conversational, adaptive intake with save/resume, uploads, transcripts, and required internal review.
- Auto-extract structured signals with confidence, evidence links, and FK-enforced source lineage.
- Protect the spine with per-field audit history, side-by-side diffs, and read-only drift detection.
- Enforce that AI cannot approve or complete its own work — at the database, not just in code.
- Coordinate execution with a build-packet state machine, evidence types, AI-vs-human separation, and portfolio-wide exception surfacing with a guaranteed Next Best Action.
- Isolate client-facing surfaces via RLS and `visibility='internal_only'` defaults.

The engine **cannot yet** honestly claim it:
- Understands responsibly with an explicit epistemic taxonomy (known / inferred / contradictory / approved_truth). §B3, B4.
- Coordinates a Captain plus purpose-built specialists — today it's one generic agent per project. §C2, C5, C6.
- Handles a business need that legitimately decomposes into multiple projects — the schema doesn't model parent/child engagements at all. §F entirely.
- Runs recurring operating engines (Content Authority, Lead Follow-Up, Reputation, Client Success, Founder Rhythm). §M entirely.
- Actively drives 30/60/90 outcome check-ins or feeds real results back into roadmap generation with governance. §O1, O6, O7, O8.
- Enforces evidence completeness at packet acceptance without a bypassable free-text ack. §I5.
- Publishes to the client portal as a real system transition — the module comments explicitly say the readiness gate does not perform the publish. §L9, L10.
- Requires cost-overrun approval; today an overrun is a hard stop, not an approval flow. §H9.

### Top gaps that block a true "yes" (ordered by leverage)

1. **Specialist agent architecture (C5, C6)** — single generic Captain today; specialists are task kinds not distinct agents.
2. **Multi-project decomposition (F entire)** — `engine_projects` needs parent_project_id + cross-project dependency model.
3. **Recurring operating engines (M entire)** — no engine table, no scheduler, no learning loop.
4. **Epistemic-status taxonomy (B3, B4)** — the intelligence layer stores confidence but not "known / inferred / contradictory / approved_truth"; without it, "never presents inference as fact" is aspirational.
5. **Portal publication as a real transition (L9, L10)** — readiness computed; publish step is undefined.
6. **Outcome→roadmap feedback loop with approval (O1, O6, O7, O8)** — 30/60/90 windows are reactive-on-read, not scheduled; no path from outcome to roadmap change.
7. **Approval vocabulary + impact disclosure (J3–J6)** — only accept/edit/reject; no approve-with-conditions/defer/escalate; no scope/budget/timeline impact fields.
8. **Point A / Point B dedicated approval ceremony (D6, D7)** — currently generic step approval; the spine's most important gates should be first-class.
9. **Evidence bypass at packet accept (I5)** — free-text `evidenceAck` overrides the check against `evidence_required`.
10. **Owner-accountability field surfaced everywhere (Q2, C10)** — next-action owner is a text string, not a structured owner reference.

### What is already strong enough to lean on

- Governance foundation: three DB CHECK constraints (`no_ai_self_approval`, `no_ai_self_complete`, `no_ai_self_completion`) + `assertActionAllowed` publish blocks + `client_portal_is_operator()` + `has_role_email` + `roadmap_approvals` INSERT policy = a real, DB-enforced governance layer.
- Portal isolation: RLS on `client_portal_*` with `client_visible+is_internal` predicates and `client_portal_permissions` scoping is the right shape.
- Spine history: post-Phase 4B `engine_audit_log` with `action='spine_field_changed'` + `SpineVersionHistory` diff view is real and correct — the earlier "not firing" suspicion was disproved.
- Portfolio-scale operations: exception board + NBA (with SQL fallback) + Decision Log = an operator can plausibly run 100+ projects without manual per-project inspection today.

---

*Report generated 2026-07-12 by Lovable capability audit. Read-only. No mutations performed. Source: 6 parallel `spawn_agent` explores + `supabase--read_query` on `pg_constraint`, `pg_policies`, `engine_audit_log`, `engine_activity`.*
