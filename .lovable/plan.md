# Rename pace tiers across the site

Swap the three engagement-pace labels everywhere they appear.

| Current | New |
|---|---|
| The Fast Walk | Accelerated Pace |
| The Middle Walk | Balanced Pace |
| The Steady Walk | Steady Pace |

## Files touched

- `src/routes/investment.tsx`
  - Lines 57–59: `Offer.name` values inside the JSON-LD structured data.
  - Lines 343–345: `WALKS[].name` used to render the three pricing cards.
- `src/routes/index.tsx`
  - Lines 198, 205, 212: the matching `name` entries in the homepage pace section.

## Out of scope (kept as-is)

- Subtitles like "The walk most founders fund from operations" stay unchanged — the user only asked to retitle the three tiers. If you want the supporting copy de-walked too, say the word and I'll do a second pass.
- The `/walks` route slug and `WalksHero` content are separate brand content and are not engagement-pace labels, so they are not touched.
