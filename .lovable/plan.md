# Fix "View Walk" 404

## Problem

Clicking "View Walk" lands on `/walks_/leadership-education` and shows the root 404 page. The detail route file is `src/routes/walks_.$slug.tsx`, where the trailing `_` on `walks_` is TanStack Router's "break out of parent layout" suffix — it is part of the route ID, not the URL. The actual URL is `/walks/$slug` (confirmed in `routeTree.gen.ts`: `path: '/walks/$slug'`).

The `<Link>` in `src/routes/walks.tsx` (line 453) is using the route ID as the `to` prop:

```tsx
to="/walks_/$slug"
```

TanStack types accept this (it matches the route id), but it serializes literally into the address bar, producing the underscore URL that does not match any route.

## Fix

In `src/routes/walks.tsx`, change the View Walk link:

- `to="/walks_/$slug"` → `to="/walks/$slug"`
- Keep `params={{ slug: walk.slug }}` unchanged.

Single-line edit, no other files affected. Existing slug guard / `notFoundComponent` in `walks_.$slug.tsx` stays as-is.

## Verification

- Navigate to `/walks`, click "View Walk" on Leadership Education → URL becomes `/walks/leadership-education` and the detail page renders.
- Click an unknown slug manually → still hits the route's `notFoundComponent` (slug-safe loading already in place).
