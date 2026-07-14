# Phase M12 — Milestone → Engine Promotion (COMPLETE)

**Closes audit gap M12** — completed operational milestones now graduate into active `engine_business_engines` only after required governance approvals and full audit logging.

## What was built

One server function module + one admin route. Uses existing tables (`engine_milestones`, `engine_business_engines`, `engine_review_items`, `engine_audit_log`, `engine_activity`) and the existing `activate_business_engine` RPC. **No schema migrations.**

### Files
- `src/lib/engine-milestone-promotion.functions.ts`
- `src/routes/admin.engine-promotion.tsx`
- Nav entry added in `src/routes/admin.tsx` (icon: Rocket)

### Server functions
| Fn | Role |
|---|---|
| `listPromotionCandidates()` | Read-only. Lists milestones where `approval_status = 'approved'`, `status IN (complete, completed, delivered)`, `phase` matches operational heuristic (`operate` / `ongoing` / `run` / `live` / `scale` / `optimize` / `launch`). Joins existing `engine_business_engines.milestone_id` to mark already-promoted candidates. |
| `proposeEnginePromotion({milestoneId, engineKind, cadence, ownerEmail, outcome})` | Creates a **draft** `engine_business_engines` row linked to the milestone. Seeds `workflow` from the milestone's `acceptance_criteria`. Creates a matching `engine_review_items` (`item_type = engine_promotion`, `impact = high`). Writes `engine_audit_log` (`action = engine.promotion.proposed`) and `engine_activity`. Rejects if milestone unapproved, not complete, non-operational, or already promoted. |
| `approveEnginePromotion({engineId, reviewItemId, ownerEmail, approverEmail})` | Activates via `activate_business_engine` RPC. Enforces `approverEmail == caller` AND `approver ≠ engine.created_by` (self-approval blocked). Marks review item `approved`. Writes `engine_audit_log` (`field_changed = status`, `old_value`, `new_value`) and `engine_activity`. |
| `rejectEnginePromotion({engineId, reviewItemId, reason})` | Archives the draft engine, marks review `rejected`, logs reason to `engine_audit_log` + `engine_activity`. |

### Governance layers (defense in depth)
1. **App layer** — `assertStaff` on every fn (operator/admin).
2. **App layer** — approver email must match signed-in user.
3. **App layer** — approver ≠ engine creator.
4. **DB layer** — `engine_business_engines_no_self_approve` trigger blocks self-approval at INSERT/UPDATE of `approved_by`.
5. **DB layer** — `engine_business_engines_gate` trigger governs status transitions.

## Evidence trail (per promotion)
1. Draft `engine_business_engines` row — `metadata` marks `promoted_from_milestone`, `promoted_by`, `source_brief`; `triggers.source_milestone = milestone_id`.
2. `engine_review_items` row — surfaces in Approvals Queue.
3. `engine_audit_log` — one row on propose, one on approve (with status before/after), one on reject.
4. `engine_activity` — human-facing entries at each stage.

## How to verify (post-deploy)
1. Sign in as staff, open `/admin/engine-promotion`.
2. Any approved+complete milestone whose `phase` matches the operational heuristic shows as a candidate.
3. Click "Propose promotion" → verify a draft `engine_business_engines` row exists with `milestone_id` set, plus a `pending` `engine_review_items` row.
4. As a **different** staff email, fill Engine ID / Review item ID / Owner email / Approver email → click "Approve & activate". Verify engine `status = 'active'` and audit log entry.
5. Attempt to approve as the same email that proposed → expect "Self-approval forbidden".
6. Try promoting the same milestone twice → expect "Milestone already promoted".

## Non-goals
- No automatic promotion. Every promotion requires human proposal + separate-approver activation.
- No new tables or triggers.
- Operational-phase detection uses a phase-string heuristic; explicit milestone tagging is a possible follow-up if the heuristic proves noisy.

## Follow-ups (optional)
- Add a `milestone_kind` column or explicit tag to escape the phase-string heuristic (would require migration → append to PENDING_MIGRATIONS.md).
- Wire an auto-proposal (still gated by human approval) when an operational milestone transitions to delivered.
