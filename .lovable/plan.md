## Phase 2 R4 — Split spine_field_keys (do not apply)

Update the Phase 2 block in `.orchestrator/PENDING_MIGRATIONS.md`. R4 mirrors the contradictions split: an internal SECURITY DEFINER helper for triggers, and a public access-gated helper for UI/API callers.

### SQL revisions

Replace the single R3 `spine_field_keys` with two functions.

```sql
-- 1. Internal helper — trigger use only. No public grant, no access check.
CREATE OR REPLACE FUNCTION public.internal_spine_field_keys(
  _project_id uuid,
  _spine text
)
RETURNS SETOF text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _spine = 'point-a' THEN
    RETURN QUERY SELECT unnest(ARRAY[
      'current_state:summary',
      'current_state:pain_points',
      'current_state:constraints',
      'current_state:stakeholders'
      -- ... full Point A static list mirrored from TS registry
    ]::text[]);

    RETURN QUERY
      SELECT DISTINCT field_key
      FROM public.engine_spine_field_truth
      WHERE project_id = _project_id
        AND spine = 'point-a'
        AND field_key LIKE 'diagnosis:%';

  ELSIF _spine = 'point-b' THEN
    RETURN QUERY SELECT unnest(ARRAY[
      'target_state:summary',
      'target_state:success_metrics'
      -- ... full Point B static list
    ]::text[]);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.internal_spine_field_keys(uuid, text) FROM PUBLIC;
-- No grant to anon/authenticated. Callable only by SECURITY DEFINER code
-- in this schema (the completion trigger and the public wrapper below).
GRANT EXECUTE ON FUNCTION public.internal_spine_field_keys(uuid, text) TO service_role;


-- 2. Public wrapper — access-gated. Same access model as has_contradictions.
CREATE OR REPLACE FUNCTION public.spine_field_keys(
  _project_id uuid,
  _spine text
)
RETURNS SETOF text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  allowed boolean := false;
BEGIN
  SELECT
    public.is_engine_staff()
    OR public.has_role_email(coalesce(auth.email(), ''), 'team_member')
    OR EXISTS (
      SELECT 1
      FROM public.client_portal_projects cpp
      JOIN public.client_portal_permissions perm ON perm.project_id = cpp.id
      JOIN public.engine_projects ep ON ep.client_portal_project_id = cpp.id
      WHERE ep.id = _project_id
        AND lower(perm.email) = lower(coalesce(auth.email(), ''))
        AND perm.revoked_at IS NULL
    )
  INTO allowed;

  IF NOT allowed THEN
    RAISE EXCEPTION 'Forbidden: access to project % not permitted', _project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY SELECT public.internal_spine_field_keys(_project_id, _spine);
END;
$$;

REVOKE ALL ON FUNCTION public.spine_field_keys(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spine_field_keys(uuid, text) TO authenticated, service_role;
```

Notes:
- The gate lives *inside* the function, so `GRANT EXECUTE ... TO authenticated` is safe — non-staff / non-portal callers are rejected by the raise before any rows are returned.
- Public wrapper delegates to the internal helper — one source of truth for the field universe.
- `team_member` is included in the gate to match the ceremony RLS SELECT model (Phase 2 R1 policy: staff + team_member read).

### Downstream updates

- `enforce_ceremony_completion()` trigger — call `public.internal_spine_field_keys(NEW.project_id, NEW.spine)` (bypasses the access gate; runs inside SECURITY DEFINER, no `auth.email()` dependency).
- `src/lib/engine-spine-ceremonies.functions.ts`:
  - `listCeremonyFields` calls the public `spine_field_keys(project_id, spine)` via `ctx.supabase.rpc('spine_field_keys', { _project_id, _spine })` after `assertAdminOrOperator` — the DB gate is defense-in-depth.
  - `completeCeremony` continues calling public `has_contradictions` for user-facing error surfacing; the DB trigger uses `internal_project_has_contradictions` + `internal_spine_field_keys`.
- Cross-check vitest updated to compare the static list inside `internal_spine_field_keys` against `SPINE_FIELD_REGISTRY` in `src/lib/engine-spine-fields.ts`.

### Smoke plan additions (on top of R3's 20)

21. Authenticated caller with no staff role and no portal permission calling `spine_field_keys(other_project_id, 'point-a')` → raises `insufficient_privilege`.
22. Same caller cannot call `internal_spine_field_keys` at all → `permission denied for function internal_spine_field_keys`.
23. Staff caller on a project with `diagnosis:x` and `diagnosis:y` truth rows: `spine_field_keys(project, 'point-a')` returns full static set + both dynamic keys.
24. Client-portal member (non-staff) with active permission on the project can read `spine_field_keys` for that project (same access model as `has_contradictions`).
25. DB completion trigger: with a fresh Point A ceremony where every static field is `approved_truth` but a `diagnosis:x` truth row is still `needs_confirmation`, a direct SQL `UPDATE ... SET status='completed'` is rejected — proves the trigger sees dynamic keys through `internal_spine_field_keys` even with no `auth.email()`.

### Files to edit once approved

- `.orchestrator/PENDING_MIGRATIONS.md` — replace the Phase 2 R3 block with R4 (revised SQL + notes + expanded smoke plan).

No migration file, no app code, no test files created in this turn.
