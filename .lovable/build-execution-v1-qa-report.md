# Build Execution / OpenClaw Handoff v1 — End-to-End QA Report

**Scope of this QA**: Per the instructions ("do not run shell commands, do not
apply migrations, do not deploy"), this pass is a **static + database
audit**: schema, RLS, grants, triggers, server-function contracts, AI
prompt safety, chat integration, and protected-surface isolation. Live UI
click-through / AI generation on the Jotaye project was **not exercised**
in this pass and is called out under "Known limitations".

---

## Executive Summary

Build Execution v1 is **structurally shipped and safe**. Schema, RLS,
grants, lifecycle triggers, staff assertions, AI prompt safety suffix, and
chat awareness are in place with no protected-surface drift risk.

**Recommendation**: ✅ **Safe to move to OpenClaw Direct Connection v2**,
with two non-blocking fixes queued (NBA integration + a live end-to-end run
on Jotaye to record real screenshots/AI output before v2 wiring).

---

## 1. Route + Access Results — ✅ PASS

- Route file present: `src/routes/engine.projects.$projectId.build-execution.tsx`
- Registered in `src/routeTree.gen.ts`
- Nav link added in `WorkspaceHeader.tsx` (after Implementation Plan)
- All 13 server-fn exports call `assertStaff(context)` before any read/write
  (`getProjectBuildExecution`, `generateBuildPackets`, `saveBuildPacketDraft`,
  `markBuildPacketReady`, `handoffBuildPacket`, `markBuildPacketInProgress`,
  `markBuildPacketReturned`, `markBuildPacketQaRequired`, `acceptBuildPacket`,
  `rejectBuildPacket`, `archiveBuildPacket`, `addBuildEvidence`,
  `listPacketEvidence`)
- Route lives outside `_authenticated/` layout only via server-fn gate, but
  `requireSupabaseAuth` middleware forces auth on every call — anon returns
  401 by design.

## 2. Readiness Results — ✅ PASS

- `generateBuildPackets` server-side gate: selects
  `engine_project_implementation_plans` filtered by
  `.eq("status","approved").not("approved_at","is",null).order("approved_at",...)`
  → refuses without an approved plan.
- UI disables the generate button and surfaces the reason (from
  `assessBuildExecutionReadiness`).

## 3. Generate Build Packets Results — ⚠ NOT LIVE-VERIFIED

Static contract is correct:
- Inserts to `engine_project_build_packets` with `implementation_plan_id`
  FK (`ON DELETE RESTRICT`), `sequence_number`, `priority`, `packet_type`,
  `status='draft'`.
- Writes `engine_audit_log` + `engine_activity` (`build_packets_generated`).
- No external calls to OpenClaw / Lovable, no `execSync`, no `net.http_post`.
- Row count in DB: **0 packets / 0 evidence** — no live generation has
  been executed yet in production.

**Action**: run one live generation on Jotaye Ventures to capture the AI
JSON output as an artifact before v2.

## 4. Packet Payload Schema Results — ✅ PASS (contract)

Server normalizer (`src/lib/engine-build-execution.functions.ts:539–580`)
enforces every required field: `packet_goal`, `source_implementation_steps`,
`target_builder`, `execution_scope.{included,excluded,expected_files_or_surfaces,do_not_touch}`,
`handoff_prompt`, `context_summary`, `implementation_steps`,
`acceptance_criteria`, `qa_requirements`, `evidence_required`,
`risk_notes`, `rollback_notes`, `dependencies`, `blocking_conditions`,
`post_execution_checks`, `open_decisions`.

Schema-level constraints:
- `packet_type` CHECK: `lovable|openclaw|developer|qa|mixed`
- `priority` CHECK: `p0|p1|p2`
- `status` CHECK: 9-state enum
- FK to `engine_project_implementation_plans` REQUIRED (NOT NULL)

## 5. Safety Prompt / Do-Not-Touch Results — ✅ PASS

- Prompt (`engine-build-execution-prompt.server.ts:98–116`) requires
  `do_not_touch` to include `approved implementation plan payload`,
  `approved backend plan payload`, `approved QA plan payload`,
  `roadmap approvals`, `client_portal_* tables`, `investment terms`,
  `engine_projects.status = delivered flag`.
- Normalizer **appends** `SAFETY_SUFFIX` to any handoff prompt missing
  the verbatim line "DO NOT deploy code" — the four safety lines cannot
  be omitted even if the AI drops them.

## 6. UI Rendering Results — ⚠ NOT LIVE-VERIFIED

Route renders: header, project status, NBA, approved-plan badge, packet
count, Generate button, Overview, Board grouped by status, packet cards,
detail drawer, Copy prompt, Evidence section, AI PM panel. Structure
confirmed by source read; visual screenshots not captured this pass
(shell-run restriction).

## 7. Copy Prompt Results — ✅ PASS (contract)

`handoff_prompt` field only — no system prompt, provider key, or bearer
token is included in the packet payload persisted to DB.

## 8. Lifecycle Transition Results — ✅ PASS

DB-level enforcement via `tg_engine_build_packets_enforce`:
- Archive allowed from any status.
- `accepted` and `archived` are terminal (except archive of accepted).
- Valid transitions: `draft→ready`, `ready→{handed_off,draft}`,
  `handed_off→{in_progress,returned}`,
  `in_progress→{returned,qa_required,handed_off}`,
  `returned→{in_progress,ready,qa_required}`,
  `qa_required→{accepted,rejected,in_progress}`,
  `rejected→{draft,ready}`.
- All others raise `check_violation`. Invalid transitions (`draft→accepted`,
  `accepted→in_progress`, `archived→ready`, `accepted→draft`) are blocked
  at trigger level — cannot be bypassed by UI.

## 9. Evidence Results — ✅ PASS

- Table `engine_project_build_evidence`: append-only via
  `tg_engine_build_evidence_no_update` (raises on UPDATE).
- FK cascade on packet delete, project delete.
- Staff-only SELECT policy.
- `evidence_type` CHECK covers `screenshot|log|diff_summary|qa_report|link|note|artifact`.

## 10. Accept / 11. Reject / 12. Archive — ✅ PASS

- `acceptBuildPacket` sets `accepted_by_*`, `accepted_at`, audits
  `build_packet_accepted`.
- `rejectBuildPacket` stores `rejected_reason`, audits
  `build_packet_rejected`.
- `archiveBuildPacket` sets `archived_at`, audits `build_packet_archived`.
- **No** side effects to `engine_projects.status`, roadmap approvals,
  client portal, or QA plan status.

## 13. Project Chat Build Awareness Results — ✅ PASS

- `engine-chat-context.server.ts` includes a `build_execution` slice
  (packet counts, next_packet, blocked_packets, packets_missing_evidence,
  accepted_count, all_accepted_ready_for_delivery).
- `engine-chat-prompt.server.ts` HARD RULE forbids chat from running
  OpenClaw, applying migrations, marking QA tests passed, marking the
  project delivered, accepting/rejecting/archiving packets, or adding
  build evidence on the user's behalf. Chat must respond with
  "I can prepare this as a proposal, but I cannot execute or approve it
  from chat."

## 14. Permission / RLS Results — ✅ PASS

Verified via `pg_class.relacl`:
- `engine_project_build_packets`: `authenticated=r`, `service_role=arwdDxtm`
- `engine_project_build_evidence`: `authenticated=r`, `service_role=arwdDxtm`
- RLS ENABLED on both.
- SELECT policy: `is_engine_staff()` only.
- **No** INSERT/UPDATE/DELETE policies for `authenticated` → all mutations
  must flow through server functions (service role). Direct browser writes
  are impossible.

## 15. Protected Surface Regression — ✅ PASS (static)

Full-repo grep confirms Build Execution code never writes to:
`client_portal_*`, `roadmap_approvals`, `roadmap_documents`,
`engine_projects.status`, investment fields, `engine_tasks`,
`engine_milestones`, or approved upstream payload tables
(`engine_project_frames`, `_mockups`, `_backend_plans`, `_qa_plans`,
`_implementation_plans`).

Only tables written by this feature: `engine_project_build_packets`,
`engine_project_build_evidence`, `engine_audit_log`, `engine_activity`.

## 16. Audit / Activity Results — ✅ PASS

Every lifecycle transition writes both audit + activity rows. Payloads
persisted to `engine_audit_log` are field-level (status/id/reason) — no
system prompts, no provider keys, no bearer tokens.

## 17. Next Best Action Results — ❌ GAP (non-blocking)

`compute_engine_next_best_action` source does **NOT** reference
`build_packet` or `build_execution` — verified via
`SELECT prosrc LIKE '%build_packet%'` → `f`. NBA will not guide operators
through packet handoff / QA / acceptance stages, and will not detect
"all packets accepted → ready to deliver".

**Fix required before v2**: extend `compute_engine_next_best_action` and
`recompute_engine_project_state` to branch on
`engine_project_build_packets` after the approved implementation plan
branch.

## 18. Regenerate Packets Results — ⚠ NEEDS LIVE VERIFICATION

Server function appends new rows with fresh `sequence_number`s; there is
no DELETE on regenerate and the `enforce` trigger prevents accepted
packets from mutating. Behavior on the second `generateBuildPackets`
call needs one live-run confirmation to snapshot the ordering strategy.

## 19. Regression Results — ✅ PASS

Prior surfaces untouched. Only additive edits to
`WorkspaceHeader.tsx`, `engine-chat-context.server.ts`,
`engine-chat-prompt.server.ts`, `types.ts`, `routeTree.gen.ts`.
Typecheck was clean on the prior turn.

---

## Screenshots

Not captured this pass (shell-run restriction). Recommend one live
Playwright run against `/engine/projects/<jotaye-id>/build-execution`
after generating packets, capturing: full page, board, detail drawer,
handoff panel, evidence form, AI PM panel, tablet + mobile viewports.

## Top Fixes (priority order)

1. **NBA integration** — teach `compute_engine_next_best_action` and
   `recompute_engine_project_state` about build packets so operators
   are guided from "impl plan approved" → "hand off packet 1" →
   "QA packet 3" → "all accepted, ready for delivery". Non-blocking
   for v2 wiring but blocking for operator UX.
2. **One live generation on Jotaye Ventures** to (a) confirm AI output
   validates against the payload schema, (b) capture screenshots,
   (c) confirm regenerate behavior.
3. **Consider grant SELECT/INSERT/UPDATE/DELETE to authenticated** is
   intentionally omitted — mutations must go through server fns. If any
   future admin tool wants direct writes, add narrow policies rather
   than broad grants.

## Recommendation

✅ **Safe to move to OpenClaw Direct Connection v2**, with the NBA
integration fix landed in the same turn as v2 wiring so operators have
a coherent "what's next" story once packets start flowing.

Live-run confirmations (§3, §6, §18) can happen alongside v2 dev; the
static contract is sound and the trigger + prompt guardrails make
autonomous execution impossible from this layer.
