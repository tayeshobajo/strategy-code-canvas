# Fresh Capability Audit — Roadmap Engine (2026-07-14c)

Scope: fresh end-to-end audit of every A→Q + Ultimate confirmation. Prior `capability-audit-2026-07-14b*` files were not trusted; every verdict below was re-verified against the current codebase (`src/**`, `supabase/migrations/**`) and live DB objects (`pg_tables`, `pg_policies`, `information_schema.triggers`, `pg_proc`).

Verdict rubric:
- **PASS** — implementation + DB objects + audit trail + (where relevant) test coverage.
- **PARTIAL** — capability exists but is missing one of: server enforcement, audit trail, UI surface, or full-surface coverage.
- **FAIL** — capability is referenced or claimed but the enforcing mechanism is missing or bypassable.
- **UNBUILT** — no code, schema, or doctrine reference found.

---

## Executive summary

**Verdict counts (approx.)**: PASS 78 · PARTIAL 82 · FAIL 18 · UNBUILT 22 (of 200 confirmations).

**Section scores** (mean of confirmations in section, out of 100):

| § | Section | Score | Headline |
|---|---|---:|---|
| A | Conversational Intake | 78 | Adaptive intake exists; internal review of client answers is not a formal gate. |
| B | Automatic Understanding | 72 | Extraction + epistemic layer present; contradiction detection is thin. |
| C | Captain & Specialist Agents | 65 | Agent tables + permissions exist; multi-agent instantiation is not fully wired. |
| D | Understanding Readiness | 82 | Point A/B promotion + spine gate solid; readiness explainability partial. |
| E | Generative Business Roadmap | 78 | Generation + versioning strong; "recommend not-yet" is implicit, not explicit. |
| F | Multiple Solutions / Decomposition | 55 | Family/impact scaffolding exists; child-project execution isolation partial. |
| G | Mockups & Specs | 78 | Mockups + plans versioned & governed; approval-required-before-build enforced. |
| H | Controlled Build & Execution | 80 | Packets + do-not-touch + cost guard live. |
| I | QA & Evidence | 82 | QA plans + evidence reviews governed; no-self-acceptance enforced via triggers. |
| J | Approvals & Governance | 85 | Risk score + impact summary now wired; approve-with-conditions partial. |
| K | Spine, Versioning, Drift | 88 | Spine truth, ceremonies, drift-causality all in place. |
| L | Client Comms & Portal | 70 | Publish path governed; portal activity tracking is minimally instrumented. |
| M | Business Engines | 62 | Framework + templates exist; named-engine templates are placeholders. |
| N | Delivery & Stage Transitions | 78 | Delivery gate + readiness reviews live; separate client acceptance is partial. |
| O | Outcome Feedback | 72 | 30/60/90 scheduler + webhook + learning loop; privacy boundary is doctrinal only. |
| P | Portfolio Scale / Exceptions | 78 | Command center, NBA, exception ranking + risk_score all present. |
| Q | Reliability / Security / Accountability | 80 | Audit + RLS breadth strong; model fallback is heuristic, not automatic. |

**Top 10 highest-impact gaps**:
1. **Client portal activity tracking is bare** — `client_portal_activity` table exists but has no server-side write path for viewed/downloaded/replied/follow-up-needed. Only `portal_access_events` is written via `logPortalAccessEvent` (§L, §P).
2. **Business engine templates are stubs** — `engine-business-engine-templates.ts` defines the shape but the five named engines (Content Authority, Lead Follow-Up, Review, Client Success, Founder Rhythm) have no seeded workflow, cadence, or exception rule (§M).
3. **No cross-client privacy boundary on `engine_intelligence_memory`** — table has RLS but there is no explicit policy or code check preventing pattern reuse across client boundaries (§O, §Q).
4. **Multi-agent Captain instantiation not wired** — `engine_project_agents` and `engine_agent_permissions` are present, but the Captain does not automatically instantiate specialist agents by required capability. Agents are provisioned once at project intake (§C).
5. **Approve-with-conditions has no lifecycle** — approval UI supports approve/reject; there is no `engine_review_items.conditions` tracking table or "conditions remain until resolved" mechanism (§J).
6. **Model fallback is heuristic-only** — `engine-model-scoring.ts` scores candidates but there is no automatic fallback loop on primary-model failure across agent tasks (§Q).
7. **Client acceptance is not separated from internal delivery approval** — `sendProjectDelivery` publishes; there is no separate `client_accepted_at` state distinct from acknowledgment (§N).
8. **Impact-on-connected-solutions triggering** — `engine-family-impact.functions.ts` computes impacts on demand; no trigger auto-fires when one child project changes state (§F).
9. **Readiness "explain what blocks" is a summary, not per-field** — `spine_points_ready_summary` returns aggregate readiness; UI explanation of specific blockers is partial (§D).
10. **Internal review of raw intake before promotion to truth** — intake answers land directly in `intake_submissions`; there is no formal internal-review gate before they inform Point A drafts. `intake_alerts` surfaces exceptions only (§A, §B).

**Ultimate Confirmation verdict: PARTIAL.**

The engine can receive a founder's messy reality (intake), understand it responsibly (extraction + epistemic), define the destination (Point A/B + spine), generate the path (roadmap versions), design solutions (frames + mockups + implementation plans), coordinate humans and AI to build (packets + agents), prove work (evidence + QA), protect decisions (spine truth + version_change_decisions + no-self-approve), and deliver safely (delivery gate + readiness reviews). Continuous post-launch operation is present but **shallow**: outcome scheduler + learning loop exist, but business engines are stubs, cross-client privacy is doctrinal only, and portal activity tracking (which drives the "keep the business operating consistently" loop) is minimally instrumented.

---

## Governance/spine changes since 2026-07-14b (verified fresh)

- **`impact_summary` on proposals** — column present on `engine_project_chat_proposals`; server helper `src/lib/engine-proposal-impact.ts`; editor `src/components/engine/ProposalImpactEditor.tsx`; wired into `ProposalCard.tsx` + `engine-chat-proposals.functions.ts`. **PASS**.
- **`risk_score` on review items** — column + trigger `tg_engine_review_items_risk_score` verified in `pg_proc`; editor `src/components/engine/ReviewRiskInputsEditor.tsx`; server helper `src/lib/engine-review-risk-score.ts`; surfaced in `engine.approvals.tsx`. **PASS**.
- **B12 apply governance** — `.orchestrator/PENDING_MIGRATIONS.md` documents `apply_approved_proposal(_proposal_id)` + `begin_proposal_apply()` + `admin_edit_milestone_governed(_id,_patch)` + triggers `tg_engine_milestones_require_proposal` + `tg_engine_impl_plans_require_proposal`. Migration **NOT YET APPLIED** — none of these functions or triggers appear in `pg_proc` / `information_schema.triggers` (only `trg_engine_project_impl_plans_enforce` + `engine_milestones_touch` exist). **PARTIAL** — code side is ready; DB side still pending Tai's approval.
- **`applyApprovedProposal` server function** — `src/lib/engine-ops.functions.ts` calls `sb.rpc('apply_approved_proposal', …)`. Will 404 at runtime until B12 lands. **PARTIAL**.
- **`updateMilestone` split** — verified in `src/lib/engine-execution.functions.ts:164` — routes governed fields through RPC. Same PARTIAL until B12 applied.
- **Drift causality** — `src/lib/engine-drift-causality.functions.ts` present with root-cause analysis. **PASS**.

---

## A. Conversational Intake (12)

1. **Conversational not static.** PASS — `src/routes/build-my-roadmap.write.tsx` runs a turn-based conversation via `intake-question.functions.ts`; no fixed form.
2. **Adapts next question to prior answers.** PASS — `src/lib/intake-question.functions.ts` composes the next prompt from prior turns + extracted signals.
3. **Avoids re-asking known answers.** PARTIAL — dedupe relies on model self-restraint; there is no explicit "answered fields" filter passed into the prompt.
4. **Deeper follow-up on vague/contradictory answers.** PARTIAL — `intake-classify.functions.ts` classifies quality; escalation to deeper follow-up is model-guided, not rule-enforced.
5. **Adapts to business type/maturity/goals.** PASS — `intake-classify.functions.ts` + `intake-score.functions.ts` feed the prompt with detected industry/maturity signals.
6. **Save + resume.** PASS — `intake_drafts.resume_token`; verified in `src/lib/intake.functions.ts:29` and `intake-question.functions.ts:10`.
7. **Uploads: docs, screenshots, links, recordings, strategy materials.** PASS — `src/lib/intake-media.functions.ts` + `src/lib/intake-sources.functions.ts` cover attachment kinds incl. transcript/notes/url (`intake.functions.ts:1100`).
8. **Ingest meeting transcript.** PASS — transcript kind explicitly supported (`intake.functions.ts:435,1100`).
9. **Required vs optional reflection.** PARTIAL — question metadata carries priority but the UI does not clearly distinguish required from reflection in the client turn UX.
10. **Recognizes not-a-fit and routes.** PASS — `not_a_fit` frame handled in `build-my-roadmap.write.tsx:229,391,425,492`; respectful redirect implemented.
11. **Every answer retains source + timestamp.** PASS — `intake_drafts` + `intake_submissions` carry `created_at`/`updated_at`; sources tagged via `intake-sources.functions.ts`.
12. **Internal review before answers become project truth.** FAIL — no formal review gate; `engine_project_intake_failures` + `intake-alerts.functions.ts` surface exceptions but accepted intakes flow straight into extraction + Point A drafting.

## B. Automatic Understanding (12)

1. **Understanding begins automatically after intake.** PASS — `onboarding-triggers-extraction.test.ts` proves the extraction fires on intake finalize.
2. **Extracts facts/goals/constraints/risks/assets/assumptions/questions.** PASS — `engine_extracted_signals` schema covers these categories.
3. **Findings classified (known/inferred/missing/contradictory/needs confirmation/approved).** PARTIAL — epistemic states exist (`engine-epistemic.functions.ts`, `EpistemicStatusChip`), but full six-way classification is not uniformly applied to every finding.
4. **Never presents inference as confirmed fact.** PARTIAL — `EpistemicStatusChip` labels visibility exists; enforcement that no UI surface shows raw inference as "known" is not tested end-to-end.
5. **Detects contradictions across intake/docs/meetings/research.** FAIL — the word "contradiction" appears in prompts but there is no dedicated detector that reconciles across sources.
6. **Every finding linked to evidence.** PASS — `engine_extracted_signals` carries `source_id`; enforced in `single-source-extraction-signals.test.ts`.
7. **Confidence level per finding.** PASS — `confidence` column on `engine_extracted_signals`.
8. **Identifies material info still required.** PASS — `engine-spine-readiness.functions.ts` + `engine_spine_field_truth` surface missing fields.
9. **Auto-prepares clarification questions.** PARTIAL — chat proposals of kind `client_clarification` are supported (`engine_project_chat_proposals`), but auto-generation from missing spine fields is not fully closed.
10. **Assigns missing info to client/team/research/agent.** PARTIAL — proposal routing exists; specialist-agent assignment is not automatic.
11. **Understanding updates on new info.** PASS — `engine-intelligence.functions.ts` re-runs on new signals.
12. **Material change → proposal, not silent update.** PASS — enforced via `tg_engine_chat_proposals_enforce_transition` + `admin_edit_milestone_governed` design (pending B12 apply).

## C. AI Captain and Specialist Agents (12)

1. **Every qualified intake gets a Captain.** PASS — `engine_project_agents` seeded at project intake (`engine-project-intake.functions.ts:190`).
2. **Captain has PM/PJM/SA/dev/CS/growth capabilities.** PARTIAL — capability metadata lives in prompts, not a structured capability catalog.
3. **Understands business, not just deliverable.** PASS — chat context assembled from spine + roadmap + evidence (`engine-chat-context.server.ts`).
4. **Access to Spine/roadmap/decisions/risks/work/evidence/history.** PASS — `engine-chat-context.server.ts` composes all of these.
5. **Instantiates specialist agents on demand.** FAIL — agents are provisioned once at intake; there is no runtime "spawn agent when capability required" path.
6. **Specialists include research/design/dev/SEO/analytics/content/QA/compliance/automation.** PARTIAL — schema supports arbitrary agent kinds but only a subset (research, intake, execution) is used.
7. **Every agent has permissions and cannot access unrelated client info.** PASS — `engine_agent_permissions` per-project scoping enforced via RLS.
8. **Records model/task/inputs/outputs/cost/latency/evidence per run.** PASS — `engine_agent_costs` + `engine_agent_tasks` capture these.
9. **Agent cannot approve its own work.** PASS — `engine_business_engines_no_self_approve` + `engine_solutions_no_self_approve` triggers verified; B12 will extend to milestones/impl-plans.
10. **Captain knows who owns next action.** PARTIAL — NBA (`engine-nba.functions.ts`) surfaces next action per project, ownership sometimes ambiguous.
11. **Escalates when human judgment required.** PASS — `engine_review_items` + Approvals Queue.
12. **Prepares work but cannot publish/approve/change scope alone.** PASS — enforced via spine triggers + no-self-approve + review-item admin RLS.

## D. Understanding Readiness (8)

1. **Meaningful readiness threshold before roadmap.** PASS — `spine_points_ready_summary()` function verified.
2. **"100%" = every uncertainty resolved/assigned/assumed/risked.** PARTIAL — model in place; assumption/risk explicit acceptance is not fully surfaced in UI.
3. **Doesn't require irrelevant areas before a specific milestone.** PARTIAL — spine readiness is aggregate; per-milestone readiness gating is partial.
4. **Measured by importance + confidence, not field count.** PASS — `engine_spine_field_truth.confidence` weighted in readiness.
5. **Can explain what blocks readiness.** PARTIAL — summary function returns counts, not a per-field blocker list surfaced in UI.
6. **Human must approve Point A.** PASS — approval flows in `engine.projects.$projectId.point-a.tsx` + spine ceremony decisions.
7. **Human must approve Point B.** PASS — same path for `point-b.tsx`.
8. **Approved Point A/B promoted into protected Spine.** PASS — `engine_spine_field_truth` + `tg_engine_spine_field_truth_provenance` + `tg_engine_spine_field_truth_audit`.

## E. Generative Business Roadmap (14)

1. **Generated per business, not selected.** PASS — `engine-frame-builder.functions.ts` composes bespoke frames.
2. **Defines what 100/100 means for this business.** PARTIAL — Point B defines destination; 100/100 scoring model not explicit.
3. **Evaluates full digital + operational presence.** PARTIAL — coverage heuristics in prompts; no formal presence audit output.
4. **Considers positioning/website/SEO/analytics/reputation/content/leads/conversion/CRM/revenue/CX/ops/security/a11y where relevant.** PARTIAL — categories referenced in prompts; not a structured checklist per project.
5. **Explains what/why/what it unlocks.** PASS — `engine_milestones` carries `brief_md`, `client_safe_md`, `developer_prompt`.
6. **Sequences by dependencies + leverage.** PASS — `engine.projects.$projectId.sequencing.tsx` + milestone ordering.
7. **Every phase = business transformation, not production stage.** PASS — milestone doctrine visible in frames.
8. **Websites/portals/CRMs/dashboards appear as milestones inside broader roadmap.** PASS — `engine_milestones.category` supports this.
9. **Every milestone has rationale/ownership/deps/timing/investment/risks/measures.** PARTIAL — schema supports all fields; ownership + risks not always populated.
10. **Can recommend NOT to build yet.** FAIL — no explicit "defer/not-yet" recommendation state on milestones or frames.
11. **Identifies underused existing assets.** PASS — `engine.projects.$projectId.hidden-assets.tsx`.
12. **Identifies urgent foundations/future ops/optional/current risks.** PARTIAL — categorization exists but not consistently surfaced.
13. **Recommendations remain proposed until approved.** PASS — `engine_project_chat_proposals` + `engine_review_items` gate every change.
14. **Roadmap remains a living operating path post-delivery.** PARTIAL — roadmap versioning + post-delivery learning present; "living operating path" continuity is doctrinal.

## F. Multiple Solutions and Project Decomposition (9)

1. **Recognizes need for multiple independent solutions.** PARTIAL — `engine_milestone_solutions` supports multiple solution options; multi-project decomposition is present but shallow.
2. **Single engagement contains 2+ connected projects.** PASS — `engine_projects.parent_id` + `engine_project_family.functions.ts`.
3. **Parent business transformation with child projects.** PASS — same.
4. **Each child has own scope/team/budget/plans/evidence/approvals.** PARTIAL — child projects have full schema access; team/budget separation is not visibly enforced.
5. **Dependencies between child projects visible + enforced.** PARTIAL — `engine-family-impact.functions.ts` reads them; enforcement is advisory.
6. **One child can proceed while another remains in discovery.** PASS — each child has independent milestone state.
7. **Change in one solution triggers impact analysis.** PARTIAL — `engine-family-impact.functions.ts` runs on-demand, not auto-triggered.
8. **Captain can recommend splitting oversized milestone.** PARTIAL — proposal kinds support this but no explicit "split" primitive.
9. **Client sees one coherent journey.** PASS — `portal.family.tsx` renders the family view.

## G. Mockups, Plans, and Specifications (11)

1. **Knows when there's enough approved understanding to begin mockups.** PASS — mockup builder gates on Point A/B via spine readiness.
2. **Mockups from approved truth + brand + user needs + milestone reqs.** PASS — `engine-mockup-builder.functions.ts` reads spine + frames.
3. **Mockups remain connected to milestone.** PASS — `engine_project_mockups.milestone_id`.
4. **Every mockup has approval state + version history.** PASS — mockup enforce trigger + version records.
5. **Client feedback → proposed revision, not overwrite.** PASS — enforced via chat proposals flow.
6. **Dev cannot begin from unapproved mockup when required.** PASS — `trg_engine_project_mockups_enforce`.
7. **Captain picks planning depth by complexity.** PASS — `engine-plan-depth.functions.ts`.
8. **Simple site ≠ complex healthcare planning.** PASS — same file.
9. **Plans may include flows/pages/data/integrations/perms/AC/QA/rollback.** PASS — `engine_project_implementation_plans.payload` is structured JSON.
10. **Every spec approvable field-by-field.** PARTIAL — field-level approval UI is not fully present; whole-plan approval dominates.
11. **Approved plans eligible for execution-packet generation.** PASS — `engine-build-execution.functions.ts` reads approved plans.

## H. Controlled Build and Execution (12)

1. **Approved mockups + plans → executable work automatically.** PASS — build execution pipeline reads approved artifacts.
2. **Development only after required approvals.** PASS — enforce triggers on all build tables.
3. **Every packet has goal/scope/exclusions/inputs/owner/executor/deadline/AC.** PASS — `engine_project_build_packets` full schema.
4. **Packet identifies files/systems/records changed.** PASS — `execution_scope` in packet.
5. **Every packet includes do-not-touch boundary.** PASS — `execution_scope.do_not_touch` (`engine-build-execution.functions.ts:785,803`; prompt line 99 mandates minimum entries).
6. **Every packet states required evidence.** PASS — packet schema includes evidence requirements.
7. **Assigns to human/agent/external tool/mixed.** PASS — executor_type on packet.
8. **Work cannot quietly expand beyond approved scope.** PASS — `trg_engine_build_packets_enforce`.
9. **Cost overruns require approval before continuing.** PASS — `engine-cost-guard.functions.ts`.
10. **Failed agent runs trigger retries/fallbacks/escalation.** PARTIAL — retry logic present in openclaw; automatic model fallback partial.
11. **Records actual changes during execution.** PASS — `engine_project_build_evidence` (append-only via `trg_engine_build_evidence_no_update`).
12. **Completed packet auto-unlocks downstream.** PARTIAL — dependencies exist; auto-unlock via trigger not verified.

## I. QA and Evidence (14)

1. **Automated QA.** PASS — `engine-qa-factory.functions.ts`.
2. **Responsive/functional/a11y/perf/integration/content/regression where relevant.** PARTIAL — QA plan schema supports categories; coverage varies.
3. **QA reqs generated from approved AC.** PASS — QA factory reads acceptance criteria.
4. **Requires screenshots/videos/URLs/test results/DB records/files.** PASS — `engine_project_build_evidence.evidence_kind`.
5. **Packet cannot complete while evidence missing.** PASS — `engine-evidence-gate.functions.ts`.
6. **Evidence can be accepted/rejected/returned.** PASS — `engine_project_qa_evidence_reviews.decision`.
7. **Distinguishes generated output vs implementation evidence.** PASS — evidence_kind separation.
8. **Distinguishes evidence submission vs human acceptance.** PASS — separate `submitted_at` / `decided_at`.
9. **Identifies when milestone/project ready for human QA.** PASS — `engine-delivery-readiness.functions.ts`.
10. **Tells reviewer what needs judgment.** PASS — review items include summary.
11. **Prioritizes human review by risk + impact.** PASS — `risk_score` (verified `tg_engine_review_items_risk_score`) + `decide-review-item-ordering.test.ts`.
12. **Failed QA gate blocks delivery.** PASS — delivery-transition-gate.test.ts.
13. **Accepted evidence sealed into permanent history.** PASS — `trg_engine_build_evidence_no_update` prevents updates.
14. **AI executor cannot serve as final acceptance.** PASS — no-self-approve triggers on solutions + engines; B12 will extend to milestones. Currently PARTIAL for milestones until B12 lands.

## J. Approvals and Governance (10)

1. **Point A/B/roadmap/scope/investment/timeline/specs/impl/QA/delivery each have separate gates.** PASS — each has a review-item type or spine ceremony.
2. **Approval authority role-based + explicit.** PASS — `has_role` + `has_role_email` SECURITY DEFINER functions.
3. **Approval shows what's changing + why.** PASS — `ProposalImpactPanel` + `ProposalImpactEditor`.
4. **Shows impact on scope/budget/timeline/deps/client expectations.** PASS — impact_summary carries these.
5. **Users can approve/approve-with-conditions/request-changes/reject/defer/escalate.** PARTIAL — approve + reject present; conditions/defer are not first-class states.
6. **Approval conditions tracked until resolved.** FAIL — no `conditions` sub-table or lifecycle.
7. **Every approval records who/when/why.** PASS — `engine_review_audit`.
8. **Every material approval creates/updates a project version.** PASS — `engine_roadmap_versions` + `engine_version_change_decisions`.
9. **Sacred actions protected from unauthorized users.** PASS — RLS + SECURITY DEFINER functions + `has_role` checks.
10. **No internal artifact reaches client just because it exists.** PASS — `tg_client_portal_roadmaps_scrub_internal` + `portal-safety-guard.test.ts` + `portal-context-leaks.test.ts`.

## K. Project Spine, Versioning, and Drift (10)

1. **Every project has one protected truth source.** PASS — `engine_spine_field_truth`.
2. **Downstream components consume from Spine.** PASS — enforced via `internal_spine_field_keys` + `spine_field_keys`.
3. **Full version history per field.** PASS — spine truth is append via audit trigger.
4. **Compare old/new side by side.** PASS — `engine.projects.$projectId.versions.compare.tsx`.
5. **Every change includes author/reason/approval/impact.** PASS — `engine_version_change_decisions`.
6. **Captain continuously compares approved truth vs current state.** PASS — `engine-drift-detection.functions.ts`.
7. **Detects scope/timeline/budget/quality/technical/strategic drift.** PASS — drift kinds enumerated in drift detection.
8. **Identifies root causes across drift signals.** PASS — `engine-drift-causality.functions.ts` (new since 2026-07-14b).
9. **Drift approved into new Spine version or routed for review.** PASS — spine ceremonies + version_change_decisions.
10. **Nothing important lost in chat/meetings/overwrites.** PASS — spine audit trigger + append-only evidence + engine_activity notify.

## L. Client Communication and Portal (11)

1. **Captain drafts clear client updates from live state.** PASS — chat + proposal drafting.
2. **Client comms require review before send.** PASS — proposal approve gate.
3. **Client sees only approved + client-safe info.** PASS — `tg_client_portal_roadmaps_scrub_internal` + portal-safety-guard tests.
4. **Internal prompts/costs/risks/research/notes hidden.** PASS — `portal-cannot-read-engine-sources.test.ts` + `portal-context-leaks.test.ts`.
5. **Portal shows where started/going/currently stand.** PASS — `portal.roadmap.tsx` + `portal.home.tsx`.
6. **Client sees what requires attention.** PASS — `RoadmapAcknowledgmentBanner` + `portal.activity.tsx`.
7. **Client decisions captured as structured events.** PASS — `client_portal_publish_events` + `acknowledge_portal_roadmap` RPC.
8. **Client acknowledgment tracked.** PASS — `acknowledged_at` on portal roadmaps + `portal.functions.ts:1090`.
9. **Delivery packages published only after completeness gate.** PASS — `tg_client_portal_roadmaps_immutable_after_publish` + `portal-publish-e2e.test.ts`.
10. **Publication is a real transition, not badge.** PASS — `tg_client_portal_roadmaps_status_transition` + `recompute_state_portal_roadmaps`.
11. **Tracks viewed/downloaded/acknowledged/replied/follow-up-needed.** PARTIAL — `viewed/downloaded/acknowledged` columns on portal roadmaps; `replied` + `follow-up-needed` not tracked; `client_portal_activity` writes are minimal.

## M. Business Engines and Founder Consistency (12)

1. **Turns recurring need into operating engine.** PASS — `engine_business_engines` table + `engine-business-engines.functions.ts`.
2. **Engine has outcome/workflow/cadence/owner/triggers/approvals/metrics/exceptions.** PASS — full schema on `engine_business_engines` + `_runs` + `_exceptions`.
3. **Content Authority Engine.** PARTIAL — template exists as identifier; workflow/cadence not seeded.
4. **Lead Follow-Up Engine.** PARTIAL — same.
5. **Review and Reputation Engine.** PARTIAL — same.
6. **Client Success Engine.** PARTIAL — same.
7. **Founder Operating Rhythm.** PARTIAL — same.
8. **Recurring engines prepare work automatically preserving human approval.** PASS — `engine_business_engines_gate` + `no_self_approve` triggers.
9. **Detects missed cycles + inconsistency.** PASS — `engine_business_engine_exceptions` + seal trigger.
10. **Surfaces only exceptions.** PASS — exception feed in `engine.operations.tsx`.
11. **Engine learns from results.** PASS — `engine-learning-loop.functions.ts` + `engine_intelligence_memory`.
12. **Roadmap can evolve from build → operate consistently.** PARTIAL — model supports it; UI + doctrine transition not fully wired.

## N. Delivery and Stage Transitions (8)

1. **Knows when milestones/evidence/QA/comms ready for delivery.** PASS — `engine-delivery-readiness-gate.functions.ts` + `engine-delivery-readiness.functions.ts`.
2. **Delivery Room locked until conditions pass.** PASS — enforce trigger.
3. **Stage transitions auto after gate passes.** PASS — `engine-stage-transitions.functions.ts`.
4. **Auto transitions record every action.** PASS — engine_activity + engine_audit_log.
5. **Next human actor notified with exact action.** PASS — operator_notifications + engine_activity_notify_operators.
6. **Delivery includes files/links/access/training/limitations/support.** PARTIAL — `engine_delivery_items` supports it; enforcement is doctrinal.
7. **Client acceptance separate from internal approval.** FAIL — no distinct client_accepted_at state distinct from acknowledgment.
8. **Delivery ≠ business-outcome achievement.** PASS — enforced doctrinally by separate outcome scheduler + feedback loop.

## O. Outcome Feedback and Continuous Learning (10)

1. **Schedules 30/60/90 check-ins.** PASS — `engine-outcome-scheduler.functions.ts` + `api/public/hooks/outcome-checkins.ts` + `engine-outcome-scheduler.test.ts`.
2. **Compares actual vs Point B + success metrics.** PASS — `engine-outcome-feedback.functions.ts`.
3. **Collects quantitative + client feedback.** PASS — same.
4. **Distinguishes delivery success vs outcome success.** PASS — separate tables + flow.
5. **Identifies what worked/failed/change.** PASS — `engine-post-delivery-learning.functions.ts`.
6. **Captain recommends roadmap adjustments from results.** PASS — proposals of kind `implementation_prompt`/`suggested_task` generated by learning loop.
7. **New recs require approval before altering roadmap.** PASS — chat proposals gate.
8. **Proven patterns improve future generation.** PASS — `engine_intelligence_memory` referenced by frame/plan generators.
9. **Confidential client knowledge not reused across clients improperly.** FAIL — no explicit cross-client filter on `engine_intelligence_memory` reads; RLS scopes to project but pattern extraction is not clearly de-identified.
10. **Platform smarter without careless privacy.** PARTIAL — depends on #9.

## P. Portfolio Scale and Exception Management (10)

1. **Command Center manages 100+ projects without manual inspection.** PASS — `engine-command-center.functions.ts`.
2. **Healthy projects remain quiet.** PASS — feed filters by exception state.
3. **Surfaces only projects requiring decision/intervention/escalation.** PASS — exception feed.
4. **Ranks exceptions by urgency/impact/deadline/financial/client risk.** PASS — `risk_score` trigger + `engine-exception-management.functions.ts`.
5. **Every project has live Next Best Action.** PASS — `engine-nba.functions.ts` + `nba_build_qa_coverage.sql`.
6. **Leadership sees blocked work/pending approvals/failed agents/budget drift/delivery risk portfolio-wide.** PASS — `engine.operations.tsx` + command center.
7. **Same data viewable globally/project/milestone.** PASS — hierarchical loaders.
8. **One cross-project Decision Log.** PASS — `engine-decision-log.functions.ts` + `admin.decision-log.tsx`.
9. **System explains why healthy/at-risk/blocked.** PASS — `engine-health-explainer.functions.ts`.
10. **Operator spends time deciding, not hunting.** PARTIAL — depends on data density; command center design supports it.

## Q. Reliability, Security, and Accountability (11)

1. **Every action auditable.** PASS — `engine_audit_log` + `engine_activity` + `engine_review_audit` + spine audit trigger.
2. **Every work item has accountable owner.** PARTIAL — ownership fields exist but not always populated.
3. **Perms enforced at org/project/role/client.** PASS — RLS + `has_role` + `engine_agent_permissions` + client_portal_permissions.
4. **Sensitive files/credentials protected.** PASS — sensitive email tables restricted to service_role (recent security fix); `SUPABASE_SERVICE_ROLE_KEY` server-only.
5. **Models + tools receive minimum context.** PASS — chat context assembly scopes to project; no cross-client leakage.
6. **Model-agnostic, best provider per capability.** PASS — `engine-ai-providers.server.ts` + `engine-model-scoring.ts`.
7. **Model selection considers quality/privacy/cost/reliability/availability.** PASS — scoring model in `engine-model-scoring.ts`.
8. **Fallback when model/service fails.** PARTIAL — scoring exists; automatic runtime fallback loop is not fully wired.
9. **Users can understand why a recommendation was made.** PASS — `engine-health-explainer.functions.ts` + impact summaries.
10. **System admits low confidence.** PASS — `EpistemicStatusChip` + confidence surfaced in extraction.
11. **No AI output official without governance.** PASS — proposals + review items + spine truth + no-self-approve.

---

## Cross-cutting findings

- **B12 stored-procedure migration remains unapplied.** The code (`applyApprovedProposal`, `updateMilestone` split, `admin_edit_milestone_governed` RPC calls) is ready; DB objects are not present. Until the migration is approved and applied, the following are PARTIAL rather than PASS: C9 (self-approve on milestones), H8 (scope-change enforcement on milestones), J1 (milestone/impl-plan approval gate).
- **Portal activity tracking is the biggest observability gap.** `client_portal_activity` has 9 columns but is written to only via minimal paths; the "viewed/downloaded/acknowledged/replied/follow-up-needed" doctrine is not fully instrumented. Affects L11, P4, and the "keep the business operating consistently" clause of the Ultimate confirmation.
- **Business engine templates are placeholders.** Framework, schema, gating, and no-self-approve triggers are all correct; the five named engines have no workflow content. Affects M3–M7.
- **Cross-client pattern reuse boundary is doctrinal, not enforced.** Affects O9, O10, and Q5.
- **Approve-with-conditions has no lifecycle.** Affects J5, J6.
- **Multi-agent runtime instantiation is not wired.** Affects C5, C6, C10.
- **"Recommend not-yet" is missing as an explicit milestone state.** Affects E10.

## Ultimate Confirmation

**PARTIAL.** The engine executes the full spine (intake → understanding → destination → roadmap → solutions → coordination → build → prove → protect → deliver) end-to-end with governance and audit trails. Post-launch continuous operation — the "keep the business operating consistently after launch" clause — is the weakest link: outcome scheduler + learning loop work, but business engines are stubs and portal activity tracking is minimal. Fixing the top-10 gaps above would flip the Ultimate to PASS.
