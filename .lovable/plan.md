
## Goal

Make the hero feel like one authored scene. Add a barely-visible paper/contour texture behind the left copy, a thin blue route-line accent near the CTAs that points toward the image, a soft feathered seam between the two columns, and a small caption anchored over the bottom-left of the image. Tighten vertical rhythm. No copy, header, or downstream sections change. The current hero image stays.

## Scope

- `src/routes/index.tsx` — `Hero()` only, plus a small `pt` reduction on `FeatureStrip` so the next section reads as connected.
- `src/styles.css` — add one utility class for the paper/contour texture (inline SVG data URI, no asset upload).

## Texture (left column)

- New utility `.hero-texture` in `styles.css`: `background-image` set to an inline SVG data URI combining (a) a faint contour-line motif (two or three long, gently curved paths in `--ink` at ~3% opacity) and (b) a subtle grain via SVG `feTurbulence`. Tiled, fixed size so it doesn't repeat obviously.
- Rendered as a `<div className="hero-texture pointer-events-none absolute inset-0 -z-0">` inside the left column's `relative` wrapper. Text sits at `relative z-10` so readability is untouched.

## Route-line accent

- Inline SVG positioned `absolute` near the CTA / microcopy area, originating just under the microcopy and arcing right toward the seam between the two columns. `stroke="currentColor"` with `text-royal`, `stroke-width="1.25"`, `stroke-linecap="round"`, `stroke-dasharray="1 6"` for a quiet dotted-path look. A small filled `circle` terminator at the seam end. `opacity-70`. Hidden below `lg` (`hidden lg:block`).
- Placed in the left column's `relative` wrapper, after the text block, with `bottom-12 right-[-2rem]` style positioning so it visually crosses into the seam.

## Column seam (soft feathered transition)

- On the right image panel, add a left-edge gradient overlay: `<div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-paper to-transparent" />`. This feathers the photo into the white text side without darkening the image. Only on `lg:` (hidden on mobile where they stack).

## Artifact caption (over bottom of image)

- Absolutely positioned at the bottom-left of the right panel, `lg:bottom-8 lg:left-8`, with a semi-translucent white pill background so it stays legible on the photo: `bg-paper/85 backdrop-blur-sm border border-ink/10 px-4 py-3 rounded-sm`.
- Content:
  - Eyebrow: `font-mono text-[10.5px] uppercase tracking-[0.18em] text-royal` — "THE OPERATING MAP"
  - Subline: `mt-1 text-[12px] text-ink/70` — "A living plan for what to build first."
- Hidden below `lg` (the photo is short on mobile and the caption would crowd it).

## Vertical alignment & rhythm

- Keep `lg:min-h-[720px]` on the hero. Left column already uses `flex items-center`, which centers content. To "bring it slightly lower", add `lg:pt-8` to nudge the centered block downward visually without breaking the center axis (`items-center` + small top padding = slight downward bias).
- Reduce the hero's bottom breathing room: the section currently relies on `min-h` only; add `lg:pb-4` so the seam to the next section closes a touch.
- `FeatureStrip` currently uses `py-16`. Change to `pt-10 pb-16` so the top of the next section sits closer to the hero. This is the one allowed touch outside the hero because the user explicitly asked for the transition to feel connected.

## Out of scope

Header, nav, headline / body / CTAs / microcopy text, the hero image asset itself, image crop position, RoadmapSection, Pricing, CTABand, Footer.

## Verification

Preview at 1477px and 390px:
- Desktop: faint texture visible behind copy without affecting legibility; dotted royal route line arcs from below the microcopy toward the image seam; left edge of the photo feathers softly into the white side; caption pill sits at bottom-left of the image, readable but quiet; hero bottom rhythm tightens into FeatureStrip.
- Mobile: texture remains harmless behind copy; route line, seam gradient, and caption are hidden; layout still stacks text → image cleanly.
