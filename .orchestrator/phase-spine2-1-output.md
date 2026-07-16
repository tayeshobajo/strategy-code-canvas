# phase-spine2-1-output.md

**Phase:** Spine 2.0 — Phase 1 (Freeze the Spine contract)
**Status:** ✅ Complete
**Date:** 2026-07-16
**Commit:** `feat(spine2-phase1): freeze Project Spine contract as doctrine`

## Deliverable

`doctrine/PROJECT_SPINE_CONTRACT.md` — v1.0, frozen.

## Contents

1. Three-representation model (Engine Rooms → Spine → Client Roadmap).
2. Eight canonical Spine sections (fixed order, no additions without amendment).
3. `SpineFieldRecord<T>` envelope shape — the shape the read model returns and
   the shape cards consume.
4. Eight-state field state machine (`draft → … → approved_truth → superseded`).
5. 14-check Spine Readiness gate, each check expressed as a boolean over the
   read model.
6. Client-safe field whitelist (what may cross into Client Roadmap Studio;
   what never does).
7. `MilestoneReadinessRow` schema + `GateState` union + per-type minimum-
   sufficient gate paths.
8. Doctrine rule — drafts vs approved.
9. Amendment procedure.

## Downstream references

- Phase 2 references §1 (nav is only the tabs that expose §1 sections).
- Phase 3 references §2, §4, §6 (read-model shape).
- Phase 4 references §1 (page layout) and §6 (matrix).
- Phase 5 references §6 (conditional tabs, gate ordering).
- Phase 6 references §5 (client-safe whitelist).

## Scope respected

- No code, no DB, no UI changes in this phase.
- Existing behavior unchanged.

## Next

Phase 2 — Simplify the project shell (remove `WorkspaceToolbar` stage-derived
primary nav, collapse `MORE_SECTIONS`, delete `WorkspaceStepper`, redirect
`/overview` → `/spine`).
