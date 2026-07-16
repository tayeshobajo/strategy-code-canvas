# Project Spine — Server read model + route split

## Goal

Two changes, planned as one phase so they land together:

1. Move Spine variant selection and section-level derived counts into a single server-owned read model returned by `getProjectSpine`. The route becomes a dumb consumer.
2. Break `src/routes/engine.projects.$projectId.spine.tsx` (3653 lines, ~60 inline components/helpers) into small, focused components under `src/components/engine/spine/` plus pure helpers under `src/lib/`.

No schema migrations. No publish. Additive to `ProjectSpinePayload` — every current consumer keeps working.

## 1. Server-owned read model

Today `deriveSpineVariant`, `pendingApprovalsCount`, `approvedMilestoneCount`, `blockedItemsCount`, `nextMilestone`, `missingForClient`, and `sourceTotal` are all computed client-side inside `ProjectSpine()`. That leaks doctrine (§5 of `PROJECT_SPINE_CONTRACT.md`) into the route and makes it impossible to test without React.

### Extend the payload additively

In `src/lib/engine.functions.ts`, extend `ProjectSpinePayload` with a `view` block computed inside the existing `getProjectSpine` handler:

```ts
export type SpineVariant = "incomplete" | "active" | "client_ready";

export type SpineView = {
  variant: SpineVariant;
  counts: {
    pending_approvals: number;
    approved_milestones: number;
    total_milestones: number;
    blocked_items: number;
    source_total_safe: number;      // max(sources.total, 1)
  };
  next_milestone: { id: string; name: string; due_date: string } | null;
  missing_for_client_ready: string[]; // e.g. ["all milestones approved", "portal publish check"]
  sections: Array<
    | "header" | "variant_banner"
    | "hero" | "snapshot" | "truth" | "milestone_readiness"
    | "approvals_inline" | "foundation" | "captain_brief"
    | "footer_stats" | "working_focus" | "approval_history"
    | "modules_expandable" | "evidence_history" | "notifications"
    | "incomplete_focus" | "incomplete_contradictions"
    | "client_ready_publish" | "client_ready_approved_milestones"
  >;
};
```

`sections` is the ordered list the route renders for the current variant. That is the single hand-off from doctrine to UI; the route just iterates.

### Variant + counts derivation

Extract the current `deriveSpineVariant` into a pure module `src/lib/spine-variant.ts` that takes only primitive inputs (`pointAApproved: boolean`, `pointBApproved: boolean`, `milestones`, `portal_publish`) so it can run both server-side (inside the handler) and, if ever needed, in the browser without a round-trip. The handler calls it after it already has `point_a_status`/`point_b_status` from `engine_spine_field_truth` and applies `isApprovedTruth`.

Counts and `next_milestone` move into the handler using the same expressions the route uses today (lines 224–236). `sections` is a small switch on `variant`.

### Consumers

`getProjectSpine` is called from `chat`, `builder`, `plans`, `evidence`, and `spine`. All read only fields they already touch; adding `view` is safe. Nothing else needs to change.

## 2. Route split

Target: `src/routes/engine.projects.$projectId.spine.tsx` shrinks to ~200 lines and contains only:

- `Route = createFileRoute(...)`
- `ProjectSpine()` component: `useQuery` for spine + workspace + approval history, mutations, error/loading, and a `sections.map(renderSection)` dispatcher.
- Route-local `renderSection(kind, spine)` switch that mounts the right component.

Nothing else — no helper functions, no cards, no PDF export logic, no palette maps.

### Files to create

```text
src/components/engine/spine/
  SpinePageHeader.tsx
  SpineVariantBanner.tsx
  HeroNextBestActionCard.tsx
  ProjectSnapshotCard.tsx
  TruthCardV2.tsx
  MilestoneReadinessMatrix.tsx          (matrix + GateChip + combineQaState import)
  ApprovalsInlineCard.tsx
  ProjectFoundationCard.tsx
  CaptainBriefCard.tsx
  FooterStatsBar.tsx                    (+ FooterStat)
  WorkingFocusStrip.tsx
  MilestoneApprovalHistoryCard.tsx
  ApproveRejectMilestonesList.tsx
  ModulesReadinessSection.tsx           (ModuleGridControls + Grid + Tile + ContentsList + ContentCard + ModuleLink + deriveModuleState + summarizeModuleData)
  EvidenceHistorySection.tsx            (SectionHeading + SearchableBlock uses + task table + version history + readiness contract)
  NotificationsCard.tsx
  SpineIncompleteBody.tsx
  SpineClientReadyBody.tsx
  SpineActiveBody.tsx                   (the big active-variant JSX currently inline)
  SpineLoading.tsx
  ErrorBanner.tsx
  primitives.tsx                         (Stat, ProgressRow, GenericBadge, ProjectStatusBadge, SectionHeading, SearchableBlock, ListCard, MetaChip, MetaKV, SnapshotCell, CollapsedBlock, TruthCard, ColumnCard, FoundationSection)

src/lib/
  spine-variant.ts                       (pure deriveSpineVariant; imported server-side)
  spine-view-helpers.ts                  (asRecord, humanize, formatDateTime, toneForStatus, toneForApproval, toneForImpact, hasMeaningfulValue, extractNamedSections, buildBusinessContext, collectScope, collectTruthBullets, extractValueList, compactObjectSummary, stringifyValue, groupMilestones, matchesSearch, filterListItems, onlyUnique, healthFromScore, deriveHealth, combineQaState, badgeToneFor, validateClientRoadmapExport)
  spine-pdf.ts                           (exportSpinePdf — currently at line 2567; jsPDF is browser-only, keep client-only)
```

`validateClientRoadmapExport` is currently `export`ed from the route file (line 98). Moving it to `spine-view-helpers.ts` requires updating any external import (none found in current repo — grep confirmed) and keeping a re-export from the route is unnecessary.

### Split rules to respect

- Never `export` component functions from the route file (breaks TanStack automatic code splitting — see `tanstack-code-splitting`).
- Extracted card components receive typed props (subsets of `ProjectSpinePayload`) — no `getRouteApi` needed because the route already threads `spine` through.
- Keep `SpineReadinessPanel`, `SpineVersionHistory`, `SourceTruthInspector` imports as-is.
- `spine-pdf.ts` (jsPDF) stays a client-only module and is imported only from event handlers, never from a loader or `.server.ts`.

## Files touched (exact list)

Edited:
- `src/lib/engine.functions.ts` — extend `ProjectSpinePayload` with `view: SpineView`; compute inside `getProjectSpine.handler`. Export `SpineVariant`, `SpineView`.
- `src/routes/engine.projects.$projectId.spine.tsx` — shrink to shell + sections dispatcher; delete inline components/helpers now living in the new files.

Created (new files listed in the tree above): 20 component files + 3 lib files.

## Tests (focused, run via `bunx vitest run <path>`)

New:
- `src/lib/spine-variant.test.ts` — all 8 truth-table cases for `deriveSpineVariant` (both truths, one missing, milestones approved vs not, publish states published/ready_to_publish/acknowledged/other/null).
- `src/lib/spine-view-helpers.test.ts` — `humanize`, `toneForStatus`, `toneForApproval`, `combineQaState` (2×3 matrix), `groupMilestones`, `collectTruthBullets`, `matchesSearch`/`filterListItems`, `validateClientRoadmapExport` (ok + each missing branch), `healthFromScore` bands, `deriveHealth`.
- `src/lib/engine.functions.spine-view.test.ts` — unit around the read-model composition. Since `getProjectSpine.handler` needs Supabase, extract a pure `composeSpineView(spine)` helper inside `engine.functions.ts` (or co-locate in `spine-variant.ts`) and test that: given a fixture `ProjectSpinePayload`-minus-view, produces the right `variant`, `sections`, and `counts`. Covers active default, incomplete when either truth missing, client_ready when all milestones approved, client_ready when portal published.

Do not add integration tests for the route (kept manual — Playwright is out of scope for this phase).

Commands:
```bash
bunx vitest run src/lib/spine-variant.test.ts src/lib/spine-view-helpers.test.ts src/lib/engine.functions.spine-view.test.ts
bunx tsgo --noEmit
```

## Risks

1. **Payload shape drift.** Adding `view` is additive, but any consumer that spreads or serializes the payload with a strict schema would break. Grep confirms only the five route files consume it and none do schema-narrow serialization. Low.
2. **Server/client parity of variant.** Once the server computes `view.variant`, the route must stop recomputing it. If a stale query cache exists after deploy, the old client code path could still exist for one render. Mitigation: keep `deriveSpineVariant` exported from `spine-variant.ts` and use it as the single source both server and any fallback consumers call.
3. **Code-splitting regression.** Exporting a component function from a route file silently defeats splitting. Mitigation: the new route file exports only `Route`; every card is imported from `@/components/engine/spine/*`.
4. **jsPDF in SSR path.** `exportSpinePdf` and `exportClientRoadmapPdf` currently live in the route file / `@/lib/roadmap-pdf`. Keep them out of any loader/server import graph — imported only inside event handlers. Verified `roadmap-pdf` is already client-only.
5. **Auth / RLS.** `getProjectSpine` already runs under `requireSupabaseAuth`; adding `view` doesn't need new grants.
6. **Test coverage of derived counts.** If we don't extract a pure `composeSpineView`, the read model is only testable via a full Supabase round-trip. Plan mandates the pure helper so tests stay focused.

## Rollback

- Revert per-message from the History tab; both changes ship as one phase, so a single revert restores the 3653-line route and drops the `view` field.

  <presentation-actions>
    <presentation-open-history>View History</presentation-open-history>
  </presentation-actions>

- If only the split needs rolling back but the read model is kept: keep `src/lib/engine.functions.ts` and `src/lib/spine-variant.ts` changes, revert only the route + new component files. Route can read `spine.view.variant` and re-inline as before.
- If only the read model needs rolling back: delete `composeSpineView` call inside `getProjectSpine`, drop `view` from `ProjectSpinePayload`. Route's `deriveSpineVariant` call still works because `spine-variant.ts` remains.

## Assumptions

- No other repo consumes `validateClientRoadmapExport` — confirmed by grep.
- `SpineView.sections` is authored per variant in `composeSpineView`, not stored in the DB. Doctrine §5 already lists them.
- The route continues to hold TanStack Query, mutations, error/loading — none of that moves to the server.
