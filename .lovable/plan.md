## Objective
Eliminate the white/light gradient effect that currently sits at the top of the unified closing/footer section.

## Issue
The `SiteClosing` component renders a `h-40 sm:h-48` blend strip with `linear-gradient(to bottom, transparent 0%, #0A0F1F 100%)`. Because the page background behind it is white/light, this strip reads as a white-to-navy fade rather than a seamless transition, creating the visible band highlighted in the screenshot.

## Plan
1. **Remove the blend strip** from `src/components/SiteClosing.tsx` — delete the empty `div` with the gradient background.
2. **Adjust spacing** so the navy section still has adequate top padding after the strip is removed.
3. **Spot-check** across key routes (`/what-we-build`, `/`, `/insights`, etc.) to confirm the transition from the preceding section into the navy field looks clean without the white band.

No other changes needed.