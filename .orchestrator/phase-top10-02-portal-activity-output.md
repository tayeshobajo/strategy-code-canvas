# Phase 2 — Portal activity tracking (Top-10 sweep)

**Status:** application-tier COMPLETE. No schema change.

## What shipped

- `src/lib/portal-activity.functions.ts` — authenticated `logPortalActivity`
  serverFn. Single centralized writer for `client_portal_activity`. Validates
  `kind ∈ { viewed, downloaded, replied, follow_up_needed, acknowledged }`,
  and maps the acceptance-criteria fields (`subject_type`, `subject_id`) onto
  the existing 9-column table via metadata. Delegates to the existing
  `log_client_portal_activity` SECURITY DEFINER RPC so RLS/audit shape is
  unchanged.
- Wired into `src/components/portal/RoadmapAcknowledgmentBanner.tsx`:
  - `viewed` emitted once per banner mount (ref-guarded, non-blocking).
  - `acknowledged` mirrored after a successful `recordPortalRoadmapEvent`.

## Gap-#1 acceptance criteria coverage

| Item | Status |
|---|---|
| DB — no schema change | PASS (uses existing table + RPC) |
| Server fn `logPortalActivity` | PASS |
| UI writers (roadmap acknowledge/view) | PARTIAL — roadmap banner wired; files, messages, home surfaces to follow in a UI-only pass |
| UI readers — `portal.activity.tsx` already lists all `event_type`s | PASS (no change needed) |
| Audit — `client_portal_activity` IS the audit | PASS |
| Tests | PENDING — deferred to Phase 12 verification pass |

Remaining UI wiring (files/messages/home) is presentation-layer only and does
not affect the server-fn contract. Landing separately keeps the diff small
and reviewable.

## Notes

- The helper stores `subject_type` + `subject_id` inside `metadata`. If Tai
  wants first-class columns, that becomes a follow-up migration; the audit
  criteria explicitly says "No schema change; use existing 9-column table."
- `actor_email` is derived from the authenticated Supabase claims — never
  trusted from the client.
