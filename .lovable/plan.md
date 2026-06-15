## Plan: Polish the "Every build begins with the map" CTA on /what-we-build

### Goal
Refine the bottom CTA section so its typography, spacing, photo treatment, and grid proportions match the editorial quality of the homepage hero.

### Changes
All edits are confined to the CTA section in `src/routes/what-we-build.tsx` (the "Every build begins with the map" block near the bottom).

1. **Vertical rhythm**
   - Increase padding to `py-28 lg:py-36`
   - Add a subtle top hairline: `border-t border-rule/50`

2. **Headline**
   - Bump size to `text-[40px] md:text-[52px] lg:text-[56px]`
   - Tighten line-height to `leading-[1.02]`
   - Add tracking: `tracking-[-0.025em]`

3. **Body copy**
   - Increase to `text-[15px] leading-[1.7]`
   - Darken slightly to `text-ink/80`

4. **Three-column grid**
   - Adjust proportions to `minmax(0,0.95fr) minmax(0,0.75fr) minmax(0,1.3fr)` so the photo column breathes
   - Switch vertical alignment from `items-center` to `items-start` for a shared top baseline

5. **Photo treatment**
   - Replace `object-contain` with `object-cover`
   - Set `aspect-[16/9]`
   - Add a soft editorial shadow: `shadow-[0_30px_60px_-30px_rgba(15,23,42,0.25)]`

6. **CTA button**
   - Slightly larger padding for better hit-area and visual weight

### Out of scope
- No copy changes
- No new image assets
- No changes to other sections, footer, or routing

### Validation
Run a Playwright screenshot pass at 1280 px and 375 px to confirm the grid does not break, text remains legible, and the photo renders at the correct aspect ratio.