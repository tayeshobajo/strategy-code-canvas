## Problem

After constraining the Market Gap grid to `max-w-[1240px]`, the right (navy) column now only gets ~723px wide at desktop. The browser-mockup image inside uses `object-cover` at fixed heights (`lg:h-[560px] xl:h-[640px]`), so it crops off the right side of every screenshot.

## Fix — `src/routes/clients.spartan.tsx`

1. **Let the split-screen grid go full-bleed again.** Remove `mx-auto max-w-[1240px]` from the Market Gap grid wrapper (line ~726). The split-panel editorial layout needs the full viewport to breathe; constraining it was what caused the crop.
2. **Keep the section header centered at 1240px** (already done — no change).
3. **Keep the image `object-cover`** so it still fills the frame cleanly at any width, but with the column back at ~60% of the viewport the mockups will show without losing the menu/CTA area on the right.
4. **Point A and Note-from-Tai stay at `max-w-[1240px]`.** The consistency the user asked for is preserved on the standard editorial sections; Market Gap is a deliberate full-bleed split-screen moment (like a magazine spread) and is treated as the exception.

## Verify

- Playwright screenshot at 1480px confirming Gap 02 image shows full menu + CTA button, no right-edge crop.
- Header still centered at 1240px so it visually aligns with Point A and Note from Tai above/below.

## Out of scope

- No copy, image, or CTA changes. No changes to Point A or Note from Tai.
