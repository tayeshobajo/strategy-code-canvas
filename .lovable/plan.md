## Roadmap Engine — "Never Get Wrong" Invariants: Gap Map + Fix Plan

Audit maps each of your 10 invariants to what's already enforced and what's missing. Fixes are sequenced so trust/safety guards land before feature depth. All work extends the existing engine and portal — no rewrites.

### Gap map (invariant → status → gap)

| # | Invariant | Status | Gap to close |
|---|---|---|---|
| 1 | Intake captures real operating truth, feeds engine as a source | ⚠️ Partial | Current client `intake_submissions` is shallow; no operator-facing deep intake. Submissions don't auto-become `engine_sources`. |
| 2 | Project creation never leaves orphans | ⚠️ Partial | On create we insert `engine_projects` + optional source, but no `engine_project_agents` row, no `engine_agent_permissions`, no `client_portal_projects` link, no owner permission row. |
| 3 | AI drafts only, never overwrites truth | ✅ Enforced | `PROTECTED_APPROVED_FIELDS` + trigger. Nothing to add beyond assertions in tests. |
| 4 | Approval gates every promotion | ✅ Enforced | Dual gate (version + client_preview) working. Add gate for milestone brief → task handoff (currently soft). |
| 5 | Portal never shows internal/draft | ✅ Enforced by allowlist + trigger | No automated guard. A regression could silently leak. |
| 6 | Source traceability unbroken (milestone → source) | ⚠️ Partial | `engine_milestones.source_evidence` exists but not populated by AI draft; builder doesn't render the trace. |
| 7 | Manual override respected + tracked | ✅ Enforced | Audit fields land. Missing: prior AI version snapshot on manual edit. |
| 8 | Roadmap keeps strategic logic (not a task list) | ✅ Enforced | 14-step workspace intact. No gap. |
| 9 | Client actions never disappear | ⚠️ Partial | View/ack/decision/clarification/file all loop back. `BookCallModal` submit not wired; send-message doesn't write `engine_activity`. |
| 10 | Hard role boundaries | ⚠️ Partial | Owner/operator/AI enforced. No explicit `client` role in `app_role` (blocked by omission). |

### Fix plan (4 stages)

**Stage A — Spine safety (P0 for your top-3 "never get wrong")**

1. **Portal safety guard** (invariant 5)
   - Add `src/lib/__tests__/portal-no-internal.test.ts` that greps `portal.functions.ts` for reads against internal tables (`engine_*`, draft version rows, `supporting_notes`, `agent_costs`) and fails the build if any appear outside the allowlisted `buildClientSafePayload`.
   - Add a runtime assertion inside `buildClientSafePayload` that throws in dev if the payload contains any key not in the whitelist, and log-only in prod.
   - Migration: add a Postgres CHECK trigger on `client_portal_roadmaps` refusing insert/update when the source version's `status = 'ai_generated'`.

2. **Source→project→draft linkage guard** (invariant 1 spine + 6)
   - Migration: `engine_extracted_signals.source_id` NOT NULL going forward (backfill existing NULLs to a synthetic "legacy" source per project); FK from `engine_milestones.source_evidence` entries validated by a trigger that requires each referenced signal id to belong to the same project.
   - Server-side: `runIntelligencePipelineInternal` already tags signals with `source_id`; extend it to persist `source_evidence` onto every AI-drafted milestone (list of `{signal_id, source_id, quote}`).
   - Builder UI: `SourceEvidence` panel already exists per step — add a "Why this milestone?" popover on each milestone row that renders the trace.

3. **Approval boundary tests** (invariant 3)
   - Extend `review-item-and-publish-gates.test.ts` with cases: AI cannot approve its own version; publishing a version whose `status='ai_generated'` throws; portal read of an unpublished roadmap returns empty.

**Stage B — Project creation completeness (invariant 2)**

4. `createProjectFromSource` becomes transactional and always creates:
   - `engine_projects` (existing)
   - `engine_project_agents` row with default budget from config
   - `engine_agent_permissions` row seeded to "suggest only"
   - `client_portal_projects` row linked via new `engine_projects.client_portal_project_id` column
   - Owner `client_portal_permissions` row for the operator email
   - Initial `engine_activity` "project bootstrapped" entry
   - Empty `engine_roadmap_versions` v0.0 container so the review queue always has a target
5. Add a `verifyProjectIntegrity(projectId)` server fn that reports missing links; surface it on the Project Overview page as a red banner if anything is missing (helps existing orphans).

**Stage C — Operator deep intake (invariant 1)**

6. New operator-only route `/engine/intake/new` (not the public client form). Structured form with the deep questions you listed, grouped:
   - Where are you now / what works / what's heavy / what you've tried
   - What breaks at growth / customer complaints / stuck decisions
   - Deadlines that matter / existing assets / 12–24mo success / do-not-touch
7. New table `engine_deep_intakes` (project_id, jsonb answers, submitted_by, submitted_at). On submit:
   - Insert as `engine_sources` (`type='intake_deep'`, `visibility='internal_only'`)
   - Kick `runIntelligencePipelineInternal` so the answers become structured signals immediately
8. Public `intake_submissions` gets an "Import to engine" action for admin/operator that mirrors the same flow so no client intake sits stranded in a form table.

**Stage D — Feedback loop + role hardening (invariants 9, 10)**

9. Wire `BookCallModal` submit → `client_portal_messages` + `engine_activity` + review item.
10. Portal `sendMessage` writes an `engine_activity` mirror (already writes portal activity).
11. Add explicit `client` value to `app_role` enum + policy update, so role boundaries are literal not omission-based.

### Sequencing & verification

- Stages A → B → C → D. Each stage ships its own migration + tests, then I run typecheck + the existing test suite + the new portal safety test.
- Stage A alone closes your three biggest "must never get wrong" items. Ship it, then decide whether to continue.

### Technical details

- **Portal guard test**: static analysis via `rg` in a vitest — cheap, deterministic, catches accidental joins into internal tables in future PRs.
- **Trigger for AI-draft publish block**: `BEFORE INSERT OR UPDATE ON client_portal_roadmaps` — checks `engine_roadmap_versions.status <> 'ai_generated'` for `approved_roadmap_version_id`. Complements the existing app-layer gate with a DB backstop.
- **`source_evidence` population**: `runStructuredPass` returns milestones with signal ids; we already store signals, so mapping in the writer step is a small change.
- **Project bootstrap** uses a single `.rpc()` wrapping all inserts inside a Postgres function so partial failures roll back — no orphaned rows.
- **Deep intake** stored as jsonb + immediately reprojected into `engine_extracted_signals` via the existing pipeline; UI reads from signals, not from the intake blob, so the "single source of truth" stays the signals table.

### Out of scope for this plan
- Renaming `client_facing` → `published` (P4 cosmetic).
- Consolidating `engine_tasks` vs `engine_agent_tasks` (P4).
- Route rename `/engine/intelligence` → `/engine/memory`.

Confirm and I'll start with Stage A.