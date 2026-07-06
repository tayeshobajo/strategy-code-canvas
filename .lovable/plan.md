## Fix

The marquee currently forces every logo to pure black (`filter: grayscale(1) brightness(0)`) at a uniform `opacity: 0.6`. That treatment crushes lighter marks (Pitcher, Paid, Aceyus wordmark) into the same optical weight as already-heavy marks (Creative World School, Swell Collective, TeamsynerG), so the newer heavy ones read as bolder than the rest of the row.

Fix in `src/components/ClientMarquee.tsx` only — no data or layout changes:

1. Replace the global `filter: grayscale(1) brightness(0)` with a lighter default: `grayscale(1)` + a mid gray tint via `opacity` alone, so naturally-heavy logos aren't further darkened.
2. Add a per-logo `weight` field on the `LOGOS` array (`"heavy" | "normal" | "light"`) and map it to a class (`data-weight="heavy|normal|light"`).
   - heavy (Creative World School, Swell Collective, TeamsynerG, Shark Group): `opacity: 0.42`, no brightness boost — tames them.
   - normal (default, most marks): `opacity: 0.6`.
   - light (Aceyus, Pitcher, Hellopaid/paid if thin): `opacity: 0.72` with a slight `filter: contrast(1.05)` so they don't disappear.
3. Keep hover state proportional (bump each tier ~+0.15 opacity, capped at 0.95).
4. Keep the black-ink treatment intent (grayscale) but drop `brightness(0)` so heavy marks stop looking painted-on.

Result: every logo sits at roughly the same optical weight in the row, matching the "one confident wall of proof" intent in the file's own comment.

### Files touched
- `src/components/ClientMarquee.tsx` (weight tagging + CSS tiers only)
