## Scope

Fix the failing TypeScript build and finish the Understanding Room UI. All items are scoped to frontend/route files and the three server-fn files already in the tree — no schema migrations.

## 1. Understanding Room route (tasks 1–4)

File: `src/routes/engine.projects.$projectId.understanding-room.tsx` (already exists but currently breaks the build).

- Repair the route so it compiles: fix imports from `@/lib/engine.functions` (verify the exported types/fn names, add missing ones or inline local types if the server fn returns a looser shape).
- Wire data with `useQuery` calling `useServerFn(getUnderstandingRoom)` keyed by `projectId`. Render loading skeletons and an error `EmptyState`.
- Render a responsive 4×3 grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-4`, exactly 12 slots) of Area Cards. Each card shows: area title, state badge (using existing `STATE_STYLES`), 1–3 line summary (line-clamped), and a confidence indicator (dot + numeric %).
- Add a click-through drawer (shadcn `Sheet`) per card showing full understanding text, open questions, recommendations, and validation notes. Local `useState` for open card id.
- If the server fn returns fewer than 12 areas, pad with `missing`-state placeholders so the grid is always 12.

## 2. Metadata / engine_projects typing (task 5)

`engine_projects` has no `metadata` column. In `src/lib/engine-ai-workspace.functions.ts` (and any sibling touched here), stop selecting/reading `metadata`. Either drop the field entirely or replace with an in-memory default `{}`. Keep the `supabaseAdmin as any` cast off if possible once metadata refs are gone.

## 3. Chat proposal approve (tasks 6, 11)

File: `src/lib/engine-chat-proposal-approve.functions.ts`.

- Coerce nullable text fields with `?? ""` / `?? null` before insert.
- Cast JSON payload fields through `as unknown as Json` using the generated `Json` type from `@/integrations/supabase/types`.
- Narrow `proposal.payload` with a Zod parse (or `as` cast + runtime guards) so downstream field access typechecks.

## 4. Decision log server fns (tasks 7, 12)

File: `src/lib/engine-decision-log.functions.ts`.

- Break the deep generic instantiation by typing the Supabase query builder as `any` at the boundary, then re-annotating the result as `{ data: ActivityRow[] | null; error: PostgrestError | null; count: number | null }` via a local `ActivityRow` type derived from `Database["public"]["Tables"]["engine_activity"]["Row"]`.
- Ensure the returned shape matches `DecisionLogResult`.

## 5. Admin decision log route (tasks 8, 13)

File: `src/routes/admin.decision-log.tsx`.

- Remove `keepPreviousData` (react-query v5 uses `placeholderData: keepPreviousData` from `@tanstack/react-query`). Import `keepPreviousData` and pass via `placeholderData`, or drop entirely.
- Annotate `useQuery<DecisionLogResult>` so `entries`, `total`, `has_more` typecheck. Add null-safe fallbacks (`data?.entries ?? []`).

## 6. Admin plan-depth JSX namespace (task 10)

File: `src/routes/admin.plan-depth.tsx`.

- Replace `JSX.Element` with `ReactNode` imported from `react` (project tsconfig doesn't include the JSX global namespace).

## 7. Roadmap intelligence icons (task 14)

File: `src/routes/admin.roadmap-intelligence.tsx` line ~425 area.

- Remove invalid `title` prop from Lucide icons; wrap the icon in a `<span title="...">` where a tooltip is needed. Fix any related type mismatches surfaced by the compiler after that change.

## 8. Evidence route stats shape (task 15)

File: `src/routes/engine.projects.$projectId.evidence.tsx`.

- The server fn returns `stats` as an object, but code calls `.filter` on it. Correct to the actual array field (e.g. `stats.items` / `evidence` array) or destructure from the result. Adjust the render to iterate the right collection.

## Verification

After edits, run `bun run build:dev` and confirm zero TS errors. Spot-check the Understanding Room route in the preview.

## Notes

- Task 9 was omitted by the user; skipping.
- No DB migrations; if any surface truly needs `metadata`, it will be logged to `.orchestrator/PENDING_MIGRATIONS.md` instead of applied.