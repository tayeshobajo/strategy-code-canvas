# Phase 2 — Point A / Point B Approval Ceremonies

Status: **ACCEPTED (2026-07-12)** — R4 + R4B shipped, acceptance smoke pass all green (21/21).

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

## Phase 2 acceptance smoke — 2026-07-12 (all green)

Harness: `/tmp/browser/phase2-ui-smoke/run.py`. Two scratch projects
(`smoke:phase-2-ui:*` and `smoke:phase-2-ui-b:*`). DB-trigger cases driven
via authenticated PostgREST using the admin/operator's real bearer token —
the same code path `CeremonyPanel`'s server functions use, so every trigger,
CHECK, and RLS policy fires as it does in production. UI verification via
headless Chromium against `http://localhost:8080/engine/projects/<id>/point-{a,b}`
and the portal routes.

**Totals: 21 PASS / 0 FAIL / 21 total.**

| # | Surface | Result | Case |
|---|---|---|---|
| 1  | DB | **PASS** | `recordCeremonyDecision` stamps `ceremony_id` on truth row |
| 2  | DB | **PASS** | `completeCeremony` blocks while non-terminal fields remain |
| 3  | DB | **PASS** | Raw completion path rejected by `trg_enforce_ceremony_completion` |
| 4  | DB | **PASS** | Bare `missing` field blocks completion |
| 5  | DB | **PASS** | Accepted-risk `missing` allows completion |
| 6  | DB | **PASS** | Unresolved contradiction blocks completion |
| 7  | DB | **PASS** | Abandon Point A rejected while Point B exists w/o invalidation |
| 8  | DB | **PASS** | Decision against completed ceremony rejected |
| 9  | DB | **PASS** | `approved_truth` decision without ceremony provenance rejected |
| 10 | DB | **PASS** | Full Point B approve + complete happy path |
| 11 | App | **PASS** | `assertStatusAllowedForActor` present + wired into `markSpineFieldStatus` (AI cannot write `verified`/`approved_truth`) |
| 12 | DB | **PASS** | Blank invalidation reason rejected by CHECK (proves the same shape enforced for `abandonCeremony`) |
| 13 | DB | **PASS** | Completion trigger enumerates dynamic `diagnosis:*` keys |
| 14 | DB | **PASS** | Point A invalidation cascades `re_review_required` + `stale_since` to Point B |
| 15 | DB | **PASS** | Active invalidation record unlocks Point A reopen |
| 16 | DB | **PASS** | Re-completion auto-resolves invalidations (`resolved_at` set) |
| UI-A       | UI | **PASS** | `CeremonyPanel` renders on `/engine/.../point-a` |
| UI-BADGE-A | UI | **PASS** | `WorkspaceStepper` badge on Point A step (`data-qa-ceremony-state=completed`) |
| UI-BADGE-B | UI | **PASS** | `WorkspaceStepper` badge on Point B step (`data-qa-ceremony-state=re_review`) |
| UI-PORTAL  | UI | **PASS** | `/portal/home`, `/portal/roadmap`, `/portal/onboarding` — no ceremony DOM |
| UI-IMPORTS | UI | **PASS** | `CeremonyPanel` imported only from `point-a` / `point-b` route files |

Screenshot evidence:
- `phase2-ui-smoke/screenshots/01_point_a.png` — Point A route rendering `CeremonyPanel`, workflow stepper shows **APPROVED** badge on Point A and **RE-REVIEW REQUIRED** on Point B, invalidation history entry resolved.
- `phase2-ui-smoke/screenshots/02_point_b.png` — Point B route.
- `phase2-ui-smoke/screenshots/03_portal_*.png` — portal routes free of any ceremony surface.

Artifacts:
- `/tmp/browser/phase2-ui-smoke/run.py` — runnable harness
- `/tmp/browser/phase2-ui-smoke/results.json` — machine-readable per-case results
- `/tmp/browser/phase2-ui-smoke/screenshots/*.png` — visual evidence

The earlier sandbox-only `db-cases.sql` pass (8 PASS / 14 INCONCLUSIVE-BY-ENV)
is superseded by this run and no longer relevant; the raw file remains under
`.orchestrator/phase-2-smoke/` for history only.

### Extra Phase 2 acceptance hardening

- `public.spine_field_keys(uuid, text)` locked to internal staff only
  (`is_engine_staff() OR has_role_email(_, 'team_member')`). The portal-member
  branch was removed — ceremonies stay internal-only and dynamic
  `diagnosis:*` keys are not exposed to portal clients. If Phase 3 needs a
  client-safe field-label helper, it must ship as a separate portal-safe
  function.


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
