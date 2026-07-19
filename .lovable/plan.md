# AI Product Manager: proactive, always-on Spine ownership

Right now the AI PM only runs when you click "AI: Fill Spine from intake" or "AI: Draft acceptance criteria". You have to prompt it. This plan makes it act like a real product manager — always aware of what's incomplete, always drafting the next artifact, and always surfacing what changed so you can review and adjust.

## What changes for you

1. **Auto-run on project load.** When a Spine is below 100%, the PM starts filling in the background — no button click. You see a small "AI PM drafting…" chip in the right rail with the current step.
2. **New-information watcher.** When intake, sources, or signals change, the PM detects the delta and re-drafts only the affected fields (using the existing materiality classifier). It posts a note in Captain Intelligence: "New intelligence detected — re-drafting Point B and 2 milestone briefs."
3. **Every field editable inline.** Point A/B summary, truths, confidence, sources; Strategic Thesis; World Entry; Execution Boundary; milestone briefs & acceptance criteria. Click a field → edit → save. Persists through the existing `proposeSpineFieldChange` audit trail.
4. **Cream "recently updated" highlight.** Any field the PM (or a human) touched in the last 24h gets a soft cream background + a small "Updated by AI PM · 3m ago" caption. Highlight fades after you open/acknowledge it.
5. **PM answers questions.** A "Ask the PM about this field" affordance next to each block opens the existing Ask Captain modal pre-scoped to that field's context.

## How it works technically

**Cream token** — add `--color-updated-cream` and `--color-updated-cream-border` to `@theme` in `src/styles.css` (uses the existing brand cream from the marketing site so it's on-token), plus a `.field-recently-updated` utility with a 24h-driven class.

**Auto-run orchestrator hook** — new `useAutoPmRun(projectId)` hook mounted on the Spine route. On mount and on query refetch:
- Reads the readiness score from `getProjectSpine`.
- If < 100% AND no run is in-flight AND no run completed in the last 5 min, fires the existing `runSynthesis` in `repair` mode.
- Uses the existing `subscribeEnrichment`-style module registry so multiple components share one in-flight run.

**New-information watcher** — extend the existing "New intelligence detected" logic in `SynthesisPlanDrawer` to auto-trigger (not just offer a button) when the materiality classifier flags a source change as `material`. Debounced 30s so bursts collapse.

**Field edit + persistence** — most fields already flow through `proposeSpineFieldChange`. Extend it to stamp `last_edited_at` and `last_edited_by` (`ai_pm` or user email) on `engine_spine_field_truth`. Milestone brief/criteria edits stamp `engine_milestones.updated_at` + a new `last_edited_by_email` column.

**Recently-updated derivation** — pure client function `wasRecentlyUpdated(iso, byWhom)` returns `{ highlight: bool, caption: string }`. No new server calls; uses existing timestamps + the new `last_edited_by` field.

**Ask PM about field** — thin wrapper around `AskCaptainModal` that pre-fills the prompt with `Explain the current draft for {field} and what evidence supports it.`

## Files touched (approx)

- `src/styles.css` — cream token + `.field-recently-updated` utility.
- `src/hooks/use-auto-pm-run.ts` — new; auto-runs synthesis when Spine < 100%.
- `src/lib/engine-pm-status.ts` — new; shared in-flight registry (mirrors `engine-milestone-enrichment-status.ts`).
- `src/components/engine/spine/RecentlyUpdated.tsx` — new; wraps a field, applies cream highlight, shows caption.
- `src/components/engine/spine/EditableField.tsx` — new; inline edit primitive used by PointCard, StrategicThesisCard, DoctrineCards.
- `src/components/engine/spine/PointCard.tsx`, `StrategicThesisCard.tsx`, `DoctrineCards.tsx`, `CaptainIntelligencePanel.tsx` — wrap fields in `RecentlyUpdated` + `EditableField`.
- `src/routes/engine.projects.$projectId.spine.tsx` — mount `useAutoPmRun`, show "AI PM drafting…" chip.
- `src/lib/engine-spine-truth.functions.ts` (or existing propose fn) — stamp `last_edited_at` / `last_edited_by`.
- One migration in `.orchestrator/PENDING_MIGRATIONS.md` (per CLAUDE.md rule) — add `last_edited_by` column to `engine_spine_field_truth` and `last_edited_by_email` to `engine_milestones`. Not applied autonomously.

## Boundaries

- No auto-approval of AI-drafted content. The PM drafts and marks `ai` provenance; you approve via the existing UI. (Preserves the "no self-approval" doctrine.)
- Auto-run is cost-guarded: max 1 run/5min per project, only when readiness < 100% or a material source arrived.
- Migration is written to `.orchestrator/PENDING_MIGRATIONS.md`, not applied.

## Open question (one)

**Auto-run trigger threshold** — should the PM auto-run on *every* Spine visit when < 100%, or only when readiness dropped or new intelligence arrived since your last visit? First is more proactive; second uses fewer credits. Default: second, with a manual "Run PM now" button always available.
