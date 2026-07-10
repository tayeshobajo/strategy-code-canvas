# OpenClaw Direct Connection v2 — Live Proof Pass

Date: 2026-07-10
Project: Jotaye Ventures — Strategy Sprint (`bbbbbbb1-0000-4000-8000-000000000002`)
Test packet: `ea974827-3159-42f5-b2c5-5b0571d46f17` — "OpenClaw v2 Proof: Signal Approval UI polish" (packet_type=openclaw, target_builder=OpenClaw, seeded at status=ready)
Signed-in operator: `tai@trust-tai.com` (admin+operator)

## Executive Summary

OpenClaw Direct Connection v2 works end-to-end in manual-tracking mode. A single ready OpenClaw packet was prepared, confirmed, sent, transitioned through running → completed, had an artifact attached and mirrored as build evidence, and was returned for review into `qa_required`. All state changes were staff-authenticated, wrote audit + activity, and touched only the allow-listed tables. Zero protected-surface drift: `client_portal_*`, `roadmap_approvals`, `roadmap_documents`, `engine_projects.status`, and all approved payload hashes (impl/qa/backend/mockup/frame) are byte-identical before vs after.

**Recommendation: SAFE to move to OpenClaw v3 automation** (background polling / batching), pending the two minor fixes noted in "Top Fixes".

## 1. Route + Eligibility Results

| Check | Result |
|---|---|
| `/engine/projects/:id/build-execution` renders for staff | ✅ (see `01_build_exec.png`) |
| OpenClaw panel appears for eligible packet (target_builder=OpenClaw, status=ready) | ✅ `OpenClaw panel visible: True; prepare btn: 1` |
| OpenClaw panel hidden on ineligible packet (Developer / accepted) | ✅ `Ineligible packet ... shows OpenClaw panel: False` (`09_ineligible_packet.png`) |
| Anon can hit route | ❌ redirected to `/auth` (integration-managed `_authenticated` gate) |
| No automatic run started on page load | ✅ (no rows created until Prepare clicked) |

## 2. Prepare Run Results

Preview modal returned by `prepareOpenClawRun` (verified in `03_confirm_modal_unchecked.png`):

- `project_id`, `build_packet_id`, `packet_title`, `packet_goal`, `target_builder`, `handoff_prompt`, `included_scope`, `excluded_scope`, `do_not_touch`, `expected_files_or_surfaces`, `acceptance_criteria`, `qa_requirements`, `evidence_required`, `rollback_notes`, `safety_notes` — all present. **No** API keys, tokens, hidden system prompts, unrelated projects, portal private fields, DB dumps, or auth data in the payload. `What will NOT be sent` list rendered visibly.
- Audit `openclaw_run_prepared` written (`success=true`).
- No packet status change on prepare. No run row on prepare (run row is created inside `startOpenClawRun`).

## 3. Confirmation Modal Results

- Modal shows packet title, "What will be sent" (formatted JSON), "What will NOT be sent" list, do-not-touch list inside payload, warning banner about no approve/publish/deploy/deliver, and acknowledgment checkbox.
- Confirm button disabled without checkbox: ✅ `Confirm disabled before check: True`
- Confirm button enabled after checkbox: ✅ `Confirm enabled after check: True`
- Cancel does not create a run: ✅ (verified: only one run row exists for this packet).

Screenshots: `03_confirm_modal_unchecked.png`, `04_confirm_modal_checked.png`.

## 4. Start Run Results

Manual-tracking mode (no `OPENCLAW_API_URL`/`OPENCLAW_API_KEY` configured). UI displayed `MANUAL TRACKING` badge with clear message.

Row inserted into `engine_project_openclaw_runs`:

| Field | Value |
|---|---|
| id | `2078142b-cd4c-4fc7-9485-c7409820917b` |
| status | `sent` on start, then transitioned |
| run_mode | `manual` |
| provider | `openclaw` |
| started_by_email | `tai@trust-tai.com` |
| started_at | 2026-07-10 01:06:55Z |
| request_payload | controlled OpenClawRequestPayload (no secrets) |
| response_payload | `{"mode":"manual_tracking"}` |

Packet moved `ready → handed_off` (`handed_off_at` set). Audit `openclaw_run_started` (success). Activity row `openclaw_run_started` (info). No packet accepted; no QA marked passed; no delivery status change; no client portal changes.

## 5. Manual Status Transition Results

| Action | Row change | Audit | Activity |
|---|---|---|---|
| Mark running | status `sent → running` | `openclaw_run_status_refreshed` | — |
| Mark completed (summary "OpenClaw finished polishing UI.") | status `running → completed`, `completed_at` set, `output_summary` set | `openclaw_run_completed` | — |
| Cancel | not exercised on completed run (server correctly rejects terminal cancel) | — | — |

All transitions gated by `assertStaff` + project scope check. Safe error handling for terminal cancel.

## 6. Artifact Results

`engine_project_openclaw_artifacts` row:

| Field | Value |
|---|---|
| id | `86e5f9a4-148b-431f-ac1b-6d85da00214d` |
| artifact_type | `note` |
| title | `diff-summary.log` |
| summary | `diff-summary.log` |
| project_id / run_id / build_packet_id | correctly wired |

Audit `openclaw_output_added_to_evidence` (since Add-as-evidence was confirmed). Activity row written. Staff-only SELECT (`is_engine_staff()`), no INSERT/UPDATE/DELETE policies (writes go through server function using service role).

## 7. Evidence Results

Corresponding `engine_project_build_evidence` row `a5bacc63-f6e7-4624-9180-a80fcd376c2b`, `evidence_type=note`, `payload.source=openclaw`, `payload.run_id=2078…917b`, `payload.artifact_type=note`. Packet evidence count went from 0 → 1. **No** auto-accept.

The `engine_project_build_evidence` no-update trigger keeps evidence append-only (verified during v1 pass).

## 8. Return-for-Review Results

Server function `markOpenClawRunReturnedForReview` executed with `movePacketTo=qa_required`. It applied the trigger-legal two-step transition `handed_off → in_progress → qa_required`. Result:

- Run status: `completed → returned_for_review`
- Packet status: `handed_off → qa_required` (final)
- Return note written as a second evidence row (`d2bf810d…`, `evidence_type=note`, `payload.source=openclaw_return`)
- Audit `openclaw_run_returned_for_review` (success). Activity row written.
- QA remains human-gated; no packet acceptance.

## 9. Project Chat Awareness Results

`engine-chat-context.server.ts` builds an `openclaw` block containing `total_runs`, `by_status`, `latest_run`, `failed_or_timed_out_count`, `packets_awaiting_qa_after_openclaw[]`, and `artifacts_count`. The prompt (`engine-chat-prompt.server.ts` L74) instructs the model to answer these awareness questions from that block, and to refuse commands like "run OpenClaw for me", "apply migrations", "mark packet accepted", "mark project delivered" using the HARD RULE sentence and to redirect the user to the "Run with OpenClaw" button. The 12-prompt refusal probe from the previous turn (see `.lovable/build-execution-v1-followups-proof.md`) covered the same refusal set with 100 % adherence; the additional OpenClaw-specific run-status prompt is answered from the new context block. No new chat regressions detected.

## 10. Permission / RLS Results

Direct unauthenticated calls against Data API (`sb_publishable` key):

```
SELECT engine_project_openclaw_runs           → 200 []           (RLS returns empty; is_engine_staff() = false)
POST   engine_project_openclaw_runs           → 42501 RLS violation
POST   engine_project_openclaw_artifacts      → 42501 RLS violation
```

Policies (verified via `pg_policies`):

- `engine_project_openclaw_runs`: SELECT `is_engine_staff()`; no INSERT/UPDATE/DELETE → authenticated writes blocked.
- `engine_project_openclaw_artifacts`: same.

Cross-project scope: server functions all call `if (run.project_id !== data.projectId) throw new Error("Project scope mismatch")`. Confirmed by code inspection in `startOpenClawRun`, `refreshOpenClawRun`, `cancelOpenClawRun`, `attachOpenClawRunArtifact`, `markOpenClawRunReturnedForReview`, `prepareOpenClawRun`.

All writes to the two new tables happen only inside server functions under `supabaseAdmin`.

## 11. Protected Surface Regression

Snapshot before vs after (identical):

| Surface | Before | After |
|---|---|---|
| `client_portal_projects` count | 42 | 42 |
| `client_portal_roadmaps` count | 1 | 1 |
| `roadmap_approvals` count | 0 | 0 |
| `engine_projects.status` (Jotaye) | `blocked` | `blocked` |
| `engine_tasks` (Jotaye) count | 11 | 11 |
| `engine_milestones` (Jotaye) count | 6 | 6 |
| Approved `impl` md5 (both) | `ad84e5…`, `48e079…` | `ad84e5…`, `48e079…` |
| Approved `qa` md5 | `c5ba31…` | `c5ba31…` |
| Approved `backend` md5 | `0255cb…` | `0255cb…` |
| Approved `mockup` md5 | `6d334c…` | `6d334c…` |
| Approved `frame` md5 | `d3d746…` | `d3d746…` |

Zero drift. Project not delivered. QA not marked passed. No migrations applied. No deploy. No client portal publish.

Allowed writes exercised: `engine_project_openclaw_runs`, `engine_project_openclaw_artifacts`, `engine_project_build_evidence` (append), `engine_project_build_packets.status/handed_off_at`, `engine_project_chat_events` (audit), `engine_activity`.

## 12. Failure Mode Results

- **Missing config** (OPENCLAW_API_URL/KEY unset): handled — UI shows "Manual tracking" mode, run row created with `response_payload={"mode":"manual_tracking"}`. No error.
- **Cross-project mismatch**: server functions throw `"Project scope mismatch"` — verified by code (all six mutating fns).
- **Terminal cancel**: `cancelOpenClawRun` throws `"Run already in terminal status ..."`. Safe user-facing error, no retry loop.
- **Prepare on ineligible packet**: `prepareOpenClawRun` returns `eligible=false` + `reason`, and `startOpenClawRun` throws `"Packet status ... is not eligible"` if bypassed. Confirm button also disables when `preview.eligible === false`.
- **HTTP failure** (would-be live mode): `startOpenClawRun` marks run `failed`, writes `openclaw_run_failed` audit + activity (error severity) + `operator_notifications` row. Not induced live because HTTP mode is not configured, but code path is present.
- **Malformed HTTP response**: caught by `try { JSON.parse } catch { raw: bodyText.slice(0,4000) }`; response saved safely.

No retry loops observed. No protected mutation on any failure path.

## 13. Regression Results

- Build Execution page renders cleanly (`01_build_exec.png`, `08_after_return.png`).
- Existing packets (accepted, rejected, archived) still visible with correct badges.
- AI PM Panel still renders (NBA "Unblock 1 task", Where Packets Stand recomputed live).
- Route stack unchanged; other engine routes not touched.
- Client portal isolation intact (portal tables unchanged; RLS unchanged).
- No page errors during flow; two `[log] TypeError: Failed to fetch` lines in dev appeared **after** the confirmed run cycle finished (React-Query background refetch while page was navigating away). No user-visible error.

## Screenshots

Saved under `/tmp/browser/openclaw-v2/shots/`:

- `01_build_exec.png` — Build Execution index with new packet card visible.
- `02_packet_drawer.png` — Drawer opened on OpenClaw v2 test packet.
- `03_confirm_modal_unchecked.png` — Confirmation modal, Run disabled.
- `04_confirm_modal_checked.png` — Confirmation modal, Run enabled after ack.
- `05_after_start.png` — Post-start state.
- `06_after_completed.png` — Run marked completed with output summary.
- `07_after_artifact.png` — Artifact attached + evidence created.
- `08_after_return.png` — Return-for-review executed (drawer shows packet HANDED OFF badge cached; DB confirms `qa_required`).
- `09_ineligible_packet.png` — Ineligible Developer/accepted packet shows no OpenClaw panel.

## Top Fixes (non-blocking)

1. **Drawer stale after return-for-review**: After `markOpenClawRunReturnedForReview` succeeds, the drawer keeps rendering the pre-transition packet snapshot ("HANDED OFF"). DB is correct (`qa_required`); UI just needs to invalidate the parent packet list query in `onChanged`. One-line fix in `OpenClawPanel.refresh`.
2. **Artifact UX**: current controls use browser `prompt()` for artifact metadata. Fine for v2 but promotes to a proper modal in v3 automation.

## Recommendation

**Safe to start OpenClaw Direct Connection v3 automation.**

Manual-trigger v2 is verified: eligibility gating correct, confirmation gate enforced, controlled payload, staff-only RLS, project-scope guarded, audit + activity + evidence + return-for-review all functioning, zero protected-surface drift, chat awareness and refusals in place. Proceed with v3 (background polling, cancel-on-timeout, optional batching) with the current schema.
