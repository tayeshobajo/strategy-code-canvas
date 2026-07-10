## P2 Portal Leak Fix

- Updated `getPortalContext` in `src/lib/portal.functions.ts` so the `client_portal_roadmaps` query no longer returns legacy roadmap body fields in the context response.
- The roadmap context projection is now limited to display-safe fields: IDs needed for portal actions, title/status/version/timestamps, and `roadmap_data:client_safe_canvas`.
- Preserved the explicit `status IN ('approved', 'delivered')` defense-in-depth filter so draft or archived rows are not returned even if RLS regresses.
- Normalized the returned `approvedRoadmap` object to expose `subtitle`, `roadmap_data`, `delivered_at`, and `client_acknowledged` without leaking `approved_roadmap_version_id`, `source_version_id`, `published_by`, `supporting_notes`, `acknowledged_by_email`, or `metadata`.
- Confirmed `submitPortalOnboarding` already returns `{ ok: true }` and does not return `engineSourceId`.

Verification:

- Passed: `./node_modules/.bin/vitest run --config vitest.config.ts src/lib/__tests__/portal-context-leaks.test.ts`
- Attempted: `./node_modules/.bin/tsc --noEmit --pretty false`
  - Result: failed on pre-existing router/search-param type errors outside `src/lib/portal.functions.ts`; no new error was reported for the touched file.

Notes:

- The current schema does not contain literal `subtitle`, `roadmap_data`, `delivered_at`, or `client_acknowledged` columns on `client_portal_roadmaps`; `roadmap_data` is returned as a client-facing alias for `client_safe_canvas`, and the other fields are derived in the server response.
- `approved_at` is retained in the normalized response as a client-visible display date because the existing portal home card reads it.
