# Phase 1 — Governance Gate (Top-10 sweep foundation)

**Status:** application-tier COMPLETE. DB-tier queued to `.orchestrator/PENDING_MIGRATIONS.md` under "Top-10 Gap Sweep — Phase 1 · Governance Gate".

## What shipped

- `src/lib/engine-governance-gate.server.ts` — single chokepoint
  `assertOfficialTransition(sb, input)` used by every server fn that flips an
  artifact into an official state. Enforces:
  1. Actor holds the required role (via `hasRoleForEmail`).
  2. Actor is not the artifact's `created_by` (no self-approval).
  3. When required, an `engine_review_items` row exists in `approved` or
     `approved_with_conditions` state, matches the required `kind`, and
     targets the same artifact.
  4. Artifact-specific completeness predicate passes.
  5. Exactly one `engine_audit_log` row is written per successful transition
     with `action='official_transition'`.
- Registry `OFFICIAL_TRANSITIONS` enumerates the 8 official transitions:
  milestone→approved, implementation_plan→approved, mockup→approved,
  roadmap_version→published, delivery_item→sent, portal_roadmap→published,
  business_engine_run→completed, intelligence_memory→promoted.

## What is queued (not applied)

DB-tier `assert_official_transition(...)` SECURITY DEFINER function + one
BEFORE trigger per official table. Sample trigger for `engine_milestones` is
in the migration draft; the full 8-table block will be finalized in the batch
migration when the remaining phases are ready.

## Acceptance criteria coverage

See `.orchestrator/audit/acceptance-criteria-2026-07-14c.md` "Gate 0". This
phase satisfies the server-fn + registry rows. Tests + call-site refactor
land in later phases (each phase's writer routes through the gate).

## What is NOT done in this phase

- Migrating existing writers (`approveMilestone`, `approveMockup`,
  `publishRoadmapVersion`, `sendDelivery`, etc.) to call
  `assertOfficialTransition`. Those refactors happen inside each gap-specific
  phase so behavior changes are reviewable in context.
- Test file — added in Phase 12 as part of the re-audit verification pass.

## Next

Phase 2 — portal activity tracking (no schema change).
