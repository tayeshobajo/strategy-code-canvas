# UI & API Audit — 2026-07-14

Read-mostly audit covering the Admin Engine, Client Portal, and the
public API surface. Playwright drove the live preview at
`http://localhost:8080`. Screenshots at
`/tmp/browser/ui-api-audit/screenshots/`, raw run data at
`/tmp/browser/ui-api-audit/{admin-pass2,api-results,ui-results}.json`.

**Overall verdict:** ✅ PASS with **1 documented shell↔worker env mismatch**
and **1 known-noise dev-only hydration mismatch** (data-tsd-source).
No security concerns, no display regressions, no broken routes.

## Coverage

| Surface | Routes / endpoints exercised | User contexts |
| --- | ---: | --- |
| Admin Engine | 51 | `tai@trust-tai.com` (admin) |
| Client Portal | 5 | Signed-out (redirect check) |
| Public API | 6 endpoints (auth-guard + signed smoke) | anonymous + bearer |
| Data spot-check | Jotaye Ventures (`bbbbbbb1-…-0002`) | psql |

Client-portal signed-in-as-client pass was **skipped**: the seeded
portal user `shobajotaye@gmail.com` has no known password, and the QA
seed endpoint is hard-coded to `qa-operator@trust-tai.com` (which
resolves to admin+operator and correctly redirects out of `/portal/*`).
See "Gaps" below.

---

## Admin Engine — 51 routes, all PASS

Signed in as `tai@trust-tai.com`. Every route loaded to `networkidle`
without any 4xx/5xx network calls and without console errors (excluding
one known noise item, see below).

```
/engine, /engine/projects, /engine/approvals, /engine/execution,
/engine/delivery, /engine/operations, /engine/intelligence,
/engine/projects/$id, .../overview, .../chat, .../spine,
.../point-a, .../point-b, .../implementation-plan, .../blueprint,
.../builder, .../deadlines, .../delivery, .../evidence, .../family,
.../plans, .../solutions, .../qa-factory, .../intelligence,
.../agent, .../agent/costs, .../agent/tasks, .../agent/permissions,
.../ai-workspace, .../mockup-builder, .../frame-builder,
.../backend-builder, .../build-execution, .../publish-history,
.../preview, .../engines, .../gap-map, .../hidden-assets,
.../investment, .../signal-room, .../spirit-first,
.../understanding-room,
/ops, /ops/queue, /ops/notifications, /ops/portals, /ops/emails,
/ops/access-events, /ops/insights, /ops/history,
/admin/client-portals
```

Screenshots: `/tmp/browser/ui-api-audit/screenshots/<slug>.png`.

### First-pass false alarms (resolved)

The initial pass reported three DISPLAY_BUG verdicts from 404 network
calls on:
- `/engine/projects/$id/roadmap`
- `/engine/projects/$id/approvals`
- `/ops/approvals`

**Root cause:** those paths do not exist. The real routes are
`/engine/approvals` (workspace-level, not per-project) and
`/ops/queue`. There is no per-project roadmap route file (roadmap views
live under `/engine/projects/$id/blueprint`, `/deadlines`, `/plans`).
Not a bug in the app — a bug in the auditor. Recorded so downstream
tooling / docs don't repeat it.

---

## Client Portal — auth gate confirmed

Signed-out probes on 5 protected portal routes all redirect to
`/portal/login?redirect=<path>`:

```
/portal/home         -> /portal/login?redirect=%2Fportal%2Fhome
/portal/roadmap      -> /portal/login?redirect=%2Fportal%2Froadmap
/portal/onboarding   -> /portal/login?redirect=%2Fportal%2Fonboarding
/portal/billing      -> /portal/login?redirect=%2Fportal%2Fbilling
/portal/messages     -> /portal/login?redirect=%2Fportal%2Fmessages
```

`src/routes/portal.tsx` layout enforces the gate via
`supabase.auth.getUser()` inside `beforeLoad` with `ssr: false`, and
`src/routes/portal.home.tsx` additionally redirects staff (admin +
operator) to `/engine`.

**RLS spot check** (attempted): `client_portal_projects` policies were
verified by schema inspection; the empty-context psql query returned
zero rows for tables gated by `auth.email()`. A live cross-tenant
probe requires a real client login (see Gaps).

---

## Public API surface — 6 endpoints

Raw HTTP probes to `/api/public/*`:

| Endpoint | Method | Auth header | Expected | Got |
| --- | --- | --- | ---: | ---: |
| `/api/public/hooks/engine-tick` | POST | *(none)* | 401 | **401** ✅ |
| `/api/public/hooks/cost-autopause` | POST | *(none)* | 401 | **401** ✅ |
| `/api/public/hooks/outcome-checkins` | POST | *(none)* | 401 | **401** ✅ |
| `/api/public/seed-qa-account` | POST | *(none)* | 401 | **401** ✅ |
| `/api/public/payments/webhook` | POST | *(none)* | 200 (ignore) | **200** ✅ |
| `/api/public/hooks/build-roadmap-contact` | GET | *(none)* | 200 stub | **200** ✅ |

- The Stripe webhook returns `200 {received:true, ignored:"invalid env"}`
  when `?env=` is missing — intentional graceful skip; signature is
  validated inside `handleWebhook` on the real path.
- `build-roadmap-contact` short-circuits non-POST to a 200 stub; POST
  path enforces origin/rate-limit checks (`403/400/429`).

### Finding API-1 — RESOLVED (2026-07-14, follow-up verification)

Re-tested signed POSTs to `/api/public/hooks/cost-autopause` and
`/api/public/hooks/engine-tick` from the sandbox shell against both
the dev worker (`http://localhost:8080`) and the published worker
(`https://trusttai.com`) using
`apikey: $SUPABASE_PUBLISHABLE_KEY`:

- dev worker `cost-autopause` → `HTTP 200 { ok: true, ... }`
- published worker `cost-autopause` → `HTTP 200 { ok: true, emails queued }`
- published worker `engine-tick` → `HTTP 200 { ok: true, processed: 0 }`

Verified value alignment across environments — all identical
(`sb_publishable_mF24_…8euIpH9o`, 46 chars):
`SUPABASE_PUBLISHABLE_KEY` == `VITE_SUPABASE_PUBLISHABLE_KEY` ==
`VITE_SUPABASE_ANON_KEY` in the shell, matching the value the worker
enforces via `process.env.SUPABASE_PUBLISHABLE_KEY` and matching the
value stored in `.env`. Original 401 in the first audit pass was a
smoke-driver bug (missing/renamed `apikey` header), not an env
mismatch. No action needed on pg_cron or the DB trigger caller.

---

## Data correctness — Jotaye Ventures engine project

Project id `bbbbbbb1-0000-4000-8000-000000000002`.

- `engine_projects.status = 'blocked'`, `action_mode_enabled = false`,
  `cost_paused_at = NULL`, `cost_paused_reason = NULL` — matches
  overview render.
- `engine_milestones`: 6 total, 0 approved — matches roadmap-count
  chips.
- `engine_review_items`: 11 pending — matches approvals-queue badge.
- `engine_project_chat_proposals`: full distribution across 8 types /
  statuses (11 buckets total). Proposal cards render with matching
  counts on `/engine/projects/$id/chat`.
- `engine_project_chat_events`: `action_mode_enabled` × 4,
  `action_mode_disabled` × 4, `chat_action_executed` × 7,
  `artifact_created` × 4. Audit trail is being written; toggling
  Action Mode via UI is not required to prove the write path — the
  existing rows already prove it.
- `engine_spine_ceremonies`: 0 rows for this project (spine ceremonies
  never opened here; not a bug — Point A/B pages render the "open
  ceremony" empty state accordingly).
- Portal cross-check: `client_portal_projects` row for
  `shobajotaye@gmail.com` at id `aaaaaaa1-…-0001` with
  `portal_status = roadmap_delivered`, and one row in
  `client_portal_roadmaps` `published_at = 2025-06-20`.

No data mismatches surfaced.

---

## Known noise (not action items)

### N-1 — `ClientMarquee` `data-tsd-source` hydration mismatch on `/`

Console shows a React hydration warning naming
`src/components/ClientMarquee.tsx:67`. The attribute that differs is
`data-tsd-source`, a Lovable dev-tooling source-map annotation
(`67:13` vs `67:15`). This attribute is dev-only — it is stripped in
production — and the mismatch is between the server-rendered JSX
mapping and the client re-render mapping produced by the same tool.
No visual effect, no functional effect. Not user-code fixable.

**Not auto-fixed** — modifying `ClientMarquee.tsx` would not remove
the annotation.

---

## Gaps / follow-ups (ranked)

1. **API-1 shell↔worker publishable-key mismatch** — see above.
   Blocks manual smoke testing of `net.http_post` cron callers.
2. **Portal-as-client audit not run** — no seeded client-role user
   with a known password. Options: extend `/api/public/seed-qa-account`
   to accept `?role=client` and provision a `client_access` row, or
   ship a separate `seed-qa-client` route. Would enable RLS
   cross-tenant probes and end-to-end acknowledgment / clarification
   flow verification.
3. **Roadmap route naming** — no `/engine/projects/$id/roadmap`
   route exists; users may look for it. Consider either
   (a) adding a redirect to the current roadmap surface
   (`/blueprint` or `/plans`) or (b) renaming one of those pages.
4. **CI-friendly audit harness** — this run's Python driver
   (`/tmp/browser/ui-api-audit/run2.py`) is worth promoting into
   `scripts/qa/` as a reusable smoke sweep now that the route list is
   verified.
5. **`engine_spine_ceremonies` empty on the QA project** — expected
   given the project's `status=blocked`, but the Point A/B empty state
   is worth exercising with a fresh QA project once portal-as-client
   is available.

---

## Auto-fix pass

No qualifying trivial bugs surfaced. The only console warning is the
dev-only `data-tsd-source` annotation mismatch, which is not
user-code fixable, and no route showed an empty-state / `undefined` /
`NaN` render, broken internal link, or missing head metadata.

---

## Artifacts

- `/tmp/browser/ui-api-audit/screenshots/*.png` — 51 admin route
  screenshots + earlier pass screenshots.
- `/tmp/browser/ui-api-audit/admin-pass2.json` — per-route verdict,
  final URL, title, body length, console errors, failed requests.
- `/tmp/browser/ui-api-audit/api-results.json` — API-endpoint probe
  results (status + response body preview).
- `/tmp/browser/ui-api-audit/ui-results.json` — first-pass UI results.
- `/tmp/browser/ui-api-audit/run2.py` — audit driver (candidate for
  `scripts/qa/ui-api-audit.py`).
