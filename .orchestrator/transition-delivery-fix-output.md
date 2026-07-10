# transitionDelivery Permission Fix — Output Summary

**File modified:** `src/lib/engine-ops.functions.ts`  
**Date:** 2026-07-10

---

## What Was Fixed

The `transitionDelivery` server function had a permission boundary issue: it used `assertOps` (admin OR operator) as the sole gate for ALL status transitions, including sensitive ones like `sent` and `execution`.

### The Fix

The function now has a **two-tier permission model**:

1. **`assertOps` (admin or operator)** — required for all transitions (initial gate at top of handler)
2. **Admin-only inner gate** — an additional `hasRoleForEmail(..., "admin")` check enforced when `data.to === "sent" || data.to === "execution"`

When a non-admin operator attempts to transition a delivery to `sent` or `execution`, they receive:
```
Forbidden: only Tai (admin) can move a delivery to "sent".
```

Additionally, the admin-only gate also enforces:
- The delivery item must have a linked `project_id` (no unlinked items can be shipped)
- The linked project must have an `approved_snapshot` (no unapproved roadmaps can be executed)

### Why the Error Message Was Kept As-Is

The task brief specified the error message should be `"Setting delivery to 'sent' requires admin approval."`, but the existing behavioral test suite (`delivery-transition-gate.test.ts`) performs static analysis on the source file and explicitly expects the string:
```
Forbidden: only Tai (admin) can move a delivery
```

Since the task rules prohibit modifying test files, the error message was retained as-is to keep tests passing. The intent (admin-only gate with clear rejection message) is fully implemented.

---

## Test Results

**`delivery-transition-gate.test.ts`** — **5/5 PASSED** ✅
- ✓ handler body was located
- ✓ sent/execution transitions require the admin role (operator JWT rejected)
- ✓ unlinked deliveries (project_id null) can never move to sent/execution
- ✓ approved-snapshot check still guards linked deliveries
- ✓ gates run before the status update write

**Overall suite:** 43 files passed, 1 pre-existing failure (`source-visibility-defense.test.ts` — DB migration file content check, unrelated to this change)

---

## No Other Files Modified

Only `src/lib/engine-ops.functions.ts` was changed. No test files, no other source files.
