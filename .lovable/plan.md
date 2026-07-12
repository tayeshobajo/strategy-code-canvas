## Scope
Narrow post-publish hotfix. No migrations, no unrelated refactors.

---

### 1. Fix P1-A — `/ops/insights` bare navigation

**File:** `src/routes/ops/insights.tsx` (lines 28-39)

Under Zod v4, `fallback(z.string().regex(...).optional(), undefined)` in `zodValidator` isn't behaving as truly optional on bare URL navigation, throwing `SearchParamError`.

**Change:** Drop `fallback()` wrapping for `from`/`to` and use plain optional Zod:

```ts
const searchSchema = z.object({
  preset: fallback(z.enum([...]), "30").default("30"),
  outcome: fallback(z.enum([...]), "all").default("all"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
});
```

`.catch(undefined)` on an optional field normalizes bad values to `undefined` without forcing presence. Component already handles `search.from ?? default` (lines 67-68), so no other change needed.

---

### 2. Fix P1-B — duplicate `approveChatProposal` export

**Files audited:**
- `src/lib/engine-chat-proposal-approve.functions.ts` (130 lines, standalone)
- `src/lib/engine-chat-proposals.functions.ts` (747 lines, canonical — used by `ProposalCard.tsx:22`)

**Diff outcome:** Standalone handles `suggested_task`, `review_item`, `milestone_brief`. Canonical (per prior QA) is the richer version already wired to ProposalCard. Standalone has zero importers (only its own file references `approveChatProposal` name-wise besides ProposalCard's canonical import).

**Action:** Delete `src/lib/engine-chat-proposal-approve.functions.ts`.
After delete, re-run `rg -n "approveChatProposal" src/` and report all references (expected: canonical + ProposalCard only).

If unexpected divergence appears in the diff at execution time (e.g., a code path present only in the standalone), stop and merge into canonical instead of deleting.

---

### 3. Decision Log status — clarify against Phase 4C

**Findings from exploration:**
- `src/routes/admin.decision-log.tsx` exists.
- `src/lib/engine-decision-log.functions.ts` provides `listDecisionLog` (paginated **cross-project** feed) and `getDecisionLogStats`.
- Route is registered in `routeTree.gen.ts` at `/admin/decision-log`.
- **Gap:** Not present in `src/routes/admin.tsx` `NAV` array (lines 47-87). No link anywhere in admin UI.
- Need to verify the loader reads `engine_audit_log` (post-4B) — will inspect `engine-decision-log.functions.ts` handler during execution.

**Action:**
- Add a `NAV` entry in `src/routes/admin.tsx` for `/admin/decision-log` (label: "Decision log", icon: `History` from lucide, match: `/admin/decision-log`).
- Verify `listDecisionLog` reads from `engine_audit_log` with `action='spine_field_changed'` (or equivalent). If it reads a stale source (e.g., hypothetical `engine_spine_versions`), report as gap — do NOT modify (out of scope).

**Verdict framing:** Route + cross-project aggregator both exist. The real gap vs Phase 4C is **navigation wiring only**, which this hotfix closes. Source-of-truth correctness will be confirmed and reported.

---

### Verification
- `tsgo` typecheck.
- Playwright smoke: bare `/ops/insights` renders, and `/ops/insights?from=2026-01-01&to=2026-02-01` still works.
- `rg -n "approveChatProposal" src/` — expect canonical file + ProposalCard only.
- Confirm ProposalCard still imports from `engine-chat-proposals.functions.ts` (unchanged).
- Visit `/admin` and confirm Decision Log link appears in nav.

### Report back
- Changed files.
- Typecheck + smoke results.
- Post-fix `approveChatProposal` reference list.
- Decision Log verdict: whether source is `engine_audit_log` (complete) or stale (real Phase 4C gap).
