# Portal Onboarding Return Fix — Output

**Date:** 2026-07-10  
**File modified:** `src/lib/portal.functions.ts`  
**Task:** Verify and harden `submitPortalOnboarding` return value to prevent internal engine ID leakage.

---

## Findings

Inspected `submitPortalOnboarding` (lines ~1893–2056 after offset).

**Return was already clean.** The function already returned `{ ok: true as const }` with a comment noting that `engineSourceId` is intentionally not returned. No internal IDs (`engineSourceId`, `engineProj.id`, portal project ID, operator emails, version IDs) were exposed to the portal client caller.

The `engineSourceId` variable is:
- Used internally to trigger `runIntelligencePipelineInternal` (fire-and-forget)
- Written into `engine_activity.body` and `engine_audit_log.metadata` (server-side only)
- **Never** returned in the function's response

---

## Change Made

Enhanced the existing comment at the return statement to match the canonical wording required by the audit standard:

**Before:**
```typescript
// NOTE: engineSourceId is intentionally NOT returned — engine-internal
// identifiers never cross the portal boundary to the client caller.
return { ok: true as const };
```

**After:**
```typescript
// Portal-facing return: never expose internal engine IDs to client context.
// engineSourceId, engineProj.id, and other engine-internal identifiers are
// intentionally omitted — they must never cross the portal boundary to the
// client caller.
return { ok: true as const };
```

---

## Test Results

```
✓ src/lib/__tests__/portal-context-leaks.test.ts (8 tests) 5ms
Test Files  1 passed (1)
      Tests  8 passed (8)
   Duration  667ms
```

All 8 portal context leak tests passed. ✅

---

## Verdict

**No data leak present.** The return value was already minimal (`{ ok: true }`). The comment was updated to use the canonical audit-standard wording. No functional code changes were required.
