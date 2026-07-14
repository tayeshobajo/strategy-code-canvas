# Phase H2b — Family-Impact Idempotency Hardening

**Status:** ✅ Complete. No schema changes.

## What shipped

- `src/lib/engine-family-impact.functions.ts`
  - Added `fingerprintBlocker({ parentId, childId, reason })` — deterministic djb2 hash exposed for tests and observability
  - Every scan emission now carries a `fingerprint` field in its result
  - Insert path writes the fingerprint into `engine_activity.body` for durable auditability (existing per-title pending-item dedupe kept as the primary guard)
- `src/lib/engine-family-impact.test.ts` — new vitest suite locking in fingerprint determinism, sensitivity to parent/child/reason changes, and the readable `_reason` suffix (3 tests, all green)

## Verified behavior

- Repeat scans of the same family produce zero new items — existing pending-title dedupe already covered this; the fingerprint gives us a stable, reason-scoped identifier that survives future title-format changes.
- Closing an open review item allows re-emission on the next scan (existing behavior, unchanged).
- Unrelated family changes do not trigger duplicate items (existing behavior, unchanged).

## Guardrails

- Staff-gated (unchanged).
- No schema changes.
- Existing per-scan `emitted` / `skipped` counts already surface in `src/routes/admin.family-impact.tsx`.
