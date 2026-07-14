# Close all remaining PARTIALs — Hardening Sprints H6–H10

**Starting state:** 152 PASS / 35 PARTIAL / 0 MISSING. **Ultimate Confirmation already PASS.** No MISSINGs exist (closed by M11/M12).

Of the 35 PARTIALs, **5 are already implemented** in shipped hardening but not re-scored yet:
- H9 (cost-overrun auto-pause) — shipped in H1
- F7 (cross-project impact automation) — shipped in H2/H2b
- M3–M6 (four engine templates) — shipped in H3 (counts as 4 items)
- O (outcome scheduler coverage) — shipped in H4
- P9 (portfolio health explainability) — shipped in H5

That leaves **26 true PARTIALs** to close, plus a re-score pass to confirm the 8 above. Grouped into 5 ranked sprints by blast radius:

---

## Sprint H6 — Governance & AI safety edges (5 items)

Highest risk if left partial: silent writes and unaudited AI paths.

- **B12** — Extend `tg_engine_chat_proposals_enforce_transition` coverage matrix to non-spine surfaces (milestone body edits, plan body edits) so any material change becomes a proposal, never a silent overwrite. Migration → `PENDING_MIGRATIONS.md`.
- **J4** — Standardise a `ProposalImpactPanel` component and require every `engine_project_chat_proposals` row to emit `impact_summary` jsonb (scope / budget / timeline / deps / expectations). Backfill defaults in code, migrate the column via `PENDING_MIGRATIONS.md`.
- **Q7** — Add explicit privacy + cost + reliability scoring to `engine-ai-providers.server.ts` selector; expose the chosen scores on every `engine_agent_costs` row via existing `metadata` column (no schema change).
- **I11** — Add `risk_score int` on `engine_review_items` (computed from impact × urgency × deadline proximity) and sort the approvals queue by it. Migration → `PENDING_MIGRATIONS.md`.
- **K8** — Root-cause graph: new `src/lib/engine-drift-causality.functions.ts` that clusters `engine_review_items` + drift signals by shared entity (spine field, milestone, engine) and returns causal edges. Rendered on the existing drift-detection route.

## Sprint H7 — Intake & understanding (4 items)

- **A8** — Transcript-parse pipeline: new `src/lib/intake-transcript.functions.ts` that accepts pasted or uploaded transcript, runs an LLM extractor into `engine_extracted_signals` with `source_kind='transcript'`. New `admin.intake-transcript.tsx` page.
- **A9** — UI polish: render `is_reflection` (already in `intake_questions`) as an "Optional" pill in `QuestionAttachments.tsx` / question card. Zero backend change.
- **A12** — Promote `engine-intake-review` from optional to hard pre-roadmap gate: check for a positive `intake_reviewed_at` in the frame-builder guard and refuse generation with a clear error. Migration → `PENDING_MIGRATIONS.md` (adds column).
- **B10** — Wire `intake/gap-analyzer.ts` output into `engine_agent_tasks` for research / specialist assignments; extend `engine_review_items.assigned_to_kind` enum values (`client|team|research|agent`) via `PENDING_MIGRATIONS.md`.

## Sprint H8 — Captain, roadmap, decomposition (7 items)

- **C2** — Extend `engine-chat-prompt.server.ts` to explicitly cover Client Success + Growth Strategy capability sections; add capability tags to `engine_project_agents.capabilities`.
- **C6** — Seed distinct specialist role templates (SEO / analytics / compliance / automation) in `engine_agent_permissions` catalog. Code-only.
- **D4** — Weighted-readiness score component: `src/components/ReadinessScore.tsx` reading from existing `engine_spine_field_truth.confidence` × field weight. Mount on project overview + engine header.
- **E2** — "100/100" rubric artifact: extend Point B ceremony to require a `success_rubric jsonb` (weighted criteria). Migration → `PENDING_MIGRATIONS.md`.
- **F1** — Multi-solution classifier: heuristic + LLM check on intake completion; emits `engine_review_items` (`item_type='multi_solution_recommended'`) when scope signals suggest decomposition.
- **F8** — Captain-side milestone-split recommender: heuristic (effort > threshold OR mixed categories) in `engine-milestone-intelligence.functions.ts`; emits `suggested_task` chat proposal with `create_child_project` action.
- **G7 + G8** — Branch `engine-plan-depth.functions.ts` into simple / standard / complex pipelines; wire depth-score → pipeline choice in the builder orchestrator.

## Sprint H9 — QA, portal, outcome loop (7 items)

- **I2** — Add `regression_pack` field on `engine_project_qa_plans` and auto-populate on milestone-completion event (reuses shipped openclaw run infra).
- **L12** — Fire `recompute_engine_project_state` from portal message + file events (extend existing trigger). Migration → `PENDING_MIGRATIONS.md`.
- **O6** — Automated Captain recommendation from outcome deltas: new `src/lib/engine-outcome-recommender.functions.ts` reads `engine-outcome-feedback` output, emits `roadmap_adjustment` chat proposals under human approval.
- **O8** — Cross-project pattern → roadmap generator: read `engine_intelligence_memory` aggregates (already scoped) into the frame builder's prompt context (no schema change).
- **O10** — Anonymisation pass on any pattern lifted cross-project: new `src/lib/engine-pattern-anonymiser.server.ts` strips client-identifying fields before writing lifted patterns.
- **P10** — Push more admin actions inline (approve / assign / snooze) on the exception board so operators decide, not hunt. Frontend-only.
- **E14** — Auto-suggest engine promotion for delivered operational milestones on portal publish (calls existing M12 `proposeEnginePromotion`). No new code path — orchestration only.

## Sprint H10 — Rescore + regression tests + docs (3 items)

- **Rescore pass** — Refresh `.orchestrator/audit/capability-audit-*.md` after H6–H9 land; confirm the 5 hardening-covered items (H9-cost / F7 / M3–M6 / O / P9) roll to PASS.
- **Integration tests** — Extend the pattern of `engine-outcome-scheduler.test.ts` (in-memory Supabase mock) to cover every new server-fn added in H6–H9. One test file per sprint.
- **Docs + BUILD_STATE** — Update `.orchestrator/BUILD_STATE.md`, add per-sprint output manifests under `.orchestrator/phase-h{6..10}-*-output.md`, and refresh the ranked-follow-ups list.

---

## Guardrails (unchanged from H1–H5)

- **No schema migrations auto-applied.** Every DDL noted above lands in `.orchestrator/PENDING_MIGRATIONS.md` for Tai to run.
- **No AI approves its own work** — every new proposer routes through `engine_review_items` + separate-approver DB triggers.
- **Public hooks** verified via `apikey` header, never a bespoke shared secret.
- **Typecheck + vitest clean** before each sprint output manifest.

## Deliverables per sprint

- 1 phase output file (`.orchestrator/phase-h{n}-*-output.md`)
- BUILD_STATE.md entry
- PENDING_MIGRATIONS.md additions (where applicable)
- vitest coverage for every new server fn

## Sequencing

H6 → H7 → H8 → H9 → H10, one sprint per approval cycle, so you can course-correct between sprints. Each sprint is self-contained (~4–7 items).

## Out of scope

- Anything requiring schema migrations to run (they stay proposals).
- Portal-facing UX overhauls beyond the specific fields listed.
- Cross-tenant learning (blocked by O10 anonymiser — do not lift patterns before that ships).
