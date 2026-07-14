
# Roadmap Engine Capability Audit — Sections A–Q

## Goal
Produce a single evidence-based audit report scoring every item in the A–Q checklist (≈250 items) plus the final "Ultimate Confirmation" as **PASS / PARTIAL / MISSING**, with concrete evidence (file path + line region, table + policy name, or read-only SQL result). No code, schema, or data changes.

## Deliverables (written under `.orchestrator/audit/`)
1. `capability-audit-2026-07-14.md` — full report, one row per checklist item:
   - `Status` (PASS / PARTIAL / MISSING)
   - `Evidence` (file:lines, table.policy, or SQL result reference)
   - `Gap` (one line, only when PARTIAL/MISSING)
2. `capability-audit-summary.md` — section-level scorecard (A–Q), top 10 gaps ranked by blast radius, and mapping of MISSING items to existing phases in `doctrine/ROADMAP_ENGINE_PHASE_MAP.md` where possible.
3. `capability-audit-smoke.sql` — the read-only SQL harness that was run (RLS checks, policy inventory, trigger inventory, cross-client isolation probes, evidence/approval constraints, portal-safety probes). Results captured in `capability-audit-smoke-output.md`.

## Method (per section)
- **Codebase evidence:** `rg` across `src/lib/**`, `src/routes/**`, `src/components/engine/**`, `src/components/portal/**`, `supabase/migrations/**`, `.orchestrator/**` for the concrete surface each item claims (server fn, table, policy, trigger, route guard, UI panel).
- **DB evidence (heavy):** read-only `psql` / `supabase--read_query` against `engine_*`, `client_portal_*`, `engine_audit_log`, `engine_agent_costs`, `engine_review_items`, `engine_spine_*`, `engine_change_events`, `engine_project_chat_proposals`, etc. — verify RLS on, policy scoping, trigger presence (cycle detection, frozen-parent, self-approval, roll-ups), and grants.
- **Cross-client isolation probes:** simulate anon + wrong-client contexts against portal-facing tables; confirm 0 rows leak.
- **Governance probes:** confirm `created_by ≠ approved_by` enforcement status; confirm no `USING(true)` policies on sensitive tables; confirm publish-gate tables (`client_portal_publish_events`, `client_portal_projects.status`) exist and are the only path to portal exposure.
- **AI/agent evidence:** `engine_agent_tasks`, `engine_agent_costs`, `engine_agent_permissions` — confirm every run logs model/inputs/outputs/cost/latency and that permissions scope per project/client.

## Scoring rules
- **PASS** — direct implementation exists AND is enforced (DB constraint, RLS policy, route guard, or governance table entry).
- **PARTIAL** — surface exists but enforcement is soft (UI-only, missing trigger, missing policy, or admin-bypass path).
- **MISSING** — no code/table/policy backing the claim.
- Items that are aspirational-by-design (e.g. "engine learns from results") are marked MISSING unless a concrete learning loop table + writer exist; no credit for prompt text alone.

## Non-goals / guardrails
- No migrations, inserts, updates, deletes, or deploys.
- No changes to `BUILD_STATE.md` phase status.
- Any newly-discovered required migration is only appended to `PENDING_MIGRATIONS.md` as a proposal, never applied.
- Self-approval prevention (Phase 9C) will be scored MISSING unless already present; no attempt to add it in this audit.

## Rough sequencing
1. Load phase map + BUILD_STATE + existing `.orchestrator/phase-*-output.md` to avoid re-deriving known state.
2. Enumerate tables, policies, triggers, functions via `information_schema` / `pg_catalog` into the smoke output file (single pass).
3. Grep code surfaces per section in parallel batches.
4. Fill the report section by section (A → Q → Ultimate).
5. Write summary + top-gaps + phase mapping.

## Estimated size
Report ~250 rows; expected runtime dominated by the SQL harness (single pass) and codebase greps. No user interaction required after approval.
