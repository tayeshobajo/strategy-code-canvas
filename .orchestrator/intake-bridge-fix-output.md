# Intake → Project Creation Bridge Fix
**File:** `src/lib/ops.functions.ts`
**Date:** 2026-07-10

## Status: ✅ COMPLETE

## What Was Done

The intake-to-project-creation bridge was implemented in `src/lib/ops.functions.ts`. The fix adds:

### 1. `createProjectFromSubmission()` (new private async function, lines ~456–622)

A self-contained bridge function with the following flow:

1. **Client resolution/creation** — looks up `engine_clients` by submission contact email. If no existing client, creates one with `company`, `contact_email`, `primary_contact`, and `owner_email`.

2. **Submission answers → raw_text** — maps `submission.answers` (array of `{ key, question, response }`) to formatted Q&A text, filtering out internal keys prefixed with `_`.

3. **Project creation** — inserts into `engine_projects` with:
   - `status: "intake"`, `current_step: "signal"`, `agent_status: "inactive"`
   - `signal_room` JSONB includes `intake_submission_id`, `intake_bridged_at`, `intake_bridged_by` for traceability
   - `delivery_mode` set based on whether contact email is present
   - Project name: `"<Business> — Roadmap"` or `"<Name> — Roadmap"`

4. **Sibling rows** — uses `Promise.allSettled()` (non-fatal) to insert:
   - `engine_project_agents` (Roadmap Agent, draft policy)
   - `engine_agent_permissions` (draft_only)
   - `engine_roadmap_versions` (v0.0 draft)
   - `engine_activity` (project_created event)

5. **Source creation + intelligence pipeline** — inserts `engine_sources` row with:
   - `type: "brief"`, `raw_text` from answers, `visibility: "internal_only"`
   - Calls `runIntelligencePipelineInternal(sb, { projectId, sourceIds, actorEmail })`
   - Pipeline failure logs an `engine_activity` error record but does NOT throw

6. **Audit trail** — writes `bridged_to_engine` to `review_audit_log` on the intake project

7. **Hard try/catch** — any failure returns `null` without throwing; the approval is never rolled back

### 2. `approveSubmission` handler — bridge call (lines ~735–776)

After the approval status flip and email enqueueing:

```typescript
const bridgeResult = await createProjectFromSubmission(
  submission as IntakeSubmissionRow,
  operatorEmail,
  data.submission_id,
);
```

**On success:**
- Updates `roadmap_intake_reviews.artifact` JSONB to include `engine_project_id` (soft error — won't throw)
- Writes `bridged_to_engine` audit action with the project ID

**On failure:**
- Logs a `console.warn` with "— project must be manually created at /engine/projects/new"
- Writes `bridge_failed` audit action with a manual retry note
- Approval remains committed

**Return value extended:**
```typescript
return { ok: true, notified: !enqErr, engine_project_id: bridgeResult?.project_id ?? null };
```

## Test Results

```
Test Files  1 failed | 43 passed | 2 skipped (46)
      Tests  1 failed | 306 passed | 4 skipped (311)
```

### Pre-existing failure (not introduced by this fix)
`src/lib/__tests__/source-visibility-defense.test.ts` — **1 test** failing on:
```
expect(contents).toMatch(/internal_only/)
```
This test checks that the **latest** migration touching both `engine_sources` and `visibility` explicitly contains `NOT NULL DEFAULT 'internal_only'`. The latest such migration (`20260708174603`) is a hotfix that does UPDATE/DELETE operations — it doesn't restate the column definition. **This failure existed before this PR** (confirmed via `git stash` + re-run).

**Our bridge insert correctly sets `visibility: "internal_only"` explicitly** and passes the companion test that scans all `engine_sources` inserts in `src/`.

## Files Modified

| File | Change |
|------|--------|
| `src/lib/ops.functions.ts` | +186 lines: `createProjectFromSubmission` function + bridge call in `approveSubmission` + extended return type |

No migrations, test files, or other source files were touched.

## Defensive Properties

- ✅ Approval is committed before bridge runs — failure cannot roll back approval
- ✅ Pipeline failure logs to `engine_activity` but does not surface to operator
- ✅ Client de-duplication by email prevents duplicate `engine_clients` rows
- ✅ Sibling row creation uses `Promise.allSettled` — partial failures don't abort
- ✅ `engine_sources.visibility` explicitly set to `"internal_only"` (satisfies G-2/G-3 guard)
- ✅ `engine_project_id` stored on review artifact for ops console deep-linking
- ✅ `bridge_failed` audit record created on failure for manual retry identification
