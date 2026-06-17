## What's wrong now

The current Walks hero uses a single full-bleed background image. The mountain art bleeds across the entire hero, sliding under the headline, body copy, and CTA. That makes the page feel different from every other page on the site (Home, About, Investment, What We Build), all of which use a contained right-side image with breathing room around it.

Your read is right: the background shouldn't bleed into the copy, and the art needs white space around it to feel natural.

## The fix — match the home page hero pattern

Rebuild `Hero()` in `src/routes/walks.tsx` to mirror the exact structure of `Hero()` in `src/routes/index.tsx`:

```text
┌─────────────────────────────────────────────────────────────┐
│  bg-paper (cream, full width)                               │
│  ┌──────────────────────────┬──────────────────────────┐   │
│  │  COPY (48fr)              │  IMAGE (52fr)            │   │
│  │                           │                          │   │
│  │  THE WALKS                │   ┌────────────────┐    │   │
│  │  Real businesses.         │   │                │    │   │
│  │  Real routes.             │   │  mountain art  │    │   │
│  │  Real ground covered.     │   │  (contained,   │    │   │
│  │                           │   │   object-cover │    │   │
│  │  Every walk here…         │   │   object-right)│    │   │
│  │                           │   │                │    │   │
│  │  A selection. Most…       │   │  feathered     │    │   │
│  │                           │   │  cream seam    │    │   │
│  │  [Build My Roadmap]       │   │  on left edge  │    │   │
│  │                           │   └────────────────┘    │   │
│  │  ── A 30 min conversation │                          │   │
│  └──────────────────────────┴──────────────────────────┘   │
│                                                              │
│        "No two walks are the same."  ← centered below       │
└─────────────────────────────────────────────────────────────┘
```

### Specifics

1. **Layout:** `lg:grid lg:grid-cols-[48fr_52fr] lg:items-stretch` — identical to home.
2. **Left column:** copy stays as-is (eyebrow, headline, body, italic private line, CTA). Same paddings as home: `px-6 py-14 lg:py-20 lg:pl-10 lg:pr-12 xl:pl-[max(2.5rem,calc((100vw-80rem)/2+2.5rem))]`. Keep the `hero-texture` paper layer behind it.
3. **Right column:** `Reveal` container, `h-[420px] lg:h-full lg:min-h-[640px]`. The mountain PNG sits `absolute inset-0 object-cover object-right`. A `bg-gradient-to-r from-paper to-transparent` strip on the left edge feathers the art into the cream — so no hard panel edge, but also no bleed into the copy area.
4. **Thesis line "No two walks are the same."** moves *out* of the hero box and sits centered on its own quiet line just under the hero (still inside the `bg-paper` section), in serif italic. This avoids the awkward absolute-positioned overlap on the mountain.
5. **Mobile:** image sits below copy at `h-[420px]`, same as the home page does implicitly via the grid collapse.

### Files touched

- `src/routes/walks.tsx` — rewrite the `Hero` component only. No other component, route, or asset changes.

## Out of scope

- No new artwork generation. The existing `walks-hero-bg.png` is reused; if after this rebuild the art still feels off (cropping, contrast), we'll address that as a separate step with image regeneration.
- No changes to filter row, walk rows, dark CTA, or footer.
- No copy edits.

## Why this works

The Home, About, Investment, and What We Build heroes all share this contained-right-image pattern. Adopting it on Walks makes the page feel like part of the same site, gives the mountain art the white space it needs to read as illustration rather than wallpaper, and removes the bleed-through that's making the copy feel like it's sitting on top of a texture instead of on a clean cream canvas.