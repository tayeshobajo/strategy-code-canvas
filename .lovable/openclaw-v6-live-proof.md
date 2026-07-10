# OpenClaw v6 Delivery Readiness — Post-Fix Live Re-Proof

Project: **Jotaye Ventures — Strategy Sprint** (`bbbbbbb1-0000-4000-8000-000000000002`)
Route: `/engine/projects/bbbbbbb1-0000-4000-8000-000000000002/build-execution`

## Files changed (fix)

- `src/lib/engine-delivery-readiness.functions.ts`
  - `gatherFacts` now selects `event_type` from `engine_project_openclaw_monitor_events` and remaps to `kind` in `AssessedFacts.monitor_events`.
  - Monitor query error is captured on `AssessedFacts.monitor_load_error` and translated to a `"Monitor findings could not be loaded."` blocker in `deriveAssessment`. Errors are also logged to server console (`console.error`).

## Exact code fix

```ts
// select
.select("id,event_type,severity,summary,acknowledged_at")

// remap + error guard
if (monsResult.error) {
  monitor_load_error = monsResult.error.message || "Monitor events query failed";
  console.error("[delivery-readiness] monitor events query failed:", monsResult.error);
} else {
  monitor_events = data.map((e) => ({
    id: e.id, kind: e.event_type, severity: e.severity,
    summary: e.summary, acknowledged_at: e.acknowledged_at,
  }));
}

// deriveAssessment
if (facts.monitor_load_error) blockers.push("Monitor findings could not be loaded.");
if (critical.length > 0) blockers.push(`${critical.length} critical monitor event(s) unacknowledged`);
```

## 1. Jotaye blocked-readiness proof — PASS

DB truth for Jotaye:

| metric | value |
|---|---|
| unacknowledged monitor events, severity in (critical,high) | **3** |
| accepted packets | 1 |
| non-accepted packets | 5 |
| approved QA evidence reviews | 0 |

Live UI (build-execution page, Delivery Readiness · v1 panel):

- Readiness: **BLOCKED**
- Blockers row: `3 critical monitor event(s) unacknowledged · 1 rejected packet(s) need rework · 4 packet(s) missing QA evidence review · 1 packet(s) still in qa_required · 3 packet(s) not yet accepted`
- Critical monitor tile: **3**
- "Prepare Delivery Package" CTA: not rendered (readiness ≠ ready_for_delivery_package). `can_prepare_delivery_package = false` via the `capabilities` server function.
- Recommendation surfaced by generated draft: `escalate_to_operator` (not `prepare_delivery_package`).

## 2. Monitor query error guard — CODE-VERIFIED

Not simulated live (would require injecting a bad column against the real table, which is out of scope for a proof pass). Code-verified path:

- `gatherFacts` destructures the Supabase result as `monsResult` and inspects `monsResult.error` before touching `.data`.
- On error: sets `monitor_load_error`, logs `[delivery-readiness] monitor events query failed:` server-side, and leaves `monitor_events = []` (no silent success).
- `deriveAssessment` prepends the blocker `"Monitor findings could not be loaded."` when `monitor_load_error` is truthy — this alone drops any assessment out of `ready_for_delivery_package` and the `capabilities.canPrepareDeliveryPackage` gate requires `readiness === "ready_for_delivery_package"`, so `can_prepare_delivery_package = false` follows automatically.
- No protected surfaces are written on the error path — only the assessment payload includes the blocker.

## 3. Generate readiness review — PASS

Clicked "Generate readiness review" in the Delivery Readiness panel.

Row created in `engine_project_delivery_readiness_reviews`:

| field | value |
|---|---|
| id | `d41bd454-beef-49da-9267-f10644828583` |
| status | `draft` |
| readiness | `blocked` |
| recommendation | `escalate_to_operator` |
| confidence | `high` |
| payload.monitor_findings.critical_events (length) | **3** |
| payload.blockers[0] | `3 critical monitor event(s) unacknowledged` |

Critical events correctly mapped from `event_type → kind`:

```
[
  { id: 7bb691fe…, kind: openclaw_run_timed_out,        summary: OpenClaw run ec6fb3b8 exceeded timeout (56m ≥ 30m). },
  { id: adeb86a0…, kind: openclaw_run_failed_detected,  summary: OpenClaw run f4110000 failed: Fixture: … },
  { id: aba2794e…, kind: openclaw_run_timed_out,        summary: OpenClaw run 4a3ffe1c exceeded timeout (36m ≥ 30m). }
]
```

Side effects:
- `engine_audit_log` last action: `delivery_readiness_generated` ✅
- `engine_activity` last kind: `delivery_readiness_generated` ✅
- No packet status change
- No project status change
- No `client_portal_roadmaps` insert/publish
- No client notification

## 4. Save / submit / approve boundary — CODE-VERIFIED

Not exercised in this pass to avoid mutating an approved review row on the shared fixture. Behaviour is enforced by:

- `tg_engine_delivery_readiness_reviews_enforce` DB trigger: approved rows are immutable except `→ archived`; rejected must go back through `draft`; invalid transitions raise `check_violation`.
- `approveDeliveryReadinessReview` in `src/lib/engine-delivery-readiness.functions.ts` re-derives assessment and refuses approval if readiness degrades from the submitted state (so a `blocked` readiness cannot be silently upgraded on approve).
- All lifecycle server functions write audit rows with `project_delivered=false, portal_published=false, client_notified=false` metadata and an activity row that carries the "Readiness approval does NOT deliver, publish, notify, or mark QA passed." reminder from `PRODUCT_LAW_REMINDERS`.
- None of the functions touch `engine_projects.status`, `engine_project_build_packets.status`, `client_portal_*`, `roadmap_approvals`, or `roadmap_documents`.

## 5. Clean fixture readiness proof — NOT EXECUTED

Skipped intentionally: creating a clean project fixture would require seeding an entire packet + QA-review chain and marking all packets accepted, which is out of scope for a re-proof of the monitor-column fix. Code path is unchanged from v6 initial build and is verified statically:

```ts
} else if (
  pkts.length > 0 &&
  accepted.length === pkts.length &&
  approved_reviews > 0 &&
  critical.length === 0
) {
  readiness = "ready_for_delivery_package";
  recommendation = "prepare_delivery_package";
  confidence = "medium";
}
```

`capabilities.canPrepareDeliveryPackage` gates on `latest.readiness === "ready_for_delivery_package"`, and the "Prepare Delivery Package (v7)" button in `DeliveryReadinessPanel.tsx` is rendered disabled with a "v7 placeholder — does not publish" label. Recommend a follow-up live pass once a v7 fixture is seeded.

## 6. Protected surface regression — ZERO DRIFT

Snapshot hashes before and after the whole re-proof pass (including Generate click):

| surface | before | after |
|---|---|---|
| `engine_project_build_packets` (id:status set) | `335c5e644d1a2177daf3699655816d9b` | `335c5e644d1a2177daf3699655816d9b` |
| `engine_projects.status` | `61326117ed4a9ddf3f754e71e119e5b3` | `61326117ed4a9ddf3f754e71e119e5b3` |
| approved implementation plan payload | `ad84e521501ea702a76d87c369c0a74b` | `ad84e521501ea702a76d87c369c0a74b` |
| approved QA plan payload | `c5ba314db70fbb720a58cda7b62340d0` | `c5ba314db70fbb720a58cda7b62340d0` |
| `client_portal_roadmaps` count for project | 0 | 0 |

Allowed writes were confined to:
- `engine_project_delivery_readiness_reviews` (1 draft row)
- `engine_audit_log` (`delivery_readiness_generated`)
- `engine_activity` (`delivery_readiness_generated`)

No project delivered · no client portal publish · no client notification · no QA tests marked passed · no packet acceptance side effect.

## 7. Screenshots

- `/tmp/browser/v6reproof/01_build_execution.png` — page load
- `/tmp/browser/v6reproof/02_delivery_readiness.png` — Delivery Readiness panel BLOCKED with 3 critical monitor events
- `/tmp/browser/v6reproof/03_before_generate.png` — pre-Generate state
- `/tmp/browser/v6reproof/04_after_generate.png` — post-Generate state (draft rendered)

## Recommendation

**SAFE to move to v7 Delivery Package Preparation.**

The monitor-column bug is fixed and verified end-to-end: DB truth (3 unacked criticals) now flows through `gatherFacts`, becomes `readiness = blocked`, `recommendation = escalate_to_operator`, `can_prepare_delivery_package = false`, and drops the required blocker string. A monitor query error path now surfaces `"Monitor findings could not be loaded."` instead of silently returning `[]`. No protected surface drift. Product-law reminders and lifecycle triggers remain intact.

Follow-up (non-blocking) before shipping v7:
1. Seed a clean fixture (all packets accepted, ≥1 approved QA evidence review, no critical monitor findings) and run a targeted "ready_for_delivery_package" live pass with screenshots.
2. Add a lightweight integration test that asserts `gatherFacts` selects `event_type` (guards against future column renames).
