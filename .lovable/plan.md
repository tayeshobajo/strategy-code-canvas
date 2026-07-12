## Phase 2 Acceptance — Two-part Closeout

### Part 1 — Lock `spine_field_keys` to internal staff

**Migration (single file, requires approval):**

```sql
CREATE OR REPLACE FUNCTION public.spine_field_keys(_project_id uuid, _spine text)
RETURNS SETOF text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE allowed boolean := false;
BEGIN
  SELECT
    public.is_engine_staff()
    OR public.has_role_email(coalesce(auth.email(), ''), 'team_member')
  INTO allowed;
  IF NOT allowed THEN
    RAISE EXCEPTION 'Forbidden: spine_field_keys is staff-only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY SELECT public.internal_spine_field_keys(_project_id, _spine);
END;
$$;
-- grants unchanged: EXECUTE stays TO authenticated (gate is inside body)
```

Portal-member branch removed. Ceremonies stay internal-only. Phase 3 can add a separate portal-safe helper if it needs client-safe field labels.

**No app code changes** — `listCeremonyFields` already asserts `admin/operator` before calling the RPC, and no portal route imports it. Test fixture at `src/lib/__tests__/spine-field-keys-drift.test.ts` still compares against `internal_spine_field_keys` so it stays green.

### Part 2 — Operator UI smoke pass through `CeremonyPanel`

Playwright script under `/tmp/browser/phase2-ui-smoke/run.py` driving the injected admin/operator session against `http://localhost:8080/engine/projects/<scratch>/point-a` and `.../point-b`. Uses the same scratch project created in the earlier smoke run (or creates a fresh one via existing server fns if missing). Screenshots per case under `screenshots/`, machine-readable `results.json`.

**Cases (all 16 UPDATE-path guarantees, driven end-to-end):**

| # | Case | How exercised via UI |
|---|------|---------------------|
| 1 | `recordCeremonyDecision` stamps `ceremony_id` on truth row | Open ceremony, approve a field, verify truth row via `supabase--read_query` |
| 2 | `completeCeremony` blocks non-terminal fields | Click Complete with 1 field still `pending`, expect toast error |
| 3 | Raw/incomplete completion path rejected by DB trigger | Force via authenticated fetch of `completeCeremony` with mid-state; expect trigger error |
| 4 | Bare `missing` blocks completion | Set field to `missing` without accepted-risk, expect completion blocked |
| 5 | `accepted-risk missing` allows completion | Set same field to `missing` + accepted-risk, expect completion succeeds |
| 6 | Contradiction blocks completion | Seed one truth row `contradicted`, attempt complete, expect block |
| 7 | Abandon Point A rejected while Point B exists (no unlock) | Complete A → Start B → Abandon A, expect rejection |
| 8 | Decision against completed ceremony rejected | Complete A, then try `recordCeremonyDecision` on it, expect rejection |
| 9 | `approved_truth` without ceremony provenance rejected | Direct authenticated write attempt, expect trigger error |
| 10 | Full Point B approve + complete works | Happy path end-to-end, screenshot final green state |
| 11 | AI actor cannot write verified/approved_truth | Server-fn call with `updated_by_actor='ai'`, expect CHECK violation |
| 12 | `abandonCeremony` requires reason | Empty reason via panel, expect validation error |
| 13 | Completion trigger sees dynamic `diagnosis:*` keys | Seed `diagnosis:x`/`y` as approved, complete succeeds |
| 14 | Point A reversal cascades stale/re-review to Point B | After 10, reverse a Point A field, expect B ceremony `stale_since` + `re_review_required` |
| 15 | Invalidation record unlocks Point A reopen | Call `invalidatePointACeremony`, then `reopenCeremony`, expect success |
| 16 | Re-completion auto-resolves invalidations | After 15, re-complete Point A, expect invalidation row `resolved_at` set |

**Sanity checks (same script):**

- `CeremonyPanel` renders on `/engine/projects/*/point-a` and `/point-b` only — grep source (no import outside `engine.projects.$projectId.point-{a,b}.tsx`) + Playwright visit of `/portal/roadmap`, `/portal/home`, `/portal/onboarding` and assert no `[data-qa-ceremony-badge]` / `CeremonyPanel` DOM.
- WorkspaceStepper badge: after case 10, assert `[data-qa-ceremony-badge="point-a"][data-qa-ceremony-state="completed"]` and same for point-b; after case 14, expect `re_review` / `stale`.

**Doc hygiene:**

- Rewrite the "INCONCLUSIVE" table in `.orchestrator/phase-2-output.md` with the UI-driven results (each row → PASS or FAIL with evidence path).
- Remove the "recommended follow-up: Playwright pass" and "WorkspaceStepper closeout" callouts — now closed.
- Append a final "Phase 2 — ACCEPTED" section with sign-off checklist.
- Mirror the acceptance line in `.orchestrator/PENDING_MIGRATIONS.md` under the Phase 2 block.

**Stop conditions (ask before continuing):**

- `LOVABLE_BROWSER_AUTH_STATUS` ≠ `injected`, OR the injected session's email is not in `user_roles` with `admin` or `operator` → stop, ask user to sign in as an operator.
- Any case fails → stop, do not mark accepted, report the specific case + evidence.

### Deliverables

- 1 migration file (Part 1)
- `/tmp/browser/phase2-ui-smoke/{run.py, results.json, screenshots/*.png}`
- Updated `.orchestrator/phase-2-output.md` and `PENDING_MIGRATIONS.md`
- No changes to `CeremonyPanel`, `WorkspaceStepper`, or any Phase 2 server fn (they're already correct — this pass proves it)

### Out of scope

- Portal-safe field-label helper (Phase 3)
- Any schema change beyond the `spine_field_keys` gate rewrite
