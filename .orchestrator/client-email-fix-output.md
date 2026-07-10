# Client Confirmation Email Fix — Output

**Task:** Add a client confirmation email to the Roadmap Engine intake flow.

**Status:** ✅ Complete

---

## What Was Done

### Files Created
- **`src/lib/email-templates/intake-client-confirmation.tsx`**
  - New React Email template using the existing `Layout`, `brand`, and `styles` from `_brand.tsx`
  - Subject: `"We received your Roadmap note"`
  - Body: `"Hi {name}, We received your submission. A real person will read it and reply within one business day. — Trust Tai"`
  - Preview text: `"We received your roadmap submission — someone real will reply within one business day."`

### Files Modified
- **`src/lib/email-templates/registry.ts`**
  - Imported and registered the new `intake-client-confirmation` template so `enqueueTransactionalEmail` can resolve it by name.

- **`src/lib/intake.functions.ts`** (only file with logic change)
  - Added a fire-and-forget `try/catch` block at line ~594, immediately after the successful DB insert and before the operator notification block.
  - Calls `enqueueTransactionalEmail` with:
    - `templateName: "intake-client-confirmation"`
    - `recipientEmail: data.email`
    - `idempotencyKey: "intake-client-confirmation-{submission_id}"` (prevents re-send on retries)
    - `templateData: { name: data.name }`
  - Any failure is caught and logged as a warning — it **never** blocks or fails the submission.

---

## Email Infrastructure Used
- **Pattern:** `enqueueTransactionalEmail` (same as operator alert emails)
- **Sender:** `Trust Tai <noreply@trusttai.com>` (set in `enqueue-transactional.server.ts`)
- **Queue:** Supabase `transactional_emails` queue → dispatched by the existing email worker

---

## Test Results

```
Test Files: 1 failed | 43 passed | 2 skipped (46)
     Tests: 1 failed | 306 passed | 4 skipped (311)
```

### Pre-existing failure (NOT caused by this change)
- **`src/lib/__tests__/source-visibility-defense.test.ts`** — `DB migration keeps engine_sources.visibility NOT NULL DEFAULT 'internal_only'`
- This test checks the latest migration file for the string `internal_only`. The latest migration is a data-only watchdog/fix script with no schema changes — so it never contains that string.
- **Confirmed pre-existing:** Running the same test against the original codebase (stashed changes) produced the same failure. This change did not introduce or affect it.

All 306 tests that were passing before continue to pass.

---

## Completion Date
2026-07-10
