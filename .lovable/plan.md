
# Momentum Triad QA Report

No code changes were made. Findings below.

## Executive Summary

The recompute engine, triggers, and per-step AI panels are wired correctly and firing across the three real projects (August 1, Jotaye, INBDE). **Two ordering bugs in `compute_engine_next_best_action` cause the Next Best Action to give wrong guidance** on projects that have both an approved/AI-drafted version *and* stale/missing extraction state (Jotaye, INBDE). AI task decomposition ships behind proper permission gates but has **never been executed against a real project**, so end-to-end evidence is unavailable. Per-step AI panels render live "knows/missing" from real project JSON but their `draftHint` still says "coming next slice" — no per-step generator exists.

## 1. State Recompute Results

Live state for the three seeded projects, plus what `compute_engine_next_best_action` returns:

| Project | Signals detected | Status (actual) | Step (actual) | Actual NBA | Expected NBA | Pass |
|---|---|---|---|---|---|---|
| August 1 — intake | 1 source, extraction=failed, 0 signals, no version | `blocked` / step 2 Signal Room | Retry the failed extraction run (critical) | same | ✅ |
| INBDE & ADAT Platform | 0 sources, 0 signals, version=ai_generated | `needs_review` / step 9 Roadmap Builder | Run the intelligence pipeline (info) | **Review AI-drafted roadmap** | ❌ |
| Jotaye Ventures | 9 sources all queued/processing, 0 signals, version=approved, no portal link | `approved` / step 13 Client Preview | Waiting on extraction (info) | **Link a client portal project / publish approved roadmap** | ❌ |

Status + step values match `recompute_engine_project_state` output. The status/step machine is correct. The bug is isolated to **NBA precedence**.

### Root cause — NBA precedence bugs

In `compute_engine_next_best_action` the order of checks is:

```
failed run → blocked tasks → client actions → pending reviews →
failed sources → pending sources → signals_count=0 → version status → …
```

Two consequences:

1. **INBDE case**: any project where extraction never ran but a version already exists (e.g. AI seeded a draft) — `signals_count=0` short-circuits before the version check, so NBA tells the operator to "run the intelligence pipeline" instead of "review AI-drafted roadmap".
2. **Jotaye case**: an approved roadmap with stale/pending source rows — `pending_sources` short-circuits before the "approved but unpublished" branch, so NBA tells the operator to wait on extraction instead of publish/link portal.

Both make the engine *less* momentum-oriented on the exact projects that should be moving fastest.

## 2. Trigger Results

All momentum triggers are installed in `public`:

- `recompute_state_sources` on `engine_sources`
- `recompute_state_extraction_runs` on `engine_extraction_runs`
- `recompute_state_signals` on `engine_extracted_signals` (INSERT/DELETE only — updates do not recompute)
- `recompute_state_versions` on `engine_roadmap_versions`
- `recompute_state_review_items` on `engine_review_items`
- `recompute_state_tasks` on `engine_tasks`
- `recompute_state_portal_roadmaps` on `client_portal_roadmaps` (UPDATE OF status only)
- `extraction_run_notify_failure`, `engine_activity_notify_operators`, `task_notify_blocked` all present

**Findings:**
- No infinite loops possible — `recompute_engine_project_state` only writes to `engine_projects`, which has no recompute trigger of its own.
- Gap: `recompute_state_signals` fires on INSERT/DELETE only. Bulk UPSERT paths that update existing signal rows will not retrigger — acceptable today (extraction always inserts) but worth flagging.
- Gap: `recompute_state_portal_roadmaps` fires only when `status` column changes, so publishing metadata edits that flip effective client-visibility without changing status won't retrigger. Minor.

## 3. Blocked Task Notification Results

- Trigger correctly moved to `engine_tasks.status` transitions.
- `tg_task_notify_blocked` guards against duplicate spam: `IF TG_OP='UPDATE' AND OLD.status='blocked' THEN RETURN NEW` — re-saving a blocked task does not re-notify. ✅
- Deep link is `/engine/projects/{id}/agent/tasks` with `task_id` in metadata. ✅
- Unblocking (status → any other) creates no notification. ✅
- Blocked task drives project `status='blocked'` via `recompute_state_tasks` and shows as top NBA ("Unblock N tasks"). ✅
- No blocked tasks currently exist in the DB to capture a live screenshot.

## 4. AI Task Decomposition Results

`generateTasksForApprovedMilestones` is present in `src/lib/engine-execution.functions.ts` with:

- `.middleware([requireSupabaseAuth])`
- `assertActionAllowed(sb, projectId, 'create_tasks', { approve: true })` — permission-gated
- Inserts to `engine_tasks` with `status='suggested'`, `ai_generated=true`, `source='ai_decomposition'`, linked `milestone_id` + `roadmap_version_id`, populated `purpose`, `expected_artifact`, `qa_checklist` (jsonb), `risks` (jsonb), `dependency_notes`.

**Findings:**
- ✅ Code path filters milestones by `approved_at IS NOT NULL` before decomposition.
- ✅ Costs are logged via existing `engine_agent_costs` helper; audit rows written to `engine_audit_log`.
- ❌ **No AI-decomposed rows exist in production** — `SELECT * FROM engine_tasks WHERE ai_generated=true` returns 0. The function has never been invoked against Jotaye (the only project with an approved version). No sample tasks can be shown until the operator runs it.
- ⚠️ Schema gap: task spec asked for `phase_id` linkage, but `engine_tasks` has no `phase_id` column. Phase is only reachable via `milestone_id → engine_milestones.phase`. Either add the column or drop the requirement from the acceptance criteria.

## 5. Permission Results

Server-side gate is authoritative:
- `create_tasks` default policy is `needs_approval` (line 587 of engine-execution.functions).
- `assertActionAllowed(..., { approve: true })` runs before any insert.
- `requireSupabaseAuth` middleware guarantees an authenticated caller.
- UI hiding is layered on top, not the sole defense. ✅
- Client role has no `create_tasks` permission, so a direct RPC from a client session fails the assertion. ✅

## 6. Per-Step AI Panel Results

All eight step routes (`point-a`, `point-b`, `hidden-assets`, `gap-map`, `blueprint`, `sequencing`, `deadlines`, `investment`) mount `<StepAiPanelFor />`.

- ✅ `computeStepKnowsMissing` reads the step's real JSON blob and derives knows/missing from actual keys (`lenses`, `diagnosis`, `narrative`, `assets`, `gaps`, `nodes`, `phases`, `dates`, `estimates`, etc.).
- ✅ "AI can draft", "requires approval", "next trigger" copy differs per step and matches the workflow.
- ❌ Every panel currently ships with `draftHint="Per-step AI drafting is coming next slice — for now, use Intelligence Layer to regenerate."` and no `onDraft` handler → the draft button never renders. The panel is informational only. This matches the current triad scope but should be called out because the QA criteria asked whether the draft button "implies functionality that does not exist" — right now it does not exist and is not shown, so the panel is honest but toothless.

## 7. Regression Results (P0 safety)

- ✅ `portal_roadmaps_v` columns confirmed: no `supporting_notes`, no doctrine/internal fields. Client-safe.
- ✅ `extraction_run_notify_failure` still present on `engine_extraction_runs`.
- ✅ `engine_activity_notify_operators` still present.
- ✅ NBA still computes live (it just gives wrong answers in the two ordering cases above).
- ✅ Portal RLS surfaces unchanged; nothing in this slice granted broader read access.

## 8. Screenshots

Not captured this pass — the browser tooling was not exercised because the audit was requested read-only against production data. If you want screenshots for the final report, ask and I'll drive Playwright through the overview/agent-tasks routes for August 1 (blocked/critical NBA) and INBDE (needs_review) after the NBA precedence fix lands.

## Remaining Gaps

**P0 (correctness of the guidance the engine gives)**
1. NBA precedence: check `version.status = 'approved'` and portal-publish gap **before** falling into source/signal-count branches.
2. NBA precedence: check `version.status IN ('ai_generated','draft','tai_edited')` **before** the `signals_count = 0` "run pipeline" branch.

**P1 (completeness of the momentum layer)**
3. Add `phase_id` to `engine_tasks` (or drop from decomposition contract) — currently unreachable directly.
4. `recompute_state_signals` fires on INSERT/DELETE only; add UPDATE for robustness to future upsert paths.
5. Per-step AI generators are not implemented — the panels are read-only. Wire real `onDraft` handlers or remove the placeholder button entirely.
6. Run `generateTasksForApprovedMilestones` against Jotaye to produce real evidence rows for the audit trail.

**P2 (polish)**
7. Consider expanding `recompute_state_portal_roadmaps` beyond `UPDATE OF status` so any publish-relevant flip retriggers.
8. Add a small NBA unit-test fixture matrix covering the eight state combinations enumerated in section 1 so precedence regressions are caught by CI.

## Recommended Next Slice

Ship a tight **"NBA correctness + decomposition evidence"** slice:

- Rewrite `compute_engine_next_best_action` precedence: version-status branches move above source/signal branches; add unit-test fixture matrix.
- Add `phase_id uuid` to `engine_tasks` referencing `engine_milestones(phase_id)` (or the phase enum), backfill from milestone.
- Run `generateTasksForApprovedMilestones` against Jotaye once to produce three real sample tasks for the audit record.
- Capture the four screenshots (August 1 overview, Jotaye overview after NBA fix, agent-tasks after decomposition, one step panel).

Estimated size: single session. After this, the momentum layer is provably correct end-to-end and we can move on to per-step AI generators (P1 item 5).
