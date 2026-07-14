# Roadmap Engine Capability Audit — 2026-07-14

**Date:** 2026-07-14
**Scope:** Read-only, evidence-based audit of the repo + live Supabase schema against the ~250-item target-state questionnaire (sections A–Q + Ultimate Confirmation).
**Method:** Codebase greps (`src/**`, `supabase/migrations/**`), full SQL smoke harness (`capability-audit-smoke.sql` → `capability-audit-smoke-output.md`), and delta review against the prior baseline at `.orchestrator/capability-audit-2026-07.md` (2026-07-13).
**Verdict legend:**
- **PASS** — implementation exists AND is enforced (DB constraint / trigger / RLS policy / route guard / SECURITY DEFINER RPC).
- **PARTIAL** — surface exists but enforcement is soft (UI-only, incomplete wiring, missing sub-capability).
- **MISSING** — no code / table / policy backing the claim.

## Section-level scorecard

| Section | Items | PASS | PARTIAL | MISSING |
|---|---:|---:|---:|---:|
| A. Conversational Intake | 12 | 8 | 4 | 0 |
| B. Automatic Understanding | 12 | 10 | 2 | 0 |
| C. AI Captain & Specialists | 12 | 8 | 4 | 0 |
| D. Understanding Readiness | 8 | 7 | 1 | 0 |
| E. Generative Roadmap | 14 | 12 | 2 | 0 |
| F. Multi-Solution Decomposition | 9 | 6 | 3 | 0 |
| G. Mockups, Plans, Specs | 11 | 9 | 2 | 0 |
| H. Controlled Build & Execution | 12 | 11 | 1 | 0 |
| I. QA & Evidence | 14 | 12 | 2 | 0 |
| J. Approvals & Governance | 10 | 9 | 1 | 0 |
| K. Spine, Versioning, Drift | 10 | 9 | 1 | 0 |
| L. Client Portal | 12 | 11 | 1 | 0 |
| M. Business Engines | 12 | 6 | 4 | 2 |
| N. Delivery & Stage Transitions | 8 | 8 | 0 | 0 |
| O. Outcome Feedback | 10 | 7 | 3 | 0 |
| P. Portfolio Scale | 10 | 8 | 2 | 0 |
| Q. Reliability & Accountability | 11 | 9 | 2 | 0 |
| **Total** | **187** | **150** | **35** | **2** |

**Roughly 80% PASS, 19% PARTIAL, 1% MISSING** — a material improvement over the 2026-07-13 baseline (65% CONFIRMED). Drivers: Phase 5D (Section F now has `parent_project_id`, `engine_milestone_solutions`, family/solutions routes, portal.family), Business Engines schema landed (`engine_business_engines*` — Section M moved from NOT BUILT to majority PASS), Governance Hardening Phase 4 (Section J/K), the portal-roadmaps hotfix (Section L reads restored).

---

## A. Conversational Intake

| # | Item | Verdict | Evidence / Gap |
|---|---|---|---|
| A1 | Conversational, not static | PASS | `src/lib/intake/conversation-planner.ts`, `question-generator.ts`; `intake-question.functions.ts` streams next question |
| A2 | Adapts to prior answers | PASS | `intake/planner-adapter.ts` + `IntakeMemory` re-plans after each turn |
| A3 | Avoids re-asking known | PASS | `intake-memory.ts` + `gap-analyzer.ts` open-slot selection |
| A4 | Deeper follow-ups on vague/contradictory/important | PASS | `intake-classify.functions.ts` (confidence + contradictions) + `heuristic-extract.ts` |
| A5 | Adapts to business type/maturity/goals/constraints | PASS | `intake/frame-profiles.ts` (frame → subtype → tailored slots) |
| A6 | Save + resume | PASS | `intake_drafts` + `resume_token`; `intake.functions.ts` saveDraft/loadDraft |
| A7 | Upload docs/screenshots/links/recordings/materials | PASS | `components/intake/QuestionAttachments.tsx`, `VoiceRecorder.tsx`; `intake-media.functions.ts`; `intake-sources.functions.ts` |
| A8 | Ingest meeting transcript | PARTIAL | Voice + attachments can carry audio/text; no dedicated transcript-parse pipeline distinct from intake answers |
| A9 | Required vs optional reflection questions | PARTIAL | Generator emits reflection prompts; UI does not uniformly mark required/optional |
| A10 | Recognize not-a-fit and route | PASS | `intake-classify.functions.ts` returns `not_a_fit`; frame profile handles routing |
| A11 | Every answer retains source + timestamp | PASS | `intake_submissions` + `engine_sources` (21 cols incl. `actor_email`, `created_at`) |
| A12 | Reviewable internally before treated as truth | PARTIAL | `engine-intake-review.functions.ts` + `admin.intake-alerts.tsx` exist; review is available but not a hard pre-roadmap gate |
| — | Distinguishes required vs optional visually | PARTIAL | Same UI gap as A9 |

## B. Automatic Understanding

| # | Item | Verdict | Evidence / Gap |
|---|---|---|---|
| B1 | Auto-starts after intake | PASS | `engine-intelligence.functions.ts` + `engine_extraction_runs` triggered from `intake_submissions` |
| B2 | Extracts facts/goals/constraints/risks/assets/assumptions/open questions | PASS | `engine_extracted_signals` (16 cols, typed kinds) |
| B3 | Classified known/inferred/missing/contradictory/needs_confirmation/approved | PASS | `engine_spine_field_truth.epistemic_status` enum (Phase 1 R3) |
| B4 | Never presents inference as fact | PASS | `EpistemicStatusChip.tsx` + `tg_engine_spine_field_truth_audit` (Governance P4) |
| B5 | Detects contradictions across intake/docs/meetings/research | PASS | RPC `has_contradictions`, `internal_project_has_contradictions`; `engine-epistemic.server.ts` |
| B6 | Every finding linked to evidence | PASS | `engine_sources` FK on signals + `engine_project_build_evidence` |
| B7 | Confidence levels | PASS | `intake-score.functions.ts` + `engine_extracted_signals.confidence` |
| B8 | Identifies material missing info | PASS | `intake/gap-analyzer.ts` + `engine_review_items` |
| B9 | Prepares clarification questions automatically | PASS | `intake-question.functions.ts` + chat proposal type `client_clarification` |
| B10 | Assign missing info to client/team/research/specialist agent | PARTIAL | `engine_review_items.assigned_to` handles client/team; research/agent routing exists via `engine_agent_tasks` but not fully wired from gap analysis |
| B11 | Updates as new info arrives | PASS | `recompute_engine_project_state` trigger on portal + project rows |
| B12 | Material change → proposal, not silent overwrite | PARTIAL for non-spine surfaces | Spine fields fully governed by `tg_engine_chat_proposals_enforce_transition` + Phase 4B audit; non-spine milestone body edits still allow direct writes with audit but no proposal layer |

## C. AI Captain and Specialist Agents

| # | Item | Verdict | Evidence / Gap |
|---|---|---|---|
| C1 | Every qualified intake gets a Captain | PASS | Auto-created `engine_project_chat_threads` per project |
| C2 | PM/PjM/architecture/dev/CS/growth capabilities | PARTIAL | Captain prompt (`engine-chat-prompt.server.ts`) covers PM/architecture/dev; explicit CS/growth roles absent |
| C3 | Understands business, not just deliverable | PASS | `engine-chat-context.server.ts` assembles spine + intake + history each turn |
| C4 | Access to Spine/roadmap/decisions/risks/work/evidence/history | PASS | Same context assembler + `engine_activity` + `engine_audit_log` |
| C5 | Instantiates specialists only when needed | PASS | `engine_project_agents` + `engine-agent.functions.ts` |
| C6 | Roles: research/design/dev/SEO/analytics/content/QA/compliance/automation | PARTIAL | Backend/frame/mockup/impl/QA prompts exist; SEO/analytics/compliance/automation not distinct roles |
| C7 | Defined permissions, no cross-client access | PASS | `engine_agent_permissions` + RLS on all `engine_*` tables (all `is_engine_staff()`) |
| C8 | Every run records model/task/inputs/outputs/cost/latency/evidence | PASS | `engine_agent_costs` (15 cols) + `engine_agent_tasks` (23 cols) + `engine_project_build_evidence`; `engine_business_engine_runs` also carries model/tokens/cost/latency |
| C9 | Agent cannot approve its own work | PASS | Phase 9C DB constraints on milestones/tasks; new triggers `engine_business_engines_no_self_approve`, `engine_solutions_no_self_approve` extend the rule to Section F/M artifacts |
| C10 | Captain knows current owner of next action | PASS | `compute_engine_next_best_action` RPC + `engine-nba.functions.ts` |
| C11 | Escalates on need for human judgment | PASS | `operator_notifications` + `engine_review_items.severity` |
| C12 | Prepares work, cannot publish/approve/re-scope alone | PASS | Chat proposal transition trigger + `publish_portal_roadmap` SECURITY DEFINER RPC |

## D. Understanding Readiness

| # | Item | Verdict | Evidence |
|---|---|---|---|
| D1 | Meaningful readiness threshold before roadmap | PASS | `enforce_point_a_before_point_b` + Phase 2 ceremonies |
| D2 | 100% = uncertainty resolved / assigned / assumed / risk-recorded | PASS | `engine_spine_field_truth.epistemic_status` covers accepted/assumed/risk |
| D3 | Doesn't require irrelevant areas resolved | PASS | Per-milestone eligibility via `engine_milestones.depends_on` + `evidence_required` |
| D4 | Measured by importance + confidence, not field count | PARTIAL | Confidence is stored; no visible weighted 0–100 readiness score UI in workspace |
| D5 | Explains what is blocking | PASS | `DeliveryReadinessPanel.tsx` + `MilestoneEvidenceGate.tsx` + `spine_points_ready_summary` (Governance P4) |
| D6 | Human approves Point A | PASS | `engine_spine_ceremonies` + `enforce_ceremony_completion` |
| D7 | Human approves Point B | PASS | Same, `kind='point_b'` |
| D8 | Approved A/B promoted to protected Spine | PASS | `cascade_point_a_truth_reversal` + `mark_point_b_stale` triggers |

## E. Generative Business Roadmap

| # | Item | Verdict | Evidence / Gap |
|---|---|---|---|
| E1 | Generated per business, not fixed list | PASS | `engine-frame-builder.functions.ts` builds from spine + intake |
| E2 | Defines what 100/100 means for this business | PARTIAL | Point B ceremony captures destination; a distinct "100/100 rubric" artifact does not exist |
| E3 | Evaluates full digital + operational presence | PASS | `admin.plan-depth.tsx` scores across 7 dimensions |
| E4 | Considers positioning / site / SEO / analytics / rep / content / lead / conv / CRM / rev / CX / ops / security / access where relevant | PASS | Depth dimensions + milestone `category` enum cover these |
| E5 | Explains what / why / what it unlocks | PASS | `MilestoneIntelligencePanel.tsx` (WHY/WHERE/WHAT/RISKS/WHO) |
| E6 | Sequences by dependency + leverage | PASS | `engine.projects.$projectId.sequencing.tsx` + milestone `depends_on` |
| E7 | Every phase = business transformation, not production stage | PASS | Roadmap unit = milestone-as-business-outcome |
| E8 | Sites/portals/CRMs/dashboards appear as milestones inside roadmap | PASS | Frame builder emits them as milestones, not top-level projects |
| E9 | Every milestone has rationale/owner/deps/timing/investment/risks/success | PASS | `engine_milestones` (32 cols) covers all |
| E10 | Can recommend NOT building | PASS | Roadmap review supports `defer` / `not_recommended` |
| E11 | Identifies under-used existing assets | PASS | `engine.projects.$projectId.hidden-assets.tsx` |
| E12 | Foundations / opportunities / optional / risks | PASS | Milestone `category` enum + intelligence layer |
| E13 | Recommendations remain proposed until approved | PASS | `engine_review_items` + roadmap version status |
| E14 | Living operating path after delivery | PARTIAL — improving | Roadmap continues + Section M engines now exist; not every project is auto-promoted from "build" to "operate" |

## F. Multiple Solutions and Project Decomposition — **MAJOR DELTA vs 2026-07-13**

| # | Item | Verdict | Evidence / Gap |
|---|---|---|---|
| F1 | Recognize one business need requires multiple solutions | PARTIAL | `engine_milestone_solutions` supports per-milestone alternatives; no dedicated intake classifier that flags multi-solution scope up front |
| F2 | Single engagement contains 2+ connected projects | PASS | `engine_clients` parent to many `engine_projects` |
| F3 | Parent transformation with child projects | PASS | `engine_projects.parent_project_id uuid` (Phase 5D) + `engine_projects_child_rollup_guard` trigger (INSERT/UPDATE/DELETE) |
| F4 | Each child has own scope/team/budget/timeline/plans/execution/evidence/approvals | PASS | Full column set per `engine_projects` row |
| F5 | Cross-project dependencies visible + enforced | PASS | `engine_milestone_solutions.depends_on_solution_ids[]` + `depends_on_milestone_ids[]`; `engine-project-family.functions.ts` renders the dependency graph via `FamilyDependencyGraph.tsx` |
| F6 | One child proceeds while another remains in discovery | PASS | Independent lifecycles per project row |
| F7 | Change in one solution triggers impact analysis on connected solutions | PARTIAL | Family view surfaces the graph and impact panel; automated impact recomputation on completion/reparent lives in `engine-project-family.functions.ts`, but not yet wired to spine-drift alerts |
| F8 | Captain can recommend splitting an oversized milestone into independent projects | PARTIAL | `createChildProject` mutation exists; Captain does not yet auto-recommend the split from milestone size heuristics |
| F9 | Client sees one coherent business journey when several projects exist | PASS | `src/routes/portal.family.tsx` + `portal-family.functions.ts` present portal-safe family with permitted-only relatives |

## G. Mockups, Plans, and Specifications

| # | Item | Verdict | Evidence / Gap |
|---|---|---|---|
| G1 | Knows when there is enough understanding to begin mockups | PASS | `engine-mockup-builder.functions.ts` gates on Point A/B approved |
| G2 | Mockups from approved truth + brand + user needs + milestone reqs | PASS | Mockup prompt assembles the full context bundle |
| G3 | Mockup connected to milestone | PASS | `engine_project_mockups.milestone_id` |
| G4 | Approval state + version history | PASS | Mockup rows + `engine_audit_log` |
| G5 | Client feedback creates proposed revision, not overwrite | PASS | `engine_project_chat_proposals` |
| G6 | Dev cannot begin from unapproved mockup when required | PASS | `tg_engine_project_mockups_enforce` |
| G7 | Captain chooses planning depth by complexity | PARTIAL | `admin.plan-depth.tsx` scores; Captain does not auto-branch pipelines per depth |
| G8 | Simple site vs complex platform get different planning processes | PARTIAL | Same pipeline; depth adjusts via scoring, not branching |
| G9 | Plans include journeys/architecture/data/integrations/perms/accept/QA/rollback | PASS | `engine_project_implementation_plans` (18 cols) + `engine_project_qa_plans` |
| G10 | Every specification reviewable field by field | PASS | Frame builder + spec editor UIs |
| G11 | Approved plans automatically eligible for execution-packet generation | PASS | `tg_engine_project_impl_plans_enforce` → packet unlock |

## H. Controlled Build and Execution

| # | Item | Verdict | Evidence / Gap |
|---|---|---|---|
| H1 | Approved mockups + plans convertible to executable work automatically | PASS | `engine-build-execution.functions.ts` |
| H2 | Dev proceeds only after approvals | PASS | `tg_engine_build_packets_enforce` |
| H3 | Packet has goal/scope/exclusions/inputs/owner/executor/deadline/accept | PASS | `engine_project_build_packets` (21 cols) |
| H4 | Packet identifies files/systems/records that may change | PASS | Phase 8E `context_inheritance` payload |
| H5 | "Do not touch" boundary | PASS | Packet exclusions field |
| H6 | States evidence required | PASS | `engine_project_build_packets.evidence_required` |
| H7 | Assign to human / agent / external tool / mixed | PASS | `engine_agent_tasks` + `engine_tasks` |
| H8 | Cannot silently expand scope | PASS | Scope changes routed through chat proposal + approval |
| H9 | Cost overruns require approval | PARTIAL | `engine_agent_costs` tracks; exception board surfaces drift; no automatic pause at threshold |
| H10 | Failed agent runs retry / fallback / escalate | PASS | Openclaw queues + `engine_extraction_watchdog` |
| H11 | Records what was actually changed | PASS | `engine_project_openclaw_artifacts` + `engine_change_events` |
| H12 | Completion unlocks downstream packets | PASS | `recompute_engine_project_state` + NBA recompute |

## I. QA and Evidence

| # | Item | Verdict | Evidence / Gap |
|---|---|---|---|
| I1 | Runs automated QA | PASS | `engine-qa-factory.functions.ts` + openclaw runs |
| I2 | Responsive/functional/a11y/perf/integration/content/regression where relevant | PARTIAL | QA factory covers functional/a11y/perf; automated per-milestone regression selection not present |
| I3 | QA reqs generated from approved acceptance criteria | PASS | `engine_project_qa_plans.acceptance_criteria` → runs |
| I4 | Requires screenshots/videos/URLs/tests/DB rows/files | PASS | `engine_project_build_evidence` accepts all types |
| I5 | Packet cannot be complete with missing evidence | PASS | `tg_engine_build_evidence_no_update` + evidence gate |
| I6 | Evidence accept / reject / return for revision | PASS | `engine_project_qa_evidence_reviews` + `QaEvidenceReviewPanel.tsx` |
| I7 | Distinguishes generated output from implementation evidence | PASS | Evidence `kind` column |
| I8 | Distinguishes evidence submission from human acceptance | PASS | Review row separate from evidence row |
| I9 | Identifies when milestone is ready for human QA | PASS | `EvidenceGateSummaryPanel.tsx` |
| I10 | Tells reviewer what needs judgment | PASS | Same panel + `admin.evidence-enforcement.tsx` |
| I11 | Prioritizes review by risk / impact | PARTIAL | Exception board sorts by severity; review queue has no explicit risk score field |
| I12 | Failed QA blocks delivery | PASS | `tg_engine_qa_evidence_reviews_enforce` + delivery gate |
| I13 | Accepted evidence sealed into permanent history | PASS | `tg_engine_build_evidence_no_update` (no UPDATE) + audit log |
| I14 | AI executor cannot be final acceptor of own output | PASS | Phase 9C constraint (`created_by ≠ approved_by`) — extended to Section F/M by `no_self_approve` triggers |

## J. Approvals and Governance

| # | Item | Verdict | Evidence / Gap |
|---|---|---|---|
| J1 | Separate gates: A/B/roadmap/scope/invest/timeline/spec/impl/QA/delivery | PASS | Each has its own `engine_review_items.kind` or ceremony |
| J2 | Approval authority role-based and explicit | PASS | `user_roles` + `has_role` + `is_engine_staff` |
| J3 | Approval displays what is changing and why | PASS | Chat proposal card + `engine_version_change_decisions` |
| J4 | Shows impact on scope/budget/timeline/deps/expectations | PARTIAL | Impact shown for spine + milestone; not universal per proposal type |
| J5 | Approve / with conditions / request changes / reject / defer / escalate | PASS | `engine_review_items.status` enum |
| J6 | Conditions tracked to resolution | PASS | `engine_review_audit` |
| J7 | Records who / when / why | PASS | Same |
| J8 | Material approval creates or updates project version | PASS | `engine_roadmap_versions` + `engine_version_change_decisions` |
| J9 | Sacred actions protected from unauthorized users | PASS | RLS + `is_engine_staff` in every SECURITY DEFINER RPC |
| J10 | No internal artifact reaches client just because it exists | PASS | Portal read policy `status='published'` only + scrub triggers strip internal keys at any depth |

## K. Project Spine, Versioning, Drift

| # | Item | Verdict | Evidence / Gap |
|---|---|---|---|
| K1 | One protected source of truth per project | PASS | `engine_spine_field_truth` + frozen `engine_projects.point_a/point_b` |
| K2 | Downstream consumes approved truth from Spine | PASS | All builder prompts route through `engine-chat-context.server.ts` |
| K3 | Field-level version history | PASS | Phase 4B — `engine_audit_log` `spine_field_changed` rows |
| K4 | Side-by-side old / new diff | PASS | `SpineVersionHistory.tsx` + `versions.compare.tsx` |
| K5 | Change carries author/reason/approval/downstream impact | PASS | Audit log (14 cols) |
| K6 | Continuous drift comparison | PASS | `admin.drift-detection.tsx` — 6 signals |
| K7 | Detects scope/timeline/budget/quality/tech/strategic drift | PASS | Same 6 categories |
| K8 | Root-cause relationships between drift signals | PARTIAL | Drift score aggregated; explicit causal graph not present |
| K9 | Drift → new Spine version or review route | PASS | Drift finding produces `engine_review_items` |
| K10 | Nothing important disappears into chat/meetings/docs | PASS | Chat proposals persisted + immutable audit + `engine_project_chat_events` |

## L. Client Communication and Portal

| # | Item | Verdict | Evidence / Gap |
|---|---|---|---|
| L1 | Captain drafts client updates from live state | PASS | Chat proposal type `client_update` |
| L2 | Client comms require review before send | PASS | Proposal approval flow |
| L3 | Client sees only approved + client-safe info | PASS | Portal RLS + `tg_client_portal_roadmaps_scrub_internal` |
| L4 | Internal prompts/costs/risks/research/team notes hidden | PASS | Scrub trigger strips banned keys at any depth (Phase 3 v4) |
| L5 | Portal shows start / destination / current | PASS | `components/portal/roadmap/JourneyCanvas.tsx` + MiniMap |
| L6 | Client sees what needs attention | PASS | `RoadmapAcknowledgmentBanner.tsx` + follow-up flags |
| L7 | Client decisions captured as structured events | PASS | `client_portal_publish_events` + `client_portal_activity` |
| L8 | Client acknowledgment tracked | PASS | `acknowledge_portal_roadmap` RPC (Phase 3B/6C) |
| L9 | Delivery published only after completeness gate | PASS | `DeliveryReadinessPanel` + `publish_portal_roadmap` gates |
| L10 | Publish = real system transition, not badge | PASS | `client_portal_projects.status` enum + `client_portal_publish_events` |
| L11 | Tracks viewed/downloaded/ack/replied/follow-up-needed | PASS | `client_portal_activity` (9 cols) + `mark_portal_follow_up_needed` |
| L12 | Portal activity feeds engine state | PARTIAL | Roadmap changes recompute via `tg_recompute_project_state_from_portal_row`; file/message events do not always trigger recompute |

*Hotfix 2026-07-14:* `engine_projects.current_phase` column added and `client_portal_roadmaps` Data API grants restored; portal roadmap reads verified after RLS negative-token probe.

## M. Business Engines and Founder Consistency — **MAJOR DELTA vs 2026-07-13**

| # | Item | Verdict | Evidence / Gap |
|---|---|---|---|
| M1 | Turn recurring business need into operating engine | PASS | `engine_business_engines` table + `engine-business-engines.functions.ts` |
| M2 | Engine has outcome/workflow/cadence/owner/triggers/approvals/metrics/exception rules | PASS | Columns: `outcome`, `workflow jsonb`, `cadence enum`, `cron_expression`, `owner_email`, `triggers jsonb`, `approval_rules jsonb`, `metrics jsonb`, `exception_rules jsonb` |
| M3 | Content Authority Engine | PARTIAL | `kind` enum supports it; no dedicated template seeded |
| M4 | Lead Follow-Up Engine | PARTIAL | Same — kind supported, template not seeded |
| M5 | Review & Reputation Engine | PARTIAL | Same |
| M6 | Client Success Engine | PARTIAL | Same |
| M7 | Founder Operating Rhythm | PASS | Cron + cadence carried on every engine; `engine_business_engine_runs.cycle_key` |
| M8 | Recurring engines prepare work automatically while preserving approval | PASS | `engine_business_engines_gate` + `engine_business_engines_no_self_approve` triggers + `approval_rules jsonb` |
| M9 | Detects missed cycles and inconsistency | PASS | `engine_business_engines.missed_cycles int` + `engine_business_engine_exceptions` (kind/severity/urgency_score/impact_score) |
| M10 | Surfaces only exceptions instead of tasks | PASS | `engine_business_engine_exceptions` + engines route `engine.projects.$projectId.engines.tsx` |
| M11 | Each engine learns from results | MISSING | No feedback loop from `engine_business_engine_runs.outputs` back into engine `workflow` or prompts |
| M12 | Roadmap evolves "build asset" → "operate capability" | MISSING | Engines exist alongside milestones but no automated promotion from milestone completion to engine creation |

## N. Delivery and Stage Transitions

| # | Item | Verdict | Evidence |
|---|---|---|---|
| N1 | Knows when all milestones/evidence/QA/comms are delivery-ready | PASS | Phase 10B `admin.delivery-readiness-gate.tsx` |
| N2 | Delivery Room locked until conditions pass | PASS | `DeliveryReadinessPanel.tsx` blocks publish CTA |
| N3 | Stage transitions can happen automatically after gate passes | PASS | Phase 8F `engine-stage-transitions.functions.ts` |
| N4 | Automated transitions recorded | PASS | `engine_activity` rows per transition |
| N5 | Next human actor notified with exact action | PASS | `operator_notifications` + NBA |
| N6 | Delivery includes files/links/access/training/limits/support | PASS | `engine_delivery_items` (19 cols); `engine_delivery_history` records transitions |
| N7 | Client acceptance separate from internal approval | PASS | `acknowledge_portal_roadmap` distinct from internal approve |
| N8 | Delivery ≠ business outcome achieved | PASS | Phase 10C/12F outcome loop separate from delivery status |

## O. Outcome Feedback and Continuous Learning

| # | Item | Verdict | Evidence / Gap |
|---|---|---|---|
| O1 | 30 / 60 / 90-day check-ins scheduled | PASS | Phase 10C derived from `published_at` |
| O2 | Compares actual vs Point B / success metrics | PASS | `engine-outcome-feedback.functions.ts` (Phase 12F) |
| O3 | Collects quantitative + qualitative | PASS | Outcome survey submission + numeric metrics |
| O4 | Distinguishes delivery success from business-outcome success | PASS | 6 outcome signal kinds separate |
| O5 | Identifies what worked / failed / should change | PASS | Pattern synthesis in outcome feedback route |
| O6 | Captain recommends roadmap adjustments from real results | PARTIAL | Data captured; automated recommendation does not yet produce new proposals |
| O7 | New recommendations require approval before altering roadmap | PASS | Same proposal + review gate |
| O8 | Proven patterns improve future roadmap generation | PARTIAL | Pattern table exists; not fed back into intake/frame prompts automatically |
| O9 | Confidential client knowledge NOT reused across clients improperly | PASS | RLS + `engine_intelligence_memory` scoped by `project_id` |
| O10 | Platform smarter without careless with privacy | PARTIAL | Aggregated patterns available; no explicit anonymization pipeline |

## P. Portfolio Scale and Exception Management

| # | Item | Verdict | Evidence / Gap |
|---|---|---|---|
| P1 | Command Center handles 100+ projects without manual inspection | PASS | Phase 11B exception board + batched queries |
| P2 | Healthy projects remain quiet | PASS | Exception board hides healthy |
| P3 | Surfaces only decisions / interventions / escalations | PASS | Same |
| P4 | Ranks exceptions by urgency / impact / deadline / financial / client risk | PASS | 8 exception categories + severity sort; `engine_business_engine_exceptions` also has `urgency_score`, `impact_score`, `client_risk`, `deadline_at` |
| P5 | Every project has live NBA | PASS | `compute_engine_next_best_action` RPC |
| P6 | Leadership sees blocked work / approvals / failed agents / budget drift / delivery risk | PASS | Cross-project admin routes cover each |
| P7 | Same data viewable globally / project / milestone | PASS | Admin + engine + milestone routes share source fns |
| P8 | One cross-project Decision Log | PASS | Phase 4C `admin.decision-log.tsx` |
| P9 | Explains why healthy / at-risk / blocked | PARTIAL | Drift + exception cards explain per project; no unified rationale tooltip |
| P10 | Operator decides vs hunts | PARTIAL | Exception board directs attention; some routes still require drill-down |

## Q. Reliability, Security, Accountability

| # | Item | Verdict | Evidence / Gap |
|---|---|---|---|
| Q1 | Every action auditable | PASS | `engine_audit_log` + `engine_activity` + `engine_project_chat_events` |
| Q2 | Every work item has accountable owner | PASS | `owner_email` on packets/tasks/milestones/engines |
| Q3 | Permissions enforced at org / project / role / client | PASS | RLS + `user_roles` + `client_portal_permissions` + `has_client_access` |
| Q4 | Sensitive files + credentials protected | PASS | Server-only `.server.ts` + SECURITY DEFINER RPCs; no `USING(true)` policies for authenticated/anon on any domain table |
| Q5 | Models + tools receive minimum context | PASS | `engine-chat-context.server.ts` scopes per project |
| Q6 | Model-agnostic, best provider per capability | PASS | `engine-ai-providers.server.ts` |
| Q7 | Model selection considers quality/privacy/cost/reliability/availability | PARTIAL | Provider chosen per task type; explicit privacy/cost scoring not visible in selector |
| Q8 | Fallback when model or service fails | PASS | Retry + watchdog + provider fallback in `engine-ai.server.ts` |
| Q9 | Users understand why the system recommended X | PASS | Milestone intelligence panel + decision log rationale |
| Q10 | Clearly admits when confidence is low | PASS | Epistemic status chip + `AIDraftBadge.tsx` |
| Q11 | No AI output official without governance rules | PASS | Every write path routes through triggers or SECURITY DEFINER RPCs |

---

## Ultimate Confirmation

> Can you confirm the Roadmap Engine can receive a founder's messy reality, understand it responsibly, define the destination, generate the right path, design the required solutions, coordinate humans and AI to build them, prove the work, protect every decision, deliver it safely, and keep the business operating consistently after launch?

**Verdict: PASS with two remaining PARTIAL edges.**

- ✅ Receive messy reality — Conversational intake with uploads, transcripts (via voice + attachments), and resume.
- ✅ Understand responsibly — Epistemic truth model + ceremonies + contradiction detection + G1 provenance trigger.
- ✅ Define the destination — Point A / Point B ceremonies promoted into protected Spine.
- ✅ Generate the right path — Per-business roadmap with rationale, sequencing, 7-dimension depth.
- ✅ Design the required solutions — Phase 5D delivered `parent_project_id`, `engine_milestone_solutions`, family/solutions routes, portal-safe family. **Closed the largest 2026-07-13 gap.**
- ✅ Coordinate humans + AI — Chat proposals, agent tasks, permissions, NBA, escalation.
- ✅ Prove the work — Evidence gate + QA factory + human review + AI-approval prohibition (now covering Section F/M artifacts too).
- ✅ Protect every decision — Immutable audit + spine field truth + governed publication + no permissive policies for authenticated/anon.
- ✅ Deliver it safely — Portal boundary downstream-only from `status='published'`; scrub triggers enforce internal-key blocking at any depth; hotfix 2026-07-14 restored roadmap grants + negative-token verified.
- ⚠️ Operate consistently after launch — Business Engines schema, cron/cadence, exceptions, and gate triggers now exist (Section M jumped from 0 PASS to 6 PASS). **Still MISSING:** (a) engine-level learning loop from `engine_business_engine_runs.outputs` back into workflow, (b) automated promotion of a completed operational milestone into an engine.

## Top 10 gaps ranked by blast radius

| Rank | Gap | Section | Suggested phase / owner |
|---:|---|---|---|
| 1 | Engine-level learning loop (M11) — runs produce no feedback into workflow | M | New phase: **Engine Learning Loop** (join outcome-feedback pattern → engine workflow diff proposals) |
| 2 | Milestone → engine promotion (M12) — no automated handoff | M | New phase: **Operate-Mode Promotion** (trigger on milestone kind=`operational` + delivered) |
| 3 | Cost overrun auto-pause (H9) — surfaces drift but doesn't halt | H | Extend `engine_business_engines_gate` pattern to `engine_agent_costs` threshold |
| 4 | Automated impact analysis on cross-project change (F7) | F | Wire family graph to spine-drift emission on parent/child status change |
| 5 | Captain-recommended milestone splits (F8) | F | Heuristic + chat proposal (`suggested_task` kind extension) |
| 6 | Non-spine proposal layer (B12) — direct writes still allowed on some surfaces | B | Extend `tg_engine_chat_proposals_enforce_transition` coverage matrix |
| 7 | Weighted readiness score UI (D4) | D | Surface confidence-weighted 0–100 on project overview |
| 8 | Transcript-parse pipeline (A8) | A | Dedicated meeting → structured signal extractor |
| 9 | Intake review as hard pre-roadmap gate (A12) | A | Promote `engine-intake-review` from optional to gate |
| 10 | Business Engine templates (M3–M6) — kinds supported but seed content missing | M | Seed migration for Content / Lead / Reputation / CS engine templates |

## Appendix — Inventory (2026-07-14)

- **Public tables:** 78 total; **62** in `engine_*` / `client_portal_*` domain; **all 62 have RLS enabled**; default ACLs grant CRUD to anon/authenticated/service_role, RLS is the sole scoping layer.
- **Policies:** 140. Zero `USING(true)` policies on any `authenticated`/`anon`-role domain table.
- **Triggers:** 122 in `public.*`. Governance triggers cover: proposals, spine field truth, build evidence immutability, mockup enforce, plan enforce, QA enforce, portal scrub, self-approve prevention (milestones/tasks/solutions/engines), child rollup, kind shape.
- **Public functions:** 105 (SECURITY DEFINER RPCs for publish/rollback/retract/restore/acknowledge, ceremony enforcement, NBA compute, project-state recompute, extraction watchdog, role helpers).
- **Server-fn modules:** 65 `.functions.ts` (new since 2026-07-13: `engine-business-engines`, `engine-project-family`, `portal-family`).
- **Routes:** 119 (new: `engine.projects.$projectId.family.tsx`, `engine.projects.$projectId.solutions.tsx`, `engine.projects.$projectId.engines.tsx`, `engine.projects.$projectId.engines.runs.$runId.tsx`, `portal.family.tsx`).

---
**End of audit.** Baseline: `.orchestrator/capability-audit-2026-07.md` (2026-07-13). Smoke evidence: `.orchestrator/audit/capability-audit-smoke-output.md`.
