# authorizes_scan Fix — Output Summary

**Date:** 2026-07-10  
**Files modified:** `src/routes/build-my-roadmap.index.tsx` only  
**Files reviewed (no changes needed):** `src/routes/build-my-roadmap.write.tsx`

---

## What Was Done

### Problem
`authorizes_scan` was hardcoded to `false` in the public intake wizard submission payload (`build-my-roadmap.index.tsx`, line ~781). Users had no way to grant scan consent, making the feature permanently dead.

### Root Cause
The `write.tsx` route already had the full pattern — `authorizesScan` state, a prop-drilled checkbox, and the value wired into the payload. The `index.tsx` route (public-facing wizard) never received this treatment; the field was just hardcoded.

---

## Changes Made to `build-my-roadmap.index.tsx`

### 1. Added state variable (line ~362)
```tsx
const [authorizesScan, setAuthorizesScan] = React.useState<boolean>(false);
```

### 2. Wired state into submission payload (line ~781)
```tsx
// Before:
authorizes_scan: false,

// After:
authorizes_scan: authorizesScan,
```

### 3. Passed props to `ConsentStep` call site
```tsx
<ConsentStep
  consent={consent}
  setConsent={setConsent}
  authorizesScan={authorizesScan}        // NEW
  setAuthorizesScan={setAuthorizesScan}  // NEW
  website={contact.website}              // NEW
  status={status}
  onBack={() => setStep(STEP_REVIEW)}
  onSubmit={onSubmit}
  onRetry={onRetrySubmit}
/>
```

### 4. Updated `ConsentStep` component signature
Added `authorizesScan`, `setAuthorizesScan`, and `website` to both the destructured params and the TypeScript prop type.

### 5. Added scan consent checkbox to `ConsentStep` UI
Conditionally rendered only when the user has entered a website (mirrors the `write.tsx` pattern exactly):
```tsx
{website.trim() && (
  <label className="mt-4 flex items-start gap-3 text-[14px] leading-[1.7] text-ink/75">
    <input
      type="checkbox"
      checked={authorizesScan}
      onChange={(e) => setAuthorizesScan(e.target.checked)}
      className="mt-[5px] h-4 w-4 accent-[#2563FF]"
    />
    <span>
      I authorize Trust Tai to scan my website for additional context before our conversation.
    </span>
  </label>
)}
```

---

## Consistency Check — `build-my-roadmap.write.tsx`
No changes needed. `write.tsx` already uses `authorizesScan` state + checkbox + payload wiring correctly. The two routes are now consistent.

---

## Build Verification
```
npx tsc --noEmit --pretty false 2>&1 | grep -i "build-my-roadmap" | head -10
```
**Result:** Zero errors for `build-my-roadmap` files. (Pre-existing unrelated TS errors exist in `portal.roadmap.tsx`; not introduced by this change.)

---

## UX Behavior
- Checkbox defaults to **unchecked** (`false`) — scan consent NOT granted by default
- Checkbox is **only shown** when the user has entered a website URL (no website = no scan prompt)
- Checking the box sets `authorizes_scan: true` in the submitted payload
- Placement: immediately below the main consent checkbox in the `ConsentStep` view
