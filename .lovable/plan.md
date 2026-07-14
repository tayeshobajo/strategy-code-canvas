## Runtime Schema Drift Hotfix — Independent Review, Apply, Verify

Scope: the `Runtime Schema Drift Fix` block already written in `.orchestrator/PENDING_MIGRATIONS.md` (lines ~3970–end). Not bundled with Phase 5D. Approval of this plan = Tai approval to apply the migration.

### What the migration does

Single migration, two changes:

1. `ALTER TABLE public.engine_projects ADD COLUMN IF NOT EXISTS current_phase text NULL` — matches generated types; unblocks 64 recent production errors from `engine-nba.functions.ts`, `engine-execution.functions.ts`, `engine-completion.functions.ts`.
2. Restore Data API grants on `public.client_portal_roadmaps`:
   - `GRANT SELECT ON ... TO anon` (portal magic-link reads under token-scoped RLS)
   - `GRANT SELECT, INSERT, UPDATE, DELETE ON ... TO authenticated` (staff writes)
   - `GRANT ALL ON ... TO service_role` (admin/server-fn writes)

Preflight already recorded in `PENDING_MIGRATIONS.md`:
- RLS enabled on `client_portal_roadmaps`
- Two scoped policies (`Clients read published roadmaps` via `client_portal_permissions`, `Operators manage roadmaps` via `client_portal_is_operator`)
- No `USING(true)` policies — grants are safe

### Apply

Issue the migration via `supabase--migration` using the SQL block already committed to `PENDING_MIGRATIONS.md`. The tool surfaces it for approval; on approval it runs.

### Post-apply verification (must all PASS before marking hotfix closed)

Write and run `.orchestrator/qa/hotfix-portal-roadmaps-smoke.sql`:

1. **Column present** — `\d public.engine_projects` shows `current_phase text NULL`; `SELECT current_phase FROM public.engine_projects LIMIT 1` succeeds.
2. **Grants present** — `information_schema.role_table_grants` returns the expected rows for anon (SELECT), authenticated (SELECT/INSERT/UPDATE/DELETE), service_role (ALL).
3. **RLS still enforcing** — `pg_class.relrowsecurity = t` on `client_portal_roadmaps`, both policies still present, unchanged.
4. **Positive read** — an authenticated context matching an active `client_portal_permissions` row for a published roadmap returns that row.
5. **Negative portal-token test (the one you called out)** — under `SET LOCAL ROLE anon` plus a JWT claim simulating client-A's magic-link email (via `set_config('request.jwt.claims', ...)`), `SELECT * FROM client_portal_roadmaps` returns:
   - client-A's published rows: >0
   - client-B's published rows: 0
   - any client's non-published rows: 0
   If any of these fail, treat as RLS drift — roll the grants back immediately (RLS wasn't doing the scoping we thought) and re-open the hotfix.
6. **App-surface smoke** — hit portal magic-link roadmap page in preview; confirm Next-Best-Action panel loads without the previous "column does not exist" errors.

### On PASS

- Write `.orchestrator/hotfix-portal-roadmaps-output.md` with per-check status + timestamps.
- Update `PENDING_MIGRATIONS.md` §Runtime Schema Drift Fix status: `APPLIED YYYY-MM-DD, verified` with link to smoke output.
- Note in `BUILD_STATE.md` build log.

### On FAIL

- Do not silently patch. Capture failure in the smoke output.
- If check 5 fails (negative portal-token), issue a compensating migration that REVOKEs the newly added grants and file a follow-up to strengthen RLS before re-granting.
- If check 1/2 fails, investigate before any app-layer changes.

### Out of scope

- No app-layer code changes — the column and grants alone unblock the existing call sites.
- No touching Phase 5D artifacts.
- No changes to other tables flagged as sibling errors in the finding (they resolved to derived-column false positives, per the existing PENDING_MIGRATIONS entry).
