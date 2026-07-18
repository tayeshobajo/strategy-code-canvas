# RT-5 — Responsive Intelligence + Impact Graph

Upgrades RT-1's rules-based materiality into an LLM classifier, adds a queryable source→truth→milestone→work impact graph, and formalises "controlled roadmap amendments" so no new intelligence can silently mutate approved truth.

Doctrine anchor: **World first → Constraint second → Milestones third → Evidence always → Human approval before promotion.** RT-5 is the "always" — approved artifacts never change without a candidate + second-reviewer decision.

## What RT-5 delivers

1. **LLM materiality classifier** — replaces keyword heuristics in `roadmap-synthesis/materiality.ts` with a Lovable AI call (google/gemini-3.5-flash) that returns `{impact, confidence, rationale, affected_spines[]}`. Falls back to the existing rules classifier on error.
2. **Impact graph read model** — a server function that walks `engine_sources → engine_extracted_signals → engine_spine_field_truth → engine_milestones → engine_tasks` for one project and returns a typed graph plus per-node `blast_radius` (which milestones + tasks would move if that truth row changed).
3. **Change event stream** — every classification, staleness mark, candidate write, and amendment decision writes to `engine_change_events` with `impact` + `affected_ids[]`, so the Synthesis Plan Drawer, activity feed, and Approvals Queue all read from one log.
4. **Controlled amendments** — when materiality touches approved truth, the orchestrator writes a `roadmap_amendment` candidate (never mutates the approved row). Reviewers approve/reject via the existing candidate flow; approval bumps the truth version and marks downstream steps stale.
5. **Amendments Inbox UI** — a room at `/engine/projects/$projectId/amendments` that lists pending amendments with before/after diff, blast radius, and the second-reviewer decision panel.

## Non-goals

- Not touching client portal (RT-6 concern).
- Not auto-promoting anything. Every amendment is human-decided.
- Not moving RT-2/RT-3/RT-4 write paths.

## Architecture

```text
                   engine_sources / engine_extracted_signals
                                    │
                     (RT-5) LLM materiality classifier
                                    │
                        engine_change_events (append)
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
       synthesis plan          impact graph     amendment
       staleness derivation    read model       candidate writer
                                                    │
                                                    ▼
                                    engine_project_roadmap_amendments
                                                    │
                                       Approvals Queue + Amendments Inbox
                                                    │
                                    approve → truth version++ → downstream stale
```

## Files

New:
- `src/lib/roadmap-synthesis/materiality-llm.ts` — pure classifier wrapping `callLovableAi` + `parseJsonOutput`; small Zod-free schema, prompt states the six impact classes.
- `src/lib/engine-impact-graph.functions.ts` — `getProjectImpactGraph({ projectId })` and `getTruthBlastRadius({ projectId, truthId })` server fns using `requireSupabaseAuth`.
- `src/lib/engine-roadmap-amendments.functions.ts` — `listRoadmapAmendments`, `proposeRoadmapAmendment`, `decideRoadmapAmendment` (second-reviewer rule via `hasRoleForEmail`, writes to `engine_change_events` + `engine_activity`).
- `src/routes/engine.projects.$projectId.amendments.tsx` — Amendments Inbox with diff view, blast-radius chip, decision panel.
- `src/components/engine/ImpactGraphPanel.tsx` — read-only node/edge summary used on the Spine page and inside Amendments.
- `.orchestrator/PENDING_MIGRATIONS.md` entry: `engine_project_roadmap_amendments` table + `engine_change_events.impact/affected_ids/actor_email` columns if missing. Do not apply — flag for Tai.

Edited:
- `src/lib/roadmap-synthesis/materiality.ts` — export `classifySourceChange` (rules) unchanged; add `classifySourceChangeSmart` that tries the LLM path and falls back.
- `src/lib/roadmap-synthesis/orchestrator.server.ts` — when `affectedSteps` includes a step whose current truth is `approved`, emit an amendment candidate instead of marking the approved row stale.
- `src/lib/roadmap-synthesis/plan.functions.ts` — surface pending amendment count so the Synthesis Plan Drawer can badge it.
- `src/components/engine/SynthesisPlanDrawer.tsx` — new "Pending amendments" section with deep link into the inbox.
- `src/components/engine/LeftProjectRail.tsx` — add "Amendments" nav entry with count badge.
- `src/lib/roadmap-synthesis/gates.ts` — no logic change; verify `drift_assessment` resolution deep link points at `/amendments`.

## DB (flagged, not applied)

Append to `.orchestrator/PENDING_MIGRATIONS.md`:

```text
-- engine_project_roadmap_amendments
-- id uuid pk, project_id uuid fk, truth_id uuid null, milestone_id uuid null,
-- proposed_change jsonb, impact text, rationale text,
-- status text default 'pending' check in (pending,approved,rejected,superseded),
-- created_by uuid, created_by_email text, created_at timestamptz default now(),
-- decided_by uuid, decided_by_email text, decided_at timestamptz,
-- decision_note text
-- RLS: authenticated read within their org; grants: authenticated + service_role.
-- Second-reviewer trigger: reject when decided_by = created_by.

-- engine_change_events additive:
--   impact text, affected_ids uuid[], actor_email text, kind text
```

Rule from `CLAUDE.md`: **do not apply this migration**. Write it, flag Tai, and code around the current schema by writing amendments into `engine_project_chat_proposals` with `type = 'roadmap_amendment'` until the table exists — the Amendments Inbox will read from the same source so the UI is stable across the cutover.

## Checks

- Tsgo on all touched files.
- Manual: on a project with an approved truth row, add a source whose text implies scope change → change event appears, amendment candidate is written, Approvals Queue + Amendments Inbox both list it, approving bumps `engine_spine_field_truth.version` and marks downstream synthesis steps stale.
- Second-reviewer: same account cannot create + approve.
- Fallback: force the LLM call to error (invalid model id in a test wrapper) → rules classifier still runs and the pipeline stays green.

## Out of scope for this batch

- Full graph visualisation (D3/force layout). Ship a text/table view first; visualise in a follow-up if Tai wants it.
- Auto-classification on legacy sources — RT-5 classifies on write and on explicit "Refresh intelligence"; backfill is a separate one-shot job.
