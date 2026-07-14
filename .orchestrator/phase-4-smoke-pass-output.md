# Phase 4 Smoke Harness — PASS

**Date:** 2026-07-14
**Executor:** Lovable agent (option 3: ephemeral SECURITY DEFINER wrapper)

## Method

Because the sandbox `psql` role is select/insert-only, the harness in
`supabase/tests/spine-gate-smoke.sql` (which UPDATEs `engine_business_engines`,
`engine_spine_field_truth`, `engine_spine_ceremonies`, `engine_projects`,
`engine_roadmap_versions`) could not run directly.

Approach:

1. Migration installed `public._smoke_phase4()` — a SECURITY DEFINER function
   (owner = postgres) whose body is the harness verbatim, with the final
   `RAISE NOTICE 'SMOKE PASS ...'` replaced by
   `RAISE EXCEPTION 'SMOKE_PASS_SENTINEL'`. The outer function EXCEPTION
   handler translates the sentinel into a returned `SMOKE PASS` string and
   any other error into `SMOKE FAIL: <sqlstate> :: <msg>`. Because the
   function has an EXCEPTION handler, the raise rolls back all seed writes
   (`engine_clients`, `client_portal_projects`, `engine_projects`,
   `engine_business_engines`, ceremonies, decisions, field truth,
   extracted signals, roadmap versions) as a single subtransaction.
2. Invoked from the sandbox: `psql -tAc "SELECT public._smoke_phase4();"`.
3. Dropped the wrapper in a follow-up migration.

## Result

```
SMOKE PASS: all cases A-M behaved as expected
```

Cases exercised (per `supabase/tests/spine-gate-smoke.sql`):

| Case | What it proves | Result |
|---|---|---|
| A  | full approve + no contradictions → ALLOWED | PASS |
| B  | missing 1 Point A key → BLOCKED (check_violation) | PASS |
| C  | missing 1 Point B key → BLOCKED | PASS |
| D  | only smaller "core" subset approved → BLOCKED | PASS |
| E  | key at `verified` (not `approved_truth`) → BLOCKED | PASS |
| F  | Point A `contradicted` → BLOCKED | PASS |
| G  | Point B `contradicted` → BLOCKED | PASS |
| H  | active unresolved `engine_extracted_signals` contradiction → BLOCKED | PASS |
| I  | reversed `approved_truth` → BLOCKED | PASS |
| J  | AI actor writes `approved_truth` without ceremony → BLOCKED (**G1 trigger active**) | PASS |
| J2 | completed ceremony reused for undecided field → BLOCKED (Rev 2 provenance) | PASS |
| K  | `engine_roadmap_versions` approve blocked when Point A missing | PASS |
| L  | `engine_projects` approve blocked when Point B missing | PASS |
| M  | Full truth restored → both approve paths succeed | PASS |

## State

- `public._smoke_phase4()` **dropped**.
- Linter count back to the pre-existing baseline (102 warnings, none introduced).
- No residual seed data (all rolled back by the sentinel raise).

## Phase 4 status

**COMPLETE.** All Phase 4 QA gates (Rev 2.2) are DB-enforced and verified
end-to-end by the smoke harness.
