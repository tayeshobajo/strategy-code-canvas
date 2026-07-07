# Roadmap Engine — Exhaustive Audit (2026-07-07)

## Executive Summary

Coverage: every table in the `public` schema, every `createServerFn` under `src/lib/*.functions.ts` + `src/utils/*.functions.ts` + `src/lib/mcp/**`, every route under `src/routes/engine.*` and `src/routes/api/public/**`, all triggers touching `engine_*` / `client_portal_*`, and the full roadmap approval/publish workflow.

Automated signals:
- `bunx vitest run` — **208/208 tests pass** (32 files)
- `code--dependency_scan` — no high/critical npm vulns
- `security--get_scan_results` — empty (persisted findings all resolved in prior passes)
- `supabase--linter` — 18 warnings, all variants of "signed-in users can execute SECURITY DEFINER function" (17 already-hardened admin/portal RPCs; expected — see F17)

**Overall health: solid.** The security fixes from the last two turns closed the biggest holes. Remaining findings cluster around three themes:

1. **Hardcoded operator allowlist** (`client_portal_is_operator` — one email) is the highest-leverage single point of failure.
2. **Client-facing error strings** leak raw Supabase error messages across most engine server fns.
3. **A handful of write policies are missing or over-scoped** on write-audit tables.

No Critical-severity data-exposure bugs found in the engine surface. The workflow itself (AI → tai-edited → approved → preview-approved → published) is correctly gated at both application and DB-trigger layers.

---

## Findings

Severity: **C**ritical (data loss / privilege escalation) · **H**igh (exploitable but bounded) · **M**edium (correctness / defense-in-depth) · **L**ow (cleanup / DX).

### Security & RLS

| # | Sev | Area | File · line | Issue | Recommended fix |
|---|-----|------|-------------|-------|-----------------|
| S1 | **H** | RLS | `client_portal_is_operator` (DB function) | Hardcoded single email `hello@trust-tai.com` gates all `client_portal_*` operator policies (~8 tables, 14 policies). Adding a second operator requires a migration. | Replace body with `EXISTS (SELECT 1 FROM public.user_roles WHERE role IN ('operator','admin') AND lower(email) = lower(_email))`. Keep SECURITY DEFINER. |
| S2 | **H** | RLS | policy `operator_notification_reads · "Operators can clear their own reads"` | DELETE `USING` clause omits the `has_role` check present on INSERT/UPDATE. Any authenticated user matching the email column can delete rows. | Add `AND (has_role(auth.uid(),'operator') OR has_role(auth.uid(),'admin'))` to the USING clause. |
| S3 | **H** | RLS | `suppressed_emails` policies | Policy role is `{public}`; protection depends on `auth.role() = 'service_role'` in the qual — fragile. No DELETE policy. | Change policy role to `{service_role}`; drop the runtime `auth.role()` check; add DELETE. |
| S4 | **H** | Server-fn auth | `src/lib/portal.functions.ts:19-21, 507-515` | `isOperator(email)` is aliased to `isAdminEmail()` only — DB `operator`-role grants are ignored by `assertOperator` and by `getPortalContext.isOperator` returned to the UI. DB-only operators fail portal operator gates. | Change alias to `isAdminEmail(email) \|\| isOperatorEmail(email)`, matching `checkPortalAccess`. Verify no downstream code relies on the current (incorrect) behavior. |
| S5 | **H** | Server-fn auth | `src/lib/portal.functions.ts:1300-1316` `resolvePortalFollowUp` | Only requires `requireSupabaseAuth`; no ownership or role check. Any authenticated user can resolve any other client's follow-up thread by ID. | Add operator role check OR verify `project_id` is in caller's `client_portal_permissions`. |
| S6 | **H** | Public route | `src/routes/api/public/hooks/build-roadmap-contact.ts` | Unauthenticated POST enqueues emails via `supabaseAdmin`. No HMAC, no rate limit, no origin check. Attacker can spam the transactional queue. | Require `X-Webhook-Secret` header verified against a secret, or add a per-IP token-bucket. |
| S7 | **M** | Server-fn errors | `src/lib/engine-ops.functions.ts` (8 sites: 85, 126, 169, 236, 381, 421, 691, 802, 916) and others | `throw new Error(String(error.message))` propagates raw Supabase errors (table/column/constraint names) to the client. Enumerable schema surface for anyone with a valid session. | Wrap each: `console.error(...); throw new Error("Operation failed")`. Centralize in a helper. |
| S8 | **M** | Server-fn auth | `src/lib/engine-agent.functions.ts` (all `assertAdmin(context: any)` calls) | Untyped `context` masks middleware regressions. If the auth middleware chain ever fails silently, `assertAdmin` gets an undefined email and throws a generic "Forbidden" but with no type protection. | Type context as `AuthenticatedContext`. Remove file-wide `eslint-disable no-explicit-any` in `engine-intelligence.functions.ts:1`. |
| S9 | **M** | Client-facing config | `src/lib/portal.functions.ts:194, 791` | `process.env.PUBLIC_SITE_URL` silently falls back to hardcoded `trusttai.com`. Staging/local magic links redirect to production. | Log `console.warn` when env var is missing; consider throwing outside prod. |
| S10 | **M** | MCP tool | `src/lib/mcp/tools/get-project.ts` | Returns raw Supabase `error.message` to MCP callers; no role check beyond RLS (roadmap `payload` JSON is broad — trusts RLS 100%). | Return generic error text; log real error. Optionally gate sensitive fields behind `has_role`. |
| S11 | **M** | RLS | `roadmap_documents` | Only a SELECT policy for clients. No INSERT/UPDATE/DELETE for operators/admins via PostgREST. All writes must go through service_role — undocumented. | Either add explicit admin/operator ALL policy, or add a doc comment that writes are server-fn-only. |
| S12 | **M** | RLS | `user_roles` | No INSERT/UPDATE/DELETE policies — role management only via `admin_grant_role` / `admin_revoke_role` SECURITY DEFINER RPCs. Intended, but implicit. | Add a documented deny-all `{authenticated}` policy or a code comment in the migration to prevent future confusion. |
| S13 | **M** | RLS | `operator_notifications`, `portal_access_events` | Read-only from the client; writes only via triggers/edge. Intended but implicit. | Same as S12 — add explicit deny + comment. |
| S14 | **L** | RLS | `client_portal_messages · "Clients update own portal messages"` | UPDATE doesn't restrict which columns can change. Client can UPDATE `project_id` to a sibling permitted project. | Column-level `GRANT UPDATE (body, updated_at) ...` OR trigger that pins `project_id`, `author_email`, `sender_type`. |
| S15 | **L** | RLS | `engine_project_intake_failures` | `"Service role manages intake failures"` policy is dead code (service_role bypasses RLS). | Drop the policy, replace with a comment. |
| S16 | **L** | RLS perf | 7 `client_portal_*` policies | Repeat correlated subquery on `client_portal_permissions` for every row. Fine today; watch as data grows. | Wrap in `get_permitted_project_ids()` SECURITY DEFINER helper. |
| S17 | **L** | Linter noise | supabase linter 17× WARN 0029 | All admin/portal RPCs are executable by `authenticated`; each intended one already asserts `has_role` inside. Expected. | Ignore in security memory (already partially covered from prior turns); no action. |
| S18 | **L** | Server-fn hygiene | `src/routes/api/public/payments/webhook.ts:5-13` | Module-scope singleton for service-role Supabase client. Fine on Node workerd but the pattern reads as "hold a service-role key across requests." | Move `createClient` inside the handler or use the shared lazy `supabaseAdmin` import. |
| S19 | **L** | Server-fn hygiene | `src/lib/portal.functions.ts:39-57` `ensureUnsubscribeToken` | `.select` + conditional `.insert` is not atomic. | Replace with `.upsert({ email, token }, { onConflict: 'email' })`. |

### Data integrity & workflow

| # | Sev | Area | File · line | Issue | Recommended fix |
|---|-----|------|-------------|-------|-----------------|
| D1 | **M** | Enum drift | `engine_version_status` (DB enum) vs code | Enum contains `client_facing` and `needs_review` but **no server function writes them**. `client_facing` rows would be invisible to clients (trigger only allows `approved`/`delivered`). Dead states masquerade as valid. | Either wire the states or drop them from the enum in a migration. |
| D2 | **M** | FK / lifecycle | `engine_roadmap_versions.published_portal_roadmap_id` | Back-reference column exists but neither `publishVersionToPortal` nor `sendProjectDelivery` writes it. Only the portal side (`client_portal_roadmaps.approved_roadmap_version_id`) is populated. | Populate on publish in the same transaction, or drop the column. |
| D3 | **M** | Data model | `client_portal_roadmaps.status` (text) | Untyped column; trigger only inspects `IN ('approved','delivered')`. A stray value bypasses trigger validation (RLS still hides it). | Add `CHECK (status IN ('draft','approved','delivered','archived'))` or convert to a Postgres enum. |
| D4 | **L** | Fan-out | trigger `tg_client_portal_files_fanout_engine`, `tg_client_portal_messages_notify_operators` | Both swallow errors with `WARNING` and `RETURN NEW` to avoid breaking client action. Correct behavior, but no persistent DLQ / retry — silent partial failures are only visible in Postgres logs. | Insert a durable row into an `engine_fanout_failures` audit table before returning, so ops can see and replay. |
| D5 | **L** | Health check | none exists | No scheduled health-check for stuck versions (`ai_generated` older than N days), orphan portal rows (`client_portal_roadmaps` with FK to deleted version), or preview-ready-but-unapproved. `CommandCenter` inline check only covers source failures + activity errors. | Add a `runEngineHealthCheck` server fn with an admin-only dashboard row on `/engine`. |

### UX / product completeness

| # | Sev | Area | File · line | Issue | Recommended fix |
|---|-----|------|-------------|-------|-----------------|
| U1 | **M** | Error boundaries | most `src/routes/engine.projects.$projectId.*.tsx` (verify each) | TanStack routes MUST define both `errorComponent` and `notFoundComponent`. Several engine sub-routes rely on the default. Suspense fall-through on a broken loader will blank a section rather than showing a scoped fallback. | Add per-route `errorComponent` (retry via `router.invalidate()` + `reset()`) and `notFoundComponent`. |
| U2 | **M** | Breadcrumbs | `src/routes/engine.tsx:165-177` `buildCrumbs` | Only handles `/engine`, `/engine/projects/*`. All other tabs (Templates, Review, Delivery, Execution, Operations, Intelligence) fall through to the generic slug-title branch. Slugs like `intelligence` render capitalized but nested pages (e.g. `.../projects/$id/agent/costs`) get a single crumb. | Extend `buildCrumbs` with a route-key → label map; drive from `NAV` array to stay in sync. |
| U3 | **M** | Admin lock enforcement | `src/routes/engine.projects.$projectId.preview.tsx:115-121` | Client-preview overrides UI hides `StepEditor` for non-admins, but the server fn behind the editor must also enforce admin — otherwise a crafted call from an operator bypasses the UI lock. Confirm the `saveStep`/`updateProject` fn for `client_preview` is admin-only server-side. | Audit the `StepEditor` submit path; if it currently uses `assertOps`, tighten to `assertAdmin` for `step = "preview"`. |
| U4 | **M** | Empty states | `engine.projects.index.tsx`, `engine.templates.tsx`, `engine.intelligence.tsx`, `engine.review.tsx` | Verify each renders a helpful empty state for a fresh workspace with zero projects / templates / reviews (not just an empty table). | Walk the four screens; add CTA cards with "Create your first…" flows. |
| U5 | **M** | Concurrent edits | `engine_projects` JSON columns (point_a, point_b, investment, blueprint, client_preview) | Last-write-wins. Two operators editing Point A simultaneously silently overwrite. No optimistic-lock / version column on writes. | Add `updated_at` optimistic check in the update server fn, or a per-column `version` int with `?on_conflict` semantics. |
| U6 | **L** | Sign-out UX | `src/routes/engine.tsx:77-80` | `signOut` navigates to `/auth` but doesn't invalidate the QueryClient. On a race, a stale protected query could 401 after sign-out. | Call `queryClient.clear()` (or the sign-out hygiene helper) before navigating. |
| U7 | **L** | Hydration mismatch | `src/components/ClientMarquee.tsx:67` (visible in console) | `data-tsd-source` line-column drift between SSR and client (13 vs 15). Cosmetic — no functional impact, but React warns loudly. | Remove or stabilize the data attribute in dev, or strip `data-tsd-source` from marquee children during SSR. |
| U8 | **L** | Client-facing PDF | `src/lib/roadmap-pdf.ts` invoked from Step 13 preview | Verify internal-only fields (`generation_provenance`, operator notes, `source_ids`) are excluded from the PDF export — same allowlist discipline as `getPortalRoadmapDocs`. | Manual check against `buildClientSafePayload` allowlist; add a unit test. |
| U9 | **L** | Route gates | `src/routes/engine.tsx:35-41` | Three parallel RPCs on every engine hit to check role. Fine, but cacheable per session. | Cache role in a client store or in TanStack Query with a stable key. |

---

## Prioritized fix plan

Ordered by risk × effort. Each item lists dependencies where relevant.

### Wave 1 — security-critical, small (1–2 turns)

1. **S1** — data-drive `client_portal_is_operator` (migration only). Unblocks onboarding a second operator without a code change.
2. **S2** — patch `operator_notification_reads` DELETE policy (migration).
3. **S3** — fix `suppressed_emails` policy role scope (migration).
4. **S4** — fix `isOperator` alias in `portal.functions.ts` (one-file change). Depends on S1 for the new operators to actually take effect.
5. **S5** — add ownership check to `resolvePortalFollowUp`.
6. **S6** — add HMAC verification to `build-roadmap-contact` public route. Requires a new secret via `add_secret`.

### Wave 2 — data integrity + defense-in-depth (2–3 turns)

7. **S7** — introduce a `throwGeneric(error, "message")` helper and replace raw `throw new Error(String(error.message))` sites across `engine-ops.functions.ts`, `engine-intelligence.functions.ts`, `engine-execution.functions.ts`, `engine-project-intake.functions.ts`.
8. **D1** — drop unused enum values `client_facing`, `needs_review` (or wire them). Coordinate with `D2`.
9. **D2** — populate `engine_roadmap_versions.published_portal_roadmap_id` on publish; add a `roadmap-publish` test.
10. **D3** — CHECK constraint on `client_portal_roadmaps.status`.
11. **U3** — audit `StepEditor` server-fn admin gate for step `preview`; harden if operator-writable.
12. **U5** — optimistic-lock on `engine_projects` JSON writes (Point A / B / investment / blueprint).

### Wave 3 — cleanup & UX polish (1–2 turns)

13. **S8**, **S10**, **S18**, **S19** — typing & hygiene fixes.
14. **S11–S13** — RLS documentation policies and comments.
15. **U1** — add missing `errorComponent` / `notFoundComponent` to every engine sub-route.
16. **U2** — refactor `buildCrumbs` from `NAV` map.
17. **U4** — empty states on 4 index screens.
18. **U6**, **U7**, **U9**, **S9**, **S14–S17**, **D4**, **D5** — batched low-priority cleanups.

### Wave 4 — nice-to-have + deferred from Wave 3

19. **D5** — new engine health-check dashboard row on `/engine` with `runEngineHealthCheck` server fn covering: stuck `ai_generated` versions older than N days, orphan `client_portal_roadmaps` rows pointing at deleted versions, and preview-ready-but-unapproved projects.
20. **S18** — webhook singleton refactor in `src/routes/api/public/payments/webhook.ts`. Replace the module-scope `createClient` with the shared lazy `supabaseAdmin`. Requires converting `getSupabase()` to async and updating ~15 call sites (`await getSupabase()`); batch under a single edit + full test run. Stylistic / defense-in-depth only — no behavior change.
21. **S8** — type all `context: any` parameters (starts at `src/lib/engine-agent.functions.ts`, plus the file-wide `eslint-disable no-explicit-any` in `engine-intelligence.functions.ts:1`) as `AuthenticatedContext` from `@/integrations/supabase/auth-middleware`. Large mechanical surface, no behavior impact; do in one sweep and verify with `tsgo --noEmit` before shipping.
22. **U4** — verify + polish empty states on `engine.projects.index.tsx`, `engine.templates.tsx`, `engine.intelligence.tsx`, `engine.review.tsx`. Existing screens render helpful empty UI in the filtered case; the gap is a fresh-workspace / zero-rows CTA card ("Create your first project", etc.) on each of the four index screens.

---

## Accepted / intentionally deferred

- **S17** (supabase linter warns on `authenticated` executing SECURITY DEFINER RPCs): every named RPC internally asserts `has_role` or an email allowlist. Add to `security-memory` so future scans don't re-flag.
- **`client_portal_messages`** table replaces legacy `portal_messages` — legacy already dropped per code comment `src/utils/portal.functions.ts:177`. Confirmed not a finding.
- Route gate 3-RPC role check (**U9**) — kept for now; correctness > micro-perf.

---

## What's NOT in this audit

Marketing site, portal client UI beyond the engine boundary, Stripe/payments internals, email queue internals, design polish, performance profiling beyond obvious N+1s.

## Verification methodology (for reproducibility)

- `bunx vitest run` — 208/208 pass
- `code--dependency_scan` — clean
- `security--get_scan_results` — no persisted findings (last cleanup: 2026-07-06)
- `supabase--linter` — 18 SECURITY DEFINER WARNs (S17)
- Two read-only sub-agents (`sub_9z76cchh` — server-fn audit; `sub_m4fas0yp` — RLS audit) with full source access
- Prior context: sub-agent `sub_xw76scw5` — roadmap approval workflow trace

---

## Phase 0 spine verification — 2026-07-07

User-requested pre-intake-redesign hardening pass. All four gaps verified closed
by prior waves; no new patches required. Evidence:

- **engine_sources.visibility default `internal_only`** — migration
  `20260704152247`; enforced live by `source-visibility-live.test.ts`.
- **Every insert sets `visibility` explicitly** — `createSource`,
  `submitPortalOnboarding`, `submitProjectIntake` all pass it; enforced by
  `source-visibility-defense.test.ts` (scans every `.from("engine_sources").insert`).
- **Portal onboarding → intelligence pipeline** — `submitPortalOnboarding`
  awaits `runIntelligencePipelineInternal(supabaseAdmin, …)`; regression-guarded
  by `onboarding-triggers-extraction.test.ts`.
- **Publish integrity** — `client_portal_roadmaps.approved_roadmap_version_id`
  (renamed from `source_version_id` in migration `20260704222007`) required by
  trigger `tg_client_portal_roadmaps_require_source_version`; `ai_generated`
  versions rejected; live-DB coverage in `portal-publish-e2e.test.ts` (two-client
  isolation), static coverage in `publish-column-integrity.test.ts`.
- **Partial project-record rollback** — `submitProjectIntake` rollback + failure
  logging guarded by `project-integrity-rollback.test.ts`.

Ran suite: 8 files / 52 tests / all pass (48.9s incl. 45s live-DB portal-publish).

Phase 0 signed off. Adaptive intake work is unblocked; Wave 4 (D5/S18/S8/U4)
remains queued.
