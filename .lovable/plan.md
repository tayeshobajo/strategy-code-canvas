# Phase 9C Apply + Phase 4B Implementation

## Phase 9C — Apply AI Self-Assessment Constraints

Preflight already returned 0/0/0. Constraints will validate instantly.

### Migration (table-qualified idempotency via `conrelid`)

```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'no_ai_self_approval'
      AND conrelid = 'public.engine_milestones'::regclass
  ) THEN
    ALTER TABLE public.engine_milestones
      ADD CONSTRAINT no_ai_self_approval CHECK (
        NOT (
          created_by_kind IN ('ai','captain','agent','system_agent','pipeline')
          AND approval_status = 'approved'
          AND (approved_by_email IS NULL OR approved_by_email = '')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'no_ai_self_complete'
      AND conrelid = 'public.engine_milestones'::regclass
  ) THEN
    ALTER TABLE public.engine_milestones
      ADD CONSTRAINT no_ai_self_complete CHECK (
        NOT (
          created_by_kind IN ('ai','captain','agent','system_agent','pipeline')
          AND status IN ('complete','completed','done')
          AND (approved_by_email IS NULL OR approved_by_email = '')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'no_ai_self_completion'
      AND conrelid = 'public.engine_tasks'::regclass
  ) THEN
    ALTER TABLE public.engine_tasks
      ADD CONSTRAINT no_ai_self_completion CHECK (
        NOT (
          ai_generated = true
          AND status IN ('done','accepted','verified','complete','completed')
          AND (owner_email IS NULL OR owner_email = '')
        )
      );
  END IF;
END $$;
```

### Post-apply audit (same turn)

Grep and review mutation paths that could now surface CHECK violations to users:
- `approveChatProposal` — already requires staff email; confirm it flows into `approved_by_email` on milestone approval paths.
- Any milestone status transition (`status = 'complete'/'completed'/'done'`) — ensure `approved_by_email` is set when the source row is AI-created.
- Any task acceptance / verification path — ensure `owner_email` is set when `ai_generated = true`.

Where a mutation could hit the constraint, either (a) ensure the human actor's email is passed in, or (b) raise a clear pre-check error before the DB write so the user sees a helpful message instead of a raw constraint error.

Update `.orchestrator/PENDING_MIGRATIONS.md` to mark Phase 9C **APPLIED** with the preflight results (0/0/0) and the applied SQL.

---

## Phase 4B — Reuse `engine_audit_log` (no new table)

### Schema inspection result

`public.engine_audit_log` columns:

`id, project_id, actor_email, action, summary, affected_modules[], version_id, target_id, metadata (jsonb, NOT NULL), created_at, field_changed, old_value, new_value, reason`

Verdict: **no migration needed**. The table already has everything required:
- `field_changed / old_value / new_value / reason` — spine field diffs
- `actor_email` — the human who made and approved the change (the spine mutation flow requires an authenticated staff user; that email is both actor and approver)
- `metadata` (jsonb) — captures anything extra (e.g. `{"approver_email": "...", "role": "admin", "spine_field": "point_a.summary"}`) if the actor/approver split ever needs to be distinct
- `action` — set to `spine_field_changed` for filtering
- `affected_modules` — set to `['spine']`

### Implementation steps

1. **Server function** — add `updateApprovedSpineField` in `src/lib/engine.functions.ts` (or a new `engine-spine.functions.ts` if cleaner). Signature:
   - `projectId`, `field` (enum: `point_a` | `point_b` | nested sub-key), `newValue`, `reason` (required, non-empty), `expectedUpdatedAt`.
   - Guards: staff role required (`requireSupabaseAuth` + `hasRoleForEmail`); reason must be present; optimistic concurrency via `expectedUpdatedAt`.
   - Writes: (a) update `engine_projects.point_a` / `point_b`; (b) insert `engine_audit_log` row with `action='spine_field_changed'`, `field_changed`, `old_value`, `new_value`, `reason`, `actor_email`, `affected_modules=['spine']`, `metadata` including the sub-field path and role; (c) insert `engine_activity` row with `kind='spine_field_changed'` for the project feed.

2. **Wire into Spine UI** — swap the existing "protected overwrite" edit path on `engine.projects.$projectId.spine.tsx` to use `updateApprovedSpineField` when the current spine content is in the approved state, so every approved change flows through the reason-required mutation.

3. **Replace placeholder reader** — rewrite `src/components/engine/SpineVersionHistory.tsx` to:
   - Load `engine_audit_log` rows for the project where `action = 'spine_field_changed'`, ordered by `created_at DESC`, limited (e.g. 25) with "show more".
   - Render field name, old → new diff (JSON diff or side-by-side text for string fields), reason, actor, timestamp.
   - Keep the collapsible summary card shape; drop the "pending migration" banner.

4. **Docs** — update `.orchestrator/PENDING_MIGRATIONS.md`: mark Phase 4B **REJECTED (no new table needed)** with a pointer to `engine_audit_log` reuse. Update `.orchestrator/phase-4b-output.md` to note the resolution and the newly built pieces.

### Out of scope

- Any change to `engine_audit_log` schema (none needed).
- Field-level history for non-spine content (existing `engine_roadmap_versions` and `engine_audit_log` already cover those).
- Adding an approver-distinct-from-actor column — only needed if a real dual-approval workflow is introduced; not required for Phase 4B.

---

## Order of execution

1. Submit Phase 9C migration (table-qualified idempotency SQL above) for approval → apply → audit mutation paths.
2. Implement Phase 4B reuse: `updateApprovedSpineField` server function → wire Spine UI → replace `SpineVersionHistory` reader → update orchestrator docs.
3. Typecheck + targeted tests after each phase; commit per phase (`feat(phase-9c): ...`, `feat(phase-4b): ...`).
