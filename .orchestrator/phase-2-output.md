# Phase 2 — Point A / Point B Approval Ceremonies

Status: **APPLIED (2026-07-12)** — R4 shipped.

## What shipped

Migration (applied to live DB):
- `public.engine_spine_ceremonies` (header, one active per project+spine, abandoned/completed metadata)
- `public.engine_spine_ceremony_decisions` (append-only per-field decisions, `public.epistemic_status` typed)
- `ceremony_id` column on `public.engine_spine_field_truth` for provenance stamping
- `public.internal_spine_field_keys(uuid, text)` — trigger-only, no public grant, mirrors TS registry
- `public.spine_field_keys(uuid, text)` — access-gated public wrapper (staff or portal member)
- `public.internal_project_has_contradictions(uuid)` — trigger-only, no public grant
- DB triggers:
  - `trg_enforce_decision_matches_ceremony` — project/spine/status consistency + `approved_truth` provenance stamp
  - `trg_enforce_point_a_before_point_b_ins/upd` — Point A precedence + reopen/abandon guard
  - `trg_enforce_ceremony_completion` — canonical completion rule (all fields terminal + no contradictions)
  - `trg_audit_spine_ceremony_ins/upd` and `trg_audit_spine_ceremony_decision_ins` — audit log
  - `trg_engine_spine_ceremonies_updated` — `updated_at` touch via `public.tg_touch_updated_at()`
- RLS: admin/operator write, staff (admin|operator|team_member) read, no DELETE

App-layer (`src/lib/engine-spine-ceremonies.functions.ts`):
- `startCeremony({ projectId, spine, notes? })` — opens or reuses in-progress; pre-checks Point A precedence
- `listCeremonyFields({ ceremonyId })` — calls public `spine_field_keys` RPC, joins truth rows
- `recordCeremonyDecision({ ceremonyId, fieldKey, newStatus, sourceRef })` — enriches for humans, stamps ceremony provenance for `approved_truth`, inserts decision, upserts truth with `ceremony_id`
- `completeCeremony({ ceremonyId })` — flips to `completed`; DB trigger is source of truth
- `abandonCeremony({ ceremonyId, reason })` — sets abandoned metadata

`SourceRef` in `engine-epistemic.server.ts` extended with optional `accepted_as_risk` boolean for ceremony-scoped `missing` decisions with operator override (required by DB completion trigger).

## Deviations from R4 plan

1. Static allowlists in `internal_spine_field_keys` now mirror the real TS registry (`POINT_A_BASE_FIELD_KEYS`, `POINT_B_FIELD_KEYS`) instead of the placeholder `current_state:*` / `target_state:*` keys shown in the plan text.
2. `tg_touch_updated_at()` used instead of `update_updated_at_column()` (preflight assumption was wrong — the latter doesn't exist on this project).

## Known follow-ups (deferred)

- Phase 2B: downstream invalidation flow for Point B when Point A truth changes — trigger currently blocks reopen/abandon of a completed Point A when Point B ceremonies exist.
- UI surfaces (`CeremonyPanel`, WorkspaceStepper badge) — not part of Phase 2 data-model completion.
- Vitest drift test comparing `internal_spine_field_keys` static arrays to `SPINE_FIELD_REGISTRY` — to be added in Phase 2 test pass.
- Smoke plan (22 test cases) — to be executed against a real project via the operator UI or a scripted run.

## Security linter

37 pre-existing WARN findings on `SECURITY DEFINER` functions callable by `authenticated`. New Phase 2 functions follow the same access-gated pattern already used by `has_contradictions`, `is_engine_staff`, etc.: `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO authenticated, service_role`, with in-function auth check that raises `insufficient_privilege`. Internal helpers grant only to `service_role`.

---

## Phase 2B — Reversal + downstream invalidation cascade (2026-07-12)

Status: **APPLIED**.

Migration:
- Columns on `engine_spine_ceremonies`: `stale_reason`, `stale_since`, `re_review_required`
- Columns on `engine_spine_field_truth`: `stale_reason`, `stale_since`
- New `engine_spine_ceremony_invalidations` table (one-shot unlock records; `resolved_at` nulls until the ceremony re-completes)
- `enforce_point_a_before_point_b` updated: reopen/abandon of completed Point A permitted only when an active invalidation exists (when downstream Point B exists)
- `cascade_point_a_truth_reversal` trigger: field-level flip from `approved_truth` → non-terminal cascades stale to Point B ceremonies + truth rows
- `cascade_ceremony_invalidation_insert` trigger: ceremony-level invalidation cascades stale + writes audit row
- `resolve_ceremony_invalidations_on_complete` trigger: re-completing a Point A ceremony auto-resolves its active invalidations and clears its own stale flags

App layer (`src/lib/engine-spine-invalidation.functions.ts`):
- `reverseFieldApproval({projectId, spine, fieldKey, reason})` — field-level reversal (both spines; Point A also cascades via trigger)
- `invalidatePointACeremony({ceremonyId, reason, reversedFieldKeys})` — records the formal invalidation
- `reopenCeremony({ceremonyId})` — flips completed → in_progress (DB trigger enforces the invalidation unlock)
- `listCeremonyInvalidations({projectId})` — history read for the panel

UI (`src/components/engine/CeremonyPanel.tsx`, internal-only):
- Wired into `engine/projects/$projectId/point-a` and `.point-b`
- Open/reuse ceremony, per-field table with current chip, per-field approve/reverse controls, complete/abandon/invalidate/reopen actions, invalidation history block
- Role-gated to admin/operator; renders a note for other viewers
- Explicitly NOT rendered anywhere under `src/routes/portal/*` — the portal remains downstream-only

Drift test (`src/lib/__tests__/spine-field-keys-drift.test.ts`):
- Parses the latest migration defining `internal_spine_field_keys`
- Diffs the point-a and point-b static arrays against `POINT_A_BASE_FIELD_KEYS` / `POINT_B_FIELD_KEYS`
- Asserts the point-a branch does not hardcode any `diagnosis:*` key
- Pure filesystem read — no DB dependency; passes reliably in every environment
- `bunx vitest run src/lib/__tests__/spine-field-keys-drift.test.ts` → 3 tests passed

Security linter: 45 pre-existing WARN findings on `SECURITY DEFINER` functions callable by `authenticated`. New Phase 2B internal helpers (`mark_point_b_stale`, cascade triggers) are `REVOKE ALL FROM PUBLIC` with grants only to `service_role`. No new externally-callable surface.
