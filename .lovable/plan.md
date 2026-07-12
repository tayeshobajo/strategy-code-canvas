## Plan: Smoke-row cleanup + Phase 2 kickoff plan

### Part A — Cleanup (must run first, gates Phase 2)

1. **Delete smoke rows via service-role SQL** (a migration is the only sanctioned service-role write path per CLAUDE.md; authenticated roles correctly lack DELETE).

   ```sql
   DELETE FROM public.engine_spine_field_truth
   WHERE project_id = 'f8019417-7ebf-4b56-a753-b24d734bf6f0'
     AND (updated_by_email = 'smoke@trusttai.com'
          OR field_key LIKE 'smoke_%');
   ```

   Wrapped in a migration file so it runs under service role and is auditable. No schema change.

2. **Confirm zero remaining rows** with the exact SELECT from your message. Expected: `0`. If non-zero, stop and report.

3. **Append `Phase 1 R3 cleanup` section to `.orchestrator/phase-1-output.md`** with:
   - rows deleted (count + field_key list captured pre-delete)
   - post-delete count = 0 confirmation
   - note logging your future-hardening item: *DB-level field-key validation (CHECK against allowlist or FK to a `spine_field_registry` table) so direct-DB writers cannot bypass the app-layer `assertSpineFieldExists` guard*. Filed for a later hardening phase, not a Phase 2 blocker.

### Part B — Phase 2 plan: Point A / Point B Approval Ceremonies

Ceremony = a structured walk through every spine field on a project where an operator (with Tai) confirms status, attaches evidence/source_ref, and promotes rows out of `needs_confirmation` toward `stated` / `verified` / `approved_truth`. This is where the R3 truth store starts earning its keep.

**Scope for Phase 2 (single shippable slice):**

1. **Ceremony data model** (migration → PENDING_MIGRATIONS, not applied):
   - `engine_spine_ceremonies` (project_id, spine `'point_a'|'point_b'`, status `'in_progress'|'completed'|'abandoned'`, opened_by_email, opened_at, completed_at, notes)
   - `engine_spine_ceremony_decisions` (ceremony_id FK, field_key, prior_status, new_status, source_ref jsonb, decided_by_email, decided_at)
   - Add nullable `ceremony_id` FK column on `engine_spine_field_truth` so `approved_truth` writes can point at the ceremony that produced them (satisfies R2/R3 deferred item).
   - GRANTs: SELECT/INSERT/UPDATE to authenticated (admin/operator gated in RLS); no DELETE; service_role ALL.
   - Audit trigger mirroring the Phase 1 pattern.

2. **Server functions** (`src/lib/engine-spine-ceremonies.functions.ts`):
   - `startCeremony({ projectId, spine })` — opens or returns existing in-progress ceremony
   - `listCeremonyFields({ ceremonyId })` — returns every allowlisted field for that spine with current truth status + suggested action
   - `recordCeremonyDecision({ ceremonyId, fieldKey, newStatus, sourceRef })` — writes the decision row AND upserts `engine_spine_field_truth` in one transaction, stamping `ceremony_id`
   - `completeCeremony({ ceremonyId })` — requires every allowlisted field to have a truth row not in `needs_confirmation` OR an explicit `missing` decision; flips ceremony to `completed`
   - All admin/operator gated; all writes route through the existing `assertEvidenceForStatus` + `assertStatusAllowedForActor` guards (actor is `human`).

3. **UI**:
   - New `CeremonyPanel` component surfaced on Point A and Point B routes: header shows overall completion count, list shows every field with its current `EpistemicStatusChip`, popover to set new status + source_ref, running audit tail.
   - `WorkspaceStepper` gets a small badge on Point A / Point B tabs when a ceremony is in-progress OR when `needs_confirmation` count > 0 (also delivers the deferred Phase 1B item cheaply).
   - Neutral fallback ("No status") from Phase 1 remains — ceremony surfaces a "Classify" affordance for unclassified fields.

4. **Contradictions integration**: ceremony completion is blocked if `has_contradictions(project_id)` returns true — forces resolution first. Resolver UI stays deferred; ceremony surfaces the contradictions list read-only and links to Phase 1B when it lands.

5. **Tests**:
   - Unit: transitions (needs_confirmation → stated / verified / missing / approved_truth), rejects AI actor, rejects unknown field_key, completion gate math.
   - Live smoke against a real project: open ceremony, decide 3 fields (one `stated`, one `missing`, one `approved_truth`), verify truth-store rows, audit rows, `ceremony_id` stamped, completion blocked while `needs_confirmation` remain, unblocked once resolved.

6. **Output**: `.orchestrator/phase-2-output.md` following the Phase 1 format (scope, shipped, deferred, acceptance, risk, smoke).

**Gate**: Part A cleanup must confirm `count = 0` before any Phase 2 work begins. Phase 2 migration will be written to `PENDING_MIGRATIONS.md` for your review before it's applied — same discipline as Phase 1.
