# Project Spine Contract

> Doctrine mirror of `src/lib/spine-contract.ts`. Frozen in Phase 1 of the Spine 2.0 reset. Update both files together.

## Purpose

The Project Spine is the **concise, protected, approved operating truth** for a project. Engine Rooms produce and reason about drafts; the Spine holds what has been decided. Client Roadmaps render only from the Spine's client-safe subset.

## Section catalogue

| Key | Required | Client-safe | Deep link |
|---|---|---|---|
| `point_a` — Current Reality | ✓ | ✓ | `point-a` |
| `point_b` — Desired Future | ✓ | ✓ | `point-b` |
| `business_context` | ✓ | ✓ | `understanding-room` |
| `constraints_risks` | ✓ |   | `gap-map` |
| `assets_leverage` |   | ✓ | `hidden-assets` |
| `approved_scope` | ✓ | ✓ | `builder` |
| `success_measures` | ✓ | ✓ | `point-b` |
| `decisions_pending` |   |   | `versions/compare` |
| `roadmap` | ✓ | ✓ | `builder` |
| `milestone_readiness` | ✓ |   | `sequencing` |
| `investment` |   | ✓ | `investment` |
| `client_acknowledgment` | ✓ | ✓ | `preview` |

## Field state machine

`draft → inferred → needs_confirmation → (contradictory | accepted_assumption | verified | approved_truth) → superseded`

Only a human transition promotes a field to `approved_truth`. Raw AI output never auto-promotes past `inferred` or `needs_confirmation`.

Every Spine field carries: `status`, `source_refs[]`, `confidence`, `version`, `updated_by`, `updated_at`, and — when approved — `approved_by`, `approved_at`, `change_reason`.

## Readiness gate

14 checks (see `SPINE_READINESS_CHECKS`). The gate confirms **no important uncertainty is hiding**, not that every unknown is gone.

**This release: readiness is advisory only.** The panel is rendered on the Spine page; no action is blocked. Enforcement (hard-block for Client Roadmap export in particular) lands in a later phase.

## Promotion rule

```
Engine Room draft → Captain recommendation → Human review → Approved conclusion promoted into Spine → Downstream systems consume the approved value
```

The Spine never mirrors raw AI drafts automatically. Downstream views (Milestone Workspaces, Client Roadmap Studio) must read from Spine-approved values, not from Engine Room storage.
