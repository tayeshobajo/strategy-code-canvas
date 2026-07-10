# OpenClaw v3 — Supervised Run Queue

Build a supervised queue on top of v2's single-packet flow. Staff explicitly select eligible packets, confirm, then step through them one at a time. Every hard guardrail from v2 stays: no auto-accept, no QA-pass, no delivery, no portal writes, no deploys.

## 1. Database (single migration)

New tables in `public`:

**`engine_project_openclaw_queues`**
- `id uuid pk`, `project_id uuid` → `engine_projects(id)`, `name text`
- `status text` — `draft | ready | running | paused | completed | failed | cancelled | archived`
- `run_mode text` default `'supervised'` (only supervised in v3)
- `failure_policy text` default `'stop_queue'` — `stop_queue | continue_after_review` (queue-level default; per-item can override)
- `simulated boolean` default `false` (manual-tracking mode when `OPENCLAW_API_URL` not configured — requires explicit opt-in at creation)
- `created_by uuid`, `created_by_email text`, `started_by uuid`, `started_by_email text`
- `started_at`, `completed_at`, `created_at`, `updated_at`, `metadata jsonb`

**`engine_project_openclaw_queue_items`**
- `id`, `project_id`, `queue_id` → queues(id) ON DELETE CASCADE
- `build_packet_id` → `engine_project_build_packets(id)`
- `openclaw_run_id` nullable → `engine_project_openclaw_runs(id)`
- `sequence_number int`, unique `(queue_id, sequence_number)`
- `status text` — `queued | running | completed | failed | skipped | cancelled | blocked`
- `failure_policy text`, `requires_confirmation boolean` default true
- `started_at`, `completed_at`, `error_code`, `error_message`
- `created_at`, `updated_at`

**Transition trigger** (`tg_engine_openclaw_queue_items_enforce`):
- Allowed: `queued → running | skipped | cancelled | blocked`; `running → completed | failed | cancelled`; `blocked → queued | skipped | cancelled`; `failed → queued` (retry).
- Terminal: `completed`, `skipped`, `cancelled` cannot change.
- Queue trigger: enforce `draft → ready → running`; `running ↔ paused`; any → `cancelled | failed | completed`; any → `archived` (only from terminal).

**Guard trigger to prevent double-queueing a packet**: unique partial index on `(build_packet_id)` where queue-item status in `('queued','running','blocked')` AND queue.status in `('draft','ready','running','paused')`.

**RLS + grants** (both tables):
- `GRANT SELECT ON ... TO authenticated;` `GRANT ALL ... TO service_role;` no `anon`.
- Policy: staff-only SELECT via `public.is_engine_staff()`.
- No INSERT/UPDATE/DELETE policies — all writes go through `SECURITY DEFINER` server functions with `service_role`.
- Update-triggers `tg_touch_updated_at`.

## 2. Server functions (`src/lib/engine-openclaw-queue.functions.ts`)

All use `.middleware([requireSupabaseAuth])` + `is_engine_staff` check + project-scope validation. Writes use `supabaseAdmin` loaded inside the handler.

- `listOpenClawQueues({ projectId })` — active + recent + archived summaries; per-queue item counts by status.
- `getOpenClawQueue({ projectId, queueId })` — queue + items + linked runs/artifacts.
- `listEligibleOpenClawPackets({ projectId })` — packets with `target_builder` = OpenClaw/mixed, status `ready|handed_off`, not `accepted|archived`, not currently in an active queue.
- `createOpenClawQueue({ projectId, name, packetIds[], sequence, failurePolicy, simulated, confirm })` — validates each packet, dedupes, refuses if any packet already active-queued; creates queue in `draft` then flips to `ready`; requires `confirm=true`.
- `startOpenClawQueue({ queueId })` — `ready → running`; sets `started_by/at`.
- `pauseOpenClawQueue({ queueId })`, `resumeOpenClawQueue({ queueId })`, `cancelOpenClawQueue({ queueId, reason })`, `archiveOpenClawQueue({ queueId })`.
- `runNextQueueItem({ queueId, confirm })` — picks the first `queued` item in sequence; calls the existing v2 `startOpenClawRun` code path (extracted into an internal helper `_startRunForPacket` shared between v2 UI and v3 queue) to create the OpenClaw run; sets item `running` + `openclaw_run_id`; refuses if queue is `paused|cancelled|failed`; refuses if prior item is still `running`.
- `markQueueItemCompleted` / `markQueueItemFailed` are triggered by the existing v2 `refreshOpenClawRun` / `markOpenClawRunReturnedForReview` — we add a post-hook inside those v2 functions that, if the run belongs to a queue item, mirrors the outcome to the item and advances/pauses the queue per `failure_policy`.
- `retryQueueItem({ queueItemId })` — `failed → queued`.
- `skipQueueItem({ queueItemId, reason })` — `queued|blocked|failed → skipped`.
- `markQueueItemReviewed({ queueItemId })` — clears `blocked` after human review (used with `continue_after_review`).

All functions write:
- `engine_audit_log` rows with event kinds listed in the spec.
- `engine_activity` rows for user-visible events (queue started/paused/failed/completed, item failed).
- `operator_notifications` on queue failure and on any item marked `failed`.

Explicitly forbidden inside every function: touching `engine_projects.status`, `roadmap_approvals`, `client_portal_*`, `engine_project_build_packets.status = 'accepted'`, or any approved payload column. Packet status transitions still flow only through the existing v2 code path (`ready → handed_off → qa_required`).

## 3. UI

**Refactor extraction:** move v2's `startOpenClawRun` request-building into a shared helper so v3 reuses the exact same payload shape, `do_not_send` list, and confirmation preview.

New component `src/components/engine/OpenClawQueuePanel.tsx` mounted on `src/routes/engine.projects.$projectId.build-execution.tsx` above the packet board.

Sections A–E per spec:
- **Overview strip** — active queue name, status pill, counts (queued/running/completed/failed/skipped), current running packet, next packet.
- **Create Queue drawer** — table of eligible packets with checkboxes, drag-to-reorder (fallback: numeric sequence input), `failure_policy` radio, `simulated` checkbox (only shown when HTTP mode not configured, with amber warning), summary of "what will / will not happen".
- **Confirmation modal** — mirrors v2's modal: full payload preview per selected packet (collapsible), do-not-send list, "no auto-accept / deploy / publish / QA-pass / delivered" reminder, acknowledgement checkbox required to enable the primary button.
- **Queue Board** — items grouped by status column, each card shows sequence #, packet title, target builder, run link, error message.
- **Controls** — Start / Pause / Resume / Cancel / Run Next / Retry / Skip (with reason prompt) / Archive. Each button gated on queue status and staff role; disabled with tooltip when not applicable.

Query invalidation: on any queue mutation, invalidate `["openclaw-queues", projectId]`, `["openclaw-queue", queueId]`, `["engine", "build-execution", projectId]`, and the v2 keys already invalidated in `OpenClawPanel.refresh` so packet badges update instantly.

## 4. Chat integration

`src/lib/engine-chat-context.server.ts` — extend the `openclaw` context block:
- `queues: { total, active_status, running_item, queued_count, failed_count, blocked_count, packets_waiting_qa_after_queue, blockers[] }`.

`src/lib/engine-chat-prompt.server.ts` — extend the hard-rules section:
- Chat may report queue state (is there a queue, what's running, what failed, what's next, which packets are waiting for QA).
- Chat MUST refuse to start/pause/resume/cancel a queue or run any item — point the operator at the Queue Controls and require human confirmation.
- Chat MUST refuse "run all packets automatically" with the same fixed refusal sentence used in v1/v2.

## 5. Audit event kinds

`openclaw_queue_created | _started | _paused | _resumed | _cancelled | _completed | _failed | _archived` and `openclaw_queue_item_started | _completed | _failed | _skipped | _retried`. Payload always includes `project_id`, `queue_id`, and where applicable `queue_item_id`, `build_packet_id`, `openclaw_run_id`, `user_id`, `user_email`, `success`, `error_code`. Never store provider keys, tokens, or hidden prompts.

## 6. Live proof pass (after implementation)

Playwright pass on Jotaye project. Seed 2–3 eligible OpenClaw packets, then:
1. Create queue → confirm blocking without acknowledgement.
2. Start queue → run next item → mark v2 run completed → verify queue advances and packet is `qa_required` (not accepted).
3. Force a failure → verify `stop_queue` pauses and `continue_after_review` blocks; verify operator notification.
4. Retry, skip-with-reason, cancel, archive.
5. Snapshot protected surfaces before/after (`client_portal_*`, `roadmap_approvals`, `engine_projects.status`, approved payload hashes) — expect zero drift.
6. Chat probes: 6 status questions must answer from context; 3 action asks ("start the queue", "run all packets", "accept the packet") must refuse.
7. RLS check: anon SELECT/INSERT on both new tables must fail.

Write full report to `.lovable/openclaw-v3-live-proof.md` with the sections requested and a safe / not-safe recommendation for OpenClaw v4.

## Technical notes

- Order of implementation: migration first (approval gate), then extract v2 helpers, then server functions, then UI, then chat, then proof pass.
- v2 `OpenClawPanel` stays as-is for single-packet operation; the queue is additive.
- Simulated mode is opt-in per queue and clearly labelled — it uses v2's manual-tracking path so no HTTP calls happen when `OPENCLAW_API_URL` is unset.
- Any post-hook mirroring from v2 → queue item is idempotent: only updates when `openclaw_run_id` matches the item's stored run.
