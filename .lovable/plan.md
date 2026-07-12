## Scope
Full evidence-backed audit of the target-state confirmation checklist (sections A–Q, ~200 items + Ultimate Confirmation). Read-only. No code changes, no migrations, no data mutations. Deliverable is a single written report.

## Deliverable
`/mnt/documents/roadmap-engine-capability-audit.md` — also mirrored to `.orchestrator/roadmap-engine-capability-audit.md` for the build history.

Report structure per section (A–Q):
- Overall section verdict: **Confirmed / Partial / Not Built**
- Per-item table:
  | # | Confirmation | Status | Evidence |
  |---|---|---|---|
  | A1 | Intake is conversational… | Confirmed | `src/routes/intake/…`, `src/lib/intake-*.functions.ts:LN`, table `intake_submissions` |
- Statuses:
  - **Confirmed** — code + DB + (where relevant) tests support it.
  - **Partial** — mechanism exists but has a real gap (e.g. missing UI wiring, ungated, no evidence trail).
  - **Not Built** — no supporting artifact found.
  - **N/A / Out of scope** — item does not map to current architecture; explained.
- Evidence style: `path/to/file.tsx:LN`, table name, migration ID, or query result. No hand-waving.
- Final section: **Ultimate Confirmation** — synthesized verdict with the top 5–10 gaps that block a true "yes".

## Method
Parallelized codebase + DB exploration via 6 `spawn_agent` explore tasks, one per cluster. Each returns a structured cluster report I merge into the final document.

Clusters:
1. **Intake & Understanding** (A + B) — `src/routes/intake/*`, `intake_submissions`, `intake_drafts`, `engine_extraction_runs`, `engine_extracted_signals`, `engine_intelligence_*`, upload flows, transcript handling, source/timestamp tracking, inference vs fact classification.
2. **Captain, Agents, Readiness, Spine** (C + D + K) — `engine_project_agents`, `engine_agent_tasks`, `engine_agent_costs`, `engine_agent_permissions`, self-approval CHECK constraints, Point A/B promotion, `engine_projects.point_a/point_b`, `engine_audit_log` spine history, drift detection.
3. **Roadmap, Decomposition, Mockups & Plans** (E + F + G) — `engine_milestones`, `engine_roadmap_versions`, `engine_project_frames`, `engine_project_mockups`, `engine_project_backend_plans`, `engine_project_qa_plans`, `engine_project_implementation_plans`, parent/child project support, milestone approval states.
4. **Execution, QA, Governance** (H + I + J) — `engine_tasks`, `engine_project_build_packets`, `engine_project_build_evidence`, `engine_project_qa_evidence_reviews`, `engine_review_items`, `roadmap_approvals`, gate enforcement, scope-drift protection, cost overrun controls, `engine_review_audit`.
5. **Portal, Engines, Delivery, Outcome** (L + M + N + O) — `client_portal_*` tables + RLS, portal activity tracking, publication gates, recurring "engines" (Content Authority / Lead Follow-Up / etc.) — this is likely a big gap area, `engine_delivery_items`, `engine_delivery_history`, `engine_project_delivery_readiness_reviews`, 30/60/90 outcome check-ins.
6. **Portfolio, Reliability, Security** (P + Q) — Command Center / NBA surfaces, `/admin/decision-log`, exception ranking, model-agnostic gateway, fallbacks, `engine_audit_log` universality, RLS coverage across all `engine_*` and `client_portal_*` tables, role model in `user_roles` + `has_role`.

Cross-cutting checks run once, results referenced from every cluster:
- `supabase--read_query` to enumerate CHECK constraints (self-approval guards), RLS policies on every `engine_*` / `client_portal_*` table, and confirm `engine_audit_log` action vocabulary.
- Grep for `needsApproval`, `stopWhen`, `Output.object`, cost/latency logging, model fallback patterns.
- Verify no items in the checklist are silently marked Confirmed based on the mere existence of a table — the item must have both DB and code paths that actually use it.

## Guardrails
- Read-only. No `supabase--migration`, no `supabase--insert`, no edits.
- `supabase--read_query` (SELECTs only) allowed for constraint/policy/schema evidence.
- No writes to a real project. If a live test is needed to confirm a UI behavior (e.g. "readiness explains what is blocking"), record it as "code path present, live behavior not exercised in this pass" rather than mutating data.
- Do not mark Confirmed based on file names or comments alone — require executable code or enforced DB constraint.

## Expected output
- One long markdown report at `/mnt/documents/roadmap-engine-capability-audit.md` (expect ~40–80KB).
- Chat reply: the section verdict summary (17 lines), the Ultimate Confirmation verdict, and the top 5–10 gaps. Full detail lives in the artifact.
- Artifact tag emitted so you can open/download.

## Non-goals
- No fixes proposed inline. Follow-up hotfix planning is a separate turn.
- No security scan re-run; RLS coverage is inspected from schema, not re-scanned.

Time expectation: this is a multi-step exploration. If you'd rather narrow the scope after seeing the plan (e.g. drop clusters 5–6, or run only sections you're least sure about), say so and I'll reissue.
