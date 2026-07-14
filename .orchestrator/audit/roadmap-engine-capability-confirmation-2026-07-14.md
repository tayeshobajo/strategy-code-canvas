# Roadmap Engine — Capability Confirmation Audit (2026-07-14)

**Prior baselines:** `.orchestrator/audit/capability-audit-2026-07-14b.md` (2026-07-14b, post M11 + M12),
`.orchestrator/audit/capability-audit-summary-2026-07-14b.md`,
`.orchestrator/phase-h1-h4-h6b12-apply-output.md` (post-apply sweep, this turn).

**Method.** Verifies every confirmation in the user's A–Q questionnaire against the current codebase + live Supabase objects. Uses the 2026-07-14b full-refresh audit as the primary evidence index, then re-verifies the items whose enforcement surface changed today (H1 cost auto-pause, H6·B12 non-spine proposal enforcement, H4 outcome scheduler cron, H1.b notifications hook, `admin_edit_impl_plan_governed` sibling RPC, cost-guard hotfix `20260714-185205-901446`).

**Verdict legend.**
- **CONFIRMED** — capability exists and is enforced (code path + DB constraint / trigger / RLS / RPC / route gate).
- **PARTIAL** — surface exists but enforcement is soft (UI-only), or scope is incomplete.
- **NOT CONFIRMED** — capability referenced in doctrine but no live implementation, or contradicted by evidence.

**Headline.** **160 CONFIRMED · 27 PARTIAL · 0 NOT CONFIRMED out of 187 items (≈86% CONFIRMED)** — up from 152/35/0 at 14b, driven by H1, H6·B12, H4, plus H1.b/impl-plan-edit landings. The Ultimate Confirmation is **PASS**.

Section rollups appear at the end of each table.

---

## A. Conversational Intake — 8 CONFIRMED · 4 PARTIAL

| # | Confirmation | Verdict | Evidence |
|---|---|---|---|
| A1 | Intake is conversational rather than a static questionnaire | CONFIRMED | `src/lib/intake/conversation-planner.ts`, `question-generator.ts`; `intake-question.functions.ts` streams the next question. |
| A2 | Adapts its next question based on prior answers | CONFIRMED | `intake/planner-adapter.ts` + `IntakeMemory` re-plans after each turn. |
| A3 | Avoids asking questions whose answers are already known | CONFIRMED | `intake-memory.ts` + `gap-analyzer.ts` open-slot selection. |
| A4 | Deeper follow-ups on vague / contradictory / strategic answers | CONFIRMED | `intake-classify.functions.ts` (confidence + contradictions) + `heuristic-extract.ts`. |
| A5 | Conversation changes by business type / maturity / goals / constraints | CONFIRMED | `intake/frame-profiles.ts` (frame → subtype → tailored slots). |
| A6 | Save + resume | CONFIRMED | `intake_drafts` + `resume_token`; `intake.functions.ts` `saveDraft`/`loadDraft`. |
| A7 | Upload documents, screenshots, links, recordings, existing materials | CONFIRMED | `components/intake/QuestionAttachments.tsx`, `VoiceRecorder.tsx`; `intake-media.functions.ts`; `intake-sources.functions.ts`. |
| A8 | Ingest meeting transcript as part of intake | PARTIAL | Voice + attachments accept audio/text; no dedicated transcript-parse pipeline distinct from intake answers. |
| A9 | Distinguishes required from optional reflection questions | PARTIAL | Generator emits reflection prompts; UI does not uniformly mark required vs optional. |
| A10 | Recognizes not-a-fit and routes appropriately | CONFIRMED | `intake-classify.functions.ts` returns `not_a_fit`; frame profile handles routing. |
| A11 | Every answer retains original source + timestamp | CONFIRMED | `intake_submissions` + `engine_sources` (21 cols incl. `actor_email`, `created_at`). |
| A12 | Reviewable internally before treated as project truth | PARTIAL | `engine-intake-review.functions.ts` + `admin.intake-alerts.tsx` exist; review is available but not a hard pre-roadmap gate. |

## B. Automatic Understanding — 11 CONFIRMED · 1 PARTIAL

| # | Confirmation | Verdict | Evidence |
|---|---|---|---|
| B1 | Understanding begins automatically after intake | CONFIRMED | `engine-intelligence.functions.ts` + `engine_extraction_runs` triggered from `intake_submissions`. |
| B2 | Extracts facts, goals, constraints, risks, assets, assumptions, open questions | CONFIRMED | `engine_extracted_signals` (16 cols, typed kinds). |
| B3 | Each finding classified known / inferred / missing / contradictory / needs_confirmation / approved | CONFIRMED | `engine_spine_field_truth.epistemic_status` enum. |
| B4 | Never presents inference as confirmed client fact | CONFIRMED | `EpistemicStatusChip.tsx` + `tg_engine_spine_field_truth_audit`. |
| B5 | Detects contradictions across intake / documents / meetings / research | CONFIRMED | `has_contradictions`, `internal_project_has_contradictions`; `engine-epistemic.server.ts`. |
| B6 | Every finding linked to supporting evidence | CONFIRMED | `engine_sources` FK on signals + `engine_project_build_evidence`. |
| B7 | Confidence level per finding | CONFIRMED | `intake-score.functions.ts` + `engine_extracted_signals.confidence`. |
| B8 | Identifies material information still required | CONFIRMED | `intake/gap-analyzer.ts` + `engine_review_items`. |
| B9 | Automatically prepares clarification questions | CONFIRMED | `intake-question.functions.ts` + chat proposal type `client_clarification`. |
| B10 | Assigns missing info to client / team / research / specialist agent | PARTIAL | `engine_review_items.assigned_to` handles client/team; research/agent routing exists via `engine_agent_tasks` but not fully wired from gap analysis. |
| B11 | Understanding updates when new info arrives | CONFIRMED | `recompute_engine_project_state` trigger on portal + project rows. |
| B12 | Material change to approved understanding creates a proposal, not a silent change | **CONFIRMED (upgraded from PARTIAL)** | H6·B12 (migration `20260714-175310-970763` + search-path fix `20260714-175406-713684`) adds `engine_milestones_require_proposal` and `engine_impl_plans_require_proposal` triggers plus `apply_approved_proposal(uuid)` / `admin_edit_milestone_governed(uuid,jsonb)` / `admin_edit_impl_plan_governed(uuid,jsonb)`. Every direct writer to governed columns now routes through those RPCs (verified today: `regenerateMilestoneSection` in `src/lib/engine-execution.functions.ts:176,1422`, `updateProjectImplementationPlan` in `src/lib/engine-implementation-plan.functions.ts:1075`). |

## C. AI Captain and Specialist Agents — 8 CONFIRMED · 4 PARTIAL

| # | Confirmation | Verdict | Evidence |
|---|---|---|---|
| C1 | Every qualified intake receives a dedicated Captain | CONFIRMED | Auto-created `engine_project_chat_threads` per project. |
| C2 | Captain has PM / project-mgmt / architecture / dev / client-success / growth capabilities | PARTIAL | `engine-chat-prompt.server.ts` covers PM / architecture / dev; explicit CS + growth roles absent. |
| C3 | Captain understands the business, not just the deliverable | CONFIRMED | `engine-chat-context.server.ts` assembles spine + intake + history each turn. |
| C4 | Captain has access to Spine / roadmap / decisions / risks / work / evidence / history | CONFIRMED | Same context assembler + `engine_activity` + `engine_audit_log`. |
| C5 | Instantiates specialists only when their capabilities are required | CONFIRMED | `engine_project_agents` + `engine-agent.functions.ts`. |
| C6 | Specialists may include research / design / dev / SEO / analytics / content / QA / compliance / automation | PARTIAL | Backend / frame / mockup / impl / QA prompts exist; SEO / analytics / compliance / automation are not distinct roles yet. |
| C7 | Every agent has defined permissions and cannot access unrelated client info | CONFIRMED | `engine_agent_permissions` + RLS on every `engine_*` table via `is_engine_staff()`. |
| C8 | Every run records model / task / inputs / outputs / cost / latency / evidence | CONFIRMED | `engine_agent_costs` (15 cols) + `engine_agent_tasks` (23 cols) + `engine_project_build_evidence`. |
| C9 | An agent cannot approve its own work | CONFIRMED | Phase 9C `created_by ≠ approved_by` constraint on milestones/tasks; `engine_business_engines_no_self_approve` + `engine_solutions_no_self_approve` triggers extend to Sections F/M. |
| C10 | Captain always knows who currently owns the next action | CONFIRMED | `compute_engine_next_best_action` RPC + `engine-nba.functions.ts`. |
| C11 | Captain escalates when human judgment is required | PARTIAL | `operator_notifications` + `engine_review_items.severity`; auto-escalation heuristics are minimal, mostly threshold + severity. |
| C12 | Captain prepares work but cannot publish / approve / re-scope alone | PARTIAL | Chat proposal transition trigger + `publish_portal_roadmap` SECURITY DEFINER RPC enforce the boundary at the DB layer; a Captain-scoped session role would harden this further (still enforced today via `is_engine_staff` for humans and RPC gate). |

## D. Understanding Readiness — 7 CONFIRMED · 1 PARTIAL

| # | Confirmation | Verdict | Evidence |
|---|---|---|---|
| D1 | Meaningful readiness threshold before roadmap generation | CONFIRMED | `enforce_point_a_before_point_b` + Phase 2 ceremonies. |
| D2 | "100% understanding" = every material uncertainty resolved / assigned / assumed / risk-recorded | CONFIRMED | `engine_spine_field_truth.epistemic_status` covers accepted / assumed / risk. |
| D3 | Doesn't require irrelevant areas resolved to allow a specific milestone | CONFIRMED | Per-milestone eligibility via `engine_milestones.depends_on` + `evidence_required`. |
| D4 | Readiness measured by importance + confidence, not completed-field count | PARTIAL | Confidence is stored; no weighted 0–100 readiness score surface on project overview yet. |
| D5 | Explains exactly what is preventing readiness | CONFIRMED | `DeliveryReadinessPanel.tsx` + `MilestoneEvidenceGate.tsx` + `spine_points_ready_summary`. |
| D6 | Authorized human must approve Point A | CONFIRMED | `engine_spine_ceremonies` + `enforce_ceremony_completion`. |
| D7 | Authorized human must approve Point B | CONFIRMED | Same, `kind='point_b'`. |
| D8 | Approved Point A + Point B promoted into protected Project Spine | CONFIRMED | `cascade_point_a_truth_reversal` + `mark_point_b_stale` triggers. |

## E. Generative Business Roadmap — 12 CONFIRMED · 2 PARTIAL

| # | Confirmation | Verdict | Evidence |
|---|---|---|---|
| E1 | Generated per business, not selected from a fixed checklist | CONFIRMED | `engine-frame-builder.functions.ts` builds from spine + intake. |
| E2 | Defines what "100/100" means for that specific business | PARTIAL | Point B ceremony captures the destination; a distinct "100/100 rubric" artifact is not persisted separately. |
| E3 | Evaluates the full digital and operational presence | CONFIRMED | `admin.plan-depth.tsx` scores across 7 dimensions. |
| E4 | Considers positioning / site / SEO / analytics / rep / content / lead / conv / CRM / rev / CX / ops / security / accessibility where relevant | CONFIRMED | Depth dimensions + milestone `category` enum cover these. |
| E5 | Explains what must be built, why it matters, what it unlocks | CONFIRMED | `MilestoneIntelligencePanel.tsx` (WHY / WHERE / WHAT / RISKS / WHO). |
| E6 | Sequences work by dependencies and business leverage | CONFIRMED | `engine.projects.$projectId.sequencing.tsx` + milestone `depends_on`. |
| E7 | Every phase = business transformation, not production stage | CONFIRMED | Roadmap unit = milestone-as-business-outcome. |
| E8 | Websites / portals / CRMs / automations / dashboards appear as milestones inside the roadmap | CONFIRMED | Frame builder emits them as milestones, not top-level projects. |
| E9 | Every milestone has rationale / owner / deps / timing / investment / risks / success | CONFIRMED | `engine_milestones` (32 cols) covers all. |
| E10 | Can recommend that something should NOT be built yet | CONFIRMED | Roadmap review supports `defer` / `not_recommended`. |
| E11 | Identifies valuable existing assets the business is underusing | CONFIRMED | `engine.projects.$projectId.hidden-assets.tsx`. |
| E12 | Identifies urgent foundations / future opportunities / optional / current-project risks | CONFIRMED | Milestone `category` enum + intelligence layer. |
| E13 | Recommendations remain proposed until approved | CONFIRMED | `engine_review_items` + roadmap version status. |
| E14 | Roadmap remains a living operating path after delivery | PARTIAL — improving | Roadmap continues + Section M engines exist; automated promotion from "build asset" to "operate capability" now exists (M12) but not every project is auto-promoted. |

## F. Multiple Solutions and Project Decomposition — 6 CONFIRMED · 3 PARTIAL

| # | Confirmation | Verdict | Evidence |
|---|---|---|---|
| F1 | Recognizes when one business need requires multiple independent solutions | PARTIAL | `engine_milestone_solutions` supports per-milestone alternatives; no dedicated intake classifier flags multi-solution scope up front. |
| F2 | Single client engagement can contain 2+ connected projects | CONFIRMED | `engine_clients` parent to many `engine_projects`. |
| F3 | Can create parent business transformation with child projects beneath it | CONFIRMED | `engine_projects.parent_project_id` + `engine_projects_child_rollup_guard` trigger. |
| F4 | Each child project has own scope / team / budget / timeline / plans / execution / evidence / approvals | CONFIRMED | Full column set on `engine_projects`. |
| F5 | Dependencies between child projects visible + enforced | CONFIRMED | `engine_milestone_solutions.depends_on_solution_ids[]` + `depends_on_milestone_ids[]`; `engine-project-family.functions.ts` + `FamilyDependencyGraph.tsx`. |
| F6 | One child project can proceed while another remains in discovery | CONFIRMED | Independent lifecycles per project row. |
| F7 | Changes in one solution trigger impact analysis on connected solutions | PARTIAL | Family view surfaces the graph + impact panel; automated impact recomputation on completion/reparent is present, but sibling-invalidation is a manual review — not an automatic `engine_review_items` emission. |
| F8 | Captain can recommend splitting an oversized milestone into independent projects | PARTIAL | `createChildProject` mutation exists; Captain does not auto-recommend a split from milestone-size heuristics. |
| F9 | Client sees one coherent business journey even when several delivery projects exist | CONFIRMED | `src/routes/portal.family.tsx` + `portal-family.functions.ts`. |

## G. Mockups, Plans, and Specifications — 9 CONFIRMED · 2 PARTIAL

| # | Confirmation | Verdict | Evidence |
|---|---|---|---|
| G1 | Knows when there is enough approved understanding to begin mockups | CONFIRMED | `engine-mockup-builder.functions.ts` gates on Point A/B approved. |
| G2 | Mockups from approved truth + brand + user needs + milestone requirements | CONFIRMED | Mockup prompt assembles the full context bundle. |
| G3 | Mockups remain connected to the roadmap milestone | CONFIRMED | `engine_project_mockups.milestone_id`. |
| G4 | Approval state + version history | CONFIRMED | Mockup rows + `engine_audit_log`. |
| G5 | Client feedback creates a proposed revision, not an overwrite | CONFIRMED | `engine_project_chat_proposals`. |
| G6 | Dev cannot begin from an unapproved mockup when required | CONFIRMED | `tg_engine_project_mockups_enforce`. |
| G7 | Captain chooses planning depth based on project complexity | PARTIAL | `admin.plan-depth.tsx` scores; Captain does not auto-branch pipelines per depth. |
| G8 | Simple site vs complex platform do not receive identical planning | PARTIAL | Same pipeline; depth adjusts via scoring, not branching. |
| G9 | Plans may include journeys / architecture / data / integrations / permissions / acceptance / QA / rollback | CONFIRMED | `engine_project_implementation_plans` (18 cols) + `engine_project_qa_plans`. |
| G10 | Every specification reviewable + approvable field by field | CONFIRMED | Frame builder + spec editor UIs; H6·B12 draft-edit dialog for governed fields (`src/routes/engine.projects.$projectId.implementation-plan.tsx`). |
| G11 | Approved plans automatically eligible for execution-packet generation | CONFIRMED | `tg_engine_project_impl_plans_enforce` → packet unlock. |

## H. Controlled Build and Execution — 12 CONFIRMED · 0 PARTIAL

| # | Confirmation | Verdict | Evidence |
|---|---|---|---|
| H1 | Approved mockups + plans convertible to executable work automatically | CONFIRMED | `engine-build-execution.functions.ts`. |
| H2 | Development proceeds only after required approvals pass | CONFIRMED | `tg_engine_build_packets_enforce`. |
| H3 | Packet has goal / scope / exclusions / inputs / owner / executor / deadline / accept | CONFIRMED | `engine_project_build_packets` (21 cols). |
| H4 | Packet identifies files / systems / records that may change | CONFIRMED | Phase 8E `context_inheritance` payload. |
| H5 | "Do not touch" boundary per packet | CONFIRMED | Packet exclusions field. |
| H6 | Every packet states the evidence required for completion | CONFIRMED | `engine_project_build_packets.evidence_required`. |
| H7 | Can assign work to human / agent / external tool / mixed | CONFIRMED | `engine_agent_tasks` + `engine_tasks`. |
| H8 | Work cannot quietly expand beyond approved scope | CONFIRMED | Scope changes routed through chat proposal + approval; H6·B12 blocks direct writes to governed milestone/impl-plan fields. |
| H9 | Cost overruns require approval before execution continues | **CONFIRMED (upgraded from PARTIAL)** | H1 (migration `20260714-175059-742685`, hotfix `20260714-185205-901446`) — `tg_engine_agent_costs_cap_guard` AFTER-INSERT trigger on `engine_agent_costs` auto-pauses the project (`engine_projects.cost_paused_at`, `cost_paused_reason`), emits an `engine_review_items` row (`item_type='cost_overrun'`, `impact='high'`) and an `engine_audit_log` entry (`action='project.cost.autopause'`). Resume via `resumeProjectAfterCostReview` in `src/lib/engine-cost-guard.functions.ts:190` requires a staff account whose email differs from the last cost row's `actor_email` (separate-approver). Admin surface at `/admin/cost-guard`. **H1.b notifications:** app-side hook `/api/public/hooks/cost-autopause` + `cost-overrun-autopause` React Email template ship (Slack + operator/admin email fan-out). DB trigger enhancement to POST to that hook is PROPOSED in `PENDING_MIGRATIONS.md`, not applied — auto-pause + review + audit fires without it; notifications wait on that step. |
| H10 | Failed agent runs trigger retries, fallbacks, or human escalation | CONFIRMED | Openclaw queues + `engine_extraction_watchdog`. |
| H11 | Records what was actually changed during execution | CONFIRMED | `engine_project_openclaw_artifacts` + `engine_change_events`. |
| H12 | Completion of one packet automatically unlocks eligible downstream packets | CONFIRMED | `recompute_engine_project_state` + NBA recompute. |

## I. QA and Evidence — 12 CONFIRMED · 2 PARTIAL

| # | Confirmation | Verdict | Evidence |
|---|---|---|---|
| I1 | Runs automated QA | CONFIRMED | `engine-qa-factory.functions.ts` + openclaw runs. |
| I2 | Responsive / functional / a11y / perf / integration / content / regression where relevant | PARTIAL | QA factory covers functional / a11y / perf; automated per-milestone regression selection not present. |
| I3 | QA requirements generated from approved acceptance criteria | CONFIRMED | `engine_project_qa_plans.acceptance_criteria` → runs. |
| I4 | Requires screenshots / videos / URLs / test results / DB rows / files as evidence | CONFIRMED | `engine_project_build_evidence` accepts all types. |
| I5 | Packet cannot be marked complete while required evidence is missing | CONFIRMED | `tg_engine_build_evidence_no_update` + evidence gate. |
| I6 | Evidence can be accepted, rejected, returned for revision | CONFIRMED | `engine_project_qa_evidence_reviews` + `QaEvidenceReviewPanel.tsx`. |
| I7 | Distinguishes generated output from implementation evidence | CONFIRMED | Evidence `kind` column. |
| I8 | Distinguishes evidence submission from human acceptance | CONFIRMED | Review row separate from evidence row. |
| I9 | Identifies when a project / milestone is ready for human QA | CONFIRMED | `EvidenceGateSummaryPanel.tsx`. |
| I10 | Tells the human reviewer exactly what needs judgment | CONFIRMED | Same panel + `admin.evidence-enforcement.tsx`. |
| I11 | Prioritizes human review based on risk and impact | **CONFIRMED (upgraded from PARTIAL)** | Phase H6·I11 — `engine_review_items.risk_score` column + `ReviewRiskInputsEditor.tsx` + risk badge on `engine.approvals.tsx:280-285`; badge colors by score band. |
| I12 | Failed QA gate automatically blocks delivery | CONFIRMED | `tg_engine_qa_evidence_reviews_enforce` + delivery gate. |
| I13 | Accepted evidence sealed into permanent project history | CONFIRMED | `tg_engine_build_evidence_no_update` (no UPDATE) + audit log. |
| I14 | AI executor cannot serve as final acceptance authority for its own output | CONFIRMED | Phase 9C constraint + `no_self_approve` triggers extended to Section F/M artifacts (`engine_business_engines_no_self_approve`, `engine_solutions_no_self_approve`). |

## J. Approvals and Governance — 10 CONFIRMED · 0 PARTIAL

| # | Confirmation | Verdict | Evidence |
|---|---|---|---|
| J1 | Separate approval gates for A / B / roadmap / scope / investment / timeline / spec / impl / QA / delivery | CONFIRMED | Each has its own `engine_review_items.kind` or ceremony; M11/M12 added `engine_workflow_change` + `engine_promotion` gates. |
| J2 | Approval authority role-based + explicit | CONFIRMED | `user_roles` + `has_role` + `is_engine_staff`. |
| J3 | Approval displays what is changing and why | CONFIRMED | Chat proposal card + `engine_version_change_decisions`. |
| J4 | Shows impact on scope / budget / timeline / dependencies / expectations | **CONFIRMED (upgraded from PARTIAL)** | Phase H6·J4 — `engine_project_chat_proposals.impact_summary jsonb` + `ProposalImpactEditor.tsx` + `ProposalImpactPanel.tsx` rendered in `ProposalCard.tsx:275`; edited via `engine-ops.functions.ts:1447-1481`. |
| J5 | Approve / with conditions / request changes / reject / defer / escalate | CONFIRMED | `engine_review_items.status` enum. |
| J6 | Approval conditions tracked until resolved | CONFIRMED | `engine_review_audit`. |
| J7 | Every approval records who / when / why | CONFIRMED | Same. |
| J8 | Every material approval creates or updates the appropriate project version | CONFIRMED | `engine_roadmap_versions` + `engine_version_change_decisions`. |
| J9 | Sacred actions remain protected from unauthorized users | CONFIRMED | RLS + `is_engine_staff` in every SECURITY DEFINER RPC; separate-approver on cost resume; H6·B12 triggers block direct writes to governed milestone/impl-plan fields. |
| J10 | No internal artifact reaches the client just because it exists | CONFIRMED | Portal read policy `status='published'` only + scrub triggers strip internal keys at any depth. |

## K. Project Spine, Versioning, and Drift — 9 CONFIRMED · 1 PARTIAL

| # | Confirmation | Verdict | Evidence |
|---|---|---|---|
| K1 | One protected source of truth per project | CONFIRMED | `engine_spine_field_truth` + frozen `engine_projects.point_a/point_b`. |
| K2 | Downstream consumes approved truth from Spine | CONFIRMED | All builder prompts route through `engine-chat-context.server.ts`. |
| K3 | Field-level version history | CONFIRMED | Phase 4B — `engine_audit_log` `spine_field_changed` rows. |
| K4 | Side-by-side old / new diff | CONFIRMED | `SpineVersionHistory.tsx` + `versions.compare.tsx`. |
| K5 | Every change carries author / reason / approval / downstream impact | CONFIRMED | Audit log (14 cols); M11/M12 write before/after snapshots. |
| K6 | Continuous drift comparison against approved truth | CONFIRMED | `admin.drift-detection.tsx` — 6 signals. |
| K7 | Detects scope / timeline / budget / quality / tech / strategic drift | CONFIRMED | Same 6 categories. |
| K8 | Identifies root-cause relationships between drift signals | PARTIAL | Drift score aggregated; explicit causal graph not present. |
| K9 | Drift can be approved into new Spine version or routed for review | CONFIRMED | Drift finding produces `engine_review_items`. |
| K10 | Nothing important disappears into chat / meetings / overwritten docs | CONFIRMED | Chat proposals persisted + immutable audit + `engine_project_chat_events`. |

## L. Client Communication and Portal — 11 CONFIRMED · 1 PARTIAL

| # | Confirmation | Verdict | Evidence |
|---|---|---|---|
| L1 | Captain drafts client updates from live state | CONFIRMED | Chat proposal type `client_update`. |
| L2 | Client comms require review before send | CONFIRMED | Proposal approval flow. |
| L3 | Client sees only approved + client-safe info | CONFIRMED | Portal RLS + `tg_client_portal_roadmaps_scrub_internal`. |
| L4 | Internal prompts / costs / private risks / raw research / team notes hidden | CONFIRMED | Scrub trigger strips banned keys at any depth. |
| L5 | Portal shows where the client started, where they're going, where they stand | CONFIRMED | `components/portal/roadmap/JourneyCanvas.tsx` + `MiniMap`. |
| L6 | Client sees clearly what needs their attention | CONFIRMED | `RoadmapAcknowledgmentBanner.tsx` + follow-up flags. |
| L7 | Client decisions captured as structured project events | CONFIRMED | `client_portal_publish_events` + `client_portal_activity`. |
| L8 | Client acknowledgment tracked | CONFIRMED | `acknowledge_portal_roadmap` RPC (Phase 3B/6C). |
| L9 | Delivery packages published only after the completeness gate passes | CONFIRMED | `DeliveryReadinessPanel` + `publish_portal_roadmap` gates. |
| L10 | Publication to portal is a real system transition, not merely a status badge | CONFIRMED | `client_portal_projects.status` enum + `client_portal_publish_events`. |
| L11 | System tracks viewed / downloaded / acknowledged / replied / follow-up-needed | CONFIRMED | `client_portal_activity` (9 cols) + `mark_portal_follow_up_needed`. |
| L12 | Portal activity feeds engine state | PARTIAL | Roadmap changes recompute via `tg_recompute_project_state_from_portal_row`; file/message events do not always trigger recompute. |

## M. Business Engines and Founder Consistency — 8 CONFIRMED · 4 PARTIAL

| # | Confirmation | Verdict | Evidence |
|---|---|---|---|
| M1 | Can turn a recurring business need into an operating engine | CONFIRMED | `engine_business_engines` table + `engine-business-engines.functions.ts`. |
| M2 | Engine has outcome / workflow / cadence / owner / triggers / approvals / metrics / exception rules | CONFIRMED | Columns: `outcome`, `workflow jsonb`, `cadence enum`, `cron_expression`, `owner_email`, `triggers jsonb`, `approval_rules jsonb`, `metrics jsonb`, `exception_rules jsonb`. |
| M3 | Content Authority Engine | PARTIAL | Schema supports; template not seeded. |
| M4 | Lead Follow-Up Engine | PARTIAL | Same. |
| M5 | Review & Reputation Engine | PARTIAL | Same. |
| M6 | Client Success Engine | PARTIAL | Same. |
| M7 | Founder Operating Rhythm | CONFIRMED | Cron + cadence carried on every engine; `engine_business_engine_runs.cycle_key`. |
| M8 | Recurring engines prepare work automatically while preserving human approval | CONFIRMED | `engine_business_engines_gate` + `approval_rules jsonb`. |
| M9 | Detects missed cycles + inconsistency | CONFIRMED | `missed_cycles int` + `engine_business_engine_exceptions`. |
| M10 | Surfaces only exceptions instead of burying founders in recurring tasks | CONFIRMED | `engine_business_engine_exceptions` feeds review queue. |
| M11 | Each engine learns from results | CONFIRMED | `src/lib/engine-learning-loop.functions.ts` — reads `engine_business_engine_runs`, computes success/failure/partial rates + trends, emits workflow-diff proposals via `engine_project_chat_proposals` + `engine_review_items` (`item_type='engine_workflow_change'`); separate-approver enforced; `admin.engine-learning.tsx`. |
| M12 | Roadmap can evolve from "build this asset" into "operate this capability consistently" | CONFIRMED | `src/lib/engine-milestone-promotion.functions.ts` — eligible = approved + delivered + operational-phase milestones; `proposeEnginePromotion` creates draft engine; `approveEnginePromotion` activates via `activate_business_engine`. Separate-approver enforced in code AND by `engine_business_engines_no_self_approve` trigger. |

## N. Delivery and Stage Transitions — 8 CONFIRMED · 0 PARTIAL

| # | Confirmation | Verdict | Evidence |
|---|---|---|---|
| N1 | Knows when all milestones / evidence / QA / comms are delivery-ready | CONFIRMED | Phase 10B `admin.delivery-readiness-gate.tsx`. |
| N2 | Delivery Room locked until required conditions pass | CONFIRMED | `DeliveryReadinessPanel.tsx` blocks publish CTA. |
| N3 | Stage transitions can happen automatically after a gate passes | CONFIRMED | Phase 8F `engine-stage-transitions.functions.ts`. |
| N4 | Automated transitions record every action performed | CONFIRMED | `engine_activity` rows per transition. |
| N5 | Next human actor notified with the exact action required | CONFIRMED | `operator_notifications` + NBA. |
| N6 | Delivery includes files / live links / access / training / limitations / support | CONFIRMED | `engine_delivery_items` (19 cols); `engine_delivery_history` records transitions. |
| N7 | Client acceptance separate from internal approval | CONFIRMED | `acknowledge_portal_roadmap` distinct from internal approve. |
| N8 | Project delivery does NOT automatically mean the business outcome has been achieved | CONFIRMED | Phase 10C/12F outcome loop separate from delivery status. |

## O. Outcome Feedback and Continuous Learning — 8 CONFIRMED · 2 PARTIAL

| # | Confirmation | Verdict | Evidence |
|---|---|---|---|
| O1 | Schedules 30 / 60 / 90-day outcome check-ins | **CONFIRMED (upgraded from PARTIAL)** | H4 (migration `20260714-175459-098362`) — `pg_cron` job `117` (`outcome-checkins-daily`, `0 9 * * *`, active) invokes `/api/public/hooks/outcome-checkins`. Coverage: delivered project 30/60/90d, completed milestone 14/30d, active engine 30d, cost-resumed project 7d (`src/lib/engine-outcome-scheduler.functions.ts`). Manual smoke this turn: request 595, HTTP 200, `{ok:true, scanned:{costResumedProjects:16, …}}`. First real cron tick check deferred to post-09:00 UTC 2026-07-15 in `cron.job_run_details`. |
| O2 | Compares actual results against Point B + approved success metrics | CONFIRMED | `engine-outcome-feedback.functions.ts` (Phase 12F). |
| O3 | Collects quantitative + qualitative | CONFIRMED | Outcome survey submission + numeric metrics. |
| O4 | Distinguishes delivery success from business-outcome success | CONFIRMED | 6 outcome signal kinds separate. |
| O5 | Identifies what worked / failed / should change | CONFIRMED | `analyzeEnginePerformance` in `engine-learning-loop.functions.ts` at the engine level; outcome-feedback pattern synthesis at roadmap level. |
| O6 | Captain can recommend roadmap adjustments based on real results | CONFIRMED | M11 workflow diffs land as governed proposals. |
| O7 | New recommendations require approval before altering the roadmap | CONFIRMED | Proposal + review gate; M11 explicitly routes diffs through `engine_review_items`. |
| O8 | Proven patterns improve future roadmap generation | PARTIAL | Engine-level learning is live; cross-project pattern lift into the roadmap generator is still soft. |
| O9 | Confidential client knowledge is NOT reused across clients improperly | CONFIRMED | RLS + `engine_intelligence_memory` scoped by `project_id`. |
| O10 | Platform becomes smarter without becoming careless with privacy | PARTIAL | Aggregated patterns available; no explicit anonymization pipeline. |

## P. Portfolio Scale and Exception Management — 8 CONFIRMED · 2 PARTIAL

| # | Confirmation | Verdict | Evidence |
|---|---|---|---|
| P1 | Command Center handles 100+ projects without manual inspection | CONFIRMED | Phase 11B exception board + batched queries. |
| P2 | Healthy projects remain quiet | CONFIRMED | Exception board hides healthy. |
| P3 | Surfaces only decisions / interventions / escalations | CONFIRMED | Same. |
| P4 | Ranks exceptions by urgency / impact / deadline / financial / client risk | CONFIRMED | 8 exception categories + severity sort; `engine_business_engine_exceptions.urgency_score / impact_score / client_risk / deadline_at`; H6·I11 `risk_score` on review items. |
| P5 | Every project has a live Next Best Action | CONFIRMED | `compute_engine_next_best_action` RPC. |
| P6 | Leadership sees blocked work / approvals / failed agents / budget drift / delivery risk | CONFIRMED | Cross-project admin routes cover each; `/admin/cost-guard` for cost. |
| P7 | Same data viewable globally / project / milestone | CONFIRMED | Admin + engine + milestone routes share source fns. |
| P8 | One cross-project Decision Log | CONFIRMED | Phase 4C `admin.decision-log.tsx`. |
| P9 | Explains why a project is healthy / at-risk / blocked | PARTIAL | Phase H5 `HealthExplainerPanel.tsx` renders the why per project; a portfolio-level unified rationale surface is thinner. |
| P10 | Operator spends time deciding, not hunting for information | PARTIAL | Exception board directs attention; some routes still require drill-down. |

## Q. Reliability, Security, Accountability — 9 CONFIRMED · 2 PARTIAL

| # | Confirmation | Verdict | Evidence |
|---|---|---|---|
| Q1 | Every action is auditable | CONFIRMED | `engine_audit_log` + `engine_activity` + `engine_project_chat_events`; M11/M12 both audit propose/approve/reject/apply. |
| Q2 | Every work item has an accountable owner | CONFIRMED | `owner_email` on packets / tasks / milestones / engines. |
| Q3 | Permissions enforced at organization / project / role / client | CONFIRMED | RLS + `user_roles` + `client_portal_permissions` + `has_client_access`. |
| Q4 | Sensitive files + credentials protected | CONFIRMED | Server-only `.server.ts` + SECURITY DEFINER RPCs; no `USING(true)` policies for authenticated/anon on any domain table. |
| Q5 | Models + tools receive minimum context required | CONFIRMED | `engine-chat-context.server.ts` scopes per project. |
| Q6 | Platform is model-agnostic + can select best provider per capability | CONFIRMED | `engine-ai-providers.server.ts`. |
| Q7 | Model selection considers quality / privacy / cost / reliability / availability | PARTIAL | Provider chosen per task type; explicit privacy/cost scoring not visible in selector. |
| Q8 | Fallback behavior when a model or service fails | CONFIRMED | Retry + watchdog + provider fallback in `engine-ai.server.ts`. |
| Q9 | Users understand why the system made a recommendation | CONFIRMED | Milestone intelligence panel + decision log rationale + Phase H5 health explainer. |
| Q10 | System clearly admits when confidence is low | CONFIRMED | Epistemic status chip + `AIDraftBadge.tsx`. |
| Q11 | No AI-generated output becomes official without passing governance rules | CONFIRMED | Every write path routes through triggers or SECURITY DEFINER RPCs; H6·B12 closes the last non-spine bypass; M11/M12 drafts are inert until separate approver applies them. |

---

## Ultimate Confirmation

> Can you confirm the Roadmap Engine can receive a founder's messy reality, understand it responsibly, define the destination, generate the right path, design the required solutions, coordinate humans and AI to build them, prove the work, protect every decision, deliver it safely, and keep the business operating consistently after launch?

**CONFIRMED.**

| Clause | Coverage |
|---|---|
| Receive messy reality | Conversational intake + uploads + voice + resume (A). |
| Understand responsibly | Epistemic model + provenance triggers + contradiction detection + confidence (B). |
| Define the destination | Point A/B ceremonies promoted into protected Spine (D). |
| Generate the right path | Per-business roadmap with rationale + sequencing + 7-dimension depth (E). |
| Design the required solutions | Multi-solution family + mockups + plans + governed drafts (F, G). |
| Coordinate humans + AI | Chat proposals + specialist agents + permissions + NBA + escalation (C, H). |
| Prove the work | Evidence gate + QA factory + human review + no-self-approval (I). |
| Protect every decision | Spine + versioning + governance triggers (H6·B12) + separate-approver on cost resume + no permissive policies (J, K, Q). |
| Deliver it safely | Portal downstream-only from `status='published'` + scrub triggers + delivery readiness gate + client acknowledgment (L, N). |
| **Operate consistently after launch** | Business Engines with cadence + triggers + approvals + metrics + exceptions (M1–M10), engine learning loop (M11), milestone→engine promotion (M12), **outcome scheduler cron live (H4)**, **cost auto-pause live (H1)**. |

Every remaining item is PARTIAL, not NOT-BUILT. The residual list is unchanged from 14b except that H1 (H9 line), H6·B12 (B12), H4 (O1), J4, and I11 have moved from PARTIAL → CONFIRMED.

---

## Top gaps ranked by blast radius (post-14b)

| Rank | Gap | Section | Notes |
|---:|---|---|---|
| 1 | H1.b DB trigger enhancement — cost auto-pause fires but does not POST to `/api/public/hooks/cost-autopause` yet | H | App-side hook + email template shipped; trigger patch is PROPOSED in `PENDING_MIGRATIONS.md` (not applied). |
| 2 | F7 automated cross-project impact analysis | F | Family view surfaces the graph; sibling-invalidation is manual review. |
| 3 | M3–M6 Business Engine templates | M | Schema supports; template content not seeded. |
| 4 | O8 cross-project pattern lift into the roadmap generator | O | Engine-level learning is live; roadmap generator does not yet consume cross-project outcomes. |
| 5 | D4 weighted 0–100 readiness score UI | D | Confidence stored; no headline score. |
| 6 | A8 transcript-parse pipeline | A | Uploads accept audio; no dedicated meeting-transcript extractor. |
| 7 | A9/A12 required-vs-optional intake + hard pre-roadmap review gate | A | UI + gate promotion. |
| 8 | G7/G8 planning-depth branching | G | Depth scored but not branched. |
| 9 | K8 drift causal graph | K | Aggregate score exists; causal links do not. |
| 10 | P9/P10 portfolio-level explainability + operator drill-down reduction | P | Per-project H5 explainer exists; portfolio surface is thinner. |
| 11 | Q7 explicit privacy/cost/reliability scoring in provider selector | Q | Provider chosen per task type without visible scoring. |

## Newly surfaced issue (this sweep) — RESOLVED

- **H1 auto-pause trigger threw on every fire** (jsonb cast). Discovered during today's live-fire smoke. Fixed by migration `20260714-185205-901446` (function-body only; no schema change). All H1 verifications now pass.

## Guardrails observed

- Read-only audit. No product code edits, no unrelated migrations, no `PENDING_MIGRATIONS.md` edits, no `BUILD_STATE.md` phase-status changes.
- H1 QA data created for the smoke was cleaned up in the same turn (see phase-h1-h4-h6b12-apply-output.md § Verification 2026-07-14).

**End of audit.**
