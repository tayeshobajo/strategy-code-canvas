## Goal
Bring the Investment page Hero and the "Businesses without a map do not fail. They scatter." section closer to the reference mockup, with the rest of the page left as-is.

## What changes

### Hero (`function Hero` in `src/routes/investment.tsx`)
Reference shows: a compact hero, no top section-nav floating over it, generous warm-paper area on the left with the book photo sitting cleanly on the right (not full-bleed under the text), and a thin hairline separating the section from the Bridge below.

- Reduce vertical padding: top ~pt-28, bottom ~pb-16 at desktop (currently `lg:pt-40 lg:pb-32` — too tall).
- Replace the full-bleed image + heavy gradient wash with a contained two-column layout: text column on the left (col-span-6), book photo on the right (col-span-6) cropped to the desk/book area, with a soft feather only on its left edge so it blends into the paper background instead of bleeding behind the headline.
- Keep paper background `oklch(0.95 0.018 75)` across the full section so left side reads as warm paper, not white.
- Headline: tighten to `text-[44px] sm:text-[56px] lg:text-[60px]`, `leading-[1.05]`, single-color ink, matching the reference's smaller, balanced two-line set.
- Eyebrow stays `INVESTMENT` in royal blue.
- CTAs: keep primary (dark pill) + ghost text link, same order; tighten the gap to `gap-2`.
- Fine-print line spacing unchanged.
- Add a bottom 1px `border-rule/60` divider so the Bridge section starts on a clean hairline (reference shows that line clearly).

### "Businesses without a map do not fail. They scatter." (`function FooterCTA`)
Reference shows: the starscape constellation occupies the **left** ~40% only, fading to flat deep-navy on the right; text column sits on the right, centered vertically; the small "Build My Map" pill is white with dark text; ghost "Start with the map" is white text; fine print sits directly under the CTAs.

- Keep the existing `to left` gradient direction (already correct), but tighten the fade so the starscape is fully solid navy past ~55% (currently fades too gradually).
- Reduce section padding: `py-16 lg:py-20` (currently `py-20 lg:py-28`) — reference is more compact.
- Headline: `text-[30px] sm:text-[36px] lg:text-[40px]`, `leading-[1.15]`, single line at desktop where possible.
- Body copy width: `max-w-[60ch]`, `text-[13.5px] leading-[1.7]`.
- CTAs: shrink to `px-5 py-2.5 text-[12.5px]` to match the smaller pill in the reference.
- Keep the footer block underneath unchanged.

## Out of scope
- No changes to Bridge, Map, Pace, Holds, Quarterly, QuoteDivider sections.
- No changes to SiteHeader or SectionNav components.
- No new assets — reuse `hero-investment-book-desk.png` and `footer-network-starscape.png`.
- No copy changes.

## Verification
- Visual check at 1440px and 1024px via Playwright screenshot of `/investment`, comparing hero + CTA against the reference.
- 375px / 414px responsive sanity check — book photo hides on mobile (already `sm:block`), CTA stack remains readable.

## Files touched
- `src/routes/investment.tsx` (Hero + FooterCTA blocks only)
