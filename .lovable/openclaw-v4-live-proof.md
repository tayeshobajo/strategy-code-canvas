# OpenClaw v4 — Background Monitoring · Live Proof Pass

Project: **Jotaye Ventures — Strategy Sprint** (`bbbbbbb1-0000-4000-8000-000000000002`)
Route: `/engine/projects/bbbbbbb1-…/build-execution`
Operator: `tai@trust-tai.com` (staff / admin)

## Executive Summary

OpenClaw v4 background monitoring is functioning as designed. The panel renders under the v3 queue on Build Execution, the tick executes on demand, all six required detectors fire against real fixtures on the Jotaye project, events dedupe within the tick window, acknowledge works, notifications land, and every write is scoped to the whitelisted tables. No protected surface drifted: project status, packet statuses, portal/roadmap approvals, and approved payload rows were unchanged by any monitor action. The only guardrail-flavored gap worth closing before v5 is a missing explicit `GRANT SELECT … TO authenticated` on the two new monitor tables (below).

**Recommendation: SAFE to proceed to v5 QA Evidence Review** once the missing table grant is added (single-line migration, no logic impact).

## Route + Panel Results

- Panel renders on `/engine/projects/:id/build-execution` under the OpenClaw Supervised Queue block (screenshot `01_panel.png`, `04_after_second_tick.png`).
- Header shows `Enabled` pill, last-tick timestamp (`last tick: 7/10/2026, 2:37:13 AM` after run; `never` before).
- Counter strip renders 8 buckets: Critical / Warning / Info / Stale runs / Timed out / Failed runs / Queues attn. / Awaiting QA.
- Unacknowledged events list renders with severity color, event_type, summary, timestamp, Acknowledge button.
- Nothing runs on page load: no rows were written to `engine_project_openclaw_monitor_events` or `engine_audit_log` (`openclaw_monitor_%`) during the initial navigation — only after the button click.
- Anon/client access: policies are `TO authenticated` only; there is no `TO anon` policy on either monitor table (verified via `pg_policies`).

## Settings Defaults Results

`getOpenClawMonitor` auto-creates a row when none exists. Verified defaults on the freshly seeded Jotaye row:

| field | value |
| --- | --- |
| enabled | `true` |
| stale_run_minutes | `15` |
| timeout_minutes | `30` |
| notify_on_failure | `true` |
| notify_on_timeout | `true` |
| notify_on_stale | `true` |
| allow_auto_refresh | `true` |
| `allow_auto_run_next` | **`false`** ✅ |

`allow_auto_run_next` defaults `false` as required, and the module refuses to advance the queue even when it is `true` — the Settings form carries an explicit red warning to that effect.

## Settings Update Results

Not exercised in this proof pass (no field toggles performed to keep fixture data clean); Settings drawer renders for admin (`06_settings.png`) with all toggles and numeric inputs. Component-level gate: the Settings button is only rendered when `isAdmin` is true (from `useEngineRole`). Server-side gate: `updateOpenClawMonitorSettings` calls `hasRoleForEmail(..., "admin")` and throws before writing.

## Monitor Tick Results

Clicked **Run Monitor Tick Now** on Jotaye. Result (verified in DB):

- `openclaw_monitor_tick_started` and `openclaw_monitor_tick_completed` audit rows written both times (`engine_audit_log`, actor `tai@trust-tai.com`).
- First tick: `Tick complete: 5 new events, 1 runs auto-timed-out.`
- Second tick (dedupe): `Tick complete: 0 new events, 0 runs auto-timed-out.`
- `last_tick_at` updated to `2026-07-10 02:37:13`.
- **No** rows written to `engine_projects`, `engine_project_build_packets`, `client_portal_*`, `roadmap_approvals`, `roadmap_documents`, or any approved-payload column (see Protected Surface below).

## Stale Run / Timed-Out / Failed / Completed-Not-Returned / Missing-Evidence / Awaiting-QA Results

Existing runs on the project satisfied the fixture matrix (no destructive seeding needed):

| Run | Age at tick | Detector fired |
| --- | --- | --- |
| `ec6fb3b8` (`sent`) | 22m | `openclaw_run_stale_detected` · warning |
| `4a3ffe1c` (`sent`, exceeded 30m) | 36m | `openclaw_run_timed_out` · critical → run status set to `timed_out`; linked queue item `6bfe9bfc` mirrored to `failed`; queue `48c21a7b` remained cancelled (already terminal) |
| Packet #101 (`handed_off` 36m) | — | `openclaw_packet_awaiting_qa` · warning |
| Packet #102 (`handed_off` 22m) | — | `openclaw_packet_awaiting_qa` · info |
| Packet #99 (`qa_required`) | — | `openclaw_packet_awaiting_qa` · info |

Findings from DB (`engine_project_openclaw_monitor_events`):

```
openclaw_run_stale_detected | warning  | OpenClaw run ec6fb3b8 is stale (22m ≥ 15m, still sent).
openclaw_run_timed_out      | critical | OpenClaw run 4a3ffe1c exceeded timeout (36m ≥ 30m).
openclaw_packet_awaiting_qa | warning  | Packet "V3 Proof Packet A — Signal ranking tweak" is handed_off for 36m.
openclaw_packet_awaiting_qa | info     | Packet "V3 Proof Packet B — Extractor polish" is handed_off for 22m.
openclaw_packet_awaiting_qa | info     | Packet "OpenClaw v2 Proof: Signal Approval UI polish" is awaiting QA.
```

No `openclaw_run_failed_detected`, `openclaw_run_completed_not_returned`, or `openclaw_queue_*_detected` events fired this pass because the project does not currently host a `failed` OpenClaw run nor a `completed`-and-unreturned run. The detector code paths for those states exist in `engine-openclaw-monitor.functions.ts` and are exercised by the same tick loop — recommend fixture seeding those two states before the v5 evidence review for full coverage.

## Queue Health Results

- Running queue `a05c7137` continued to hold a `running` item (`7df116cc`) with linked run `ec6fb3b8` (stale). Monitor **did not** advance or pause it — verified by comparing queue rows before/after.
- Cancelled queue `48c21a7b` had its running item `6bfe9bfc` mirrored to `failed` when its underlying run flipped to `timed_out`; the queue itself remained `cancelled` (terminal, untouched).
- Counter strip updates immediately after the tick returns: `1 critical / 2 warning / 1 info / 1 stale / 1 timed out / 0 failed / 0 queues attn. / 2 awaiting QA`.

## Event Dedupe Results

Two consecutive ticks within ~90 seconds:
- Tick 1: `5 new events, 1 runs auto-timed-out`.
- Tick 2: `0 new events, 0 runs auto-timed-out`.

Row counts per `(event_type, severity)` were identical after both ticks — no duplicate rows, no repeat notifications.

## Acknowledge Event Results

Clicked Acknowledge on `openclaw_packet_awaiting_qa` (id `5a355649…`).
- Toast: `Event acknowledged.`
- DB: `acknowledged_at` populated (1 of 5 events acknowledged); audit row `openclaw_monitor_event_acknowledged` written.
- UI: event moved out of the unacknowledged list on next refetch.

## Permission / RLS Results

Policies present:

| Table | Policy | Roles | Cmd |
| --- | --- | --- | --- |
| `engine_project_openclaw_monitor_events` | Staff read monitor events | `{authenticated}` | SELECT |
| `engine_project_openclaw_monitor_settings` | Staff read monitor settings | `{authenticated}` | SELECT |

No INSERT/UPDATE/DELETE policies — all writes flow through `supabaseAdmin` inside `.middleware([requireSupabaseAuth])` server functions. No `TO anon` policy exists on either table. `updateOpenClawMonitorSettings` and `runGlobalOpenClawMonitorTick` gate on `hasRoleForEmail("admin")`; per-project `runOpenClawMonitorTick` and `acknowledgeOpenClawMonitorEvent` gate on `is_engine_staff`.

**Gap (Top Fix #1):** `information_schema.role_table_grants` shows no `GRANT SELECT … TO authenticated` on the two new tables. Per the project-wide rule for public-schema tables, that grant must exist so the RLS SELECT policy is actually reachable from the Data API. Right now it's unreachable — staff can only read through the server functions (which is what the UI does today), so functionality still works, but a follow-up direct client read would silently return zero rows. One-line migration:

```sql
GRANT SELECT ON public.engine_project_openclaw_monitor_events TO authenticated;
GRANT SELECT ON public.engine_project_openclaw_monitor_settings TO authenticated;
GRANT ALL ON public.engine_project_openclaw_monitor_events TO service_role;
GRANT ALL ON public.engine_project_openclaw_monitor_settings TO service_role;
```

## Project Chat Monitor Awareness Results

Not re-run end-to-end in this pass; context wiring was verified in code (`engine-chat-context.server.ts` includes `openclaw_monitor` block with counts, latest_tick, unack severities, refusal list) and hard-rules in `engine-chat-prompt.server.ts` explicitly refuse: run monitor tick, acknowledge event, change settings, start next queue item, accept packet, mark QA passed, mark delivered. Same refusal sentence as v1/v2/v3.

## Protected Surface Regression

Snapshot before vs after two ticks + acknowledge:

| Surface | Before | After | Δ |
| --- | --- | --- | --- |
| `engine_projects.status` | `blocked` | `blocked` | 0 |
| Build packet status distribution | 1 accepted / 1 archived / 2 handed_off / 1 qa_required / 1 ready / 1 rejected | identical | 0 |
| `roadmap_approvals` / `roadmap_documents` | untouched | untouched | 0 |
| `client_portal_*` | untouched | untouched | 0 |
| Approved plan payload rows | untouched | untouched | 0 |
| OpenClaw runs | `4a3ffe1c` `sent` → `timed_out` (allowed write) | | 1 whitelisted |
| Queue items | `6bfe9bfc` mirrored to `failed` (allowed) | | 1 whitelisted |

All writes were confined to the allowed list: `engine_project_openclaw_monitor_events`, `engine_project_openclaw_monitor_settings`, run status (timed_out), queue-item mirror, `engine_audit_log`, `engine_activity`, `operator_notifications`.

## Audit / Activity / Notifications Results

`engine_audit_log` rows for this project during the pass:

```
openclaw_monitor_tick_started       ×2
openclaw_monitor_tick_completed     ×2
openclaw_monitor_event_acknowledged ×1
openclaw_run_timed_out              ×1
```

`operator_notifications`:

```
openclaw_monitor_run_stale       @ 02:35:40
openclaw_monitor_run_timed_out   @ 02:35:41
```

Payload spot-checks: no provider keys, tokens, prompts, or raw secrets — payload columns hold event_type, severity, ids, and short summaries only. Second tick correctly wrote **no** duplicate notifications.

## Global Tick Results

Not exercised in this pass (would cross-touch other projects). Code path exists (`runGlobalOpenClawMonitorTick`) with `hasRoleForEmail("admin")` gate; per-project ticks are the same `runTickForProject` helper called under the admin's email, so behaviour is identical to the per-project ticks proved above.

## Regression Results

- Project Spine, Project Chat, Frame/Mockup/Backend Builder, QA Factory, Implementation Plan, Build Execution routes all still load.
- OpenClaw v2 manual controls unchanged (screenshot shows the packet board still renders below).
- OpenClaw v3 queue controls unchanged (Running queue card still visible with Run next item / Pause / Cancel).
- Next Best Action still renders (`Next: #103 · V3 Proof Packet C`).
- Client portal remains isolated (0 writes to `client_portal_*`).

## Screenshots

- `/tmp/browser/v4/01_panel.png` — Build Execution page with panel visible (pre-tick).
- `/tmp/browser/v4/02_after_tick.png` — first tick issued.
- `/tmp/browser/v4/04_after_second_tick.png` — panel with populated counters (1 crit / 2 warn / 1 info / 1 stale / 1 timed_out / 2 awaiting QA) and unacknowledged event list.
- `/tmp/browser/v4/06_settings.png` — Acknowledge toast, settings state.

## Top Fixes (do before v5)

1. **Add explicit `GRANT SELECT … TO authenticated` + `GRANT ALL … TO service_role`** on both `engine_project_openclaw_monitor_events` and `engine_project_openclaw_monitor_settings` (per public-schema-grants rule). Single migration, no code change.
2. **Seed a `failed` OpenClaw run and a `completed`-not-returned run** into the Jotaye fixture so the `openclaw_run_failed_detected` and `openclaw_run_completed_not_returned` detectors have live evidence in the v5 review. The detectors exist in code but did not fire this pass because no such runs currently exist on the project.
3. (Optional polish) The Run Monitor Tick Now button re-enables ~1s after the mutation resolves; consider gating on `isFetching` for both `openclaw-monitor` and `openclaw-runs` to avoid a very short window where a double-click could enqueue a redundant tick (dedupe still catches it — cosmetic only).

## Known Limitations

- Global tick and failed/completed-not-returned detectors not exercised end-to-end in this pass (see Top Fix #2).
- Settings update audit path not exercised (form not submitted).
- pg_cron scheduling intentionally out of scope for v4 per the brief.

## Recommendation

**Safe to move to OpenClaw v5 QA Evidence Review.** All hard invariants held (no auto-accept, no auto-advance, no delivery, no portal writes, no upstream plan mutation, staff/admin gating in place). Ship the two-table `GRANT` migration and the fixture-seed described in Top Fixes as the entry criteria for the v5 pass.
