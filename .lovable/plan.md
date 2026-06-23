# Homepage proof-first re-order

## 1. Move the client marquee directly under the hero

In `src/routes/index.tsx`, reorder the section stack so the order is:
hero → `ClientMarquee` → `FeatureStrip` ("Built for founders who are done guessing") → `RoadmapSection` → rest.

Tighten the band so it sits close to the hero rather than floating:
- In `ClientMarquee`, drop outer padding from `py-10 lg:py-12` to `py-6 lg:py-7`.
- Drop the `mt-8` above the marquee track to `mt-5`.
- Keep top + bottom hairline borders so it reads as a structural band, not a stranded panel.
- Remove the bottom border on the hero section (or rely on the marquee's top border) so the two meet flush.

## 2. Curate the logo set

Reduce `LOGOS` in `src/components/ClientMarquee.tsx` to these eight, in this order:

1. Aceyus, a Five9 company
2. Agilysys Book4Time
3. Keep Financial
4. PayStandards
5. EMCI Wireless
6. Pitcher
7. Hellopaid
8. Real Leaders

Delete the rest from the array (CWS, Destination Magic, Shark Group, Tune Up Fitness, TeamsynerG, Swell Collective). Leave the `.asset.json` pointer files in place — no asset deletions — so they can be re-introduced later without re-uploading.

## 3. Normalize logo ink and optical weight

Goal: every mark in the row reads as the same brand, same confidence.

- Remove the per-logo `scale` field from the type and from every entry. All cells render at the same height.
- Set the image treatment to a single ink: use a CSS filter to force every logo to one royal/navy tone at ~70% opacity. Apply `filter: brightness(0) saturate(100%) invert(15%) sepia(40%) saturate(2200%) hue-rotate(210deg)` (or the closest match to the existing `--royal` token) plus `opacity: 0.7`. Hover lifts to `opacity: 0.9`.
- Drop `grayscale` since we're now monotone-tinted.
- Set every image to `max-height: 100%; max-width: 100%` of the cell with no per-logo overrides. Keep the uniform cell sizing already in `.tt-marquee__cell`.
- Result: one ink, one weight, one rhythm across the row.

## 4. Remove the decorative dash before "A 30 minute conversation"

In `src/routes/index.tsx` around line 638-641, delete the `<span className="inline-block h-px w-5 bg-ink/40" />` and the `flex items-center gap-3` wrapper styling. Render the line as plain mono caps:

```tsx
<Reveal immediate variant="fade-up" delay={540} as="p"
  className="mt-5 font-mono text-[11.5px] uppercase tracking-[0.16em] text-ink/60">
  A 30 minute conversation. No pitch.
</Reveal>
```

Sweep `src/routes/index.tsx` and `src/components/SiteClosing.tsx` for any other decorative hairline `<span>` used as a typographic dash before mono caps labels (timeline phase labels in `RoadmapPanel`, closing CTA microcopy near line 1172) and remove them the same way. Hairlines that act as structural rules between sections stay.

## 5. Build Order language audit

In `RoadmapSection` and `RoadmapPanel`, audit copy so the vocabulary stays on **order / sequence / build order / unlocks / depends on**. Replace any instance of **timeline, schedule, plan, milestones-on-a-date, Gantt, deadline, week of, quarter ending** with order/sequence equivalents. The existing caption "the order is a conversation, not a contract" stays. No structural panel changes — copy only.

## Out of scope

- Hero composition, image, or headline.
- FeatureStrip copy and icons.
- Roadmap panel visual structure.
- Any new assets or uploads.
- Sections below the Roadmap (other than the dash sweep).

## Files touched

- `src/routes/index.tsx` — section order, hero dash removal, Build Order copy audit, dash sweep.
- `src/components/ClientMarquee.tsx` — curated list, removed `scale`, monotone filter, tightened padding.
