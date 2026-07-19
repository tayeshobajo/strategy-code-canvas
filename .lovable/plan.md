## Why Spine reads 36% on cakepro

Assembler math shows exactly 5/14 passing (5 ÷ 14 = 36%):

| ✅ Passing | ❌ Failing / Unknown |
|---|---|
| Point A approved (7 rows) | Constraints named — no `constraints-risks` / `gap-map` truth rows |
| Point B approved (7 rows) | Assets reviewed — no `assets-leverage` / `hidden-assets` rows |
| No material contradiction | Gaps classified — same |
| Assumptions accepted | Blueprint reflects solution — no `approved-scope` / `blueprint` rows |
| Success metrics measurable | Sequence valid — no `sequencing` / `milestone-readiness` rows |
| | Roadmap rationale approved — 0/5 phases have `rationale` |
| | Critical dates captured — 0/21 milestones have `due_date` |
| | Investment present — has `range_low_usd`/`range_high_usd` but evaluator expects `investment.phases[].range` |
| | Client acknowledged destination — portal not published + acknowledged |

Plus a hard bug on the Strategic Thesis room: `column engine_projects.intake_summary does not exist`. Two server fns (`engine-strategic-thesis-ai`, `engine-execution-boundary`) select a column that was declared in `types.ts` but never migrated. That blocks the RT‑4 and RT‑3 AI drafts entirely — so the ceremony chain the Spine depends on can't even start.

Net: Spine can't climb past 5/14 until (a) the missing column is added and (b) the AI PM actually seeds the six unseeded sections and patches the three shape gaps.

---

## Fix plan — "tap Start, engine runs"

### 1. Add the missing column (migration, sent for approval)
- `ALTER TABLE public.engine_projects ADD COLUMN IF NOT EXISTS intake_summary text;`
- Backfill from the newest `engine_extraction_runs.intake_summary` per project.
- Unblocks Strategic Thesis AI draft, Execution Boundary AI draft, and any downstream fn that reads `intake_summary`.

### 2. Extend `fillMissingSpineDetailsFromIntake` to close the six section gaps
For each of these sections, upsert `engine_spine_field_truth` rows with `status = 'assumed'`, `source_type = 'ai_inferred'`, and a `rationale` in `source_ref`:
- `constraints-risks` → derive named constraints from intake
- `assets-leverage` + `hidden-assets` → list current assets (Instagram audience, past clients, vendor list, etc.)
- `gap-map` → classify each diagnosis into a gap type
- `approved-scope` / `blueprint` → summarize the approved scope from roadmap payload
- `sequencing` / `milestone-readiness` → summarize sequence from milestones

All `assumed` rows include a reason string so `assumptions_accepted` stays green.

### 3. Patch the three shape gaps in the same fill pass
- **Phase rationale**: for the latest approved `engine_roadmap_versions`, write a one-sentence `rationale` into every phase in `payload.phases` (or `payload.roadmap.phases`), preserving order. If no approved version exists yet, approve v0.1 as we already do.
- **Milestone due dates**: spread the 21 in-scope milestones across a 24-month window (respect phase boundaries when present), only writing to rows where `due_date IS NULL`.
- **Investment shape**: normalize `investment` to include `phases: [{ label, range: { low, high } }]` derived from existing `range_low_usd` / `range_high_usd`, keeping the legacy fields intact so nothing else breaks.

### 4. Turn "Run AI PM now" into the single Start button
`runSynthesis({ mode: 'force' })` from the header button already exists — extend the orchestrator so one click runs the full compass end-to-end and returns only when done:

```text
intake refresh → World Entry AI draft → Execution Boundary AI draft
   → Strategic Thesis AI draft → Milestone qualification drafts
   → fillMissingSpineDetailsFromIntake (seeds §2 + patches §3)
   → readiness re-evaluate
```

Anything that requires a human ceremony signature stays in the Approvals room; the draft still lands, so its section counts as `settled` and readiness climbs. Non-human checks reach `approved_truth` automatically.

Auto-run on new intake already exists — the same orchestrator path is what fires there, so new projects get the same behavior for free.

### 5. Verify on cakepro, then report
- Run the extended `Run AI PM now` on `cf21df7b-…`.
- Re-query `evaluateProjectSpineReadiness` and confirm passed ≥ 13/14 (client acknowledgment stays out until the roadmap is published + acknowledged — that's real human work, not something the engine should fake).
- Confirm Strategic Thesis room loads without the `intake_summary` error.

---

## Technical notes (for reference)

- Files touched: `src/lib/engine-spine-ai-fill.functions.ts`, `src/lib/engine-spine-ai-fill.helpers.ts`, `src/lib/roadmap-synthesis/orchestrator.server.ts` (new `force` cascade order), `src/lib/engine-pm-status.ts` (return combined progress), `src/components/engine/RunAiPmButton.tsx` (show step-by-step toast).
- Untouched by design: `client_portal_roadmaps` acknowledgment, human ceremony signatures — these are real gates.
- Migration is the only DB change and follows the standard grants pattern; no RLS surface change.
- No client-portal publish, no `own-work approval`, no schema drops.