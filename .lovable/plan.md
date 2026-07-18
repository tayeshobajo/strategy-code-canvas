## RT-2 · World Entry Workspace

Ships the first real doctrine-gate resolution surface. Today `world_entry` is a stub gate that reads `engine_spine_field_truth` rows written by nobody. RT-2 gives Captain (and a human approver) an editor to draft, evidence, and approve the three fields the RT-1 gate already checks:

- `destination_summary` — one-paragraph "industry destination" the client is walking into
- `competitors` — ≥3 named competitors, each with a link + one-line why-they-matter
- `vocabulary` — ≥5 category-language tokens the roadmap must use (drives the qualification checker at `src/lib/roadmap-synthesis/qualification.ts`)

All writes go through the existing `engine_spine_field_truth` schema (no migrations). Value payloads live in the `source_ref` JSONB column, following the pattern the gates already read.

### Route & layout

New route `src/routes/engine.projects.$projectId.world-entry.tsx` (co-located with the other project rooms). Three-column engine cockpit:

```text
┌──────────────────────────── World Entry ────────────────────────────┐
│ Header: gate status pill (satisfied / unmet · missing pieces)       │
├──────────────┬──────────────────────────────┬────────────────────────┤
│ Left rail    │ Draft (candidate)            │ Evidence + history     │
│ (persisted)  │  · Destination summary       │  · Attach source URL   │
│              │  · Competitors (list editor) │  · Prior approvals     │
│              │  · Vocabulary (chips)        │  · Change log          │
└──────────────┴──────────────────────────────┴────────────────────────┘
```

Bottom bar: **Save draft** · **Ask Captain to draft from intake** · **Submit for approval** · **Approve World Entry** (admin-only, second-reviewer rule per Spine contract).

Deep-link target already registered in `RESOLUTION_LINKS` (`world_entry: "understanding-room"`) is repointed to `world-entry`.

### Server functions (`src/lib/engine-world-entry.functions.ts`, new)

All `requireSupabaseAuth` + admin role check.

- `getWorldEntry({ projectId })` — reads the three truth rows + latest attempts + evidence list. Returns `{ destination, competitors, vocabulary, gateStatus, history }`.
- `saveWorldEntryDraft({ projectId, patch })` — upserts truth rows with `status = 'drafted'`, `source_ref` = the value payload. Patch is partial (any subset of the three fields). Records `engine_activity` `world_entry.drafted`.
- `submitWorldEntryForReview({ projectId })` — flips status to `awaiting_review`, blocks if any field is empty / below threshold. Notifies via `engine_activity`.
- `approveWorldEntry({ projectId, notes })` — enforces second-reviewer rule (author ≠ approver, comparing `updated_by_email` on latest drafted rows against caller). Flips rows to `approved_truth`, stamps a new `world_entry_version` (integer bumped, stored on `strategic_thesis`-style version field). Emits `engine_activity` `world_entry.approved`.
- `rejectWorldEntry({ projectId, reason })` — flips back to `stale`, records reason.
- `draftWorldEntryFromIntake({ projectId })` — Captain drafts destination summary + competitors + vocabulary from intake / signals via Lovable AI (`google/gemini-3.5-flash`, JSON output), saves as a draft (never auto-approves).

### AI draft (Lovable AI gateway)

Uses the existing pattern (`src/lib/engine-ai.server.ts` — `callLovableAi` / `parseJsonOutput`). Prompt reads: project name, intake submission text, extracted signals, existing sources. Output schema:

```ts
{
  destination_summary: string,   // ≤ 600 chars
  competitors: Array<{ name: string, url?: string, why_matters: string }>, // 3-6
  vocabulary: string[]           // 5-12 lowercase tokens
}
```

Never approves — always writes with `status='drafted'` so the human approval gate stays intact.

### UI components (`src/components/engine/world-entry/`, new)

- `WorldEntryHeader.tsx` — gate status, version pill, second-reviewer banner
- `DestinationEditor.tsx` — textarea + char counter
- `CompetitorList.tsx` — add/remove/reorder, URL + why-matters
- `VocabularyChips.tsx` — chip input with paste-split, min-5 counter
- `EvidencePanel.tsx` — attached sources + change log (reuses `getSpineFieldHistory` for each field)
- `ApprovalGateCard.tsx` — shows missing pieces, disables approve until satisfied, enforces second-reviewer rule client-side

### Wiring

- `src/lib/roadmap-synthesis/gates.ts` — repoint `RESOLUTION_LINKS.world_entry` from `"understanding-room"` to `"world-entry"`; set `resolution_pending: false` for `world_entry` (RT-2 is live).
- `src/components/engine/LeftProjectRail.tsx` — add "World Entry" link between Understanding and Spine.
- `src/routes/engine.tsx` — label mapping.
- `SynthesisPlanDrawer` — no changes; the gate list already renders `resolution_deep_link`.

### Second-reviewer & audit

- Approve fn rejects when `caller.email === latest drafted row's updated_by_email` with a friendly error. Matches the Spine contract's approval rule.
- Every write emits an `engine_activity` row via the existing `insertEngineActivity` guard.
- `engine_spine_ceremonies` gets a `world_entry` ceremony row on approve (uses existing table — no schema change).

### Out of scope for RT-2

- Execution Boundary and Strategic Thesis workspaces (RT-3).
- Reviewer inbox / notifications beyond `engine_activity`.
- Migration for a first-class `world_entry_version` column — the version integer piggybacks on the ceremony row (`decisions` count), following the pattern already used for other gates.

### Verification

- Build (`bun run build:dev`).
- Playwright: open `/engine/projects/<id>/world-entry` as admin, draft → submit → attempt self-approve (blocked) → approve as second user → confirm `world_entry` gate flips to satisfied in the RT-1 SynthesisPlanDrawer.

### Files touched

**New**
- `src/routes/engine.projects.$projectId.world-entry.tsx`
- `src/lib/engine-world-entry.functions.ts`
- `src/lib/engine-world-entry-ai.functions.ts` (Captain draft, split so `.functions.ts` handler stays clean)
- `src/components/engine/world-entry/{WorldEntryHeader,DestinationEditor,CompetitorList,VocabularyChips,EvidencePanel,ApprovalGateCard}.tsx`

**Edited**
- `src/lib/roadmap-synthesis/gates.ts` (deep link + `resolution_pending`)
- `src/components/engine/LeftProjectRail.tsx` (nav entry)
- `src/routes/engine.tsx` (room label)
