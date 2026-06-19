# Fix Walk detail page (SSR crash) and verify against reference

## Problem

`/walks/leadership-education` renders a blank page. Console shows:

```
Invariant failed: Expected to find a dehydrated data on window.$_TSR.router…
```

Root cause: the route loader in `src/routes/walks_.$slug.tsx` returns the full `DETAILS[slug]` object, which contains `headline` as a `React.ReactNode` (JSX with `<em>`). TanStack Start serializes loader data into the SSR HTML for hydration, and React elements are not serializable — dehydration fails and the client mounts with no data, throwing the invariant. Because the page never renders, we cannot visually compare against the reference yet.

## Fix

In `src/routes/walks_.$slug.tsx`:

1. Loader: validate the slug and return only the slug string — no JSX.
   ```ts
   loader: ({ params }) => {
     if (!DETAILS[params.slug]) throw notFound();
     return { slug: params.slug };
   }
   ```
2. `head()`: read `loaderData?.slug` and look up `SUMMARY[slug]`/`DETAILS[slug]` for title/description (still serializable strings).
3. `WalkDetailPage` component (line 917): replace `const { walk } = Route.useLoaderData()` with
   ```ts
   const { slug } = Route.useLoaderData();
   const walk = DETAILS[slug];
   ```

No visual code changes — only data plumbing. The existing hero, route bar, milestones, stats, quote, dark CTA, continue-walking, and footer sections stay as-is.

## Verify against reference

After the fix, drive Playwright to `/walks/leadership-education`, capture full-page screenshots at 1280px width, and compare to the user's reference image section by section:

- Hero: eyebrow "THE WALKS", headline with italic royal "carries the work.", subhead, mountain art on right with route line ending in flag.
- The Route: 7-step horizontal bar (Point A → 01–05 → Current State) with labels.
- Point A + The Milestones: left copy block, right 5 numbered milestones with Lucide icons and titles.
- Where They Stand Now: left copy + 4 stat cards (1,250+, 84%, 28, 18+).
- Quote block with mountain art, founder attribution.
- Dark CTA "Your business is at its own Point A right now." with Build My Roadmap button.
- Continue Walking: 5 horizontal cards with sparkline-like routes and "View walk →".
- Footer matching site footer.

Note any deviations and patch only the off-spec elements (spacing, type sizes, colors). Stop when the rendered page matches the reference layout.
