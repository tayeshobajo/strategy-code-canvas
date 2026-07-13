# Phase 3 Migration — v3 Tightening (not applied)

Rewrites the migration block in `.orchestrator/PENDING_MIGRATIONS.md` in place. No app code, no apply. Still awaiting Tai approval.

## 1. Recursive JSONB scrub

Replace the `?|` top-level check in `tg_client_portal_roadmaps_scrub_internal` with a recursive helper that walks the whole tree.

```sql
CREATE OR REPLACE FUNCTION public.jsonb_contains_banned_key(
  doc jsonb,
  banned text[]
) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  k text;
  v jsonb;
  hit text;
BEGIN
  IF doc IS NULL THEN RETURN NULL; END IF;
  CASE jsonb_typeof(doc)
    WHEN 'object' THEN
      FOR k, v IN SELECT * FROM jsonb_each(doc) LOOP
        IF k = ANY(banned) THEN RETURN k; END IF;
        hit := public.jsonb_contains_banned_key(v, banned);
        IF hit IS NOT NULL THEN RETURN hit; END IF;
      END LOOP;
    WHEN 'array' THEN
      FOR v IN SELECT jsonb_array_elements(doc) LOOP
        hit := public.jsonb_contains_banned_key(v, banned);
        IF hit IS NOT NULL THEN RETURN hit; END IF;
      END LOOP;
    ELSE
      RETURN NULL;
  END CASE;
  RETURN NULL;
END $$;
```

Banned keys (canonical list, one source of truth):
`ceremony_id`, `ceremony_state`, `epistemic`, `epistemic_status`, `operator_override`, `operator_lock`, `contradiction`, `contradictions`, `provenance`, `source_ids`, `agent_costs`, `ai_confidence`, `confidence`, `internal_notes`, `supporting_notes_internal`, `review_state`, `intelligence_memory`.

Scrub trigger runs the helper on every jsonb snapshot column (see §3) and raises with the offending key + column. Preflight query added to abort migration if any existing row already contains a banned key at any depth.

## 2. Explicit state-transition guard

New `BEFORE UPDATE` trigger `tg_client_portal_roadmaps_status_transition`. Uses a whitelist table of `(from_status, to_status, requires_flag)` tuples; anything not listed raises.

Allowed transitions:

```text
in_progress  → approved
approved     → published
delivered    → published            (legacy path; delivered kept for historical rows only)
published    → superseded           (on republish)
published    → retracted            (on retract)
superseded   → published            (rollback/restore; requires metadata.transition_reason = 'rollback')
retracted    → published            (explicit restore; requires metadata.transition_reason = 'restore')
```

Rules:
- Same-status updates always allowed (subject to immutability trigger on frozen columns).
- Acknowledgment (`acknowledged_at`, `acknowledged_by_email`) may change under any current status without a transition.
- All other transitions raise `invalid_status_transition`.
- No path leads back to `in_progress` or `approved` or `delivered` from a terminal state.

## 3. Full column audit + snapshot classification

Complete column list for `client_portal_roadmaps` today (from live schema):

```text
id, project_id, source_submission_id, source_review_id,
roadmap_document_id, title, version_label, status,
approved_at, executive_summary, current_diagnosis,
strategic_priorities, sequence_30_60_90, risks_dependencies,
recommended_next_move, supporting_notes, current_focus,
owner_name, next_milestone, next_meeting_at,
pdf_file_id, one_pager_file_id, share_url,
acknowledged_at, acknowledged_by_email,
metadata, created_at, updated_at,
approved_roadmap_version_id, visible_modules,
published_by, published_at, client_safe_canvas
```

Plus the columns this migration adds:
`previous_publication_id, publish_diff, retracted_at, retracted_by, retraction_reason`.

Classification:

| Class | Columns | Rule after status ∈ (published, superseded, retracted) |
|---|---|---|
| **Frozen client-facing snapshot** | `title, version_label, executive_summary, current_diagnosis, strategic_priorities, sequence_30_60_90, risks_dependencies, recommended_next_move, current_focus, owner_name, next_milestone, next_meeting_at, pdf_file_id, one_pager_file_id, share_url, visible_modules, client_safe_canvas, approved_roadmap_version_id, source_submission_id, source_review_id, roadmap_document_id, publish_diff, previous_publication_id, published_by, published_at, approved_at` | Immutable. Any change raises. |
| **JSONB snapshot (frozen + scrubbed)** | `strategic_priorities, sequence_30_60_90, risks_dependencies, visible_modules, client_safe_canvas, metadata, publish_diff` | Frozen after publish AND recursively scrubbed for banned keys on every write. |
| **Internal-only, never client-visible** | `supporting_notes` | Recursively scrubbed on write regardless of status. Not exposed via portal read path. Kept out of `publish_diff`. |
| **Mutable post-publish (governed)** | `status, updated_at, acknowledged_at, acknowledged_by_email, retracted_at, retracted_by, retraction_reason` | Allowed to change; each governed by its own trigger (transition guard for `status`, retraction CHECK for retraction fields). |
| **System** | `id, project_id, created_at` | Never mutable after insert. |

Immutability trigger updated to compare OLD vs NEW across the full "Frozen" set above (not just the four columns in v2). Scrub trigger runs on all "JSONB snapshot" columns plus `supporting_notes` (as text, checked against banned substrings only if we ever migrate it to jsonb — for now, kept text and excluded from portal read path via existing `visible_modules` filter, which we also enforce in an app-layer read guard follow-up in Phase 3 app work).

## 4. Updated smoke cases (28 total)

Additions on top of the v2 set of 24:

- **S25** — insert with banned key nested 3 levels deep inside `client_safe_canvas.phases[0].items[0].provenance` → rejected, error names `provenance`.
- **S26** — insert with banned key nested inside `metadata.publish.debug.agent_costs` → rejected.
- **S27** — update `published` → `approved` → rejected (`invalid_status_transition`).
- **S28** — update `retracted` → `published` without `metadata.transition_reason='restore'` → rejected; same update with the flag → allowed.

Existing v2 cases S1–S24 unchanged (backfill correctness, single-published invariant, immutability of frozen snapshot cols, lineage same-project check, self-reference block, event RLS, acknowledgment event write, retraction CHECKs, delivered legacy backfill, etc.).

## 5. What does NOT change from v2

- Backfill logic (latest `published_at` across `approved/delivered/published` → `published`; older → `superseded`).
- Post-backfill preflight aborting if >1 `published` per project.
- Partial unique index on `(project_id) WHERE status='published'`.
- `client_portal_publish_events` table, RLS, `ON DELETE RESTRICT`, `acknowledged` as first-class event.
- Lineage trigger for `previous_publication_id` (same project, no self-ref).
- Retraction CHECK constraints.
- Rollback SQL (extended to drop the new helper function and transition trigger).

## Deliverable

Rewrite the Phase 3 block in `.orchestrator/PENDING_MIGRATIONS.md` with:
- revised SQL (helper function, updated scrub trigger, new transition trigger, expanded immutability column list, updated preflight, extended rollback),
- the 4 new smoke cases appended (S25–S28),
- status header unchanged: **PENDING TAI REVIEW — NOT APPLIED**.

No app code, no UI, no migration apply in this turn.
