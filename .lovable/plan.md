# Phase 6C acknowledgment migration — recommendation

## TL;DR
**Do not apply the proposed `ALTER TABLE engine_projects` migration.** The three columns it adds (`acknowledged_roadmap_version`, `acknowledged_at`, `acknowledged_by`) duplicate data that already lives on `client_portal_roadmaps`, and every current reader in the codebase is already using that existing surface. Adding a second copy on `engine_projects` will drift and create a "which one is truth?" bug.

## What already exists in the DB

`public.client_portal_roadmaps` already stores exactly this concept:

| Proposed on `engine_projects`      | Already on `client_portal_roadmaps`             |
| ---------------------------------- | ----------------------------------------------- |
| `acknowledged_roadmap_version TEXT`| `approved_roadmap_version_id UUID` (FK to `engine_roadmap_versions`) |
| `acknowledged_at TIMESTAMPTZ`      | `acknowledged_at TIMESTAMPTZ`                   |
| `acknowledged_by TEXT`             | `acknowledged_by_email TEXT`                    |

There is also `engine_delivery_items.client_acknowledged_at` / `client_acknowledged_by_email` as a secondary readout.

## What the code already uses

Every current reader points at `client_portal_roadmaps`, not `engine_projects`:

- `src/routes/portal.roadmap.tsx:338` — `ctx.data.approvedRoadmap?.acknowledged_at`
- `src/routes/portal.home.tsx:398` — `data.approvedRoadmap?.acknowledged_at`
- `src/lib/engine-execution.functions.ts` — reads `client_portal_roadmaps.acknowledged_at` / `acknowledged_by_email`
- `src/lib/engine-chat-context.server.ts:915` — filters unacked via `is("acknowledged_at", null)` on the same source
- Types in `src/integrations/supabase/types.ts` already reflect the `client_portal_roadmaps` shape

No code reads `engine_projects.acknowledged_*`. Applying the migration adds three permanently-NULL columns that nothing writes to and nothing reads from.

## Options for the acknowledgment feature

**Option A — Recommended: reject the migration, keep the single source on `client_portal_roadmaps`.**
Everything already works. If a new engine-side surface (e.g. "acknowledged in the last N days" panel on the project workspace) needs it, add a read-only helper:

```sql
CREATE OR REPLACE VIEW public.engine_project_acknowledgments AS
SELECT
  ep.id                              AS project_id,
  cpr.approved_roadmap_version_id    AS acknowledged_roadmap_version_id,
  cpr.acknowledged_at,
  cpr.acknowledged_by_email
FROM public.engine_projects ep
JOIN public.client_portal_roadmaps cpr
  ON cpr.project_id = ep.client_portal_project_id
WHERE cpr.acknowledged_at IS NOT NULL;

GRANT SELECT ON public.engine_project_acknowledgments TO authenticated, service_role;
```

Pros: no drift, no dual-write, no backfill. Cons: none for the current spec.

**Option B — Apply the migration only if Phase 6C explicitly needs a project-level ack independent of the portal roadmap.**
If (and only if) the requirement is "the internal engine has its own ack event that a project can carry without a published portal roadmap", then the columns are justified. In that case the shape should still be tightened:

```sql
ALTER TABLE public.engine_projects
  ADD COLUMN IF NOT EXISTS acknowledged_roadmap_version_id UUID
    REFERENCES public.engine_roadmap_versions(id),   -- FK, not free-text
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_by_email TEXT; -- match the naming used elsewhere
```

Plus a CHECK that all three are set together (`(ack_at IS NULL) = (ack_by IS NULL) AND (ack_at IS NULL) = (ack_version IS NULL)`), and a follow-up code change to keep the two ack surfaces in sync (or explicitly mark one authoritative).

**Option C — Apply the migration as written.**
Not recommended. Free-text `acknowledged_roadmap_version` (no FK), free-text `acknowledged_by` (no `_email` suffix used everywhere else), no CHECK, no writers, no readers. Guaranteed drift.

## My recommendation

Go with **Option A**. Reject Phase 6C's proposed ALTER, close it out in `.orchestrator/PENDING_MIGRATIONS.md` with a note pointing to the existing `client_portal_roadmaps` columns, and — if a joined engine-side read is needed — I'll add the `engine_project_acknowledgments` view in a small follow-up migration.

If Tai confirms Phase 6C genuinely needs a separate engine-level ack independent of the portal, I'll implement **Option B** (typed FK, matching `_email` naming, CHECK, and the sync path) instead.

## What I'll do next (once you pick)

- **Option A**: update `.orchestrator/PENDING_MIGRATIONS.md` to mark Phase 6C as "rejected — superseded by `client_portal_roadmaps.acknowledged_*`", optionally scaffold the view migration.
- **Option B**: draft the tightened `ALTER` migration (FK + `_email` naming + CHECK) plus the app-side write path.
- **Option C**: apply the migration as-written (only if you tell me to override the recommendation).

Out of scope for this plan: Phase 4B (`engine_spine_versions`) and Phase 9C (AI self-assessment CHECKs) — those are separate items in the same doc and I'll write dedicated plans for them when you're ready.
