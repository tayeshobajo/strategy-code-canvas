## G-3 Extension — Source visibility, defense across every path

### What's already in place (verified live)

| Layer | State | Evidence |
|---|---|---|
| DB column | `engine_sources.visibility` = `NOT NULL DEFAULT 'internal_only'` (enum: `internal_only` \| `operator_only` \| `client_safe`) | `\d engine_sources` |
| App inserters | All 3 set `visibility: "internal_only"` explicitly | `createSource`, `createProjectFromSource`, `submitPortalOnboarding` |
| RLS on `engine_sources` | Single policy, admin-only. No `anon`, no operator, no client-portal role | `pg_policies` inspection |
| Portal reads | Portal UI never queries `engine_sources` — reads `client_portal_roadmaps` / `_files` / `_messages` only | Grep across `src/routes/portal.*` and `src/lib/portal.functions.ts` |

**About the "extra paths" you listed** (Plaud, transcript, website URL, uploaded docs, manual notes): these don't have separate inserter functions in the codebase. The Signal Room / Intelligence Layer UI funnels **all** of them through `createSource`, which takes a `type` discriminator (`transcript` \| `brief` \| `website_url` \| `document` \| `screenshot` \| `email_note` \| `research_note` \| `competitor_url` \| `previous_roadmap`). One inserter, many `type` values. That inserter already sets `visibility: 'internal_only'`, so every type inherits it. `reprocessSource` operates on an existing row — it does not create or clone.

### What this plan adds

The runtime is already safe. This is about **making the guarantees provably locked** so a future path can't quietly break the rule.

1. **Widen the existing G-2 guard test** into a stricter multi-layer contract:
   - Scan **every** `from("engine_sources").insert(...)` in `src/**` (not just the 3 known ones); assert each carries `visibility: "internal_only"`. Any new inserter added later without visibility fails CI.
   - Assert the `SOURCE_TYPES` enum covers all the audience-facing source flavors (transcript, brief, website_url, document, screenshot, email_note, research_note, competitor_url, previous_roadmap) so the "one inserter, many types" contract is durable.

2. **Add a portal-isolation guard test** (new file):
   - Scan `src/routes/portal.*`, `src/lib/portal.functions.ts`, and all portal components: assert **zero** references to `"engine_sources"` (any SELECT/INSERT/UPDATE/DELETE). Portal is not allowed to touch the table.
   - Assert the RLS migration for `engine_sources` uses `has_role(..., 'admin')` (or admin/operator) and never grants a broader audience.

3. **Add a live-DB integration test** (`src/lib/__tests__/source-visibility-live.test.ts`, gated on `PGHOST`):
   - Insert a row into `engine_sources` **omitting** `visibility`; assert the returned row has `visibility = 'internal_only'` (proves the DB default). Cleanup after.
   - Attempt to select `engine_sources` under a non-admin JWT context and assert RLS blocks it (skip cleanly if we can't mint a portal-scope JWT in test env).

4. **Add an audit-doc anchor** in `.lovable/engine-qa-audit.md` noting G-3 is closed with a link to the three guard tests, so future audits don't re-flag it.

### What this plan explicitly does **not** do

- No new migration (DB default is already correct; RLS is already admin-only).
- No code changes to `createSource`, `createProjectFromSource`, or `submitPortalOnboarding` (already explicit).
- No new "client_safe" write path — promoting content to client-visibility still happens only through the approved-roadmap → `client_portal_*` publish flow, which is a separate G-0 concern already closed.

### Files touched

- `src/lib/__tests__/source-visibility-defense.test.ts` — widen (scan all inserters; assert type enum)
- `src/lib/__tests__/portal-cannot-read-engine-sources.test.ts` — **new** (portal isolation)
- `src/lib/__tests__/source-visibility-live.test.ts` — **new** (live-DB default + RLS block)
- `.lovable/engine-qa-audit.md` — mark G-3 closed with test references

### Success criteria

- All new / widened tests pass locally (`vitest run`).
- Adding a hypothetical new `from("engine_sources").insert(...)` without `visibility` fails at least one test (proven by mentally walking the regex).
- Live-DB test proves the DB default is authoritative even if a future refactor removes the explicit app-level line.

Ready to switch to build mode when you approve.
