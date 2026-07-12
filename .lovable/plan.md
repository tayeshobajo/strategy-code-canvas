# Phase 1 Revision — Epistemic Truth Model v2

Status target: **PENDING_REVISION → ready for Tai re-review**. Migration still NOT applied.

## Scope of this revision

Rework the Phase 1 taxonomy, defaults, evidence rules, and sidecar drift story. App-layer scaffolding stays; semantics and guardrails change.

---

## 1. Expanded taxonomy

Replace the 5-value enum with the full 8-value truth model.

```text
stated              client or operator asserted it
inferred            AI inferred it from context
assumed             accepted working assumption (explicitly held, not proven)
missing             material info absent — spine field is a known hole
contradicted        conflicts with another recorded source
needs_confirmation  candidate truth pending human sign-off
verified            evidence supports it (source + quote/timestamp/evidence id)
approved_truth      authorized human promoted it into the Project Spine
```

Key semantic split: `verified` ≠ `approved_truth`. Verified = evidence exists. Approved truth = a human with authority accepted it as canonical.

`AI_WRITABLE_STATUSES` becomes `['inferred', 'assumed', 'missing', 'needs_confirmation']`. AI can never write `stated`, `verified`, `contradicted`, or `approved_truth`.

## 2. Neutral default for absent statuses

Remove the "default to inferred" fallback everywhere.

- Chip renders a neutral `unclassified` tone when no entry exists (grey, dashed border, tooltip: "No status recorded yet").
- `unclassified` is a UI-only sentinel — NOT an enum member, never written to DB.
- Ceremony gate (Phase 2) treats `unclassified` and `missing` as blocking.

## 3. Evidence rules per status

Enforced in server-fn validators before any write. Each status has a minimum `source_ref` shape:

| Status | Required evidence |
|---|---|
| stated | `source_ref.kind ∈ {intake_answer, transcript, operator_note}` AND (`id` OR `operator_confirmed_by` email) |
| inferred | `source_ref.kind = 'ai_inference'` AND `model` + `prompt_ref` |
| assumed | `source_ref.kind = 'working_assumption'` AND `rationale` string |
| missing | `source_ref.kind = 'gap_note'` — no id required |
| contradicted | `source_ref.kind = 'conflict'` AND `conflicting_source_ids: string[]` (≥2) |
| needs_confirmation | any base kind + `reason` string |
| verified | `evidence_id` (FK to `engine_evidence`) OR (`source.id` + `quote` + `timestamp`) |
| approved_truth | `approved_by_email` + `approval_kind ∈ {ceremony, operator_override}` + (Phase 2) `ceremony_id` |

`source_ref` becomes a discriminated Zod union. Invalid shape = 400 with the offending status name.

## 4. Sidecar drift — validate field paths

Keep `point_a_status` / `point_b_status` as jsonb sidecars (deferring a normalized table until Phase 2 usage patterns are proven), and add server-side allowlists:

- `POINT_A_FIELD_KEYS` and `POINT_B_FIELD_KEYS` exported from `src/lib/engine-spine-fields.ts` — single source of truth used by editors, chips, and validators.
- `markSpineFieldStatus` / `promoteSignalToSpine` reject any `fieldKey` not in the allowlist.
- A `spine_field_keys_v1` check function (SQL) is proposed for future normalization; not blocking.

If Tai prefers, alternative migration variant B introduces `engine_spine_field_truth (project_id, spine, field_key, status, source_ref, updated_at, updated_by)` with unique `(project_id, spine, field_key)` — plan documents both; Tai picks.

## 5. Migration revision (NOT applied)

Rewrite the Phase 1 block in `.orchestrator/PENDING_MIGRATIONS.md`:

- `CREATE TYPE public.epistemic_status AS ENUM (...8 values...)`.
- If an older enum was drafted, `DROP TYPE ... CASCADE` guard in preflight (none applied yet, so safe).
- Sidecar columns unchanged in shape; comment updated to reference the field-key allowlist.
- `has_contradictions(_project_id uuid)` unchanged.
- Add optional variant B (normalized table) as a commented alternative.
- Preflight queries + rollback updated for the 8-value enum.

## 6. App-layer updates

- `src/lib/engine-epistemic.server.ts` — expand `EPISTEMIC_STATUSES`, split `sourceRefSchema` into a discriminated union, revise `AI_WRITABLE_STATUSES`, add `assertEvidenceForStatus(status, sourceRef)` used by both write handlers.
- `src/lib/engine-spine-fields.ts` (new) — `POINT_A_FIELD_KEYS`, `POINT_B_FIELD_KEYS` constants.
- `src/lib/engine-epistemic.functions.ts` — call `assertEvidenceForStatus`; reject unknown `fieldKey`.
- `src/components/engine/EpistemicStatusChip.tsx` — add `unclassified` neutral tone; render 8 statuses; popover form adapts required fields per selected status.
- Point A / Point B routes — pass `undefined` (not `inferred`) when no entry exists; chip handles the neutral state.
- `src/lib/__tests__/engine-epistemic.test.ts` — add cases for: each new status validator, evidence-rule rejections, AI-writable guardrail rejecting `verified`/`approved_truth`, unknown-field rejection, neutral default rendering (schema-level).

## 7. Doc updates

- `.orchestrator/phase-1-output.md` → append a **Revision R2** section explaining what changed, why, and what is still deferred (ceremony_id linkage lands in Phase 2).
- `.orchestrator/PENDING_MIGRATIONS.md` → replace Phase 1 block with revised SQL + variant B.

## Out of scope (deferred, explicitly)

- Ceremony surface + `ceremony_id` FK on `approved_truth` entries → Phase 2.
- Contradiction resolver UI → Phase 1B.
- Portal payload stripping of sidecars → Phase 3.
- Backfill of existing spine fields → Phase 5 (agents write initial statuses).

## Acceptance for the revision

1. Enum has 8 values with the documented semantics.
2. No code path defaults an unknown status to `inferred`.
3. Every write validates `source_ref` against the status-specific rule.
4. Every write validates `fieldKey` against the allowlist.
5. Tests cover the new validators and the neutral default.
6. Migration remains unapplied and documents both sidecar and variant B options.

## Build order

1. Update `engine-epistemic.server.ts` (taxonomy, discriminated union, evidence assertions).
2. Add `engine-spine-fields.ts` allowlist.
3. Update server-fn handlers to call the new assertions.
4. Update chip UI: neutral state + 8-status popover.
5. Update Point A / Point B routes to stop defaulting to `inferred`.
6. Expand tests.
7. Rewrite `PENDING_MIGRATIONS.md` Phase 1 block + variant B.
8. Append Revision R2 to `phase-1-output.md`.

No migration will be applied in this turn. After Tai re-reviews, a follow-up turn applies it.
