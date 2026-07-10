
## Findings from investigation

Before proposing changes, two of the three items don't match the current codebase state. Flagging so we don't ship a phantom fix.

### Item 1 — TS error in `src/lib/ops.functions.ts:612`
Not reproducible on the current tree:
- Line 612 is `severity: "error",` inside an `engine_activity` insert — not a query chain.
- `rg "\.catch\("` on `src/lib/ops.functions.ts` returns **zero matches**. There is no misplaced `.catch()` anywhere in the file.
- `bunx tsgo --noEmit` reports zero errors in `ops.functions.ts`. (There are ~30 unrelated pre-existing errors in `portal.*`, `_authenticated/route.tsx`, `engine.tsx`, etc. — router `search`/redirect typings, untouched by this request.)

The earlier turn already corrected a `.catch()` misuse in this file. Commit `919f2fd` (direct GitHub commit) likely landed after that fix, so the error you're seeing may be from a **stale local build cache** or a different branch. **Proposed action: no code change; ask you to re-run the build to confirm.** If it still errors, paste the exact `tsgo`/build output and I'll patch precisely.

### Item 2 — Extraction watchdog (10 min → 30 min)
The watchdog is **not** in TS. It lives in Postgres functions inside migrations (`nba_*`, `watchdog_timeout_increase`). Current state:
- Most recent migration `20260710110100_watchdog_timeout_increase.sql` already bumped the interval from **10 → 20 minutes** (the earlier 10-min hard cap is gone).
- Two functions still reference the interval: `run_watchdog_sweep()` and the `_nba_*` helper used when NBA triggers extractions.

The reset-to-queued path: status is flipped in Postgres via `engine_sources.status = 'queued'`, and the extraction-run creation is done in the same PL/pgSQL helpers. I need to confirm both helpers insert a fresh `engine_extraction_runs` row on the transition rather than reusing the last one — will `read_query` the current function bodies before writing the migration.

### Item 3 — Push to production
Publish/deploy is a user action from the Publish dialog (frontend must be published via "Update"; backend/migrations deploy automatically on approval). I can surface the publish action but cannot push for you.

---

## Proposed plan

### Step 1 — Confirm/dismiss the TS error
Ask you to re-run `bun run build` (or `bunx tsgo --noEmit`) on the current tree. If `ops.functions.ts` still shows a `.catch` error, share the exact output and I'll fix the specific chain. Otherwise this item is already resolved by the earlier fix.

### Step 2 — Watchdog migration: 20 → 30 minutes + guaranteed new run on reset
Single migration that:
1. Updates `run_watchdog_sweep()` (and the NBA helper) to use `interval '30 minutes'` everywhere the current `'20 minutes'` appears, and updates the audit/error message strings accordingly.
2. Adjusts the reset-to-queued path so setting `engine_sources.status = 'queued'` always inserts a new `engine_extraction_runs` row (status `queued`, fresh `started_at = NULL`) instead of reopening the last row. Exact SQL depends on the current function bodies — I'll read them first, then write the migration.

No table shape changes, no policy changes, no touching `lib/calculations.ts`, `engine-spirit-first.functions.ts`, or `engine-completion.functions.ts`.

### Step 3 — Verify + publish
- Re-run `bunx tsgo --noEmit` after the migration; confirm no new errors introduced (pre-existing unrelated errors remain out of scope).
- Surface the publish CTA so you can push frontend + confirm the migration to production.

---

## Question before I switch to build

Given items 1 and 3 are essentially no-ops from my side, the only real code change here is the watchdog migration. Want me to:

**(A)** Proceed with just Step 2 (watchdog migration to 30 min + guaranteed new run on reset), and surface the publish action, treating Step 1 as "no change needed unless build still errors"?

**(B)** Or do you have a fresh build log showing the `ops.functions.ts:612` `.catch` error that I should look at first?
