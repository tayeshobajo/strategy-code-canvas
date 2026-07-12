## Goal

Get the build green on the three flagged files and lock in the two recent behavioral fixes (Approvals mutations + Plans navigation) with automated tests.

## Changes

### 1. `src/lib/engine-chat-proposal-approve.functions.ts`
The errors come from strongly-typed `supabaseAdmin` rejecting our loose payloads (`string | null` where `string` expected, `unknown[]` where `Json` expected, and `never`-typed update fields).

- Cast the three write payloads with `as never` (mirrors the pattern already used elsewhere in this repo, e.g. `engine-decision-log.functions.ts`):
  - `.insert({...} as never)` on `engine_tasks`
  - `.update({...} as never)` on `engine_review_items`
  - `.update({...} as never)` on `engine_milestones`
- Cast the `acceptance_criteria: ac` shape by giving `ac` an explicit `unknown[] → any[]` before insert, or fold it into the same `as never` cast.

Only the payload objects change — logic, validation, and audit calls stay identical.

### 2. `src/lib/engine-decision-log.functions.ts`
Errors 133/164/192/220/262: excessive type instantiation from casting the real `SupabaseClient` to hand-rolled shapes.

- Delete the three ad-hoc `supabase` re-typings at lines 133, 164, 192, 262.
- Use a single `// eslint-disable-next-line @typescript-eslint/no-explicit-any` + `const sb: any = context.supabase;` at the top of each handler.
- Type `q: any` for the chained filter builder (already partly done) and annotate the awaited result explicitly:
  ```ts
  const { data: rows, error, count } = (await q) as { data: RawRow[] | null; error: unknown; count: number | null };
  ```
- In `getDecisionLogStats`, do the same `any` escape hatch for the single `from().select().in()` chain.

Runtime behavior is unchanged; only the type shell around Supabase calls is simplified.

### 3. `src/routes/admin.decision-log.tsx`
- Import `keepPreviousData` from `@tanstack/react-query`.
- Replace `keepPreviousData: true` with `placeholderData: keepPreviousData` on the `useQuery` at line 78 (the TanStack v5 equivalent).
- No other changes.

### 4. New test — Approvals queue persistence
File: `src/routes/__tests__/engine-approvals-persistence.test.ts` (source-scan style, matching the existing guard tests in `src/lib/__tests__/`).

Assert against `src/routes/engine.approvals.tsx`:
- Imports `useMutation` and `useServerFn` and `decideReviewItem` from `@/lib/engine-ops.functions`.
- Approve / Reject / Request Revision buttons each call the mutation (not a local `setDismissedIds` handler).
- No `window.alert` or purely-local dismiss state remains.

Then a behavioral test against `decideReviewItem` in `src/lib/engine-ops.functions.ts` (source-scan, matches `review-item-and-publish-gates.test.ts`):
- Its handler writes to `engine_review_items` (`.update({ status: ... })`).
- Its handler writes an `engine_audit_log` row.
- Its handler writes an `engine_activity` row.

This mirrors the audit-guard test style already in the repo and doesn't require a live Supabase.

### 5. New test — Plans "Start planning" navigation
File: `src/routes/__tests__/plans-start-planning-nav.test.ts`.

Source-scan against `src/routes/engine.projects.$projectId.plans.tsx`:
- No `window.alert` remains.
- The Start-planning / Prepare-this controls are `<Link>` (from `@tanstack/react-router`) with `to="/engine/projects/$projectId/milestones/$milestoneId/brief"` and `params` containing `projectId` and `milestoneId`.
- The target route file `src/routes/engine.projects.$projectId.milestones.$milestoneId.brief.tsx` exists.

## Out of scope

- The other TS errors visible in the earlier build output (`WorkspaceHeader`, portal `BookCallModal` / `ClarificationModal` / `DecisionResponseModal` `to="/portal/messages"` missing `search`, admin `outcome-feedback` / `stage-transitions`, etc.) are not in this request; flag them but don't touch them.
- No DB migrations. No behavior changes beyond what's needed to compile.

## Verification

- `bunx tsgo --noEmit` clean for the three targeted files.
- `bunx vitest run src/routes/__tests__/engine-approvals-persistence.test.ts src/routes/__tests__/plans-start-planning-nav.test.ts` passes.
