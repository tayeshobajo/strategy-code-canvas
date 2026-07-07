# Phase C: MEDIUM Items 9–19 — Audit Fixes

**Context:** strategy-code-canvas audit (Fable 5 final report)  
**Current:** main branch, Phase A+B merged (PR #1)  
**Task:** Implement MEDIUM priority fixes and decisions  
**Output:** New branch `fixes/audit-medium-10-19`, PR ready for merge

---

## Full Audit Context

See `AUDIT_REPORT_FINAL.md` for complete details. Summary:

- Phase A (CRITICAL #1-2): ✅ portal upsert clobber, untracked migrations
- Phase B (HIGH #3-8): ✅ error checking, milestone durability, budget-cap, rollback logging, behavioral tests
- **Phase C (MEDIUM #9-19):** This task

---

## MEDIUM Items — Ranked by Impact/Effort

### Gap 10 (MEDIUM) — `supporting_notes` Doctrine Conflict
**Problem:** Column is in client-RLS-readable `client_portal_roadmaps` table, but both portal read doctrines call it "internal". No server read path selects it, but direct PostgREST query could read it.

**Decision:** Remove from CLIENT_SAFE_KEYS and stop writing to portal roadmaps.

**Files:**
- `src/lib/roadmap-publish.ts:591` — remove `supporting_notes` from CLIENT_SAFE_KEYS
- `src/lib/engine-ops.functions.ts:1087` — remove `supporting_notes` from the publish write
- Test: grep -r supporting_notes — verify no portal read paths reference it

**Commits:** 1

---

### Gap 8 (MEDIUM) — Extraction Divergence (Both Halves)

**Problem:** Two paths, zero unification:
1. **Pipeline path:** `processSingleSource` (engine-intelligence.functions.ts:303-336) writes only `engine_change_events`, never writes `engine_extracted_signals`. The extraction logic extracts categories but the output is swallowed.
2. **UI path:** extraction.tsx renders 12 category keys ("Not extracted yet.") while the pipeline writes `{confidence, items: string[]}` (engine-ai-providers.server.ts:44, 246).

**Decision:** Unify on the pipeline extraction path. Make `createSource`/`reprocessSource` write categorized `engine_extracted_signals`, and align the UI schema with what the pipeline writes.

**Files:**
- `src/lib/engine-intelligence.functions.ts:303-336` — wire `processSingleSource` extraction output to `engine_extracted_signals` insert (or route through the pipeline extractor)
- `src/lib/engine-ai-providers.server.ts:44, 246` — confirm extraction schema ({confidence, items})
- `src/routes/engine.projects.$projectId.extraction.tsx:11-45` — update UI to consume {confidence, items} instead of hardcoded category keys
- Test: add test that verifies `createSource` writes to `engine_extracted_signals`

**Commits:** 2–3

---

### New Issue #3 (MEDIUM) — TOCTOU on `preExistingPortal`

**Problem:** Two concurrent intakes for the same contact email can both observe no portal, both set `portalProjectCreated = true`. If one rolls back, it deletes the shared portal and permissions (`:629-636`) out from under the other, successful project.

**Fix:** Use INSERT … ON CONFLICT DO NOTHING + re-read pattern. Or add a unique constraint and handle the conflict explicitly.

**File:**
- `src/lib/engine-project-intake.functions.ts:218-222` — wrap the insert in an ON CONFLICT DO NOTHING, then re-query

**Commits:** 1 + test

---

### New Issue #6 (MEDIUM) — Email Wildcard in `ilike`

**Problem:** `_tryAutoLinkPortalProject` uses `ilike` with raw email. `_` and `%` are wildcard characters; an email like `tai_%@example.com` could match unintended portals.

**Fix:** Escape the email before the `ilike`, or use `eq` with normalized casing.

**File:**
- `src/lib/engine-ops.functions.ts:984` — escape email or switch to `eq`

**Commits:** 1

---

### New Issue #5 (MEDIUM) — Authored/Fallback Source Tag Invisible

**Problem:** `journey.pointA.source` and `journey.pointB.source` are computed (roadmap-publish.ts:59, 413-414; portal-roadmap-model.ts:57, 548-553) but no component reads them. The authored/fallback distinction is data-only.

**Decision:** Surface the tag in the UI OR accept it as a data-only field for future ops tools. If surfacing: add a small badge/indicator in MapCanvas and MobilePhaseStack showing "(authored)" vs "(fallback)" next to point labels. Or skip this phase — it's informational, not functional.

**Impact:** Low. Data is correct; visibility is optional.

**Commits:** 0–2 (skip or implement UI indicator)

---

### New Issue #4 (MEDIUM) — Approve-then-Fail Milestone Apply

**Status:** Partially addressed in Phase B (HIGH #4). Milestone-diff errors now tracked and logged to engine_activity. Confirm this is sufficient (it is — persists a warning activity entry visible to ops).

**Action:** Verify Phase B fix is in place. If not, implement the same pattern (per-op error tracking + warning activity entry).

**Commits:** 0 (already done in Phase B as HIGH #4)

---

### Gap 9 Residual (MEDIUM) — Upsert Nulling Contact Fields

**Problem:** `engine-project-intake.functions.ts:227-228` nulls `contact_name` and `company_name` when the portal exists but data.newClient is undefined (existing-client path). This silently overwrites pre-existing portal data.

**Fix:** Branch on `preExistingPortal` — when portal exists, do NOT update these fields (leave them alone, or skip the upsert entirely).

**File:**
- `src/lib/engine-project-intake.functions.ts:227-238` — add guard: only upsert contact_name/company_name if preExistingPortal is false OR add explicit "don't touch pre-existing" logic

**Commits:** 1

---

### Gap 15 (MEDIUM) — `engine_tasks` ON DELETE CASCADE

**Problem:** `engine_tasks.milestone_id` has ON DELETE CASCADE. No app code deletes `engine_milestones` individually (pipeline comment at engine-intelligence.functions.ts:1266; version-apply soft-drops at engine-ops.functions.ts:474-482). But if a milestone is ever deleted, tasks vanish silently.

**Decision:** Either revert CASCADE to SET NULL (tasks survive, milestone_id becomes null) + document why, OR keep CASCADE and add a comment explaining the intent (milestone deletion is only via version soft-drop, which is safe).

**File:**
- `supabase/migrations/20260706003158:11-14` — revise or add clarifying comment

**Commits:** 1 (migration or doc update)

---

### LOW — Hygiene (20–24)

Skip or batch:
- `severity: "warning"` → `"warn"` (engine-project-intake.functions.ts:337)
- Delete dead `portal-state.ts` + `portal-state.test.ts` (untracked, zero imports)
- Email escape in `ilike` or use `eq` (overlaps with New #6)
- `updateTaskStatus` free-string status → enum (engine-execution.functions.ts:340)
- Mobile Point A/B cosmetics (MobilePhaseStack.tsx:105, 132-133)

---

## Execution Plan

1. **Confirm state:** Verify main has Phase A+B merged, all 199 tests pass
2. **Create branch:** `git checkout -b fixes/audit-medium-10-19`
3. **Implement in order:**
   - Gap 10 (1 commit)
   - Gap 8 (2–3 commits)
   - New #3 (1 commit + test)
   - New #6 (1 commit)
   - New #5 (0–2 commits, decision-based)
   - Gap 9 (1 commit)
   - Gap 15 (1 commit)
   - LOW items (optional, batch or skip)
4. **Test:** After each commit, `npx tsc --noEmit && npx vitest run`
5. **Commit:** Separate commits per logical unit, clear messages
6. **Push & PR:** Push to origin, open PR against main, ready for merge

---

## Acceptance Criteria

- [ ] All MEDIUM items addressed (code written or decision documented)
- [ ] 200+ tests pass
- [ ] tsc clean
- [ ] Commits pushed to `fixes/audit-medium-10-19`
- [ ] PR ready for review/merge
- [ ] Task file updated with completion status

---

## Notes

- **No deploy blocker.** All items improve consistency, safety, or clarity.
- **Parallel work possible:** Gap 8 (extraction) is isolated; could pair-program with Gap 10 (doctrine).
- **Fable 5 budget:** Use this task to refine and catch edge cases. The audit is thorough; your job is to implement cleanly and test confidently.
