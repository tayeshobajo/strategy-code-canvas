# Spine 2.0 · Sprint 1 · Wave 1 — Output

Date: 2026-07-16
Scope: Project Shell refinement · Spine variant selector + banners · Source & Truth Inspector

## Delivered

### 1. Project Shell (`src/routes/engine.tsx`)
- Global sidebar now renders the **six primary items** from the design brief: Command Center, Projects, Approvals, Operations, Strategic Sales, Settings.
- Legacy engine surfaces (Templates, Review & Approvals, Delivery Room, Execution Tracker, Intelligence Memory) collapsed into a **More** group that expands on click.
- Two new stub routes created so the global nav never 404s while Strategic Sales and Settings are still being scoped:
  - `src/routes/engine.strategic-sales.tsx`
  - `src/routes/engine.settings.tsx`
- Breadcrumb project link now points to `/spine` (was `/overview`, which redirects but adds a hop).
- Layout wrapped in `<SourceInspectorProvider>` and mounts `<SourceTruthInspector />` once so any child screen can open the drawer through the hook.

### 2. Spine variant selector
- New `deriveSpineVariant(pointAApproved, pointBApproved, milestones, publish)` returns `'incomplete' | 'active' | 'client_ready'`.
- New `<SpineVariantBanner>` renders a distinct top-of-page strip per variant:
  - **Incomplete** → amber banner naming which of Point A / Point B is unapproved + unresolved-contradiction count + primary CTA **Resolve Understanding Gaps** → understanding-room.
  - **Active** → thin royal strip confirming the spine is active and stating what still needs to happen to reach client-ready.
  - **Client-Ready** → green banner listing the six client-safe completeness items + **Open Roadmap Studio** placeholder (real Studio lands in Sprint 3) + reminder that export lives in the header.
- Downstream cards (NBA, snapshot, foundation, milestone matrix, evidence rail) are unchanged so context never resets between variants.

### 3. Source & Truth Inspector
- `src/hooks/use-source-inspector.tsx` — global context (open / close / target). Falls back to a no-op if opened outside `/engine`.
- `src/components/engine/SourceTruthInspector.tsx` — right-side `Sheet` drawer that renders: status strip, source excerpts, Captain interpretation, accepted assumptions, contradictions, related roadmap items, provenance (updated / approved / version), recent activity, and a deep-link to the source room.
- `src/lib/engine-source-inspection.functions.ts` — `getSourceInspection({ projectId, sectionKey, fieldKey })` auth-gated server function. Reads only existing tables (`engine_projects`, `engine_sources`, `engine_activity`). **No migration.**
- `TruthCardV2` (Point A / Point B) now exposes an **Inspect sources** button that opens the drawer with the correct target. This is the first end-to-end proof of the two-click rule: Spine statement → drawer → source excerpt.

## Two-click rule check

Spine landing → Point A card → **Inspect sources** button → drawer with source excerpts.
✅ 2 clicks.

## What is intentionally deferred to Wave 2 / Wave 3

- **Spine Incomplete state** — currently signalled by the top banner only. Wave 2 will replace the standard Point A/B truth cards with the readiness cards + missing-keys list when `variant === 'incomplete'`.
- **Spine Client-Ready state** — currently signalled by the top banner only. Wave 2 will replace the Foundation strip with the Client Export Readiness panel.
- **Milestone Brief & Acceptance, Mockups, Build+QA** — Wave 3.

## Files touched

- Created: `src/hooks/use-source-inspector.tsx`
- Created: `src/components/engine/SourceTruthInspector.tsx`
- Created: `src/lib/engine-source-inspection.functions.ts`
- Created: `src/routes/engine.strategic-sales.tsx`
- Created: `src/routes/engine.settings.tsx`
- Edited: `src/routes/engine.tsx` — nav restructure, inspector provider mount, breadcrumb fix
- Edited: `src/routes/engine.projects.$projectId.spine.tsx` — variant selector + banner + TruthCard inspector wiring

## Verification

- `tsgo --noEmit` — clean, 0 errors.
- Auto-generated route tree picks up the two new stub routes on next dev-server boot.
- Inspector fetch is lazy; opens only when a statement is clicked, so no perf impact on Spine load.
