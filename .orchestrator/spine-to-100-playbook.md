# Spine → 100% Playbook

The repeatable process for taking any project from raw intake to a fully approved Project Spine using the AI Product Manager. Apply in order. Every step is idempotent and safe to re‑run.

---

## 0. Preconditions

- Project exists in `engine_projects` (created from intake or manually).
- Signed in as an **admin** operator (all AI PM writes require admin).
- Intake draft or submission is linked to the project (so the AI has raw material). Without intake text the AI PM will still draft, but confidence will be low and every field will be marked `assumed`.

---

## 1. Seed baseline truth from intake — **AI: Fill Spine from intake**

Route: `/engine/projects/{id}/spine` → header button **AI: Fill & approve Spine**.

Server fn: `fillMissingSpineDetailsFromIntake` (`src/lib/engine-spine-ai-fill.functions.ts`).

What it writes:
- `engine_spine_field_truth` rows for **point‑a** (`key_diagnosis`, `lenses`, `diagnosis:*`) and **point‑b** (`24_month_destination`, `10_year_position`, `client_outcome`, `customer_outcome`, `operational_outcome`, `revenue_outcome`, `brand_position`).
- Missing sections (blueprint, gap_map, hidden_assets, sequencing) are upserted as `assumed`.
- Phase rationales are patched on the current roadmap version.
- 4–6 milestones are seeded with spread due dates.

Expected outcome: readiness jumps from ~30% to 60–70%. Point A and Point B become **approved_truth**.

---

## 2. Run the synthesis orchestrator — **Run AI PM now**

Route: same header → chip **AI PM · Run now** (also auto‑runs on load below 100%, throttled by `PM_RERUN_COOLDOWN_MS`).

Server fn: `runRoadmapSynthesis` (`src/lib/roadmap-synthesis/plan.functions.ts`), mode = `repair`.

What it does:
- Walks the RT‑1 DAG in `src/lib/roadmap-synthesis/runners/`.
- For every failing readiness check, either extracts from existing sources/signals or drafts an `accepted_assumption`.
- Logs each run into `engine_pm_memory.decisions_log` and turns hard failures into `open_questions` (via `recordSynthesisIntoMemory`).

Repeat until the drawer shows no failed/blocked steps. `repair` mode never touches approved truth.

---

## 3. Resolve open questions in the PM Memory drawer

Route: `/engine/projects/{id}/spine` → **PM Memory** button.

- Filter to **Open questions**. Every unanswered question is a readiness blocker the AI could not draft around.
- Answer it inline — the answer is promoted to `known_facts` and unblocks the corresponding readiness check on the next PM run.
- Review **Assumptions** tab, hit **Approve** on the ones you agree with. Approval writes them to `known_facts` + `decisions_log` and lets `evaluateSpineReadiness` flip the check to `pass`.

---

## 4. World Entry ceremony (RT‑2)

Route: `/engine/projects/{id}/world-entry`.

- Click **Draft with AI** → reviewer approves each of the four artifacts (competitor review, destination, vocabulary, evidence).
- The Second‑Reviewer Rule blocks the same actor from approving their own draft.
- Approval writes `engine_spine_field_truth` rows on the `world-entry` spine and satisfies the doctrine card on the Spine cockpit.

---

## 5. Execution Boundary + Capability Registry (RT‑3)

Route: `/engine/projects/{id}/execution-boundary`.

- Pick capabilities from the versioned registry. If the registry is empty, seed it once from `/engine/ops/capability-registry`.
- Approve the boundary — writes `engine_project_execution_boundary`.

---

## 6. Strategic Thesis + milestone qualification (RT‑4)

Route: `/engine/projects/{id}/strategic-thesis`, then per‑milestone `.../milestones/{m}/qualify`.

- **AI: Draft thesis** → human approve → thesis becomes the gate for qualification ceremonies.
- For each active milestone, run the qualification ceremony: LLM World judge + Wow judge produce a rubric, human approves.

---

## 7. Approve Roadmap v0.1

Route: `/engine/projects/{id}/roadmap` → **Approve baseline**.

- Requires: Point A + Point B + thesis + at least one qualified milestone.
- Writes a new `engine_roadmap_versions` row; supersedes the previous.

---

## 8. Publish to client portal

Route: `/engine/projects/{id}/roadmap` → **Publish to client portal**.

- Portal is downstream‑only. Only approved artifacts cross the boundary.

---

## Readiness reference — how the % is computed

`src/lib/spine-readiness-evaluator.ts` runs the 14 canonical checks from `doctrine/PROJECT_SPINE_CONTRACT.md §4`. A check counts as `pass` only when the underlying field's status is one of `verified | accepted_assumption | approved_truth`. Draft/inferred rows do **not** count. The percentage = passed / total.

To debug why a project is stuck below 100%:

```sql
-- Which spines still have unapproved rows?
select spine, field_key, status
from engine_spine_field_truth
where project_id = '<id>'
order by spine, field_key;

-- Missing entire spines shows as no rows for that section.
```

---

## cakepro — current state (2026‑07‑19)

Project: `cf21df7b-5646-45dd-a3c3-dc62d0c7ead0`

| Section | State |
|---|---|
| point‑a truth rows | 6 · all `approved_truth` |
| point‑b truth rows | 7 · all `approved_truth` |
| world‑entry rows | **0 — blocking** |
| strategic‑thesis rows | **0 — blocking** |
| execution boundary | **0 — blocking** |
| capability registry | **0 — registry unseeded, blocks step 5** |
| milestones | 21 total · **0 approved / in_progress / done** — none qualified |
| roadmap versions | 1 draft · not approved |
| ceremonies logged | 0 |
| PM memory | 0 facts · 0 assumptions · 0 open questions · 2 decisions (synthesis runs) |

**Why 36%:** steps 1 and part of 2 are done. Steps 3–7 have never been run. The AI PM can only get you to ~70% on its own; the remaining readiness checks are gated by human ceremonies (World Entry approval, Execution Boundary approval, Strategic Thesis approval, milestone qualification, Roadmap v0.1 approval).

**Next actions for cakepro, in order:**

1. Open PM Memory → answer any open questions (currently none — trigger `Run AI PM now` first so it seeds questions for the missing sections).
2. Seed the capability registry once (`/engine/ops/capability-registry`) if empty.
3. Run the World Entry ceremony → approve all four artifacts.
4. Run the Execution Boundary ceremony → approve.
5. Draft + approve the Strategic Thesis.
6. Qualify at least one milestone.
7. Approve Roadmap v0.1.
8. Publish.

After step 7 readiness will read 100% and the Approve baseline banner will clear.

---

## Applying this to a new project

For every new project, run the checklist top to bottom. The AI PM handles steps 1–2 autonomously; steps 3–7 require a human reviewer per doctrine (Second‑Reviewer Rule). If a step is blocked, the drawer will list the exact check id so you can trace it back to `SPINE_READINESS_CHECKS`.
