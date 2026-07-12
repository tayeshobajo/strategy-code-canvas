# Phase 1 R3 — Variant B: Normalized `engine_spine_field_truth`

Status target: **PENDING_REVISION → ready for Tai review**. Migration still NOT applied.

Direction approved: canonical truth moves out of the `point_a_status` / `point_b_status` JSONB sidecars into a normalized, queryable, auditable table. Sidecars become dead code and get dropped by the same migration.

---

## 1. Evidence-table verification (result)

Queried live DB. There is **no** `public.engine_evidence` table. Existing evidence-shaped tables:

- `engine_project_build_evidence` — build-packet artifacts (screenshots, logs, diffs, QA reports). Not a general-purpose spine-field evidence store.
- `engine_project_qa_evidence_reviews` — QA review records.

Decision: **do not** add an FK to a non-existent table, and do not overload `engine_project_build_evidence` (its `evidence_type` CHECK and required `build_packet_id` don't fit spine-field evidence).

For Phase 1 R3, `verified` evidence stays inside the validated `source_ref` JSONB (`evidence_id` remains a free string, no FK). A dedicated `engine_spine_evidence` (or reuse decision) is deferred to Phase 4 alongside the ceremony surface. `assertEvidenceForStatus` is unchanged on this axis.

---

## 2. Canonical schema — `engine_spine_field_truth`

One row per (project, spine, field_key). Latest truth only; history lives in `engine_audit_log` (Phase 4B pattern already in place).

```text
engine_spine_field_truth
------------------------
id                 uuid pk default gen_random_uuid()
project_id         uuid not null references engine_projects(id) on delete cascade
spine              text not null check (spine in ('point-a','point-b'))
field_key          text not null                          -- validated app-side against allowlist
status             public.epistemic_status not null       -- 8-value enum
source_ref         jsonb not null default '{}'::jsonb
updated_at         timestamptz not null default now()
updated_by_email   text
updated_by_actor   text not null default 'human' check (updated_by_actor in ('human','ai'))
unique (project_id, spine, field_key)
```

Indexes: unique above + `(project_id, spine)`, `(project_id, status)` for contradiction/ceremony queries.

RLS: staff read via `is_engine_staff()`; writes only via server functions running as authenticated staff (RLS + role check in-app). No anon grant.

GRANTs: `SELECT, INSERT, UPDATE, DELETE` to `authenticated`; `ALL` to `service_role`.

Trigger: `BEFORE UPDATE` sets `updated_at = now()` and writes a row into `engine_audit_log` with `action='spine_field_truth_changed'`, `field_changed = spine||':'||field_key`, `old_value`, `new_value` (status + short source_ref summary), `actor_email = NEW.updated_by_email`. Reuses the existing audit path; no separate history table.

Enum: keep the 8-value `public.epistemic_status` from R2 unchanged.

Sidecar removal in same migration:
- `ALTER TABLE engine_projects DROP COLUMN IF EXISTS point_a_status;`
- `ALTER TABLE engine_projects DROP COLUMN IF EXISTS point_b_status;`

(Neither has ever been read as canonical — R2 loaders degrade gracefully — so drop is safe.)

Rollback SQL included in the migration file. Variant A block deleted from `PENDING_MIGRATIONS.md`.

---

## 3. App-layer changes

All reads/writes route through the new table. Field-key allowlist and evidence rules remain enforced at the app layer.

Files to change:

- `src/lib/engine-epistemic.functions.ts`
  - `markSpineFieldStatus` → `upsert` into `engine_spine_field_truth` on `(project_id, spine, field_key)`; sets `updated_by_actor='human'`.
  - `promoteSignalToSpine` → same upsert path; source_ref built from signal (unchanged shape).
  - `getSpineFieldStatus` → `select field_key, status, source_ref, updated_at, updated_by_email from engine_spine_field_truth where project_id=? and spine=?`, returned as `Record<fieldKey, FieldStatusEntry>` so the chip API is unchanged.
  - `detectContradictions` → gains a second path that also queries `engine_spine_field_truth where status='contradicted'` (in addition to the existing extracted-signals scan). Union returned to caller.
  - Remove all references to `point_a_status` / `point_b_status` columns.
- `src/lib/engine-epistemic.server.ts`
  - No taxonomy changes. Add an `updatedByActor: 'human' | 'ai'` field on the internal write helper.
  - `assertEvidenceForStatus`, allowlist, AI-writable guard — unchanged.
- `src/routes/engine.projects.$projectId.point-a.tsx` and `.point-b.tsx`
  - No shape change; loader already consumes the same `Record<fieldKey, FieldStatusEntry>`.
- `src/components/engine/EpistemicStatusChip.tsx`
  - No change; contract preserved.
- `src/lib/__tests__/engine-epistemic.test.ts`
  - Adjust any test that asserted on the sidecar column names. Add cases: upsert conflict on `(project,spine,field_key)`, `updated_by_actor` guard.

No new AI writers ship in Phase 1; all AI-driven writes still land through the same function with `updatedByActor='ai'` and are constrained by `assertStatusAllowedForActor`.

---

## 4. Backfill plan (runs inside the migration, after table + enum exist)

Goal: every existing Point A / Point B field key that already holds content in `engine_projects.point_a` / `point_b` (the content JSONB, not the sidecars) gets a `needs_confirmation` row so Phase 2 ceremonies have real targets. Empty fields get no row (they stay `unclassified` in the UI, which the ceremony gate treats as blocking — that's the desired state).

Approach (SQL, idempotent):

1. For each row in `engine_projects`, insert rows for Point B fixed keys where the corresponding content path is non-null/non-empty in `point_b`.
2. For Point A base keys (`lenses`, `diagnosis`, `key_diagnosis`) — same rule.
3. For Point A diagnosis cards, iterate the `point_a->'diagnosis'` array (if any) and insert one `diagnosis:<title>` row per card with a non-empty title.

Every backfilled row:
- `status = 'needs_confirmation'`
- `source_ref = jsonb_build_object('kind','backfill','reason','Phase 1 R3 backfill from existing spine content','timestamp', now())`
- `updated_by_email = NULL`
- `updated_by_actor = 'ai'` (conservative — not human-attested)

`ON CONFLICT (project_id, spine, field_key) DO NOTHING` so re-runs are safe.

Preflight query included in `PENDING_MIGRATIONS.md`: counts of projects, Point A cards, Point B non-null fields — reported before Tai approves.

11 existing projects, so the backfill is small and inspectable.

---

## 5. Smoke test plan (must pass before Phase 2 starts)

Run after migration + backfill on one real project (id chosen from preflight):

1. `getSpineFieldStatus({ point-a })` returns the backfilled `needs_confirmation` rows.
2. `markSpineFieldStatus` sets one Point A field to `stated` with an operator-note source_ref — row upserts, chip re-renders as "Stated".
3. `markSpineFieldStatus` sets one Point B field to `needs_confirmation` with a reason — succeeds.
4. `promoteSignalToSpine` on a live `engine_extracted_signals` row — upserts a row with `kind='extracted_signal'` source_ref.
5. Force a contradiction: insert (via server fn) a `contradicted` status with two `conflicting_source_ids`; `detectContradictions` returns it.
6. Chip UI: fields with no truth row render neutral "No status"; fields with rows render the correct status and popover shows the source_ref quote/reason.
7. Negative cases: unknown `field_key` rejected; AI actor attempting `verified` or `approved_truth` rejected; evidence-rule violations rejected.

Smoke results appended to `.orchestrator/phase-1-output.md` as "Phase 1 R3 verification".

---

## 6. Deliverables in this revision turn (NO migration applied)

- Revised migration SQL in `.orchestrator/PENDING_MIGRATIONS.md` (Variant B only; Variant A block removed).
- Updated `src/lib/engine-epistemic.functions.ts` (table-based reads/writes).
- Small delta in `src/lib/engine-epistemic.server.ts` (`updatedByActor` in write helper signature).
- Updated tests in `src/lib/__tests__/engine-epistemic.test.ts`.
- Appended "Revision R3" section to `.orchestrator/phase-1-output.md` covering: evidence-table verification result, schema, backfill plan, smoke test plan.

Explicitly out of scope (deferred): dedicated `engine_spine_evidence` table + FK; ceremony surface with `ceremony_id`; contradiction resolver UI; portal payload stripping.

---

## Build order

1. Verify evidence table (done — see §1).
2. Rewrite `PENDING_MIGRATIONS.md` Phase 1 block: enum + `engine_spine_field_truth` + grants + RLS + audit trigger + sidecar DROPs + backfill + preflight + rollback.
3. Update `engine-epistemic.functions.ts` to read/write the new table.
4. Minor helper update in `engine-epistemic.server.ts`.
5. Update tests.
6. Append Revision R3 to `phase-1-output.md`.
7. Stop. Wait for Tai to approve migration. Only then apply + run smoke tests.
