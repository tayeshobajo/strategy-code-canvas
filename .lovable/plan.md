## What's actually broken

You're not seeing signals for Mubo's project because the intake extraction pipeline **never finished**, and there is nothing in the app that will ever finish it.

**The stuck row** (August 1 — intake, `3ade32db…`):
- `engine_extraction_runs`: 1 row, `status='running'`, `started_at=2026-07-08 02:05`, no `finished_at`, no `error`, 0 signals. Stuck for ~32 hours.
- `engine_sources` for that project: `status='processing'`, never advanced.
- `engine_projects.status='source_processing'` — the "waiting" state the overview shows.
- No `engine_project_intake_failures` row. No failure activity. It just… stopped.

**Why it stopped** (`src/lib/engine-project-intake.functions.ts:460-472`):
```ts
// Fire-and-forget: run pipeline. Return immediately …
void (async () => {
  try { await runIntelligencePipelineInternal(sb, {...}); }
  catch { /* errors are logged inside the pipeline */ }
})();
return { … status: "processing" };
```
This runs on a stateless Cloudflare Worker. The moment `createProjectFromSource` returns its HTTP response, the runtime tears down the isolate and kills the background promise — usually before the first Gemini call finishes, sometimes mid-run. There's no `waitUntil`, no queue, no retry, no watchdog. So:
- The extraction row is inserted (`status=running`).
- The source is flipped to `processing`.
- The response returns `processing` to the client.
- The pipeline dies silently.
- Nothing ever marks the run `failed` or retries it.

Every intake submission is a coin flip: complete fast enough → works; anything slower → orphaned forever like Mubo's.

**Secondary QA finding — 8 phantom "test" sources.** Between the demo purge and now, someone (a G-3 visibility test at 03:39 yesterday) attached a `g3-visibility-test-…` source to Mubo's real project. It's a leftover QA fixture polluting a real customer's workspace.

## Plan

### 1 · Unblock Mubo today (data fix, no schema)
- **Mark the stuck run failed** with an explanatory error so the UI stops implying "in progress":
  - `engine_extraction_runs.3655cb9a…` → `status='failed'`, `error='Pipeline abandoned by worker before completion (fire-and-forget lost). Requeued manually.'`, `finished_at=now()`.
  - `engine_sources` for that project → `status='failed'` where currently `processing`.
  - `engine_projects.3ade32db… .status → 'intake'` so the workflow header stops saying `source_processing`.
- **Delete the G-3 visibility-test source** (`7ab57976…`) from Mubo's project. Leaves only the real `Adaptive intake brief` source.
- **Re-run extraction cleanly** by calling `runIntelligencePipeline` for that project once. Because we haven't fixed the underlying async bug yet, I'll run it via the server function during the QA pass, watch the row, and confirm it completes end-to-end (signals inserted, `roadmap_version` bumped, `engine_activity` shows `pipeline_completed`).

### 2 · Fix the actual bug so this stops happening
Two options; I recommend (a) as the small-surface fix:

**(a) Make extraction synchronous inside the intake bridge.** Drop the `void (async () => {…})()` wrapper and `await` `runIntelligencePipelineInternal` before returning. The user waits ~15-30s on submit, but the run cannot be orphaned, and every failure is captured in the try/catch that already updates `status='failed'` + writes `pipeline_failed` activity. Simplest, safest, one file changed.

**(b) Queue-based background processing.** Insert a job into a `engine_extraction_jobs` table (or reuse `pgmq` which is already installed for email), have a pg_cron task hit a `/api/public/engine/process-extractions` endpoint. Correct long-term architecture, but new surface area, cron config, and retry semantics — a separate change.

I'll do **(a)** now. If you want (b) as a follow-up I'll open a separate plan.

### 3 · Add a watchdog for anything already stuck
One-off migration that adds a scheduled job (pg_cron, reusing the pattern from `email_queue_dispatch`):
- Every 5 minutes, find `engine_extraction_runs` with `status='running'` and `started_at < now() - interval '10 minutes'` and mark them `failed` with `error='Watchdog: run exceeded 10-minute timeout.'`, cascade the same status change to their `engine_sources`, and write a `pipeline_timed_out` activity. This is the safety net regardless of (a) vs (b).

### 4 · Engine QA sweep (once 1-3 are in)
Signed in as `tai@trust-tai.com` (now `admin` per last session), walk every engine page and record findings. For each page I'll capture: renders / count of real rows / console errors / any hard-coded demo strings still leaking through.
- `/engine` Command Center — tiles reflect the 3 real projects; Priority Queue includes August 1.
- `/engine/projects` — list, filters, search.
- `/engine/projects/3ade32db…/overview` — Mubo's workspace, now with a real extraction and signals count > 0.
- `/engine/projects/3ade32db…` step-by-step: Signal Room → Extraction → Point A → Point B → Hidden Assets → Gap Map → Blueprint → Roadmap → Sequencing → Deadlines → Investment → Client Preview → Delivery. Confirm each step renders the AI draft the pipeline produced, and no step throws.
- `/engine/review` — Review & Approvals queue.
- `/engine/templates`, `/engine/delivery`, `/engine/execution`, `/engine/operations`, `/engine/intelligence` — render, no crashes, no demo-data ghosts.

Output: a short QA report appended to `REPORT.md` listing every page, pass/fail, and any residual issues to fix in a follow-up.

### Out of scope for this pass
- Broader RLS redesign for operator vs admin (last plan already flagged; the DB row for you is now `admin`).
- Removing the hard-coded `ADMIN_EMAILS` allowlist.
- Any conversation-intelligence / roadmap-panel test work — Phase 14 is done.
- Migration to a proper queue-based extraction runner — see (b) above; separate change.

## Technical notes
- Fire-and-forget in Workers has to use `ctx.waitUntil(...)` to survive past the response; TanStack Start's `createServerFn` doesn't expose the execution context, so the practical fix is to `await` inside the handler (option a).
- The pipeline itself already has a full try/catch that flips the run to `failed`, marks sources `failed`, resets project to `intake`, and writes a `pipeline_failed` activity — so making it synchronous is safe.
- Watchdog uses the same `net.http_post` + `cron.schedule` pattern as `email_queue_dispatch` in the DB, no new secrets required.
- No changes to portal, roadmap versions, or the auth schema.
