## Phase 5D QA + Docs Reconciliation + Separate Runtime Schema Hotfix

Two independent workstreams. Phase 5D stays "implementation-complete pending QA" in `BUILD_STATE.md` until section A passes. The schema drift fix ships as its own hotfix (section C), not folded into 5D.

---

### A. Phase 5D QA harness (no code changes yet — QA-only pass)

Write a service-role smoke harness at `.orchestrator/qa/phase-5D-smoke.ts` (or `.sql` where pure SQL suffices) exercising each guard. Each check prints `PASS` / `FAIL <reason>`. Overall: **QA PASS** only if all green.

Checks:

1. **Staff-only route guard** — `/engine/projects/$projectId/family`
   - Anonymous → redirected to `/auth`
   - Signed-in non-operator → 403 / redirect (whatever the workspace shell enforces elsewhere)
   - Operator (via `hasRoleForEmail`) → 200 with tree
2. **`createChildProject` authorization**
   - Non-operator caller → rejected at server fn (not just RLS)
   - Operator on client A cannot create child under client B's parent → rejected
   - Operator on same client → succeeds, row visible, `engine_activity` + `engine_audit_log` written with actor email + subtree summary
3. **`reparentProject` authorization**
   - Non-operator → rejected
   - Cross-client reparent (move client-A subtree under client-B parent) → rejected
   - Cycle attempt (reparent to own descendant) → rejected
   - Legal reparent → `engine_audit_log` snapshot includes pre-move subtree ids + size
4. **Cross-client isolation on reads**
   - `getProjectFamily` / `listStaffFamilyRoots` called with operator scoped to client A returns only client-A projects
   - `getFamilyImpact` never surfaces nodes/edges from another client
5. **Portal surface (`getPortalProjectFamily`)**
   - Only projects with published/client-safe status appear
   - No `internal_status`, diagnostics, staff notes, costs, unpublished children, or draft milestones in payload — assert via explicit column allowlist diff
   - Portal token for client A cannot read client B family (negative test with a second portal token)
6. **Audit trail integrity**
   - After each create/reparent, `engine_activity` row exists AND `engine_audit_log` row exists with matching `actor_email`, `action`, affected subtree
   - Assert both, not just one
7. **Impact analysis guard**
   - `getFamilyImpact` respects DB triggers from Revision 4 — attempting to preview a `complete` that would bypass Spine returns the blocker, not a success
   - No cross-client leakage in blocker list

Deliverable: `.orchestrator/qa/phase-5D-smoke-output.md` with per-check status + final verdict. If any FAIL, file a fix task and keep 5D open.

### B. Docs reconciliation (only after A is green)

1. `.orchestrator/BUILD_STATE.md` — flip Phase 5D to **complete** with date + link to smoke output.
2. `.orchestrator/PENDING_MIGRATIONS.md` — remove/annotate the Phase 5D block that still reads "app follow-ups pending / revision pending review". Keep only genuinely pending items (e.g., optional `engine_audit_log` column additions if still deferred).
3. `.orchestrator/phase-5D-output.md` and `phase-5D-followups-output.md` — add a "QA verified" footer pointing at the smoke report.
4. Sweep `.orchestrator/` for any other stale "5D pending" mentions and reconcile.

### C. Runtime schema drift hotfix (SEPARATE from 5D)

Scope: add `current_phase` column + grants on `client_portal_roadmaps`. Ships as its own migration + entry in `.orchestrator/PENDING_MIGRATIONS.md` labelled `hotfix-portal-roadmaps-schema`, not under Phase 5D.

Preflight (must pass before writing the migration):

1. Confirm `client_portal_roadmaps` has `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on
2. Enumerate existing policies; confirm they scope by client/portal token (not `USING (true)`)
3. If either is missing, the hotfix expands to include RLS enable + scoped policies before the grants — grants without real RLS are unsafe

Migration contents (pending approval, written to `PENDING_MIGRATIONS.md` only):

- `ALTER TABLE public.client_portal_roadmaps ADD COLUMN IF NOT EXISTS current_phase text`
- Any missing RLS/policies uncovered in preflight
- `GRANT SELECT ON public.client_portal_roadmaps TO anon, authenticated` (only if RLS confirmed scoping)
- `GRANT ALL ON public.client_portal_roadmaps TO service_role`

Post-apply verification:

- Negative portal-token test: portal token for client A queries `client_portal_roadmaps` — must return only client-A rows, zero client-B rows
- Positive test: same token reads its own `current_phase` successfully
- Record results in `.orchestrator/hotfix-portal-roadmaps-output.md`

### Order of operations

1. Section A (QA harness + run) → PASS required
2. Section B (docs reconciliation)
3. Section C (hotfix preflight → migration draft in `PENDING_MIGRATIONS.md` → await Tai approval → apply → verify)

### Out of scope

- No new features on the family surface
- No schema changes under Phase 5D
- No auto-apply of the hotfix migration (goes through Tai per non-negotiable rule #1)
