## Fix the two preflight blockers in `.orchestrator/PENDING_MIGRATIONS.md`

Scope: edit the pending migration draft only. No code changes, no migration application, no other phases touched. Both edits are in the same file.

### Fix 1 — Complete Point A / Point B static arrays in `internal_spine_field_keys`

File: `.orchestrator/PENDING_MIGRATIONS.md`, lines ~767–804 (Phase 1 R3 block).

Source of truth is `src/lib/engine-spine-fields.ts`:
- `POINT_A_BASE_FIELD_KEYS = ['lenses', 'diagnosis', 'key_diagnosis']`
- `POINT_B_FIELD_KEYS = ['24_month_destination', '10_year_position', 'client_outcome', 'customer_outcome', 'operational_outcome', 'revenue_outcome', 'brand_position']`
- Dynamic Point A: `diagnosis:<title>` (already handled via the existing `RETURN QUERY … LIKE 'diagnosis:%'` block).

Replace the placeholder Point A array (`current_state:*` sample + `-- ... full Point A static list mirrored from TS registry`) with the exact three base keys above. Replace the placeholder Point B array (`target_state:*` sample + `-- ... full Point B static list`) with the seven keys above. Preserve order so the vitest drift check (`spine-field-keys-drift.test.ts`, which asserts `expect(dbKeys).toEqual([...POINT_A_BASE_FIELD_KEYS])`) passes on first run.

Leave the dynamic `diagnosis:%` `RETURN QUERY` block untouched.

### Fix 2 — Correct trigger function name for `engine_spine_ceremonies.updated_at`

File: `.orchestrator/PENDING_MIGRATIONS.md`, line 708 (Phase 2 ceremony model block).

Change:
```sql
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```
to:
```sql
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
```

This matches the function that already exists on this project and is what the other three ceremony-model triggers (lines 2527, 2614, 2739) already use — so this is the odd one out.

Also update the Phase 2 preflight note (~line 1117) so it reads "Confirm `public.tg_touch_updated_at()` exists" rather than `update_updated_at_column()`, keeping the preflight checklist honest.

### Not in scope

- No SQL applied. Both edits stay queued in `PENDING_MIGRATIONS.md` for Tai's review.
- No changes to Phase 1 R3 rollback SQL (it does not reference either symbol).
- No changes to any other phase, server function, or UI.
- The paired-apply recommendation for Phase 1 R3 + Phase 2 ceremony model is noted but not implemented here; it belongs to the apply-window plan, not this preflight fix.

### Acceptance

- `rg "update_updated_at_column" .orchestrator/PENDING_MIGRATIONS.md` returns only the historical mention in the diagnostic notes block (line ~3983), not the trigger DDL.
- `rg "full Point A static list|full Point B static list" .orchestrator/PENDING_MIGRATIONS.md` returns zero hits.
- The two static arrays in `internal_spine_field_keys` match `POINT_A_BASE_FIELD_KEYS` and `POINT_B_FIELD_KEYS` element-for-element in order.
