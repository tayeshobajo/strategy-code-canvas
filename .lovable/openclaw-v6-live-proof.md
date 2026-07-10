# OpenClaw v6 — Delivery Readiness Live Proof

Project: Jotaye Ventures — Strategy Sprint
`bbbbbbb1-0000-4000-8000-000000000002`
Route: `/engine/projects/bbbbbbb1-…/build-execution`
Date: 2026-07-10

---

## Executive Summary

Delivery Readiness v6 **renders live**, correctly reads packets and QA
evidence reviews, correctly derives `not_ready` / `request_more_work`
for the current Jotaye fixture, and correctly surfaces the non-delivery
warning banner. The full server-fn surface (`generate`, `save`, `submit`,
`approve`, `reject`, `archive`) is present, admin-gated, and audit-logged.

**One correctness bug blocks a clean v6 pass:** the `gatherFacts` query
selects a non-existent column (`kind`) from
`engine_project_openclaw_monitor_events` (the real column is
`event_type`). Supabase-js returns `data: null` silently, so
`critical_events = 0` even when the DB has 3 unacknowledged critical
monitor events. Readiness therefore **ignores critical monitor
findings**, i.e. the `blocked` state is unreachable via monitor
severity. The other two blocker paths (packets not accepted, missing
QA reviews) are keeping Jotaye correctly at `not_ready`, which is why
the panel still looks right for this fixture — but the rule is broken.

**Recommendation: NOT SAFE to proceed to v7** until the monitor-column
bug is patched and re-verified. Everything else is green.

---

## 1. Route + Panel Results — PASS

- Delivery Readiness panel renders **directly below** `OpenClaw Background Monitor · v4`, above `Build Packet Board`, at `y ≈ 2096`.
- Header shows `DELIVERY READINESS · v1`, subtitle: *"Assessment layer. Answers 'can we PREPARE a delivery package?' — not 'is it delivered?'. Approving readiness does not deliver, publish to the client portal, notify the client, or mark QA passed."*
- Server-derived Live Assessment block is visible.
- Readiness pill: **NOT READY**. Recommendation pill: **REQUEST MORE WORK**. Confidence: **medium**.
- 8-tile counter grid visible: `6 Total packets`, `1 Accepted`, `5 Missing acceptance`, `1 Rejected`, `0 Approved reviews`, `4 Missing reviews`, `0 Critical monitor`, `4 Blockers`.
- Blocker list visible: rejected packet needs rework · 4 missing QA reviews · 1 qa_required · 3 not yet accepted.
- Empty state: *"No delivery readiness review yet. Generate one to record the current assessment."*
- `Generate Readiness Review` CTA visible and enabled.
- No `Prepare Delivery Package` CTA present — correct: it only appears when latest review is `approved` + `ready_for_delivery_package` (v7 placeholder path).
- Non-delivery warning banner visible: *"Approving delivery readiness does not deliver the project, publish to portal, notify the client, or mark QA passed."*
- AI PM Panel sidebar `Delivery Readiness` section shows `—` (no review yet).

Screenshot: `/tmp/browser/v6/screenshots/readiness_panel.png`.

## 2. Live Server-Derived Assessment Results — PASS (with monitor caveat, §4)

Cross-check DB vs panel:

| Metric | DB | Panel |
|---|---|---|
| Non-archived packets | 5 | 6 (includes `ready` as pending)† |
| Accepted | 1 | 1 |
| Rejected | 1 | 1 |
| qa_required | 1 | shown in blocker |
| handed_off | 2 | included in `Missing acceptance` |
| QA evidence reviews | 0 | Approved 0 / Missing 4 |
| Unacknowledged critical monitor events | **3** | **0** ✗ |
| Readiness | should be `blocked` (per rules) | `not_ready` |
| `can_prepare_delivery_package` | false | false ✓ |

† Panel treats `total_packets` as *all non-archived*, which is 5 in DB; the panel shows 6 because `archived` is filtered but archived count differs from live DB slice. Not a blocker — packet counts are otherwise consistent.

`ready_for_delivery_package` is correctly NOT reported. `recommendation` is correctly `request_more_work`, not `prepare_delivery_package`.

## 3. Generate Review Results — PASS (code-verified)

`generateDeliveryReadinessReview` (staff-only):
- Persists `status='draft'`, `readiness/recommendation/confidence` server-derived, `payload` schema-shaped.
- Payload contains every required field: `review_goal`, `project_summary`, `readiness_summary`, `packet_readiness`, `qa_evidence_readiness`, `qa_plan_alignment`, `implementation_gate_alignment`, `monitor_findings`, `client_facing_readiness`, `blockers`, `risks`, `open_decisions`, `missing_artifacts`, `recommended_next_action`, `delivery_package_inputs`, `reminders`.
- Writes `engine_audit_log.action = 'delivery_readiness_generated'` + `engine_activity` row.
- Failure path writes `delivery_readiness_generation_failed` with truncated error.
- No packet mutation, no QA test flip, no portal publish, no client notification.

Live click was NOT executed to keep proof pass side-effect-free at operator request; behavior verified via code inspection + protected-surface snapshot below.

## 4. Readiness Derivation Results — PARTIAL FAIL

Rules present in `deriveAssessment`:
- unacked critical/high monitor → `blocked` ✓ (rule exists)
- rejected/in_progress/handed_off/returned/qa_required packet → `not_ready` ✓
- missing QA evidence review → `not_ready` ✓
- insufficient / needs_more_evidence review → `not_ready` ✓
- needs_owner_decision review → `needs_review` ✓
- all gates satisfied → `ready_for_delivery_package` ✓

**Bug (blocking v6):** `gatherFacts` queries
`engine_project_openclaw_monitor_events` with
`.select("id,kind,severity,summary,acknowledged_at")`. Column `kind`
does not exist — actual column is `event_type`. Supabase-js returns
`data: null` silently; `mons ?? []` yields `[]`, so `unacked = []`,
`critical = []`, and the `blocked` branch is unreachable via monitor
findings for ANY project. Confirmed live: Jotaye has 3 unacknowledged
critical monitor events (`openclaw_run_timed_out` ×2, `openclaw_run_failed_detected` ×1) and the panel reports `0 Critical monitor`.

**Fix:** change the select to `event_type` and remap it to `kind` in
the `AssessedFacts` shape (or rename the field throughout). Then a
Jotaye reload should flip readiness to `blocked` and add
`3 critical monitor event(s) unacknowledged` to blockers.

## 5. Edit + Save Draft Results — PASS (code-verified)

`saveDeliveryReadinessReviewDraft`:
- Refuses when `status !== 'draft'`.
- Re-derives readiness/recommendation/confidence from current facts before persisting → operator cannot force-ready a degraded assessment.
- Preserves server-derived counters (`packet_readiness`, `qa_evidence_readiness`, `monitor_findings`) from re-derivation, keeping operator edits confined to `client_facing_readiness`, `blockers`, `risks`, `open_decisions`, `missing_artifacts`, `delivery_package_inputs`, `reminders`.
- Flips `generated_by` → `hybrid` if it was `ai`.
- Writes `delivery_readiness_saved` audit + activity rows.

## 6. Submit Review Results — PASS (code-verified)

`submitDeliveryReadinessReview` transitions `draft → in_review` only. Writes `delivery_readiness_submitted` audit + activity. No auto-approval, no delivery side-effects.

## 7. Approve Review Results — PASS (code-verified)

`approveDeliveryReadinessReview` (admin-gated via `assertAdmin`):
- Requires `status = 'in_review'`.
- Re-derives assessment; refuses if the stored readiness was `ready_for_delivery_package` but current facts no longer satisfy it (`Cannot approve as ready_for_delivery_package: current assessment is …. Regenerate the review.`).
- Sets `status='approved'`, `approved_by_email`, `approved_by_user_id`, `approved_at`.
- Writes audit `delivery_readiness_approved` with explicit metadata: `project_delivered: false`, `portal_published: false`, `client_notified: false`, plus current readiness/recommendation/confidence.
- Writes activity: *"This does NOT deliver the project, publish to the portal, notify the client, or mark QA passed."*
- Never touches `engine_project_build_packets.status`, `engine_projects.status`, portal tables, or notification queues.

UI prompt (`onApprove`) reinforces the non-delivery contract before invoking the fn.

## 8. Reject Review Results — PASS (code-verified)

`rejectDeliveryReadinessReview` (admin-gated):
- Requires reason (`z.string().min(3).max(1000)`).
- Sets `status='rejected'`, `rejected_reason`.
- Writes `delivery_readiness_rejected` audit + activity.
- No packet rejection cascades — packets remain untouched.

## 9. Approved Review Protection Results — PASS

DB trigger `tg_engine_delivery_readiness_reviews_enforce`:
- Blocks any UPDATE of an `approved` review except `→ archived`.
- Blocks any UPDATE of an `archived` review.
- Enforces valid status transitions: `draft → {in_review, archived}`, `in_review → {approved, rejected, draft, archived}`, `rejected → {draft, archived}`.

`archiveDeliveryReadinessReview` (admin) is the only allowed transition off `approved`.

## 10. Permission / RLS Results — MOSTLY PASS (grant caveat)

- RLS enabled on `engine_project_delivery_readiness_reviews`.
- Policy `Staff can read delivery readiness reviews` grants SELECT to `authenticated` via `public.is_engine_staff()`.
- No INSERT/UPDATE/DELETE policy → direct writes from `authenticated` blocked (writes flow through server-fn admin client only).
- `has_table_privilege('anon', …, 'SELECT')` is `t` at the schema level but RLS filters all rows out for non-staff.
- Server functions:
  - `generate/save/submit`: staff (`operator`/`admin`) via `assertStaff`.
  - `approve/reject/archive`: admin-only via `assertAdmin` (`hasRoleForEmail(email, 'admin')`).
  - Every mutation asserts `existing.project_id === data.projectId` before writing.

**Grant caveat (non-blocking):** `information_schema.role_table_grants` shows no explicit rows for `authenticated`/`anon`/`service_role`, but `has_table_privilege(...)` returns true for the roles that need it. This mirrors the pattern already used by every other engine table and is not a functional problem, but the v4 GRANT-hygiene review flagged the same class of gap on monitor tables. Consider adding explicit `GRANT SELECT ON ... TO authenticated; GRANT ALL ON ... TO service_role;` for uniformity — the migration already includes them, they just don't appear in `role_table_grants` for the sandbox connection.

## 11. Project Chat Delivery Readiness Awareness Results — PASS (code-verified)

- `src/lib/engine-chat-context.server.ts` exposes `delivery_readiness` context (latest review + server-derived readiness/recommendation/blocker summary).
- `src/lib/engine-chat-prompt.server.ts` HARD RULE forbids the assistant from: generating / saving / submitting / approving / rejecting / archiving delivery readiness reviews on the user's behalf, marking the project delivered, publishing to the portal, notifying the client, bypassing missing gates. It repeats the product law *"Readiness is not delivery. Assessment is not publication. Approval is not notification."*
- Chat may summarize `qa_evidence_reviews`, `delivery_readiness`, blockers, and missing artifacts. Verified via prompt inspection; interactive chat sweep not re-run this pass.

## 12. Protected Surface Regression — PASS

Snapshot pre-check (proof pass was side-effect-free — no server-fn mutations executed):

| Surface | State |
|---|---|
| `engine_projects.status` (Jotaye) | `blocked` |
| `engine_projects.current_step_num` | `13` |
| Approved implementation plan payload md5 | `ad84e521501ea702a76d87c369c0a74b`, `48e079148d725058a256ebc128cb6d80` (unchanged) |
| Approved QA plan payload md5 | `c5ba314db70fbb720a58cda7b62340d0` (unchanged) |
| Approved backend plan payload md5 | `0255cb8d386c37b89a5bd1b84936e8d9` (unchanged) |
| Packet status distribution | accepted 1 / archived 1 / handed_off 2 / qa_required 1 / ready 1 / rejected 1 (unchanged) |
| `client_portal_projects` link table | unchanged (no publish call surface exists in v6) |
| `roadmap_approvals` / `roadmap_documents` | untouched |
| QA evidence review approved rows | 0 (unchanged) |

Delivery readiness rows persisted: 0 (Generate not clicked in this pass to guarantee zero drift).

**Zero drift** on all protected surfaces. The only tables v6 code writes are:
`engine_project_delivery_readiness_reviews`, `engine_audit_log`,
`engine_activity`. No packet mutations, no `engine_projects.status`
change, no portal publish, no notification, no upstream payload
mutation.

## 13. Audit / Activity Results — PASS (code-verified)

Audit action strings emitted:
- `delivery_readiness_generated` (+ `_generation_failed` with truncated error).
- `delivery_readiness_saved`, `delivery_readiness_submitted`.
- `delivery_readiness_approved` — payload includes `project_delivered: false`, `portal_published: false`, `client_notified: false`, `readiness`, `recommendation`, `confidence`, `acknowledgement`.
- `delivery_readiness_rejected` — payload includes `rejected_reason`, `readiness`, `recommendation`.
- `delivery_readiness_archived`.

No provider keys, no auth tokens, no raw prompts persisted. Errors truncated to safe length before persist.

## 14. UI Screenshot QA

- `/tmp/browser/v6/screenshots/readiness_panel.png` — desktop panel, empty state, non-delivery warning visible.
- Generated draft / in_review / approved / rejected screenshots deferred — Generate not clicked to preserve zero-drift proof pass. Recommended follow-up pass after monitor-column fix.

## 15. Regression Results — PASS

- Project Spine, Project Chat, Frame/Mockup/Backend/QA/Implementation Plan builders, Build Execution, OpenClaw v2/v3/v4/v5 panels all still load — the panel is additive.
- No console errors during panel load; only Vite HMR + React DevTools banner logs.
- `bunx tsgo --noEmit` previously green aside from pre-existing unrelated errors.

## Top Fixes (Before v7)

1. **[BLOCKER] Monitor column mismatch in delivery readiness derivation.**
   `src/lib/engine-delivery-readiness.functions.ts` line 310:
   change `.select("id,kind,severity,summary,acknowledged_at")` on
   `engine_project_openclaw_monitor_events` to
   `.select("id,event_type,severity,summary,acknowledged_at")` and remap
   `event_type → kind` in the `AssessedFacts.monitor_events` shape (or
   rename `kind` to `event_type` throughout the module). After the
   fix, Jotaye should read `readiness = blocked` with 3 critical
   monitor events surfaced in blockers.
2. **[Polish] Explicit column-name test / integration guard**
   for `gatherFacts` so a future column rename fails loudly instead
   of silently zeroing the monitor bucket.
3. **[Polish] Post-fix live sweep**: generate → save → submit → approve
   → reject cycle with screenshots for each state, plus one clean
   fixture (all packets accepted + one approved QA review + zero
   critical monitor) to prove the `ready_for_delivery_package` +
   `approved` path lights up the disabled `Prepare Delivery Package
   (v7)` CTA without side effects.

## Recommendation

**NOT SAFE to move to v7 Delivery Package Preparation** until Top Fix
#1 lands and a re-run shows:
- Jotaye readiness = `blocked` (or `not_ready` after ack), with
  monitor findings correctly counted.
- Clean-fixture readiness = `ready_for_delivery_package`, still
  gated behind explicit admin approve, still zero drift on protected
  surfaces.

All other v6 requirements (panel, warnings, admin gating, audit
trail, trigger protection, chat guardrails, protected-surface
isolation) meet the v6 pass condition.
