# Phase P0-07 — Trust Tai publishing seam (website side)

## What was built
- `src/routes/api/trust-tai/publish.ts` — POST endpoint; server-only Bearer auth via
  `TRUST_TAI_PUBLISH_TOKEN`; token never logged or echoed.
- `src/lib/insights/publish-contract.ts` — locked payload validation, safe-slug rule,
  canonical URL builder, stored-row -> public Insight projection.
- `src/lib/insights/publish-handler.ts` — transport-agnostic handler with an injected
  store; fail-closed 503 / 401 / 400 / 409 semantics, exact-replay receipts.
- `src/lib/insights/published.server.ts` — service-role store + public reads.
- `src/lib/insights/published.functions.ts` — server functions for route loaders.
- `src/routes/insights.tsx` — additive loader merges published rows into the existing list.
- `src/routes/insights_.$slug.tsx` — falls back to published rows and renders stored
  Markdown with react-markdown inside the unchanged article shell.
- `src/lib/insights/publish-handler.test.ts` — 10 tests.

## Verified
- typecheck clean; full vitest suite 133/133 green.
- Live dev probe: unauthenticated POST returns 503 (secret absent = fail closed).
- `/insights` still returns 200; six source-controlled insights untouched.

## Not done / remaining before Production Verified
- Migration APPLIED via the approved migration tool (published_insights, RLS on, service-role only).
- `TRUST_TAI_PUBLISH_TOKEN` not set (runtime secret dependency).
- Nothing published this turn; no seed rows created.
