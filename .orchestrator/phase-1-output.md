# Phase 1 — Epistemic-Status Taxonomy — Build Output

Date: 2026-07-12
Status: **App-layer shipped. Migration PENDING TAI REVIEW.**

## Scope

Introduce a first-class truth model across the engine: every extracted
signal and every Point A / Point B field carries an epistemic status
(`stated`, `inferred`, `assumed`, `contradicted`, `verified`) plus a
provenance pointer (`source_ref`). Foundation for Phase 2 (ceremonies),
Phase 3 (portal transitions), Phase 4 (evidence gate), and Phase 5
(specialist agents).

## What shipped this turn

### 1. Migration proposal (NOT applied)

Appended a full Phase 1 section to `.orchestrator/PENDING_MIGRATIONS.md`
containing:

- `CREATE TYPE public.epistemic_status`
- `ALTER TABLE engine_extracted_signals` — add `status`, `source_ref`,
  `superseded_by` + status index
- `ALTER TABLE engine_projects` — add sidecar `point_a_status`,
  `point_b_status` jsonb columns (existing payload shape untouched)
- `ALTER TABLE engine_project_chat_events` — add `epistemic_delta` jsonb
- `CREATE FUNCTION public.has_contradictions(_project_id uuid)` +
  `GRANT EXECUTE TO authenticated`
- Preflight queries Tai should run before applying
- Rollback plan (all additive; drop columns + enum + RPC)

Per CLAUDE.md rule: **no autonomous schema changes**. Awaiting Tai's
review.

### 2. Server functions — `src/lib/engine-epistemic.functions.ts`

Four `createServerFn` handlers, all `.middleware([requireSupabaseAuth])`,
all admin/operator-gated via `hasRoleForEmail`:

| Function | Method | Purpose |
| --- | --- | --- |
| `markSpineFieldStatus` | POST | Set epistemic status for a single Point A / Point B field. Writes to sidecar column. |
| `promoteSignalToSpine` | POST | Copy an extracted signal onto the spine as `stated` / `verified` / `inferred`. Builds `source_ref` from the signal. |
| `detectContradictions` | POST | List active contradictions (`status='contradicted' AND superseded_by IS NULL`). |
| `getSpineFieldStatus` | POST | Read the sidecar map. Degrades gracefully to `{}` when the migration is not yet applied, so the UI stays alive. |

Governance encoded in code:

- `AI_WRITABLE_STATUSES = ['inferred', 'assumed']` — documented constant
  that Phase 5 specialist agents will import as their guardrail.
- All mutations require admin or operator role. AI-written statuses will
  come through the agent invocation pipeline (Phase 5), not these fns.
- All error paths log the raw Supabase error server-side and throw a
  generic message to the client (audit finding S7 pattern).

### 3. UI — `src/components/engine/EpistemicStatusChip.tsx`

Presentation-only chip. Five tones, five icons, five accessible tooltips.
Defaults to `inferred` when no status is supplied — so it renders
correctly before AND after the migration.

Wired into:

- `src/routes/engine.projects.$projectId.point-a.tsx` — chip on every
  Current State Diagnosis card, keyed by card title. Sits next to the
  existing tag chip (`PARTIAL` / `MISSING` / etc.), not replacing it.
- `src/routes/engine.projects.$projectId.point-b.tsx` — chip in the
  right-slot header of every `SectionCard` (24-month destination, 10-year
  position, client outcome, etc.).

Both routes read from `project.point_a_status` / `point_b_status` via a
narrow type assertion — undefined until the migration lands, at which
point real statuses flow through automatically with no further UI work.

## What did NOT ship (deferred by scope)

Called out explicitly so nothing is "silently missing":

- **Contradiction resolver UI.** `detectContradictions` returns rows; no
  UI yet lists them or provides a "resolve" action. Tracked as
  **Phase 1B** below.
- **Chat feed epistemic-delta rendering.** Column proposed; chat UI does
  not yet render "Tai marked X as stated." Depends on Phase 5 chat
  refactor.
- **StepEditor status controls.** Tai cannot yet click a field and set
  its status from the Point A / Point B editors. Ships in Phase 2 as
  part of the ceremony surface (a ceremony IS "walk every field, confirm
  status, sign off").
- **Portal `buildClientSafePayload` audit.** Sidecar status columns must
  be stripped from client-facing payloads. Trivial (allowlist already
  narrow) but formally verified in Phase 3.
- **AI writer path.** No agent yet writes `inferred`/`assumed` statuses
  during extraction. Phase 5 (Intake Interviewer + Strategy Analyst
  agents) is where AI starts populating these.

## Acceptance criteria — status

| Criterion (from plan) | Status | Note |
| --- | --- | --- |
| Every field in point_a / point_b has a status. | **Blocked on migration** | Sidecar column defaults to `{}` — UI renders `inferred` fallback for every field, so the *displayed* answer is "every field has a status." True DB-level backfill lands with Phase 5 agents. |
| No field enters `stated` without evidence. | **Enforced by API** | `markSpineFieldStatus` requires `sourceRef.kind` (Zod-validated). |
| Contradiction detector flags a seeded dataset. | **Ready for QA** | `detectContradictions` operational once migration applied. Seeder script not written — Tai to seed via `psql` or reuse an existing signal for the smoke test. |

## QA questions the phase must answer

Answered where possible today, marked "post-migration" where not:

1. **Can I see, for any Point A field, whether Tai confirmed it or the
   AI guessed it?** → *Yes, via the chip on each card.* Pre-migration
   every chip reads `inferred` (safe default). Post-migration values
   reflect real DB state.

2. **If a client contradicts a prior answer, does the system surface
   it before the next ceremony?** → *Post-migration + Phase 2 ceremony.*
   `detectContradictions` is live; Phase 2 wires it into the ceremony
   gate.

3. **Does the portal ever show `inferred` content as if it were fact?**
   → *Yes, currently.* Sidecar columns are engine-side only. Portal
   payload builder makes no distinction. **Phase 3 must fix this** —
   either by leaking status labels (best) or by refusing to publish
   fields that are not `stated` / `verified`.

## Risk register

| Risk | Mitigation |
| --- | --- |
| Migration adds columns that collide with a future migration. | Preflight query in `PENDING_MIGRATIONS.md` checks for the exact column names. |
| AI writes `stated` by bypassing the API and calling `.update()` directly. | Not possible via the current agent surface — all AI writes go through server fns that use `requireSupabaseAuth`. Enforced again at Phase 5 with per-agent allowlists. |
| UI chip renders wrong tone for an unknown status. | TypeScript enum + exhaustive `TONE` map — TS refuses to compile on a new status without a tone entry. |
| `getSpineFieldStatus` returns `{}` post-migration due to a query bug and no one notices. | Ceremony (Phase 2) reads status directly with a joined query and will surface the mismatch. |

## Suggested Phase 1B (next incremental turn)

Tightly scoped follow-ups that can ship independently once migration is
approved:

1. Wire `detectContradictions` into `WorkspaceStepper` as a red badge
   on Point A / Point B tabs when count > 0.
2. Add a `ContradictionsPanel` component (list + `resolve` action calling
   a new `resolveContradiction` server fn that sets `superseded_by`).
3. Update the `updateProjectStep` handler in `src/lib/engine.functions.ts`
   so that when it detects a `spine_field_changed` audit row, it also
   flips any matching signal to `contradicted` — closes the "client
   said something different" loop end-to-end.

## Files touched

Created:
- `src/lib/engine-epistemic.functions.ts`
- `src/components/engine/EpistemicStatusChip.tsx`
- `.orchestrator/phase-1-output.md` (this file)

Modified:
- `.orchestrator/PENDING_MIGRATIONS.md` — appended Phase 1 section
- `src/routes/engine.projects.$projectId.point-a.tsx` — chip on diagnosis cards
- `src/routes/engine.projects.$projectId.point-b.tsx` — chip on section cards

No files deleted. No dependencies added.

## Verification

- Build errors: fixed inline (context cast through `unknown`; SectionCard
  `right` prop name).
- Typecheck: harness ran automatically after edits; passes.
- Migration applied: **NO** — awaiting Tai review.
- Live smoke test: chips render on `/engine/projects/*/point-a` and
  `/point-b` with default `inferred` tone. Confirmed against DB shape
  where sidecar columns do not yet exist.
