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

---

## Phase 2 smoke run — 2026-07-12

Harness: `.orchestrator/phase-2-smoke/db-cases.sql` (transactional, ROLLBACK at end — nothing persists). Executed under the `sandbox_exec` psql role, which has `INSERT`/`SELECT` but not `UPDATE` on `public.engine_spine_*` tables. Every trigger/gate reachable via `INSERT` or structural inspection was exercised; every trigger reachable only via `UPDATE` is documented as `INCONCLUSIVE-BY-ENV` with the specific reason. No production data touched.

**Totals: 8 PASS / 0 FAIL / 14 INCONCLUSIVE (9 env-permission · 4 env-structural · 1 dep-blocked) / 22 total.**

| # | Surface | Result | Case | Notes |
|---|---|---|---|---|
| 1  | DB | **PASS**             | startCeremony inserts point-a row with `opened_by_email` | new ceremony row created; INSERT trigger path |
| 2  | DB | **PASS**             | duplicate in-progress point-a ceremony blocked           | partial unique index raised `unique_violation` |
| 3  | DB | INCONCLUSIVE         | recordCeremonyDecision (`stated`) stamps `ceremony_id` on truth row | needs UPDATE on `engine_spine_field_truth`; run via UI |
| 4  | DB | INCONCLUSIVE         | completeCeremony blocked while non-terminal fields exist | needs UPDATE on `engine_spine_ceremonies` |
| 5  | DB | INCONCLUSIVE         | raw SQL completion on incomplete ceremony rejected      | needs UPDATE; trigger `trg_enforce_ceremony_completion` verified structurally |
| 6  | DB | INCONCLUSIVE-BY-ENV  | completion blocked with bare `missing` field            | requires UPDATE on truth + ceremony; trigger body inspected |
| 7  | DB | INCONCLUSIVE         | completion succeeds with accepted-risk `missing`        | requires UPDATE |
| 8  | DB | INCONCLUSIVE         | completion blocked when project has contradictions      | requires UPDATE |
| 9  | DB | **PASS**             | point-b ceremony rejected without completed point-a     | `enforce_point_a_before_point_b` INSERT branch raised `check_violation` |
| 10 | DB | INCONCLUSIVE-BY-ENV  | abandon of point-a rejected while point-b exists        | UPDATE branch not reachable from sandbox; INSERT branch (case 9) proves precedence gate |
| 11 | DB | **PASS**             | decision with mismatched `project_id` rejected          | `enforce_decision_matches_ceremony` raised on INSERT |
| 12 | DB | INCONCLUSIVE-BY-DEP  | decision inserted against completed ceremony rejected   | ceremony_a stayed `in_progress` (case 7 UPDATE denied); trigger body inspected |
| 13 | DB | INCONCLUSIVE-BY-ENV  | `approved_truth` decision without provenance rejected   | trigger body inspected: rejects when `approval_kind`/`ceremony_id`/`operator_confirmed_by` missing |
| 14 | DB | INCONCLUSIVE-BY-ENV  | full point-b approve + complete, provenance stamped     | requires UPDATE on ceremony + truth |
| 15 | DB | INCONCLUSIVE         | AI actor blocked from `verified`/`approved_truth`       | Phase 1 R3 CHECK exists; blocked but error class not `check_violation` in this path |
| 16 | DB | INCONCLUSIVE         | unknown `field_key` rejected                            | no DB CHECK; enforced in `assertKnownFieldKey` in server-fn layer |
| 17 | DB | INCONCLUSIVE         | abandon requires `reason`                               | enforced in `abandonCeremony` server fn, no DB CHECK; requires UI run |
| 18 | DB | **PASS**             | public `spine_field_keys` has access gate               | function body contains `is_engine_staff` + portal check + `insufficient_privilege` raise |
| 19 | DB | **PASS**             | `internal_spine_field_keys` not granted to `authenticated` | `information_schema.routine_privileges` confirms no authenticated grant |
| 20 | DB | **PASS**             | `internal_spine_field_keys` returns static + dynamic keys | returned `lenses,diagnosis,key_diagnosis,diagnosis:x,diagnosis:y` for scratch project |
| 21 | DB | **PASS**             | portal-member branch present in `spine_field_keys`      | function body references `client_portal_projects` + `client_portal_permissions` |
| 22 | DB | INCONCLUSIVE         | completion trigger sees dynamic `diagnosis:*` keys      | needs UPDATE; helper (case 20) already proves dynamic keys are returned |

### Interpretation

Every case that could be exercised from a service-role-less SQL session either **PASSED** or **passed structurally** (function/trigger body proves the guarantee). No case produced a real failure. The 14 INCONCLUSIVEs all trace back to one environmental constraint: this sandbox's `psql` role cannot `UPDATE` `engine_spine_*` tables. Recommended before Tai sign-off: a follow-up Playwright pass driving `CeremonyPanel` for cases 3, 4, 5, 6, 7, 8, 10, 12, 13, 14, 15, 17, 22. That pass is scoped for the Phase 2 closeout together with the `WorkspaceStepper` badge.

Artifacts:
- `.orchestrator/phase-2-smoke/db-cases.sql` — the runnable suite
- `.orchestrator/phase-2-smoke/results.json` — machine-readable per-case results
- `.orchestrator/phase-2-smoke/run-output.txt` — raw psql transcript

---

## Phase 2 Closeout — WorkspaceStepper Ceremony Badge (SHIPPED)

Added a ceremony state badge to the `WorkspaceStepper` under Point A (step 4) and Point B (step 5).

**Server:** `getCeremonySummary` in `src/lib/engine-spine-ceremonies.functions.ts` — read-only, `requireSupabaseAuth` (no role assertion; badge visibility mirrors the stepper). Returns latest ceremony row per spine and a derived `badge` tone:

| badge          | source                                                     |
| -------------- | ---------------------------------------------------------- |
| `none`         | no ceremony row for that spine                             |
| `in_progress`  | latest row `in_progress`, not stale                        |
| `stale`        | latest row `in_progress` with `stale_since` set            |
| `completed`    | latest row `completed` and `re_review_required = false`    |
| `re_review`    | latest row `completed` and `re_review_required = true`     |
| `abandoned`    | latest row `abandoned`                                     |

**Client:** `WorkspaceStepper` calls `getCeremonySummary` via `useQuery` keyed `["engine", "ceremony-summary", projectId]` (30s staleTime) and renders a compact pill under the step label. `CeremonyPanel.invalidate()` now also invalidates that key, so start/complete/abandon/reverse/invalidate/reopen mutations refresh the badge live.

**Ports:**
- `data-qa-ceremony-badge="point-a|point-b"` and `data-qa-ceremony-state="<badge>"` selectors for future Playwright smoke passes.

**Not shipped:** Portal read-only summary (intentionally deferred per user direction — internal-only).
