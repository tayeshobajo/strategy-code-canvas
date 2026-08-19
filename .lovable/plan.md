# Fix the build, then deliver the boundary audit

The typecheck is failing on three independent problems. None are caused by the audit work (that has been read-only). Two are pre-existing orphan files; one is a route search-param regression. Fixing these first unblocks the build, and the fix itself is aligned with the subtraction direction of the audit.

## Problem 1 — Orphaned Next.js files under `src/app/`

This is a TanStack Start project. `src/app/` contains a stray Next.js App Router tree that nothing in `src/routes/` or `vite.config.ts` references, but the typechecker still compiles it:

- `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/loading.tsx`, `src/app/globals.css`
- `src/app/dashboard/page.tsx`, `src/app/settings/page.tsx`, `src/app/settings/loading.tsx`
- `src/app/dna/loading.tsx`, `src/app/jobs/loading.tsx`, `src/app/jobs/[id]/loading.tsx`, `src/app/proposals/loading.tsx`

They import `next`, `next/link`, `next/navigation`, `next/font/google` (not installed) and `@/data/studio`, `@/lib/studio-store`, `@/lib/queries`, `@/lib/supabase/server` (do not exist). `src/app/globals.css` is imported only by `src/app/layout.tsx`.

Two more files exist only to serve that dead tree:
- `src/components/Sidebar.tsx` — imports `next/link`, `next/navigation`, `@/lib/studio-store`
- `src/lib/studio-badges.ts` — imports `@/data/studio`

**Action:** delete `src/app/` entirely, plus `src/lib/studio-badges.ts`, and delete `src/components/Sidebar.tsx` after confirming no live route imports it (the shadcn `src/components/ui/sidebar.tsx` is a different file and stays).

## Problem 2 — `/engine/projects/$projectId/spine` forces a required `search` prop

`src/routes/engine.projects.$projectId.spine.tsx:118` declares:

```ts
validateSearch: (search: Record<string, unknown>) => ({
  export: search.export === 1 || search.export === "1" ? 1 : undefined,
}),
```

The inferred return type has `export` as a **required** key (typed `1 | undefined`), so TanStack Router marks the whole search object as required. Every `<Link to="/engine/projects/$projectId/spine">`, `navigate(...)` and `redirect(...)` in the app now fails with "Property 'search' is missing" — 13 files, including `ProjectTabs.tsx`, `WorkspaceHeader.tsx`, `WorkspaceStepper.tsx`, `StudioTopBar.tsx`, `engine.projects.$projectId.chat.tsx`, `drift.tsx`, `index.tsx`, `overview.tsx`, `roadmap.index.tsx`.

**Action:** give the validator an explicit return type with an optional property, so the search object becomes optional again at every call site:

```ts
validateSearch: (search: Record<string, unknown>): { export?: 1 } =>
  search.export === 1 || search.export === "1" ? { export: 1 } : {},
```

This is a one-line fix at the source rather than adding `search={{}}` to 13+ call sites, and it does not change runtime behaviour of the PDF-export deep link.

## Problem 3 — `roadmap.index.tsx` reads search from the wrong route id

`src/routes/engine.projects.$projectId.roadmap.index.tsx:74` calls
`useSearch({ from: "/engine/projects/$projectId/roadmap" })`, but the Zod search schema (`view`, `phase`, `versionId`) is declared on the **index** route `/engine/projects/$projectId/roadmap/`. The parent (`roadmap.tsx`) is a bare `<Outlet />` layout with no search schema, so `search` resolves to `{}` and lines 79/96 error on `versionId`, `view`, `phase`.

**Action:** replace it with `Route.useSearch()` so the typed schema on the index route is used.

## Verification

- Run the typecheck and the vitest suite; confirm the previously failing files are clean and no new failures appear.
- Confirm `/engine/projects/<id>/spine` and `/engine/projects/<id>/roadmap` still load in the preview, and that the `?export=1` deep link still triggers the client roadmap export.

## After the fix

I will return to the read-only architecture and product-boundary audit and deliver it as a written report (executive diagnosis, subsystem inventory with KEEP/MOVE/ARCHIVE classification, database inventory, intake trace, route and dependency audit, security/data-risk notes, target website architecture and Scout data contract, phased subtraction plan, deletion-candidate list, Website app screens for cmd.trusttai.com, and the conversational intake question framework). Nothing will be deleted or migrated as part of that audit.
