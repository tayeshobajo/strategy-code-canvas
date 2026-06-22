# Client Logo Marquee — Homepage

Add an infinitely-scrolling client logo strip on the homepage, placed directly above the "Built for founders who are done guessing" section. Logos render in black and white (grayscale + reduced opacity), with a subtle hover state restoring slight contrast.

## Logos to include (9)

Uploaded by user:
- Aceyus (a Five9 company)
- Agilysys Book4Time
- Creative World School
- Destination Magic
- Hellopaid (paid)
- Keep Financial
- PayStandards
- Pitcher
- EMCI Wireless (PTTanywhere.png)

All uploaded as Lovable Assets (CDN) — no binaries committed to the repo.

## Implementation

1. **Upload logos as CDN assets** via `lovable-assets create` from `/mnt/user-uploads/`, writing `.asset.json` pointers into `src/assets/clients/`.
2. **New component** `src/components/ClientMarquee.tsx`:
   - Heading: "Trusted by founders & operators" (small, muted, centered) — confirm copy with user if needed; defaulting to a neutral line since reference uses "Trusted by 500+ Businesses" which may not be accurate.
   - Horizontally scrolling track using a CSS keyframe animation (`translateX(-50%)` over ~40s, linear, infinite). Duplicate the logo list twice in the DOM for a seamless loop.
   - Each logo: `<img>` with fixed height (~40–48px), `width: auto`, `className="grayscale opacity-60 hover:opacity-100 transition"`. Logos with color (Aceyus, Book4Time, CWS, Destination Magic, paid, Keep, PayStandards, Pitcher accent) become monochrome via `filter: grayscale(1)`.
   - Edge fade masks (left/right) using `mask-image: linear-gradient(...)` so logos fade in/out at the edges.
   - Pause on hover (`:hover { animation-play-state: paused }`).
   - Respects `prefers-reduced-motion` — animation disabled, logos shown statically wrapped.
3. **Mount on homepage** `src/routes/index.tsx`: insert `<ClientMarquee />` immediately above the "Built for founders who are done guessing" section.
4. **Sizing**: container `py-12`, logos capped at `h-10 md:h-12`, with per-logo max-widths where needed (Book4Time is tall/square — render at `h-14` to compensate; CWS wide — `h-10`). Tuned visually after first render.

## Out of scope

- No backend changes.
- No new routes or SEO/structured-data changes (logos are decorative, not linked).
- Not adding a "Trusted by 500+ Businesses" counter unless user confirms the number.
