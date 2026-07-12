# Get the project fully green

Items 2, 3, and 4 from your list are already fixed in the previous turn (the four targeted errors — `JSX.Element`, Lucide `title` props, and `spine.sources` filter/length/some — no longer appear in `bunx tsgo --noEmit`).

Running the full typecheck now surfaces **27 pre-existing TypeScript errors across 16 files**, all in the same family: TanStack Router link/navigate/redirect calls that don't match the generated route tree's typed search params. Test run is blocked until typecheck passes cleanly (item 1 can't be satisfied without addressing these).

## What's actually broken

All 27 errors fall into 4 buckets:

**Bucket A — `redirect({ search: { redirect: "..." } })` missing `email`** (5 errors)
The `/auth` route's `validateSearch` requires `{ email: string | undefined; redirect: string }`. Callers only pass `redirect`.
- `src/routes/_authenticated/route.tsx:11`
- `src/routes/engine.projects.$projectId.chat.tsx:45`
- `src/routes/engine.tsx:38`
- `src/routes/engine.tsx:102` (`navigate({ to: "/auth" })` missing `search` entirely)
- `src/routes/ops/route.tsx:27`

Fix: `search: { redirect: "...", email: undefined }` (and add `search` to the bare `navigate({ to: "/auth" })`).

**Bucket B — `<Link to="/auth" | "/portal/messages" | "/portal/roadmap">` missing required `search`** (6 errors)
Same root cause on the JSX side.
- `src/components/portal/roadmap/BookCallModal.tsx:129`
- `src/components/portal/roadmap/ClarificationModal.tsx:115`
- `src/components/portal/roadmap/DecisionResponseModal.tsx:130`
- `src/routes/forgot-password.tsx:91`
- `src/routes/portal.home.tsx:102`
- `src/routes/portal.messages.tsx` / `portal.roadmap.tsx` (same pattern)

Fix: add `search={{ email: undefined, redirect: "..." }}` or the minimal required search per target route.

**Bucket C — template-literal `to` on `<Link>` not assignable to route-tree union** (5 errors)
`` to={`/engine/projects/${projectId}/foo`} `` is inferred as a plain string, not one of the generated route paths.
- `src/components/engine/WorkspaceHeader.tsx:297, 333, 415`
- `src/routes/admin.plan-depth.tsx:195`
- `src/routes/admin.roadmap-intelligence.tsx:288, 370`

Fix: use `to="/engine/projects/$projectId/overview"` (etc.) with `params={{ projectId }}` — the typed-params pattern the router expects — instead of interpolating into the string.

**Bucket D — search-updater functions on `ops/insights` and stray `beforeLoad` return** (4 errors)
- `src/routes/ops/insights.tsx:81, 83, 85` — `navigate({ search: (prev) => ({...}) })` without `from`/`to`, so `prev` widens to `Record<string, unknown>` and the returned shape misses required fields. Fix per `tanstack-type-safety`: use `Route.useNavigate()` + `to: "."` so the updater's type resolves.
- `src/routes/checkout.walk.$pace.tsx:89` — `beforeLoad` typed as returning `never` but current body returns `void`. Fix: `throw redirect(...)` on the redirect path, otherwise return nothing (no early `return;` that widens the type).

## Plan

1. Fix Bucket A (5 sites): add `email: undefined` to every `redirect({ to: "/auth", search: { ... } })` and add the missing `search` on the bare `navigate({ to: "/auth" })` in `engine.tsx`.
2. Fix Bucket B (6 sites): add the required `search` prop to `<Link to="/auth" | "/portal/messages" | "/portal/roadmap">`.
3. Fix Bucket C (6 sites): rewrite `` to={`/engine/projects/${id}/x`} `` as `to="/engine/projects/$projectId/x"` with `params={{ projectId: id }}`.
4. Fix Bucket D (4 sites): scope the `ops/insights` navigates through `Route.useNavigate()` with `to: "."`; correct the `checkout.walk.$pace.tsx` `beforeLoad` return type.
5. Re-run `bunx tsgo --noEmit` — expect 0 errors.
6. Run `bunx vitest run` — report pass/fail. Fix any test regressions caused by the router changes (unlikely; the tests I added earlier are source-scan only).

## Out of scope

- No behaviour changes, no route restructuring, no new routes.
- No DB migrations.
- No changes to auto-generated files (`routeTree.gen.ts`, Supabase client).
