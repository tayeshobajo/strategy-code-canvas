# Phase 4 QA Fixes Rev 2.1 — Deadlock Fix + Enumeration

## Problem

Rev 2.1's G1 provenance trigger requires `engine_spine_ceremonies.status = 'completed'` before an `approved_truth` row can be written. But Phase 2's ceremony lifecycle writes `approved_truth` during `recordCeremonyDecision()` while the ceremony is still `in_progress`, and only flips to `completed` after all fields are terminal.

Result: deadlock. Truth can't be written until ceremony completes; ceremony can't complete until truth exists.

## Plan

### 1. Run enumeration first (read-only)

Execute the Step 1 enumeration query from Rev 2.1 against the live DB to count legacy `approved_truth` rows that would fail the new trigger. Output row counts by category (missing ceremony, wrong actor, no operator_override reason, etc.). Save results to `.orchestrator/phase-4-qa-rev-2-1-enumeration.md`.

Do NOT apply the migration.

### 2. Patch Rev 2.1 in `.orchestrator/PENDING_MIGRATIONS.md`

Replace the ceremony-status predicate in three places so ceremonies that are actively being recorded also satisfy provenance:

- **Runtime trigger `tg_engine_spine_field_truth_provenance` (ceremony branch)** — change the ceremony status guard from
  ```
  OR ceremony.status <> 'completed'
  ```
  to
  ```
  OR ceremony.status NOT IN ('in_progress', 'completed')
  ```
  Keep the rest of the ceremony match unchanged (same `project_id`, same `spine`, and — critical — a matching `engine_spine_ceremony_decisions` row for this `field_key` with `new_status = 'approved_truth'`). The ceremony_decisions row is what proves this specific field was ceremonially decided; ceremony status alone is not sufficient.

- **Step 1 enumeration query** — same status set, so the pre-apply count matches what the runtime trigger will actually reject.

- **Step 3 fail-closed guard** (if it re-checks status independently) — same status set, so guard and trigger don't drift.

Mark the block header: `Rev 2.1 — NOT APPLY-READY. Blocked on ceremony-status deadlock; patched pending re-review.` Bump to Rev 2.2 once patched.

### 3. Re-review, then apply

After the patch:
1. Re-run enumeration against the patched predicate.
2. Remediate any remaining legacy rows (attach to a completed/in-progress ceremony with a matching decision, restamp as `operator_override` with reason, or demote to `verified`).
3. Only then apply G1 + G1a + G1b + G1c + G2 + G3 in one migration.

## Out of scope this turn

- Applying the migration.
- Remediation of legacy rows (depends on enumeration output).
- G2 (roadmap_versions / projects gate) and G3 (smoke harness) — unchanged by this fix, ride along in the same migration once G1 is patched.

## Technical notes

- Ceremony decisions table: `engine_spine_ceremony_decisions` — the per-field decision row is the real provenance anchor. Ceremony status is a coarser gate.
- Operator override path is unchanged: `source_ref.kind='operator_override'` + `operator_email` matching `updated_by_email` + non-empty `reason`.
- Backfill path (`source_ref.kind='backfill'`) remains exempt per Rev 2.1.
