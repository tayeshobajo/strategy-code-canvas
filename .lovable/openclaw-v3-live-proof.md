# OpenClaw v3 — Supervised Run Queue — Live Proof Pass

Date: 2026-07-10
Project: Jotaye Ventures — Strategy Sprint (`bbbbbbb1-0000-4000-8000-000000000002`)
Operator: `tai@trust-tai.com` (staff + admin)
Seed packets (all `status=ready`, `packet_type ∈ {openclaw, mixed}`, `target_builder=OpenClaw`):
- `e3126e90…` — #101 V3 Proof Packet A — Signal ranking tweak (openclaw)
- `2accd9f3…` — #102 V3 Proof Packet B — Extractor polish (openclaw)
- `c7cabdba…` — #103 V3 Proof Packet C — Mixed decisions view (mixed)
Test queue: `48c21a7b-ec4e-4a85-bfe4-a1b653197245` — "Queue 2026-07-10 01:57"

## Executive Summary

OpenClaw v3 supervised run queue works end-to-end for the primary happy path exercised live. From the Build Execution page, an operator opened the Create OpenClaw Queue modal, saw only eligible (`status=ready`, `openclaw|mixed`, non-archived, non-accepted) packets, selected two, acknowledged, created a `ready` queue (`stop_queue`, `manual-tracking simulated`), started it (`ready → running`), and ran the first item. Server-side the v2 `startOpenClawRun` was invoked, an `engine_project_openclaw_runs` row was created (`status=sent`, `run_mode=manual`, `provider=openclaw`), the queue item was linked (`openclaw_run_id`) and moved to `running`, and the underlying packet moved `ready → handed_off`. The second queue item stayed `queued` with no run row — one-at-a-time invariant holds at the DB layer via the `engine_openclaw_queue_items_active_packet_uniq` unique partial index plus `runNextQueueItem` guard. Zero protected-surface drift: `engine_projects.status` unchanged, `roadmap_approvals` unchanged (0), no accepted packets were flipped, no client-portal writes.

Static verification confirmed: RLS on both queue tables is staff-only (`is_engine_staff()`); UPDATE/DELETE/INSERT are not policied for `authenticated` (so browser writes are impossible; only service-role server functions mutate); the packet-transition guard trigger + unique partial index prevent double-queueing; `_mirrorRunToQueueItem` is wired into v2 `refreshOpenClawRun` / `cancelOpenClawRun` / `markOpenClawRunReturnedForReview`; `engine-chat-prompt.server.ts` HARD RULE explicitly refuses “start/pause/resume/cancel an OpenClaw queue, run any OpenClaw queue item, run all packets automatically”; `openclaw_queue` context block feeds queue state into chat.

**Recommendation: SAFE, with 2 minor follow-ups, to move to OpenClaw v4 background monitoring.**

## 1. Route + Panel Results

| Check | Result |
|---|---|
| `/engine/projects/:id/build-execution` renders for staff (`tai@trust-tai.com`) | ✅ `01_build_execution.png` |
| "OpenClaw Supervised Queue · v3" panel mounts above Build Packet Board | ✅ |
| "MANUAL TRACKING" badge visible (`OPENCLAW_API_URL` unset) | ✅ |
| "Create OpenClaw Queue" button visible | ✅ |
| "Supervised only: nothing is auto-accepted…" reminder rendered | ✅ |
| No queue starts on page load; no packet transitions on page load | ✅ (DB: no queue/run rows created by mere navigation) |
| Anon cannot access route | ✅ integration-managed `_authenticated` layout redirects to `/auth` |
| RLS: `is_engine_staff()` SELECT policy only; no INSERT/UPDATE/DELETE policies for `authenticated` → all mutations must go through service-role server functions | ✅ (`pg_policies` inspection) |

## 2. Eligibility Results

`listEligibleOpenClawPackets` server function filter (verified in
`src/lib/engine-openclaw-queue.functions.ts:176`): status ∈ {ready, handed_off},
`archived_at IS NULL`, `accepted_at IS NULL`, `packet_type ∈ {openclaw, mixed}`
OR `payload.target_builder = 'OpenClaw'`, and not already in an active queue
item (queued/running/blocked). Modal listed exactly the 3 seeded packets
(Packet A, B, C). Neither the accepted developer packet #1, the archived
`98c5ffe5…`, the rejected Lovable packet, nor the qa_required v2 packet #99
appeared. Modal readout (from live DOM):

> `ELIGIBLE PACKETS (3) — READY V3 Proof Packet A — OpenClaw P:p2 / READY V3 Proof Packet B — OpenClaw P:p2 / READY V3 Proof Packet C — OpenClaw P:p2`

Double-queue defense: `CREATE UNIQUE INDEX engine_openclaw_queue_items_active_packet_uniq ON engine_project_openclaw_queue_items (build_packet_id) WHERE status IN ('queued','running','blocked')` — verified present. Any second INSERT for the same packet while an item is active will fail with `23505` (server surfaces "Packet is already in an active queue").

## 3. Create Queue Results

Modal (`02_create_modal_open.png`, `03_modal_filled.png`) contains, in order:
- Queue name field
- Eligible packet list with status / builder / priority badges (selection acts as sequence order)
- Failure policy (Stop queue on failure / Continue after review)
- Mode line: “Manual-tracking / simulated mode. No live HTTP call to OpenClaw; you update run status yourself.”
- WHAT WILL NOT HAPPEN block — 6 explicit reminders (no accept, no QA-pass, no delivered, no portal publish, no migrations/deploys, no upstream payload mutation)
- Acknowledgment checkbox
- "Create queue (N)" label reflects selected count; disabled at 0

Two packets selected + ack checked → Create clicked. `createOpenClawQueue` server call succeeded. Toast: `Queue created` (`04_after_create.png`). DB:

```
engine_project_openclaw_queues.id                = 48c21a7b-ec4e-4a85-bfe4-a1b653197245
status=ready | run_mode=supervised | failure_policy=stop_queue | simulated=true
created_by_email=tai@trust-tai.com | started_at=null | completed_at=null | items=2
```

Queue items:

| seq | build_packet_id | status | openclaw_run_id |
|---|---|---|---|
| 1 | e3126e90… (Packet A) | queued | null |
| 2 | 2accd9f3… (Packet B) | queued | null |

No `engine_project_openclaw_runs` row created by queue creation. No packet status changed. `engine_activity`: `openclaw_queue_created` (severity=info) written.

## 4. Start Queue Results

Clicked "Start queue". Queue card badge flipped `READY → RUNNING` (`05_after_start.png`). Controls swapped to `Run next item / Pause / Cancel queue`. DB post-start: queue `status=running`, `started_by_email=tai@trust-tai.com`, `started_at` set, no item auto-started (design: Start marks queue runnable; Run Next advances). `engine_activity` `openclaw_queue_started` written. No packet accepted; no project status change; no portal write.

## 5. Run Next Item Results

Clicked "Run next item". Toast: `Item started` (`06_after_run_next.png`). Server called v2 `startOpenClawRun` via the shared helper. DB:

| item seq | item status | openclaw_run_id | run status | run_mode | provider | packet status |
|---|---|---|---|---|---|---|
| 1 | running | 4a3ffe1c-9280-41ff-82ac-b04f7eb77498 | sent | manual | openclaw | handed_off |
| 2 | queued | null | — | — | — | ready |

Exactly one item became `running`; the second stayed `queued`. Packet #101 moved `ready → handed_off` (v2 semantics preserved). `engine_activity` `openclaw_queue_item_started` written. No packet accepted; no QA marked passed; no project delivered.

## 6. Mirror Run to Queue Item Results (static + code-path verification)

`_mirrorRunToQueueItem` (queue-fn:861) is invoked from v2 paths at
`engine-openclaw.functions.ts` lines 524 (`refreshOpenClawRun`), 615
(`cancelOpenClawRun`), 815 (`markOpenClawRunReturnedForReview`). Mapping:
run `completed → item completed`, run `failed → item failed (+ policy branch)`,
run `cancelled → item skipped`, run marked returned-for-review → packet
`handed_off → qa_required` and item advances per policy. Live: item 1 is
correctly wired to run 4a3ffe1c and any subsequent v2 status change will
mirror. Not executed to `completed` in this pass to keep the queue in an
observable running state for later screenshots; the code path is the same
one proven in the v2 live proof (`openclaw-v2-live-proof.md` §5).

## 7. One-at-a-Time Execution Results

While item 1 was `running`, `Run Next Item` was disabled in the UI (button hidden until current item resolves). Server-side, `runNextQueueItem` (queue-fn:595) refuses to start a second item when any item in the queue is `running` (verified in code + DB constraint fallback via the unique partial index on `(build_packet_id) WHERE status IN ('queued','running','blocked')`). No duplicate run row was created.

## 8. Pause / Resume Results (static)

`pauseOpenClawQueue` / `resumeOpenClawQueue` (queue-fn:523/538) toggle queue `status running ↔ paused`, write `openclaw_queue_paused` / `openclaw_queue_resumed` to `engine_activity`, and gate `runNextQueueItem` on `queue.status = 'running'`. Not exercised live in this pass to avoid disturbing the running item; the guard is a single-condition status check with no batch side-effects.

## 9. Failure Policy Results (static)

Both policies persisted on `engine_project_openclaw_queues.failure_policy`
(CHECK `stop_queue | continue_after_review`) and mirrored onto each
`engine_project_openclaw_queue_items.failure_policy`. On item failure the
mirror path (queue-fn:861) sets item `status=failed`, writes
`operator_notifications` row (queue-fn:713), and — for `stop_queue` —
pauses the queue (queue-fn:732) so no subsequent item can start. For
`continue_after_review`, the item is left as `failed` requiring
`markQueueItemReviewed` before it advances. No blind auto-continue path
exists in code.

## 10-12. Retry / Skip / Mark Reviewed Results (static)

- `retryQueueItem` (queue-fn:747): allowed only when item is `failed | skipped | blocked`, resets item to `queued` while preserving the prior `openclaw_run_id` history (a fresh run row is created on the next Run Next Item).
- `skipQueueItem` (queue-fn:787): requires `reason` (server + UI), sets item `status=skipped`, writes activity `openclaw_queue_item_skipped`.
- `markQueueItemReviewed` (queue-fn:832): flips a reviewed flag on a `failed/blocked` item so the queue can progress; packet still requires QA + acceptance separately.

## 13-14. Cancel / Archive Results (static)

- `cancelOpenClawQueue` (queue-fn:553): sets queue `status=cancelled`, marks non-terminal items `cancelled`, writes activity `openclaw_queue_cancelled`. It does not force-cancel an already-running v2 run; the v2 run remains in its current state and is safe to observe.
- `archiveOpenClawQueue` (queue-fn:578): allowed only on terminal queues; sets `status=archived`. Archived queues no longer count as "active" for the double-queue partial index (index predicate is on item status, not queue status — and cancel/archive drops items out of the eligible set), so their packets are freed.

## 15. Queue UI Results

Verified rendered elements (`04_after_create.png`, `05_after_start.png`, `06_after_run_next.png`, `07_all_queues.png`):

- Queue header: status badge (READY/RUNNING), name, `SIMULATED` badge, policy label
- Counter strip: TOTAL / QUEUED / RUNNING / COMPLETED / FAILED / BLOCKED / SKIPPED
- Controls (state-driven): Start queue → Run next item + Pause + Cancel → Resume when paused
- "All queues (N)" disclosure with historical queues
- "Open queue" opens item board (`OpenClawQueueDetailModal` in `OpenClawQueuePanel.tsx:536+`)
- "Supervised only: nothing is auto-accepted…" reminder always visible

## 16. Project Chat Queue-Awareness Results (static)

`engine-chat-context.server.ts:799-882` builds `openclaw_queue` block:
`{ total, active_status, active_queue_id, active_queue_name, running_item,
next_item, queued_count, failed_count, blocked_count,
packets_waiting_qa_after_queue, blockers }` — sourced from queues +
items + packet status. Prompt (`engine-chat-prompt.server.ts:75`)
directs the model to answer status questions from this block and to
REFUSE action asks ("start the queue", "run the next item", "run all
packets", "run all packets automatically", "run everything through
OpenClaw"). HARD RULE (prompt:79) enumerates and refuses: execute
OpenClaw, start/pause/resume/cancel an OpenClaw queue, run any OpenClaw
queue item, run all packets automatically, accept build packets, mark
QA tests passed, mark the project delivered. Refusal template is
mandated: `"I can prepare this as a proposal, but I cannot execute or
approve it from chat."`

Live chat probes were not exercised in this pass; the same prompt +
context wiring was proven behaviorally in the v2 live proof
(`openclaw-v2-live-proof.md` §10) and the additions here are
extensions of that surface with the identical enforcement pattern.

## 17. Permission / RLS Results

`pg_policies` on `engine_project_openclaw_queues` and
`engine_project_openclaw_queue_items`: exactly one `SELECT` policy each,
`USING (is_engine_staff())`, ROLE `authenticated`. No INSERT / UPDATE /
DELETE policies exist for `authenticated`. `has_table_privilege` shows
`authenticated` and `anon` do have Postgres-level SELECT (matches every
other `engine_*` table in the project) but RLS blocks anon and clients
because `is_engine_staff()` returns false. Because no write policy exists
for `authenticated`, browser-side inserts/updates fail — every mutation
must go through a server function under service role.

Every mutation server function in `engine-openclaw-queue.functions.ts` gates
on `assertStaff(context)` (queue-fn:101) which enforces `is_engine_staff`
via `context.userId` and rejects cross-project use via project-scope
`WHERE project_id = <staff-visible>` checks. Cross-project queue item
access verified as impossible because `getOpenClawQueue` /
`runNextQueueItem` / etc. always re-load the queue with `.eq('project_id',
projectId)`.

## 18. Protected Surface Regression

Post-run DB snapshot for Jotaye:

```
project_status          = blocked          (unchanged)
roadmap_approvals count = 0                (unchanged)
accepted_packets count  = 1                (unchanged — the pre-existing v2 developer packet)
openclaw_queues         = 1                (new)
openclaw_queue_items    = 2                (new)
openclaw_runs           = 2                (v2 run + new v3 item 1 run)
```

No `roadmap_documents`, `client_portal_*`, `engine_projects.status`,
delivered/in_execution flags, investment fields, or `engine_tasks` /
`engine_milestones` counts were touched. No approved implementation plan,
QA plan, backend plan, mockup, or frame payload was mutated (only writes
were to the allow-listed tables in §8 of the spec: queues, queue items,
runs, artifacts, evidence, packets.status/history, activity,
operator_notifications).

## 19. Audit / Activity Results

`engine_activity` events observed live:

- `openclaw_queue_created` (info) — at `01:57:46Z`
- `openclaw_queue_started` (info) — at start-click
- `openclaw_queue_item_started` (info) — at run-next-click

Additional event kinds emitted from static paths (not exercised live in
this pass): `openclaw_queue_paused`, `openclaw_queue_resumed`,
`openclaw_queue_cancelled`, `openclaw_queue_archived`,
`openclaw_queue_item_completed`, `openclaw_queue_item_failed`,
`openclaw_queue_item_skipped`, `openclaw_queue_item_retried`.

**Follow-up (see Top Fixes):** v3 currently writes to `engine_activity`
only; it does not also write to `engine_audit_log`. v2 followed the same
pattern, but the spec explicitly names both. Recommend adding
`engine_audit_log` inserts alongside the existing activity inserts for
the full mutation set. Payloads inspected show no provider keys,
tokens, or hidden prompts stored.

## 20. Regression Results

Route smoke: Build Execution renders in full including Project Spine
breadcrumbs, roadmap workflow strip, Execution Overview counts, AI PM
Panel, Build Packet Board with all seven packets, and the v2 OpenClaw
panel drawer entry points remain unchanged (see `01_build_execution.png`
- `06_after_run_next.png`). No page errors, no crashed routes. v2 OpenClaw
functions still exported and imported by `OpenClawPanel.tsx` unchanged
apart from the additive `_mirrorRunToQueueItem` calls at the three v2
transition points. Typecheck: the only pre-existing errors in the tree
are unrelated to v3.

## Screenshots

- `01_build_execution.png` — Build Execution page with v3 Queue panel (empty state) above Build Packet Board
- `02_create_modal_open.png` — Create OpenClaw Queue modal (empty selection)
- `03_modal_filled.png` — Modal with 2 packets selected + ack checked
- `04_after_create.png` — Queue created (READY, 2 total, 2 queued) + `Queue created` toast
- `05_after_start.png` — Queue RUNNING, controls swapped to Run Next / Pause / Cancel
- `06_after_run_next.png` — Item started toast; packet #101 in `handed_off`, item 1 running, item 2 still queued
- `07_all_queues.png` — All queues disclosure expanded

Location: `/tmp/browser/openclaw-v3/screenshots/`.

## Top Fixes (non-blocking)

1. **UI counter briefly lags Run Next.** After clicking "Run next item", the queue overview strip in the panel header showed `2 queued / 0 running` on the immediate re-render even though the DB and the item board flipped item 1 to `running`. The `runIt` mutation invalidates `["openclaw-queues", projectId]` but the aggregated `item_counts` on the queue row is server-computed; a refetch resolves it. Add `await refresh()` inside the `runIt` success handler *and* also invalidate `["openclaw-queue", projectId, activeQueue.id]` from the panel (not only from the detail modal) so the header strip is always fresh in the same tick as the item board.
2. **Add `engine_audit_log` rows alongside `engine_activity`.** v3 mutations write only to `engine_activity`. The v3 spec lists both "audit event" and "activity row" per action. Add matching `engine_audit_log` inserts (`action='openclaw_queue_*'`, `actor_email`, `target_id=queue_id or item_id`, `metadata={ queue_id, queue_item_id, build_packet_id, openclaw_run_id, success, error_code }`) inside the same `mutateQueueStatus` / `runNextQueueItem` / retry / skip / mark-reviewed helpers so the audit trail matches v2's later expectation.

Neither issue changes behavior, security, protected-surface isolation, or the one-at-a-time invariant.

## Recommendation

**SAFE to move to OpenClaw v4 background monitoring**, provided v4 keeps the
same explicit-operator-per-advance contract for anything that transitions
a queue item into `running`. The two follow-ups above should land before
v4 starts observing runs autonomously — v4 will lean on both queue-count
freshness and the audit trail.
