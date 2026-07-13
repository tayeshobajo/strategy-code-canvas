# Prepared delivery packages invisible to clients — decide semantics

## Confirmed issue

`src/lib/engine-completion.functions.ts` `prepareDeliveryPackage` writes to
`client_portal_roadmaps` with `status: "approved"` (line 415, both INSERT
and UPDATE branches).

After migration `20260713123604`, the client_portal_roadmaps SELECT policy
and the portal read paths (`getPortalContext`, `getPortalRoadmapDocs`,
`getPortalRoadmapContextOptions`) accept only `status = 'published'`.
Only `sendProjectDelivery` / `publishVersionToPortal` route through the
`publish_portal_roadmap` SECURITY DEFINER RPC that sets `'published'`.

Consequence: a package prepared through the Delivery Readiness gate is
invisible in the portal until a separate delivery/publish step runs. The
function's docstring ("Publishes to client_portal_roadmaps. Does NOT
notify the client.") no longer matches behavior.

## Decision needed (Tai)

Two valid intents; pick one before code changes:

**Option A — Prepare == stage internally (change docstring only).**
"Prepare" is an internal readiness marker. Client sees nothing until
`sendProjectDelivery` publishes.
- Change: update the docstring on `prepareDeliveryPackage` to say the row
  is staged staff-side and NOT visible to the client until delivery.
- Optionally add a `preparedAt` column or an internal-only status
  (`'prepared'`) if we want to distinguish it from bare `'approved'` on
  staff dashboards.
- Zero client-facing behavior change; no migration.

**Option B — Prepare == publish silently (change behavior).**
"Prepare" makes the package visible in the portal without notifying the
client, matching the old docstring.
- Change: `prepareDeliveryPackage` calls `publish_portal_roadmap` RPC (or
  writes `status: 'published'`) and skips the email/notify step that
  `sendProjectDelivery` performs.
- Client-facing behavior change: portal shows the package as soon as it is
  prepared, before any explicit "send".

## Recommendation

Option A. The recent RLS tightening implies the current model is
"published == client-visible, everything else == staff-only". Making
Prepare publish silently reintroduces the surface that was just closed.

## Out of scope

- The two schema-drift fixes (missing `current_phase` column,
  `client_portal_roadmaps` grants) are already written to
  `.orchestrator/PENDING_MIGRATIONS.md` awaiting Tai approval — not part
  of this plan.
