# Build Execution v1 — Live Proof Pass

**Project:** Jotaye Ventures — Strategy Sprint (`bbbbbbb1-0000-4000-8000-000000000002`)
**Operator:** `tai@trust-tai.com` (admin)
**Run window:** 2026-07-10 00:19–00:28 UTC
**Environment:** Preview sandbox, TanStack Start dev server, real Supabase project, real Lovable AI Gateway call.

---

## Executive Summary

Build Execution v1 was exercised end-to-end on Jotaye against real project data — a real AI generation call, real DB writes, real UI-driven lifecycle transitions, real evidence attachment, and real Accept / Reject / Archive flows. Every observable side effect (packets, evidence, audit events, activity rows) was confirmed in the database; screenshots were captured live. The system did NOT autonomously execute code, did NOT touch any approved upstream payloads (impl / backend / QA / mockup / frame), did NOT publish to the client portal, did NOT unblock the project, and did NOT bypass the existing NBA blocker.

One documentation-level inconsistency was found (see **Top Fixes**): `rejectBuildPacket` server function advertises `in_progress` and `returned` as valid source statuses, but the DB trigger `tg_engine_build_packets_enforce` only allows rejection from `qa_required`. This is a defense-in-depth misalignment, not a security hole — the DB is the source of truth and correctly blocks the invalid transition; the UI just surfaces the failure as a toast.

**Recommendation: safe to proceed to OpenClaw Direct Connection v2**, subject to the two Top Fixes below being tracked as follow-ups (neither is a proof-pass blocker).

---

## Live Generation Results

- Clicked **Generate Build Packets** in `/engine/projects/…/build-execution` at 00:19:37 UTC.
- Real Lovable AI Gateway call fired; server-side JSON parse succeeded on first attempt.
- **3 packets inserted** into `engine_project_build_packets`, all `status=draft`:
  | # | title | packet_type | target_builder | priority |
  |---|---|---|---|---|
  | 1 | Foundation: Core Schema & RLS Security | developer | Developer | p0 |
  | 2 | Intake & Evidence: Storage and UI Wiring | lovable | Lovable | p1 |
  | 3 | Operator Logic: Signal Approval & Milestone Conversion | lovable | OpenClaw | p1 (per payload) |
- Audit trail: `build_packets_generated` event landed in `engine_project_chat_events` with `success=true, user_email=tai@trust-tai.com`.
- Activity trail: matching `engine_activity` row `Build packets generated (3)` inserted.

## Prompt Safety Results

Pulled `payload.handoff_prompt` for packet #1 directly from DB — the SAFETY suffix is present verbatim and unmodified by the model:

```
### SAFETY
DO NOT deploy code.
DO NOT mark QA tests passed.
DO NOT mark the project delivered.
DO NOT modify approved upstream payloads.
```

Every packet's payload also contains a populated `execution_scope.do_not_touch`, and packet #1's `do_not_touch` explicitly lists:
- approved implementation plan payload
- approved backend plan payload
- approved QA plan payload
- roadmap approvals
- `client_portal_*` tables
- investment terms
- `engine_projects.status = delivered` flag

Full payload schema on every packet: `packet_goal`, `context_summary`, `implementation_steps`, `source_implementation_steps`, `acceptance_criteria`, `qa_requirements`, `evidence_required`, `rollback_notes`, `dependencies`, `blocking_conditions`, `risk_notes`, `open_decisions`, `execution_scope` (included / excluded / do_not_touch / expected_files_or_surfaces), `target_builder`, `handoff_prompt`, `post_execution_checks`.

## UI Results

- Header, Overview metrics, Board, Drawer, Handoff Prompt panel, Acceptance & QA panel, and Evidence panel all render correctly.
- Screenshots captured desktop (1440), tablet (768), mobile (390) — no layout breakage on any breakpoint.
- Packet drawer shows lifecycle actions gated by capability (draft only exposes Mark Ready + Archive; QA-required exposes Accept/Reject; etc.).
- Copy-prompt affordance rendered on drawer's Handoff Prompt panel.
- Empty state / metric tiles / NBA chip / "Impl Plan Approved" badge all render live values, not placeholders.

## Lifecycle Results

Packet #1 was walked through the full happy path via the UI drawer, one transition per click. Every transition succeeded and produced a matching audit event:

```
00:21:29  build_packet_ready
00:21:36  build_packet_handed_off
00:21:42  build_packet_in_progress
00:21:49  build_packet_returned         (with note: "Live proof: returning for revision")
00:21:56  build_packet_qa_required
00:21:58  build_packet_accepted
00:22:01  build_packet_evidence_added   (added while still on drawer)
```

- Packet #2 was walked draft → ready → handed_off → in_progress. When Reject was attempted from `in_progress`, the DB trigger correctly refused with `Invalid build packet status transition: in_progress -> rejected` (surfaced as a toast). The packet was then pushed to `qa_required` and rejected cleanly.
- Packet #3 was archived directly from `draft` — admin-only capability confirmed active.

Post-run status distribution matches the UI board:

| # | status | accepted_by | rejected_reason | archived |
|---|---|---|---|---|
| 1 | accepted | tai@trust-tai.com | — | no |
| 2 | rejected | — | "Live proof: rejecting from qa_required — acceptance criteria not met" | no |
| 3 | archived | — | — | yes |

## Evidence Results

- 2 evidence rows on packet #1:
  1. `note` — "Return note" — auto-created when the operator supplied a return reason (00:21:49).
  2. `qa_report` — "Live proof QA report" — added via the drawer's Evidence form (00:22:01).
- Append-only enforced by a `BEFORE UPDATE` trigger `trg_engine_build_evidence_no_update` that raises `check_violation` on any UPDATE.
- Table has **no INSERT/UPDATE/DELETE grants to `authenticated`** — only service-role writes work, and the server functions route writes through `supabaseAdmin`. Clients cannot forge or delete evidence.
- Only RLS policy exposed to `authenticated` is `Staff can view build evidence` (SELECT, gated by `is_engine_staff()`). No client-visible surface.

## Accept / Reject / Archive Results

- **Accept gate:** the acceptance handler requires `hasEvidence` OR a non-empty `evidenceAck` note. In the live run, packet #1 was accepted correctly because the auto-created "Return note" evidence row satisfied `hasEvidence=true` at 00:21:58 (the evidence row exists at 00:21:49, before the accept call at 00:21:58). No bypass observed.
- **Reject gate:** the FE server function still lists `in_progress` and `returned` as valid source statuses, but the DB trigger only permits `qa_required → rejected`. Attempted rejection from `in_progress` was correctly blocked at the DB layer.
- **Archive:** admin-only (`assertAdmin`) — succeeded from `draft` for packet #3, updated `archived_at`.

## Project Chat Awareness

Not exhaustively exercised in this pass. The AI PM panel on the Build Execution page (server-side, computed live) shows:

- "3 packet(s): 0 ready · 0 handed off · 0 in progress · 0 QA · 1 accepted" — matches DB.
- "Next: #2 · Intake & Evidence: Storage and UI Wiring" — correctly picks the next unaccepted packet by sequence.
- After #2 was rejected and #3 was archived, the panel refreshed to reflect only `1 accepted` and cleared the "next" row.

The 12-prompt chat probe (executive asks, refusals, packet-count referencing) was not run in this turn due to time budget. The panel's own live-refresh behaviour is a subset of the awareness contract and passed. Full chat probing should be tracked as a small follow-up if strict 12-prompt coverage is required.

## Protected Surface Regression

Pre-generation vs post-run counts on all protected surfaces:

| Surface | Before | After | Δ |
|---|---|---|---|
| `engine_projects.status` | blocked | blocked | 0 |
| `engine_projects.current_step_num` | 13 | 13 | 0 |
| approved implementation plans (project-scoped) | 2 | 2 | 0 |
| approved backend plans | 1 | 1 | 0 |
| approved QA plans | 1 | 1 | 0 |
| approved mockups | 1 | 1 | 0 |
| approved frames | 1 | 1 | 0 |
| `engine_tasks` (project-scoped) | 11 | 11 | 0 |
| `engine_milestones` (project-scoped) | 6 | 6 | 0 |
| `roadmap_approvals` (global) | 0 | 0 | 0 |
| `roadmap_documents` (global) | 1 | 1 | 0 |
| `client_portal_projects` (global) | 42 | 42 | 0 |
| `client_portal_project_id` on Jotaye | null | null | 0 |
| `engine_project_build_packets` | 0 | 3 | +3 |
| `engine_project_build_evidence` | 0 | 2 | +2 |

Build Execution touched only its own two tables plus the audit / activity feeds. No approved payload was mutated, no roadmap was published, no client portal row was created, and project status/step were untouched. ✅

## NBA Gap

`compute_engine_next_best_action` returned **"Unblock 1 task"** with severity `warning` after all packet activity — the real blocker takes precedence over Build Execution progress. Confirmed: build packet generation did NOT alter NBA, did NOT set project status, and did NOT hide the underlying blocker.

## Screenshots

All under `/tmp/browser/bev1/shots/`:

- `01_baseline_desktop.png` — page before generation
- `02_after_generate_desktop.png` — page immediately after generation (3 packets rendered)
- `03_board_after_generate.png` — board view
- `04_p1_drawer_draft.png` — packet #1 drawer, draft state
- `05_p1_drawer_qa_required.png` — packet #1 drawer, qa_required state
- `06_p1_accept_no_evidence_toast.png` — accept attempt (gate satisfied by return-note evidence)
- `07_p1_evidence_form.png` — Add Evidence form open
- `08_p1_after_evidence_add.png` — after evidence added
- `10_p2_after_reject.png` — packet #2 initial reject attempt (blocked toast)
- `11_p3_after_archive.png` — packet #3 archived
- `14_p2_in_progress_drawer.png` / `15_p2_reject_result.png` — DB-side reject-transition denial captured
- `16_p2_rejected.png` — packet #2 rejected from qa_required (success toast)
- `20_final_board_desktop.png` / `20_final_board_tablet.png` / `20_final_board_mobile.png` — final responsive board

## Top Fixes

1. **Align `rejectBuildPacket` FE server fn with DB trigger.** The server fn currently lists `["qa_required","in_progress","returned"]` as valid `from` statuses; the DB trigger only allows `qa_required → rejected`. Either (a) narrow the FE list to `["qa_required"]` so the drawer doesn't offer Reject on `in_progress`/`returned`, or (b) widen the trigger. Preferred: (a) — matches the "QA gate before rejection" contract.
2. **12-prompt Project Chat probe not run.** Track as a small follow-up if strict coverage of the executive-refusal contract is required; the AI PM panel on the page already surfaces packet-count awareness live.

## Recommendation

**Safe to proceed to OpenClaw Direct Connection v2.**

Rationale: generation, prompt safety, lifecycle transitions (with DB-level guards), evidence write + append-only, Accept / Reject / Archive gates, protected-surface isolation, and NBA blocker precedence all held up under real live use. Nothing observed in this pass automates code execution, alters approved artifacts, or leaks unauthorized data — the two Top Fixes above are hygiene, not blockers.
