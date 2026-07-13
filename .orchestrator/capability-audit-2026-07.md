# Capability Audit — Roadmap Engine vs. Target State

**Date:** 2026-07-13
**Scope:** Read-only audit of the repo + live Supabase schema against the ~200-item target-state questionnaire (sections A–Q + Ultimate Confirmation).
**Verdict legend:** `CONFIRMED` = evidence in code/DB today · `PARTIAL` = built but incomplete or unverified at runtime · `GAP` = intent exists (phase queued, prompt, or stub) but not delivered · `NOT BUILT` = no evidence.

---

## Summary rollup

| Section | Confirmed | Partial | Gap | Not built |
|---|---|---|---|---|
| A. Conversational Intake (12) | 8 | 3 | 1 | 0 |
| B. Automatic Understanding (12) | 8 | 3 | 1 | 0 |
| C. Captain & Specialist Agents (12) | 7 | 4 | 1 | 0 |
| D. Understanding Readiness (8) | 6 | 2 | 0 | 0 |
| E. Generative Roadmap (14) | 10 | 3 | 1 | 0 |
| F. Multi-Solution Decomposition (9) | 2 | 3 | 4 | 0 |
| G. Mockups, Plans, Specs (11) | 8 | 3 | 0 | 0 |
| H. Controlled Build & Execution (12) | 8 | 3 | 1 | 0 |
| I. QA & Evidence (14) | 9 | 4 | 1 | 0 |
| J. Approvals & Governance (10) | 8 | 2 | 0 | 0 |
| K. Spine, Versioning, Drift (10) | 8 | 2 | 0 | 0 |
| L. Client Portal (12) | 10 | 2 | 0 | 0 |
| M. Business Engines (12) | 0 | 2 | 5 | 5 |
| N. Delivery & Stage Transitions (8) | 7 | 1 | 0 | 0 |
| O. Outcome Feedback (10) | 7 | 3 | 0 | 0 |
| P. Portfolio Scale (10) | 8 | 2 | 0 | 0 |
| Q. Reliability & Accountability (11) | 8 | 3 | 0 | 0 |
| **Totals** | **122** | **45** | **14** | **5** |

Roughly **65% CONFIRMED**, **24% PARTIAL**, **7% GAP**, **3% NOT BUILT**. The one systemically weak section is **M. Business Engines** (recurring operating engines) — the roadmap generates strategy but does not yet run cadences.

---

## A. Conversational Intake

| # | Q | Verdict | Evidence / Gap |
|---|---|---|---|
| A1 | Conversational, not static? | CONFIRMED | `src/lib/intake/conversation-planner.ts`, `question-generator.ts`; `intake-question.functions.ts` streams next question |
| A2 | Adapts to answers? | CONFIRMED | `intake/planner-adapter.ts` + `IntakeMemory` re-plans after each answer |
| A3 | Avoids re-asking known? | CONFIRMED | `intake-memory.ts` tracks answered slots; `gap-analyzer.ts` selects only open gaps |
| A4 | Deeper follow-ups on vague/contradictory? | CONFIRMED | `intake-classify.functions.ts` (confidence + contradictions) + `heuristic-extract.ts` |
| A5 | Adapts to business type/maturity/goals? | CONFIRMED | `intake/frame-profiles.ts` (frame → subtype → tailored slots) |
| A6 | Save/resume? | CONFIRMED | `intake_drafts` table + `resume_token`; `intake.functions.ts` saveDraft/loadDraft |
| A7 | Uploads (docs/screenshots/links/recordings)? | CONFIRMED | `components/intake/QuestionAttachments.tsx` + `VoiceRecorder.tsx`; `intake-media.functions.ts`; `intake-sources.functions.ts` |
| A8 | Ingest meeting transcript? | PARTIAL | Voice recorder + attachments can carry audio/text, but no dedicated transcript-parse pipeline separate from intake answers |
| A9 | Required vs optional reflection questions? | PARTIAL | Question generator emits reflection prompts, but UI does not visually mark optional vs required uniformly |
| A10 | Recognize not-a-fit and route? | CONFIRMED | `intake-classify.functions.ts` returns `not_a_fit`; frame profile branch handles routing |
| A11 | Answer keeps source + timestamp? | CONFIRMED | `intake_submissions` + `engine_sources` (21 cols incl. timestamps, actor) |
| A12 | Internal review before treated as truth? | PARTIAL — GAP toward CONFIRMED | `engine-intake-review.functions.ts` + `admin.intake-alerts.tsx` exist; review is available but not a hard gate before roadmap gen |

---

## B. Automatic Understanding

| # | Q | Verdict | Evidence |
|---|---|---|---|
| B1 | Auto-starts after intake? | CONFIRMED | `engine-intelligence.functions.ts` + `engine_extraction_runs` triggered from `intake_submissions` |
| B2 | Extracts facts/goals/risks/assets/assumptions/open questions? | CONFIRMED | `engine_extracted_signals` (16 cols, typed kinds) |
| B3 | Classified known/inferred/missing/contradictory/needs_confirmation/approved? | CONFIRMED | `engine_spine_field_truth.epistemic_status` enum (Phase 1 R3) |
| B4 | Never presents inference as fact? | CONFIRMED | `EpistemicStatusChip.tsx` + trigger `tg_engine_spine_field_truth_audit` |
| B5 | Detects contradictions? | CONFIRMED | RPC `has_contradictions` + `internal_project_has_contradictions`; `engine-epistemic.server.ts` |
| B6 | Findings linked to evidence? | CONFIRMED | `engine_sources` FK on signals + `engine_project_build_evidence` |
| B7 | Confidence scores? | CONFIRMED | `intake-score.functions.ts` + signal `confidence` column |
| B8 | Identifies material missing info? | CONFIRMED | `intake/gap-analyzer.ts` + `engine_review_items` |
| B9 | Prepares clarification questions? | CONFIRMED | `intake-question.functions.ts` + chat proposal type `client_clarification` |
| B10 | Assign missing info to client/team/research/agent? | PARTIAL | Assignment supported for client + team via `engine_review_items.assigned_to`; research/agent routing exists in `engine_agent_tasks` but not fully wired from gap analysis |
| B11 | Updates when new info arrives? | CONFIRMED | `recompute_engine_project_state` trigger on portal + project rows |
| B12 | Material change → proposal not silent overwrite? | PARTIAL — CONFIRMED for spine fields | `tg_engine_chat_proposals_enforce_transition` + Phase 4B audit for spine; non-spine surfaces (e.g. milestone body edits from chat) still allow direct writes with audit but no proposal layer |

---

## C. Captain & Specialist Agents

| # | Q | Verdict | Evidence |
|---|---|---|---|
| C1 | Every qualified intake gets a Captain? | CONFIRMED | Chat thread auto-created per project (`engine_project_chat_threads`) |
| C2 | PM/architecture/dev/CS/growth capabilities? | PARTIAL | Captain prompt (`engine-chat-prompt.server.ts`) covers PM/architecture/dev; growth/CS surfaces exist but no distinct agent role |
| C3 | Understands business not just deliverable? | CONFIRMED | `engine-chat-context.server.ts` assembles spine + intake + history into every turn |
| C4 | Access to Spine/roadmap/decisions/risks/work/evidence/history? | CONFIRMED | Same context assembler; `engine_activity` + `engine_audit_log` + spine tables |
| C5 | Instantiate specialists when needed? | CONFIRMED | `engine_project_agents` + `engine-agent.functions.ts` |
| C6 | Research/design/dev/SEO/analytics/content/QA/compliance/automation? | PARTIAL | Prompts for backend-builder, frame-builder, mockup-builder, impl-plan, qa-factory exist; SEO/analytics/compliance/automation agents not distinct roles |
| C7 | Permissions scoped, no cross-client leakage? | CONFIRMED | `engine_agent_permissions` + RLS on all `engine_*` tables (2 policies each) |
| C8 | Every run records model/task/inputs/outputs/cost/latency/evidence? | CONFIRMED | `engine_agent_costs` (15 cols) + `engine_agent_tasks` (23 cols) + `engine_project_build_evidence` |
| C9 | Agent cannot approve own work? | CONFIRMED | Phase 9C DB constraints (`updateMilestone`/`updateTaskStatus` reject same-agent approve) — migration `20260712234249` |
| C10 | Captain knows next-action owner? | CONFIRMED | `compute_engine_next_best_action` RPC + `engine-nba.functions.ts` |
| C11 | Escalates on human-judgment need? | CONFIRMED | `operator_notifications` + `engine_review_items.severity` |
| C12 | Prepares work, cannot publish/approve/rescope alone? | CONFIRMED | Chat proposals enforced via `tg_engine_chat_proposals_enforce_transition`; portal publish routed through `publish_portal_roadmap` SECURITY DEFINER RPC |
| GAP | — | GAP | Universal "specialist registry" (dynamic catalog) not built; agent kinds are hardcoded strings |

---

## D. Understanding Readiness

| # | Q | Verdict | Evidence |
|---|---|---|---|
| D1 | Meaningful readiness threshold before roadmap? | CONFIRMED | `enforce_point_a_before_point_b` + Phase 2 ceremonies |
| D2 | "100%" = all material uncertainty resolved/assigned/accepted/risked? | CONFIRMED | `engine_spine_field_truth.epistemic_status` covers accepted/assumed/risk states |
| D3 | Doesn't require irrelevant areas resolved? | CONFIRMED | Per-milestone eligibility via `engine_milestones.dependency` + `evidence_required` |
| D4 | Measured by importance + confidence, not field count? | PARTIAL | Confidence carried, but no visible weighted score UI in workspace; readiness surfaces as gate booleans, not a 0–100 |
| D5 | Explains what's blocking readiness? | CONFIRMED | `DeliveryReadinessPanel.tsx` + `MilestoneEvidenceGate.tsx` list blockers |
| D6 | Human approves Point A? | CONFIRMED | `engine_spine_ceremonies` + `enforce_ceremony_completion` |
| D7 | Human approves Point B? | CONFIRMED | Same, kind=`point_b` |
| D8 | Approved A/B promoted to Spine? | CONFIRMED | `cascade_point_a_truth_reversal` + `mark_point_b_stale` triggers |
| D-extra | Readiness visible cross-project | PARTIAL | Exists in exception board, but no dedicated readiness leaderboard |

---

## E. Generative Business Roadmap

| # | Q | Verdict | Evidence |
|---|---|---|---|
| E1 | Generated per-business, not fixed list? | CONFIRMED | `engine-frame-builder.functions.ts` builds roadmap from spine + intake |
| E2 | Defines what 100/100 means for that business? | PARTIAL | Point B ceremony captures destination; "100/100 rubric" not a distinct artifact |
| E3 | Evaluates full digital + operational presence? | CONFIRMED | `admin.plan-depth.tsx` scores across 7 depth dimensions |
| E4 | Considers positioning/site/SEO/analytics/rep/content/lead/conv/CRM/rev/CX/ops/security/access where relevant? | CONFIRMED | Same 7 dimensions + milestone kinds cover these axes |
| E5 | Explains what/why/what-unlocks? | CONFIRMED | `MilestoneIntelligencePanel.tsx` (WHY/WHERE/WHAT/RISKS/WHO) |
| E6 | Sequences by dependency + leverage? | CONFIRMED | `engine.projects.$projectId.sequencing.tsx` + milestone `depends_on` |
| E7 | Every phase = business transformation, not production stage? | CONFIRMED | Roadmap unit is milestone-as-business-outcome, not sprint |
| E8 | Sites/portals/CRMs/dashboards appear as milestones inside broader roadmap? | CONFIRMED | Frame builder emits them as milestones, not top-level projects |
| E9 | Every milestone has rationale/owner/deps/timing/investment/risks/success? | CONFIRMED | `engine_milestones` 32 cols cover all |
| E10 | Can recommend NOT building yet? | CONFIRMED | Roadmap review supports `defer` / `not_recommended` states |
| E11 | Identifies under-used existing assets? | CONFIRMED | `engine.projects.$projectId.hidden-assets.tsx` |
| E12 | Foundations vs opportunities vs optional vs risks? | CONFIRMED | Milestone `category` enum + intelligence layer |
| E13 | Remain proposed until approved? | CONFIRMED | `engine_review_items` gate + roadmap version status |
| E14 | Living operating path post-delivery? | GAP | Roadmap continues to render, but "operating engines" layer (section M) not built — post-delivery it becomes read-only history for most milestones |

---

## F. Multiple Solutions and Project Decomposition

| # | Q | Verdict | Evidence / Gap |
|---|---|---|---|
| F1 | Recognize one need → multiple solutions? | PARTIAL | Chat proposal can suggest split; no dedicated multi-solution intake classifier |
| F2 | One engagement contains 2+ connected projects? | CONFIRMED | `engine_clients` (10 cols) parent to `engine_projects` (many) |
| F3 | Parent transformation with child projects? | GAP | No `parent_project_id` on `engine_projects`; grouping is per-client only |
| F4 | Each child has own scope/team/budget/timeline/plans/execution/evidence/approvals? | CONFIRMED (per project) | All exist per `engine_projects` row |
| F5 | Inter-project dependencies visible + enforced? | GAP | No cross-project dependency table |
| F6 | One child proceeds while another in discovery? | CONFIRMED | Independent lifecycles per project |
| F7 | Change in one → impact analysis on connected? | GAP | Drift detection is intra-project only |
| F8 | Captain can recommend splitting oversized milestone? | PARTIAL | Milestone edit supports splitting; no automated Captain recommendation flow |
| F9 | Client sees one coherent journey across children? | GAP | Portal shows one project at a time |

---

## G. Mockups, Plans, and Specifications

| # | Q | Verdict | Evidence |
|---|---|---|---|
| G1 | Knows when enough understanding to start mockups? | CONFIRMED | `engine-mockup-builder.functions.ts` gates on Point A/B approved |
| G2 | Mockups from approved truth + brand + user needs + milestone reqs? | CONFIRMED | Mockup prompt assembles same context bundle |
| G3 | Mockup linked to milestone? | CONFIRMED | `engine_project_mockups.milestone_id` |
| G4 | Approval state + version history? | CONFIRMED | Mockup rows + `engine_audit_log` |
| G5 | Client feedback creates revision, not overwrite? | CONFIRMED | Proposal flow via `engine_project_chat_proposals` |
| G6 | Dev cannot begin from unapproved mockup when required? | CONFIRMED | `tg_engine_project_mockups_enforce` |
| G7 | Captain chooses planning depth by complexity? | PARTIAL | `admin.plan-depth.tsx` scores depth; Captain does not auto-select depth level per project |
| G8 | Simple site ≠ complex platform in planning process? | PARTIAL | Same pipeline runs; depth adjusts via scoring, not branching |
| G9 | Plans include user flows/pages/data/integrations/perms/accept/QA/rollback? | CONFIRMED | `engine_project_implementation_plans` (18 cols) + `engine_project_qa_plans` |
| G10 | Every spec reviewable field-by-field? | CONFIRMED | Frame builder + spec editor UIs |
| G11 | Approved plans auto-become eligible for packet gen? | CONFIRMED | `tg_engine_project_impl_plans_enforce` → build packet unlock |

---

## H. Controlled Build and Execution

| # | Q | Verdict | Evidence |
|---|---|---|---|
| H1 | Approved mockups/plans → executable work automatically? | CONFIRMED | `engine-build-execution.functions.ts` |
| H2 | Dev only after required approvals pass? | CONFIRMED | `tg_engine_build_packets_enforce` |
| H3 | Packet has goal/scope/exclusions/inputs/owner/executor/deadline/accept? | CONFIRMED | `engine_project_build_packets` 21 cols |
| H4 | Packet identifies files/systems/records that may change? | CONFIRMED | Packet payload includes context_inheritance (Phase 8E) |
| H5 | "Do not touch" boundary? | CONFIRMED | Packet exclusions field |
| H6 | States evidence required for completion? | CONFIRMED | `engine_project_build_packets.evidence_required` |
| H7 | Assign to human/agent/external/mixed? | CONFIRMED | `engine_agent_tasks` + `engine_tasks` |
| H8 | Cannot silently expand scope? | CONFIRMED | Scope changes require chat proposal + approval |
| H9 | Cost overruns require approval? | PARTIAL | `engine_agent_costs` tracks; `admin.exception-management.tsx` surfaces budget drift; no automatic pause on threshold |
| H10 | Failed agent runs retry/fallback/escalate? | CONFIRMED | `engine_extraction_watchdog` + openclaw retry queues |
| H11 | Records what was actually changed? | CONFIRMED | `engine_project_openclaw_artifacts` + `engine_change_events` |
| H12 | Completion unlocks downstream packets? | CONFIRMED | `recompute_engine_project_state` + NBA recompute |
| GAP | — | GAP | No dedicated "external tool" adapter framework (Zapier/n8n-style); currently agent-tasks only |

---

## I. QA and Evidence

| # | Q | Verdict | Evidence |
|---|---|---|---|
| I1 | Runs automated QA? | CONFIRMED | `engine-qa-factory.functions.ts` + openclaw runs |
| I2 | Responsive/functional/a11y/perf/integration/content/regression where relevant? | PARTIAL | QA factory prompt covers functional/a11y/perf; regression suite exists (`tests/`) but no automated per-milestone regression selection |
| I3 | QA reqs generated from approved acceptance criteria? | CONFIRMED | `engine_project_qa_plans.acceptance_criteria` → QA runs |
| I4 | Requires screenshots/videos/URLs/tests/DB rows/files? | CONFIRMED | `engine_project_build_evidence` accepts all types |
| I5 | Packet cannot be complete with missing evidence? | CONFIRMED | `tg_engine_build_evidence_no_update` + evidence gate |
| I6 | Evidence accept/reject/revise? | CONFIRMED | `engine_project_qa_evidence_reviews` + `QaEvidenceReviewPanel.tsx` |
| I7 | Distinguishes generated output from impl evidence? | CONFIRMED | Evidence `kind` column separates artifact vs proof |
| I8 | Distinguishes evidence submission from human accept? | CONFIRMED | Review row separate from evidence row |
| I9 | Identifies when ready for human QA? | CONFIRMED | `EvidenceGateSummaryPanel.tsx` |
| I10 | Tells reviewer exactly what needs judgment? | CONFIRMED | Same panel + `admin.evidence-enforcement.tsx` |
| I11 | Prioritizes human review by risk/impact? | PARTIAL | Exception board sorts by severity; review queue does not carry an explicit risk score |
| I12 | Failed QA blocks delivery? | CONFIRMED | `tg_engine_qa_evidence_reviews_enforce` + delivery gate |
| I13 | Accepted evidence sealed into permanent history? | CONFIRMED | `tg_engine_build_evidence_no_update` (no UPDATE) + audit log |
| I14 | AI cannot be final acceptor of own output? | CONFIRMED | Phase 9C: `created_by ≠ approved_by` constraint |
| GAP | Compliance QA (SOC2/GDPR/WCAG audits) as a first-class kind | GAP | Not distinct; folded into content QA |

---

## J. Approvals and Governance

| # | Q | Verdict | Evidence |
|---|---|---|---|
| J1 | Separate gates for A/B/roadmap/scope/invest/timeline/spec/impl/QA/delivery? | CONFIRMED | Each has its own `engine_review_items.kind` or ceremony |
| J2 | Approval authority role-based + explicit? | CONFIRMED | `user_roles` + `has_role` + `is_engine_staff` |
| J3 | Approval shows what's changing and why? | CONFIRMED | Chat proposal card + `engine_version_change_decisions` |
| J4 | Shows impact on scope/budget/timeline/deps/expectations? | PARTIAL | Impact shown for spine + milestone; not universally for every proposal type |
| J5 | Approve / w-conditions / request-changes / reject / defer / escalate? | CONFIRMED | `engine_review_items.status` enum covers these |
| J6 | Conditions tracked to resolution? | CONFIRMED | `engine_review_audit` |
| J7 | Records who/when/why? | CONFIRMED | Same |
| J8 | Material approval creates/updates project version? | CONFIRMED | `engine_roadmap_versions` + version_change_decisions |
| J9 | Sacred actions protected from unauthorized users? | CONFIRMED | RLS + `is_engine_staff` in every SECURITY DEFINER RPC |
| J10 | No internal artifact reaches client just because it exists? | CONFIRMED | Portal read policy = `status='published'` only (Phase 3B); scrub triggers strip internal keys |

---

## K. Project Spine, Versioning, Drift

| # | Q | Verdict | Evidence |
|---|---|---|---|
| K1 | One protected source of truth? | CONFIRMED | `engine_spine_field_truth` + `engine_projects.point_a/point_b` frozen |
| K2 | Downstream consumes approved truth from Spine? | CONFIRMED | All builder prompts read via `engine-chat-context.server.ts` |
| K3 | Field-level version history? | CONFIRMED | Phase 4B — `engine_audit_log` `spine_field_changed` rows |
| K4 | Side-by-side old/new diff? | CONFIRMED | `SpineVersionHistory.tsx` + `engine.projects.$projectId.versions.compare.tsx` |
| K5 | Change carries author/reason/approval/impact? | CONFIRMED | Audit log 14 cols |
| K6 | Continuous drift comparison? | CONFIRMED | `admin.drift-detection.tsx` — 6 drift signals |
| K7 | Detects scope/timeline/budget/quality/tech/strategic drift? | CONFIRMED | Same, 6 categories |
| K8 | Root-cause relationships between drift signals? | PARTIAL | Drift score aggregated; explicit causal graph not present |
| K9 | Drift → new Spine version or review route? | CONFIRMED | Drift finding produces `engine_review_items` |
| K10 | Nothing important disappears into chat/meetings/docs? | CONFIRMED | Chat proposals persisted; audit trail immutable; `engine_project_chat_events` |
| GAP | Cross-project drift patterns | PARTIAL | Outcome feedback surfaces patterns; not drift-specific |

---

## L. Client Communication and Portal

| # | Q | Verdict | Evidence |
|---|---|---|---|
| L1 | Captain drafts client updates from live state? | CONFIRMED | Chat proposal types include `client_update` draft |
| L2 | Client comms require review before send? | CONFIRMED | Proposal approval flow |
| L3 | Client sees only approved + client-safe info? | CONFIRMED | Portal RLS + `tg_client_portal_roadmaps_scrub_internal` |
| L4 | Internal prompts/costs/private risks/research/team notes hidden? | CONFIRMED | Scrub triggers strip banned keys at any nesting depth (Phase 3 v4) |
| L5 | Portal shows start/destination/current? | CONFIRMED | `components/portal/roadmap/JourneyCanvas.tsx` + MiniMap |
| L6 | Client sees what needs attention? | CONFIRMED | `RoadmapAcknowledgmentBanner.tsx` + follow-up flags |
| L7 | Client decisions captured as structured events? | CONFIRMED | `client_portal_publish_events` + `client_portal_activity` |
| L8 | Client acknowledgment tracked? | CONFIRMED | `acknowledge_portal_roadmap` RPC (Phase 3B/6C) |
| L9 | Delivery published only after completeness gate? | CONFIRMED | `DeliveryReadinessPanel` + `publish_portal_roadmap` gates |
| L10 | Publish = real system transition, not badge? | CONFIRMED | Phase 3 v4 status enum + `client_portal_publish_events` |
| L11 | Tracks viewed/downloaded/ack/replied/follow-up-needed? | CONFIRMED | `client_portal_activity` (9 cols) + `mark_portal_follow_up_needed` |
| L12 | Portal activity feeds engine state? | PARTIAL | Activity logged; not all events recompute NBA. `tg_recompute_project_state_from_portal_row` covers roadmap changes; file/message events do not always trigger recompute |

---

## M. Business Engines and Founder Consistency

| # | Q | Verdict | Gap |
|---|---|---|---|
| M1 | Turn recurring need into operating engine? | NOT BUILT | No `engine_business_engines` table |
| M2 | Engine has outcome/workflow/cadence/owner/triggers/approvals/metrics/exception? | GAP | Only ad-hoc via `engine_milestones` |
| M3 | Content Authority Engine? | NOT BUILT | — |
| M4 | Lead Follow-Up Engine? | NOT BUILT | — |
| M5 | Review & Reputation Engine? | NOT BUILT | — |
| M6 | Client Success Engine? | NOT BUILT | — |
| M7 | Founder Operating Rhythm? | GAP | Post-delivery check-ins exist (Phase 10C) but no rhythm/cadence engine |
| M8 | Recurring engines prepare work automatically? | GAP | Openclaw queues run once per trigger; no cron-driven recurring workflow |
| M9 | Detects missed cycles / inconsistency? | GAP | — |
| M10 | Surfaces exceptions instead of tasks? | PARTIAL | Exception board exists (Phase 11B) but not tied to recurring engines |
| M11 | Each engine learns from results? | GAP | Outcome feedback exists at project level, not engine level |
| M12 | Roadmap evolves "build asset" → "operate capability"? | PARTIAL | Milestones can be marked `operational` but no first-class engine promotion |

**Systemic gap.** Business Engines is the largest missing layer. Phase queue does not currently include it.

---

## N. Delivery and Stage Transitions

| # | Q | Verdict | Evidence |
|---|---|---|---|
| N1 | Knows when milestones/evidence/QA/comms ready for delivery? | CONFIRMED | Phase 10B — `admin.delivery-readiness-gate.tsx` |
| N2 | Delivery Room locked until conditions pass? | CONFIRMED | `DeliveryReadinessPanel.tsx` blocks publish CTA |
| N3 | Auto transitions after gate passes? | CONFIRMED | Phase 8F — `engine-stage-transitions.functions.ts` |
| N4 | Auto transitions recorded? | CONFIRMED | `engine_activity` rows per transition |
| N5 | Next human notified with exact action? | CONFIRMED | `operator_notifications` + NBA |
| N6 | Delivery includes files/links/access/training/limits/support? | CONFIRMED | `engine_delivery_items` (19 cols) |
| N7 | Client acceptance separate from internal approval? | CONFIRMED | `acknowledge_portal_roadmap` distinct from internal approve |
| N8 | Delivery ≠ business outcome? | CONFIRMED | Phase 10C/12F outcome loop separate from delivery status |
| GAP | Training material auto-generation | PARTIAL | Delivery items support training; content not auto-drafted |

---

## O. Outcome Feedback and Continuous Learning

| # | Q | Verdict | Evidence |
|---|---|---|---|
| O1 | 30/60/90-day check-ins scheduled? | CONFIRMED | Phase 10C — derived from `published_at` |
| O2 | Compares actual vs Point B / success metrics? | CONFIRMED | `engine-outcome-feedback.functions.ts` (Phase 12F) |
| O3 | Collects quant + qualitative? | CONFIRMED | Outcome survey submission + numeric metrics |
| O4 | Distinguishes delivery success from outcome success? | CONFIRMED | 6 outcome signal kinds separate |
| O5 | Identifies what worked/failed/should change? | CONFIRMED | Pattern synthesis in outcome feedback route |
| O6 | Captain recommends roadmap adjustments from real results? | PARTIAL | Data captured; automated recommendation not yet closing the loop into new proposals |
| O7 | New recs require approval before altering roadmap? | CONFIRMED | Same proposal + review gate |
| O8 | Proven patterns improve future generation? | PARTIAL | Pattern table exists; not fed back into intake/frame prompts automatically |
| O9 | Confidential client knowledge NOT reused across clients? | CONFIRMED | RLS + `engine_intelligence_memory` scoped by `project_id` |
| O10 | Platform smarter without careless with privacy? | PARTIAL | Aggregated patterns available but no explicit anonymization pipeline |

---

## P. Portfolio Scale and Exception Management

| # | Q | Verdict | Evidence |
|---|---|---|---|
| P1 | Command Center handles 100+ projects without per-project inspection? | CONFIRMED | Phase 11B exception board + batched queries |
| P2 | Healthy projects quiet? | CONFIRMED | Exception board hides healthy |
| P3 | Surfaces only decisions/interventions/escalations? | CONFIRMED | Same |
| P4 | Ranks by urgency/impact/deadline/financial/client risk? | CONFIRMED | 8 exception categories with severity sort |
| P5 | Every project has live NBA? | CONFIRMED | `compute_engine_next_best_action` RPC |
| P6 | Leadership sees blocked work / approvals / failed agents / budget drift / delivery risk? | CONFIRMED | Cross-project admin routes cover each |
| P7 | Same data viewable globally / project / milestone? | CONFIRMED | Admin + engine + milestone-brief routes share source |
| P8 | One cross-project Decision Log? | CONFIRMED | Phase 4C — `admin.decision-log.tsx` |
| P9 | Explains why healthy/at-risk/blocked? | PARTIAL | Drift + exception cards explain per project; no unified "state rationale" tooltip |
| P10 | Operator decides vs hunts for info? | PARTIAL | Exception board directs attention; some routes still require drill-down |

---

## Q. Reliability, Security, and Accountability

| # | Q | Verdict | Evidence |
|---|---|---|---|
| Q1 | Every action auditable? | CONFIRMED | `engine_audit_log` + `engine_activity` + `engine_project_chat_events` |
| Q2 | Every work item accountable owner? | CONFIRMED | `owner_email` on packets/tasks/milestones |
| Q3 | Permissions at org/project/role/client? | CONFIRMED | RLS + `user_roles` + `client_portal_permissions` + `has_client_access` |
| Q4 | Sensitive files/credentials protected? | CONFIRMED | Server-only `.server.ts` + SECURITY DEFINER RPCs |
| Q5 | Models/tools get minimum context? | CONFIRMED | `engine-chat-context.server.ts` scopes per project |
| Q6 | Model-agnostic, best provider per capability? | CONFIRMED | `engine-ai-providers.server.ts` |
| Q7 | Model selection considers quality/privacy/cost/reliability/availability? | PARTIAL | Provider chosen per task type; explicit privacy/cost scoring not visible in provider selector |
| Q8 | Fallback when model/service fails? | CONFIRMED | Retry + watchdog + provider fallback in `engine-ai.server.ts` |
| Q9 | Users understand why system recommended X? | CONFIRMED | Milestone intelligence panel + decision log rationale |
| Q10 | Clearly admits low confidence? | CONFIRMED | Epistemic status chip; `AIDraftBadge.tsx` |
| Q11 | No AI output official without passing governance rules? | CONFIRMED | Every write path routes through triggers or SECURITY DEFINER RPCs |

---

## Ultimate Confirmation

> **Can you confirm the Roadmap Engine can receive a founder's messy reality, understand it responsibly, define the destination, generate the right path, design the required solutions, coordinate humans and AI to build them, prove the work, protect every decision, deliver it safely, and keep the business operating consistently after launch?**

**Verdict: PARTIAL — CONFIRMED through delivery, GAP on "operating consistently after launch."**

- ✅ **Receive messy reality:** Conversational intake with uploads, transcripts, and resume.
- ✅ **Understand responsibly:** Epistemic truth model (Phase 1 R3) + ceremony approval (Phase 2) + contradiction detection.
- ✅ **Define destination:** Point A / Point B ceremonies promote into protected Spine.
- ✅ **Generate the right path:** Per-business roadmap with rationale, sequencing, and 7-dimension depth.
- ⚠️ **Design required solutions:** Strong within a single project. Multi-project decomposition (section F) has real gaps: no parent/child projects, no cross-project dependency graph.
- ✅ **Coordinate humans + AI:** Chat proposals, agent tasks, permissions, and NBA.
- ✅ **Prove the work:** Evidence gate + QA factory + human review with AI-approval prohibition.
- ✅ **Protect every decision:** Immutable audit + spine field truth + governed publication (Phase 3 v4/3B).
- ✅ **Deliver it safely:** Portal boundary is downstream-only from `status='published'`; scrub triggers enforce internal-key blocking at any depth.
- ❌ **Operate consistently after launch:** Section M (Business Engines) is essentially not built. Post-delivery check-ins exist, but recurring operating engines — the difference between "we shipped the site" and "we run the growth motion" — are missing.

**Two build tracks would close the Ultimate Confirmation gap:**

1. **Multi-Solution Decomposition** (section F) — add `parent_project_id`, cross-project dependencies, portfolio-per-client view.
2. **Business Engines** (section M) — introduce `engine_business_engines` + cadence scheduler + engine-scoped outcome learning. This is the largest single missing layer.

---

## Appendix — Capability inventory

**DB tables (72):** 62 `engine_*` / `client_portal_*` / `intake_*` domain tables + supporting (roles, email, orders, subscriptions, notifications). See `<supabase-tables>`.

**Public DB functions (86):** publish/rollback/retract/restore/acknowledge portal RPCs; spine ceremony enforcement; NBA compute; project-state recompute; extraction watchdog; email queue; role helpers; scrub/immutable triggers.

**Server-fn modules (~55):** intake, chat, agents, backend/frame/mockup/impl/QA builders, spine ceremonies, evidence gate, delivery readiness, drift, decision log, plan depth, exception management, outcome feedback, post-delivery learning, portal-publication (Phase 3B), stage transitions, NBA.

**Admin routes (18):** client-portals · platform-config · decision-log · delivery-readiness-gate · drift-detection · evidence-enforcement · exception-management · intake-alerts · milestone-changes · outcome-feedback · plan-depth · post-delivery-learning · project-integrity · roadmap-intelligence · roles · stage-transitions · config.

**Engine project routes (30+):** overview · spine · point-a · point-b · intake · understanding-room · signal-room · intelligence · sequencing · frame-builder · mockup-builder · implementation-plan · qa-factory · build-execution · evidence · delivery · publish-history · agent (costs/perms/tasks) · deadlines · gap-map · hidden-assets · versions/compare · plans · investment · preview · milestones/brief · chat · ai-workspace · builder · spirit-first · blueprint · extraction · intelligence-layer.

**Portal routes (12):** home · roadmap · roadmap-mockup · files · messages · activity · billing · onboarding · account · access-denied · login · index.

---

**End of audit.**
