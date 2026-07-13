# Capability Audit — Roadmap Engine vs. Target State

## Deliverable

A single audit document at `.orchestrator/capability-audit-2026-07.md` that answers every question in sections A–Q (plus the Ultimate Confirmation) with:

- **Verdict**: `CONFIRMED` / `PARTIAL` / `GAP` / `NOT BUILT`
- **Evidence**: file paths, table/RPC names, route names, or migration IDs backing the verdict
- **Gap note** (when not CONFIRMED): one sentence on what's missing and which phase/queue item would close it

No code changes. Read-only investigation of the repo + DB schema. Existing phase output files (`.orchestrator/phase-*.md`), `BUILD_STATE.md`, `PENDING_MIGRATIONS.md`, `doctrine/ROADMAP_ENGINE_PHASE_MAP.md`, `AUDIT_REPORT*.md`, and the live Supabase schema are the primary sources.

## Method

1. **Inventory pass** — enumerate: server-fn modules under `src/lib/`, admin routes under `src/routes/admin.*` and `src/routes/engine.*`, portal routes under `src/routes/portal.*`, DB tables/RPCs, and completed phase outputs. Build a capability map.
2. **Section-by-section answering** — for each of A–Q, walk the questions in order, cite evidence from the inventory. Use `acp_subagent--explore` for any capability whose evidence isn't obvious from the inventory (e.g. "does intake accept meeting transcripts").
3. **Cross-check DB claims** — for governance/spine/portal/publication/evidence claims, verify against live schema via `supabase--read_query` (RLS policies, RPC existence, trigger presence). This is where past audits drifted from reality.
4. **Ultimate Confirmation** — synthesize the end-to-end verdict from the section rollups; do not answer it independently.

## Structure of the output file

```text
# Capability Audit — 2026-07
## Summary rollup (counts per verdict per section)
## A. Conversational Intake
   A1. ... — CONFIRMED — src/routes/intake.*, engine_project_chat_* — [note]
   A2. ...
...
## Q. Reliability, Security, and Accountability
## Ultimate Confirmation
## Appendix: capability inventory (tables, RPCs, routes, server fns)
```

## Scope boundaries

- No code edits, no migrations, no test runs. Pure audit.
- Verdicts reflect what's in the repo/DB *today*, not what's queued in `BUILD_STATE.md`. A completed phase that shipped only admin UI without the DB primitive gets `PARTIAL`, not `CONFIRMED`.
- Where a prior phase output claims completion but evidence can't be located, the audit says so — it does not defer to the phase doc.

## Estimated size

~200 line items + inventory appendix. Target under 40KB. If a section balloons, split into `capability-audit-2026-07-part{1,2}.md` and link from the index.

## Out of scope for this plan

- Building missing capabilities. Gap items feed the next build cycle, they don't get fixed in this pass.
- Re-running Phase 3 smoke or other test harnesses. If a question depends on unverified runtime behavior, the audit marks it `PARTIAL — unverified at runtime` rather than guessing.

Approve and I'll produce the audit file.
