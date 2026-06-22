## Goal
Reorder the homepage so the client logo marquee appears below the "What You Get" section instead of directly under the hero.

## Change
In `src/routes/index.tsx`, inside the `Index` component, swap the order of `<ClientMarquee />` and `<FeatureStrip />`:

```
<Hero />
<FeatureStrip />     {/* "What You Get" */}
<ClientMarquee />    {/* moved here */}
<RoadmapSection />
```

## Out of scope
- No changes to marquee styling, logos, or spacing.
- No changes to FeatureStrip or other sections.
