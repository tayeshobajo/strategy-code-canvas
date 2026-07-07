# Production Readiness — What's Still Pending

Waves 1–3 of the engine audit are shipped. What remains before the app is production-ready falls into three buckets.

## 1. Wave 4 (already scoped, not yet executed)

From `.lovable/engine-audit-2026-07.md`:

- **D5 — Engine health-check dashboard.** New admin row on `/engine` backed by `runEngineHealthCheck` server fn covering: stuck `ai_generated` versions older than N days, orphan `client_portal_roadmaps` rows pointing at deleted versions, and preview-ready-but-unapproved projects.
- **S18 — Payments webhook singleton refactor.** Replace module-scope `createClient` in `src/routes/api/public/payments/webhook.ts` with shared lazy `supabaseAdmin`; convert `getSupabase()` to async and update ~15 call sites. Defense-in-depth, no behavior change.
- **S8 — Type `context: any` as `AuthenticatedContext`.** Sweep `engine-agent.functions.ts` and remove the file-wide `eslint-disable no-explicit-any` in `engine-intelligence.functions.ts:1`.
- **U4 — Zero-state CTAs.** Add fresh-workspace CTA cards on `engine.projects.index.tsx`, `engine.templates.tsx`, `engine.intelligence.tsx`, `engine.review.tsx`.

## 2. Low-priority audit items still open

Batched cleanup deferred through Waves 1–3:

- **S9** — warn/throw when `PUBLIC_SITE_URL` env is missing (silent prod-URL fallback in staging/local).
- **S14** — column-level UPDATE grant on `client_portal_messages` so clients can't reassign `project_id`.
- **S15** — drop dead `service_role manages intake failures` policy on `engine_project_intake_failures`.
- **S16** — wrap repeated `client_portal_permissions` subquery in a `get_permitted_project_ids()` SECURITY DEFINER helper (perf, not correctness).
- **D4** — durable DLQ table for `tg_client_portal_files_fanout_engine` / `tg_client_portal_messages_notify_operators` fan-out failures.
- **U6** — call `queryClient.clear()` on sign-out in `src/routes/engine.tsx`.
- **U7** — stabilize/strip `data-tsd-source` on `ClientMarquee` to kill the SSR hydration warning.
- **U8** — unit test that `roadmap-pdf` export honors the `buildClientSafePayload` allowlist (no `generation_provenance` / operator notes / `source_ids` leak).
- **U9** — cache the 3-RPC role check per session (micro-perf).

## 3. Out of audit scope but required for "production-ready"

These were explicitly excluded from the engine audit and haven't been separately validated:

- **Payments go-live.** Stripe is wired but the live-mode readiness (`payments--get_go_live_status`) hasn't been confirmed. Verification, provider approval, and live webhook secret needed before real checkout works.
- **Email domain verification.** Confirm `notify.trusttai.com` DNS is `active` (not `awaiting_dns` / `provisioning_failed`) so auth + transactional emails actually send in prod.
- **Publish visibility + badge.** Confirm published visibility is `public` (not `private`) and decide on the "Edit with Lovable" badge.
- **Portal client UI + marketing site smoke pass.** Audit covered engine only — the client-facing portal roadmap flow and public marketing pages haven't had an equivalent security/data/UX pass this cycle.
- **Analytics / error reporting.** Confirm `lovable-error-reporting` is capturing prod errors and there's a review cadence.
- **Backup / restore drill.** No documented restore-from-backup runbook.

## Recommended sequencing

1. Wave 4 items D5 → S18 → S8 → U4 (unblocks admin ops visibility + finishes engine surface).
2. Batch the Wave 3 low-priority cleanups (S9, S14–S16, U6–U9, D4) in one turn.
3. Non-engine gates: payments go-live check, email domain status, publish visibility. These are tool calls / dashboard checks, not code — I can run them and report back.
4. Portal + marketing audit as a separate scoped pass.

## Ask before I proceed

Do you want me to:
- **(a)** execute Wave 4 now (D5 + S18 + S8 + U4),
- **(b)** run the non-code production checks first (payments go-live, email domain, publish visibility) and report,
- **(c)** kick off a portal-side audit equivalent to the engine one, or
- **(d)** all three in sequence?
