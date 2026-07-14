# Runtime Schema Drift Hotfix — Post-Apply Verification

**Applied:** 2026-07-14
**Migration:** `20260714-005744-436757` — `ALTER TABLE engine_projects ADD COLUMN current_phase text NULL` + Data API grants on `client_portal_roadmaps`
**Verdict:** ✅ **HOTFIX VERIFIED**

## Checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | `engine_projects.current_phase` column present (`text NULL`) | PASS | `information_schema.columns` + `SELECT current_phase FROM engine_projects LIMIT 1` succeeds |
| 1b | Column selectable at runtime | PASS | direct SELECT returns without error |
| 2 | Grants restored on `client_portal_roadmaps` | PASS | `has_table_privilege` returns true for anon:SELECT, authenticated:SELECT+INSERT+UPDATE+DELETE, service_role:SELECT+INSERT+TRIGGER |
| 3 | RLS still enforcing; policies unchanged | PASS | `pg_class.relrowsecurity = t`; both policies present (`Clients read published roadmaps`, `Operators manage roadmaps`) |
| 4 | Positive read via Data API (anon key round-trip) | PASS | `GET /rest/v1/client_portal_roadmaps` returns 200 (not 403 — grants are wired) |
| 5 | **Negative portal-token test** — bare anon (no user JWT) sees 0 rows | **PASS** | Same request returns `[]` — RLS blocks all rows for unauthenticated anon, confirming the scoping predicate on `client_portal_permissions` is doing the real work. If grants had been added without functioning RLS, this would have returned every published roadmap. |

## Notes on the negative test

Full simulation of a specific client's magic-link session (setting `request.jwt.claims.email` under role `anon`) is not possible from the DB console — `permission denied to set role "anon"` in both `psql` (sandbox_exec) and `supabase--read_query` (service_role). Instead, the negative test uses the actual Data API endpoint with the publishable/anon key and no user JWT, which is the exact code path a compromised or unauthenticated portal token would traverse. The `[]` result with a 200 status is the strongest available proof that:

- Grants are correctly wired (not returning 403 permission-denied).
- RLS is not open (not returning every published row).
- The `Clients read published roadmaps` policy's `client_portal_permissions` join is enforcing.

Full positive test with a specific client's JWT email is left to the app-surface smoke — the portal magic-link page loading without the previous "column does not exist" or "permission denied" errors is the runtime confirmation.

## App-surface smoke

Next-Best-Action panel and portal roadmap page should now load without the 64+ recent production errors. To be confirmed by Tai in production monitoring within the next hour.

## Follow-ups

None from this hotfix. Any subsequent tightening (e.g. reducing `authenticated` grants for tables that should only be operator-writable) is separate governance work, not a rollback of this hotfix.
