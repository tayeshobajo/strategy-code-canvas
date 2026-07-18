
# Project Spine — Narrative Cockpit Redesign

Recompose `/engine/projects/$projectId/spine` around the project story (Truth → Destination → Strategic Route → Readiness → Next Move) instead of the database. Match the reference mock: identity strip, narrative header, first-viewport NBA + Captain Intelligence, mirrored Point A/B, Strategic Thesis, horizontal Business Roadmap, sticky intelligence rail, and one collapsed "Evidence & History" section for everything operational.

## Layout

```text
┌──────────────────────────────────────────────────────────────────┐
│  Identity Strip  · client · type · roadmap vX · health · portal  │
├──────────────────────────────────────────────────────────────────┤
│  Narrative Header (Instrument Serif) + variant banner             │
├────────────────────────────────────────────┬─────────────────────┤
│  Next Best Action  ·  Captain Intelligence │  Amendments         │
│  (What changed / What matters / Recommend) │  Drift              │
│                                            │  Active Agents      │
│  Point A card              Point B card    │  Approvals queue    │
│                                            │                     │
│  Strategic Thesis (full width)             │                     │
│  Business Roadmap strip (A → phases → B)   │                     │
│  Milestone Readiness matrix                │                     │
│                                            │                     │
│  ▶ Evidence & History (collapsed)          │                     │
└────────────────────────────────────────────┴─────────────────────┘
```

## Scope

1. **Narrative shell** — replace the current top of `spine.tsx` with `IdentityStrip` + `NarrativeHeader`. Existing `SpineVariantBanner` and `SpineStatusStrip` stay but move under the header.
2. **First viewport** — pair `HeroNextBestActionCard` with a new `CaptainIntelligencePanel` (three stacked sections: What changed, What matters now, Recommendation) sourced from `spine.nba`, latest `spine.activity`, and materiality signals already on the payload.
3. **Mirrored Point cards** — replace `TruthCardV2` usages with `PointCard` (identical IA for A and B: Key Truths, Status chip, Confidence, Sources, Inspect/Open room).
4. **Strategic Thesis card** — new full-width card reading from `getStrategicThesis` (already server-owned). Shows current version summary + link to `/strategic-thesis` room. Empty state links to draft flow.
5. **Business Roadmap strip** — reuse `BusinessRoadmapPreview` unchanged, promoted to full width directly under the thesis.
6. **Intelligence rail** — keep sticky right column (already exists via `SpineRightRail`); reorder to Amendments → Drift → Active Agents → Approvals. No new data.
7. **Progressive disclosure** — collapse everything currently below the readiness matrix (Approvals inline, Foundation, Captain Brief, Footer stats, Working focus, Approval history, Modules & Readiness, Sources, Activity, Audit, Tasks, Versions, Readiness contract, Notifications) into a single `<details>` "Project Evidence & History" with tabbed subsections. Nothing is deleted — moved.
8. **Coherence guards** — `src/lib/spine-coherence.ts` derives `hasContent`, `isApprovedWithContent`, and canonical bullet selection so a card can never render "Approved" with an empty body.

## Files

**New**
- `src/lib/spine-coherence.ts` — derivation helpers + guards
- `src/components/engine/spine/IdentityStrip.tsx`
- `src/components/engine/spine/NarrativeHeader.tsx`
- `src/components/engine/spine/CaptainIntelligencePanel.tsx`
- `src/components/engine/spine/PointCard.tsx` (replaces `TruthCardV2` usage)
- `src/components/engine/spine/StrategicThesisCard.tsx`
- `src/components/engine/spine/EvidenceHistoryAccordion.tsx`

**Edited**
- `src/routes/engine.projects.$projectId.spine.tsx` — becomes a thin orchestrator (~400 lines). Existing helpers not yet extracted (`TruthCardV2`, `CaptainBriefCard`, `FooterStatsBar`, `ModuleReadinessGrid`, `SearchableBlock`, `SpineIncompleteBody`, `SpineClientReadyBody`, `validateClientRoadmapExport`, etc.) stay in place but are moved under the new accordion or into their own files as a follow-up. `validateClientRoadmapExport` and the `spine:export-roadmap` window listener are preserved (roadmap route imports the former).

**Untouched**
- `getProjectSpine` server function and payload shape — no data-layer changes.
- `SpineIncompleteBody` / `SpineClientReadyBody` — variant branches keep working; only the `variant === "active"` body is recomposed.
- All right-rail data sources (`LatestAmendmentsPanel`, `DriftSummaryPanel`, `AgentStatusBadge`).

## Technical notes

- Design tokens: reuse existing engine cloud-blue palette (`#3E68B2`, `#0A0F1F`, `#E8E1D6`, `#FBF9F4`); Instrument Serif for the narrative header only.
- No new server functions or migrations. No changes to Ask Captain modal, export flow, or roadmap route.
- Client-ready and Incomplete variants render the same identity strip and narrative header, then delegate to their existing body components (no regression risk on those branches).
- Coherence guard rule: a Point card shows the "Approved" chip only when `isApprovedTruth(status) && bullets.length > 0`; otherwise the chip falls back to `presentationFor(status)` with a "content pending" hint.

## Out of scope

- Refactoring `SpineIncompleteBody` / `SpineClientReadyBody` internals.
- Deleting deprecated helpers — this pass moves them behind the accordion; a follow-up plan can extract them into `src/components/engine/spine/legacy/`.
- Any changes to `/roadmap`, `/work`, or `/strategic-thesis` routes.
