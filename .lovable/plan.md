# Phase 2 Smoke Execution Plan (22 cases)

Goal: run all 22 smoke cases end-to-end against the live backend, capture per-case PASS/FAIL + evidence, and record results.

## Execution strategy per case category

The 22 cases split into three execution surfaces. Each needs a different harness — one script can't cover all of them.

### A. DB-layer trigger cases (5, 6, 8, 11, 12, 13, 22)
Run via `supabase--read_query` (SELECT/DO blocks) and, where writes are needed, a **temporary smoke migration** that:
- opens a transaction
- seeds a throwaway project + ceremony
- attempts the forbidden SQL
- captures the raised `SQLSTATE` / message
- **rolls back** so nothing persists

Nothing here needs `auth.email()` — triggers fire on service-role writes too.

### B. App-layer server-function cases (1, 2, 3, 4, 7, 9, 10, 14, 15, 16, 17)
These exercise `startCeremony / recordCeremonyDecision / completeCeremony / abandonCeremony` which all use `requireSupabaseAuth`. Two options:

- **Preferred:** Playwright script under `/tmp/browser/phase2-smoke/` that logs in as an operator via the injected Supabase session (`LOVABLE_BROWSER_AUTH_STATUS`), navigates to a scratch project's Point A / Point B routes, and drives `CeremonyPanel` UI. Screenshots + DB reads after each step.
- **Fallback:** if `LOVABLE_BROWSER_AUTH_STATUS != injected`, invoke each server fn via `stack_modern--invoke-server-function` (bearer attached automatically) and verify with `supabase--read_query`.

Case 15 (AI actor blocked) can't be reached through the UI or an authenticated server fn — verify by direct `insert` attempt on `engine_spine_field_truth` with `updated_by_actor='ai'` + `verified` and confirm the Phase 1 R3 CHECK rejects it. Documented as DB-verified.

### C. R4 access-gate cases (18, 19, 20, 21)
Require calling `spine_field_keys` / `internal_spine_field_keys` under different auth identities:

- **18, 19:** authenticated non-staff, no portal permission — use `stack_modern--invoke-server-function` with a thin new smoke server fn that just RPCs the two helpers and returns error/rows. Alternatively use `supabase--read_query` with `SET LOCAL role authenticated; SET LOCAL request.jwt.claims = '{"sub":"…","email":"nonstaff@…"}'` inside a transaction.
- **20:** staff caller — same technique with a staff claim, seed two `diagnosis:*` truth rows first.
- **21:** portal member — requires an active `engine_client_portal_permissions` row; seed one for the smoke user, then call under their JWT.

Because full JWT impersonation from the sandbox is fragile, I will use the `SET LOCAL request.jwt.claims` pattern inside a read-only transaction — it's how our other RLS smokes have been shown to run in this project. If a specific case can't be reliably impersonated, it will be marked `INCONCLUSIVE (impersonation)` rather than falsely PASS.

## Fixture

Single scratch project created at start:
- `engine_projects` row with a distinct name (`smoke:phase-2:<timestamp>`)
- 3 seeded truth rows on Point A (one `stated`, one `needs_confirmation`, one `contradicted` for case 8) plus `diagnosis:x`, `diagnosis:y` (for cases 20, 22)
- operator email = current session email

Fixture is torn down at end (soft delete / status='archived' — no hard DELETE, matching design principle).

## Deliverables

1. `.orchestrator/phase-2-smoke/` directory with:
   - `run.py` (Playwright driver)
   - `db-cases.sql` (transactional trigger tests)
   - `screenshots/` per UI case
   - `results.json` — machine-readable per-case PASS/FAIL/INCONCLUSIVE + evidence pointer
2. Append **"Phase 2 smoke run — <date>"** section to `.orchestrator/phase-2-output.md` with a 22-row table (Case # · Surface · Result · Evidence).
3. Append the same summary block to `.orchestrator/PENDING_MIGRATIONS.md` immediately after the existing smoke plan (line ~1188), and flip the "Known follow-ups" bullet in `phase-2-output.md` from "to be executed" to "executed <date> — N/22 PASS".
4. Do **not** apply any permanent migration. The transactional smoke SQL rolls back.

## Risks / calls I'll make during execution

- If `LOVABLE_BROWSER_AUTH_STATUS` is `signed_out`, I'll stop and ask you to sign in via the preview once before continuing — no credential prompts.
- If a case fails, I'll capture the failure, continue the rest, and report the full 22-row result rather than halting.
- Any case that requires JWT impersonation I can't cleanly reproduce will be marked INCONCLUSIVE with the exact reason, not silently PASSed.

## Out of scope

- WorkspaceStepper badge (separate Phase 2 closeout item).
- Portal read-only summary (future phase).
- Any schema change — this is verification only.
